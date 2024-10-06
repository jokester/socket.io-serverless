// @ts-ignore
import type * as eio from 'engine.io/lib/engine.io';
import {EventEmitter} from "events";
import debugModule from "debug";
// @ts-ignore
import {Socket} from 'engine.io/lib/socket';
import type {EioSocketState} from "./EngineActorBase";
import {WebsocketTransport} from "./WebsocketTransport";

const debugLogger = debugModule('sio-serverless:eio:EioSocket');

function createStubEioServer() {
    const server = new EventEmitter();
    Object.assign(server, {
        opts: {
            pingInterval: 10_000,
            pingTimeout: 20_000,
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
export class EioSocket extends Socket {
    constructor(private readonly socketState: EioSocketState, private readonly _transport: WebsocketTransport, private readonly _isRevivedSocket: boolean) {
        super(socketState.eioSocketId, createStubEioServer() as any, _transport, null!, 4);
        if (_isRevivedSocket) {
            // FIXME need a way to monkey hack this at right timing
            // @ts-expect-error
            this.onOpen = () => {
                // when this is revived, monkey patch the method
                // to not send 'open' package and initial server message
                this.readyState = "open";
            }
        }
        debugLogger('EioSocket created', socketState)
    }

    setupOutgoingEvents(
        socketState: EioSocketState,
    ) {
        debugLogger('setup outgoing events', socketState.eioSocketId)
        const eioAddr = socketState.eioActorId

        // start forwarding data/close/error events to sioActorStub
        this.on('data', data => socketState.socketActorStub.onEioSocketData(eioAddr, socketState.eioSocketId, data));
        this.on('close', (code, reason) => socketState.socketActorStub.onEioSocketClose(eioAddr, socketState.eioSocketId, code, reason));
        this.on('error', error => socketState.socketActorStub.onEioSocketError(eioAddr, socketState.eioSocketId, error));
        // TODO: subscribe to close/error inside SioActor code
    }

    // @ts-ignore
    schedulePing() {
        // rewrite to workaround incompatible 'timer' polyfill in CF worker
        // (this also removes server-initiated ping timeout detection in protocol v4)
        this.pingTimeoutTimer = {
            refresh() {
            }
        }
        this.pingIntervalTimer = {
            refresh() {
            }
        }
    }

    override resetPingTimeout() {
        // emptied to fit `schedulePing` change
    }

    onPingAlarmTick() {
        // instead of setTimeout, trigger server-sent ping with alarm
        // TODO: connect alarm
        this.sendPacket('ping')
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
