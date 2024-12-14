import type * as eio from 'engine.io/lib/engine.io';
import { EventEmitter } from 'events';
import debugModule from 'debug';
import { Socket } from 'engine.io/lib/socket';
import type { EioSocketState } from './EngineActorBase';
import { WebSocketTransport } from './WebSocketTransport';

const debugLogger = debugModule('sio-serverless:eio:EioSocket');

function createStubEioServer() {
  const server = new EventEmitter();
  Object.assign(server, {
    opts: {
      /**
       * EngineActor gets waken up every 30s by alarm. Client should receive 'ping' at that interval
       */
      pingInterval: 60e3,
      pingTimeout: 10 * 60e3,
    } as eio.ServerOptions,
    upgrades: () => [],
  });
  return server;
}

/**
 * A stub that should still emit the following events (used by sio.Client)
 * - data
 * - error
 * - close
 */
// @ts-expect-error overriding private methods
export class EioSocket extends Socket {
  constructor(private readonly socketState: EioSocketState, private readonly _transport: WebSocketTransport) {
    super(socketState.eioSocketId, createStubEioServer() as any, _transport, null!, 4);
    debugLogger('EioSocket created', this.constructor.name, socketState);
  }

  setupOutgoingEvents(
    socketState: EioSocketState,
  ) {
    debugLogger('setup outgoing events', socketState.eioSocketId);
    const eioAddr = socketState.eioActorId;

    // start forwarding data/close/error events to sioActorStub
    this.on('data', async data => {
      try {
        await socketState.socketActorStub.onEioSocketData(eioAddr.toString(), socketState.eioSocketId, data);
        debugLogger('forwarded transport data into socketActorStub');
      } catch (e: any) {
        debugLogger('error calling socketActorStub.onEioSocketData()', e, e?.stack);
      }
    });
    this.on('close', async (code, reason) => {
      try {
        await socketState.socketActorStub.onEioSocketClose(eioAddr.toString(), socketState.eioSocketId, code, reason);
        debugLogger('forwarded transport close into socketActorStub');
      } catch (e: any) {
        debugLogger('error calling socketActorStub.onEioSocketClose()', e, e?.stack);
      }
    });
    this.on('error', async error => {
      try {
        await socketState.socketActorStub.onEioSocketError(eioAddr.toString(), socketState.eioSocketId, error);
        debugLogger('forwarded transport error into socketActorStub');
      } catch (e: any) {
        debugLogger('error calling socketActorStub.onEioSocketError()', e, e?.stack);
      }
    });
  }

  override schedulePing() {
    // rewrite to workaround incompatible 'timer' polyfill in CF worker
    // (this also removes server-initiated ping timeout detection in protocol v4)
    // @ts-expect-error
    this.pingTimeoutTimer = {
      refresh() {
      },
    };
    // @ts-expect-error
    this.pingIntervalTimer = {
      refresh() {
      },
    };
  }

  onPingTimer() {
    // @ts-expect-error
    this.sendPacket('ping');
  }

  override resetPingTimeout() {
    // emptied to fit `schedulePing` change
  }

  onCfClose(code: number, reason: string, wasClean: boolean) {
    // FIXME reason/wasClean should be used someway
    this._transport._socket.emit('close'); // this will bubble up and call SocketActor#onEioSocketClose
  }

  onCfMessage(msg: string | Buffer) {
    debugLogger('onCfMessage', this.socketState.eioSocketId, msg);
    const msgStr = typeof msg === 'string' ? msg : msg.toString();
    this._transport._socket.emit('message', msgStr); // this will bubble up and call SocketActor#onEioSocketData
  }

  onCfError(msg: string, desc?: string) {
    debugLogger('onCfError', this.socketState.eioSocketId, msg);
    this._transport._socket.emit('error', new Error(msg)); // this will bubble up and call SocketActor#onEioSocketError
  }
}

// @ts-expect-error
export class RevivedEioSocket extends EioSocket {
  protected override onOpen() {
    // when this is revived, monkey patch the method
    // to not send 'open' package and initial server message
    this.readyState = 'open';

    // but still set this.pingIntervalTimer to be a stub
    this.schedulePing();
  }
}
