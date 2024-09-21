import type * as CF from '@cloudflare/workers-types';
import debug from 'debug'
import {DefaultEngineDelegate, EngineDelegate} from "./eio/EngineDelegate";
import {SocketActor} from "./SocketActor";
import {EioSocketState, EngineActorBase} from "./eio/EngineActorBase";
import {EioSocket} from "./eio/EioSocket";
import {WorkerBindings} from "./workerApp";

const debugLogger = debug('sio-serverless:EngineActor');

/**
 * Works in place of a engine.io Server
 * - accepts and keeps WebSocket connection
 * - forward incoming messages to eio.Socket, via RPC
 * - forward outgoing messages to clients, via WS
 */
export class EngineActor extends EngineActorBase<WorkerBindings> {

    private _delegate?: EngineDelegate
    protected override get delegate(): EngineDelegate {
        return this._delegate ??= new DefaultEngineDelegate(this._ctx, this._env.socketActor)
    }

    // @ts-expect-error
    protected getSocketActorStub(sessionId: string): CF.DurableObjectStub<SocketActor> {
        return this.delegate.getSocketActorStub(sessionId)
    }

    protected recallSocketStateForId(eioSocketId: string): null | EioSocketState {
        return this.delegate.recallSocketStateForId(eioSocketId)
    }

    protected recallSocketStateForConn(ws: CF.WebSocket): null | EioSocketState {
        return this.delegate.recallSocketStateForConn(ws)
    }

    override async onNewConnection(eioSocketId: string, serverSocket: CF.WebSocket) {
        const created = await super.onNewConnection(eioSocketId, serverSocket)
        created.socket.setupOutgoingEvents(created.state)
        this.delegate.onNewSocket(eioSocketId, created.socket)
        debugLogger('created new CustomEioSocket', eioSocketId)
        return created
    }

    protected recallSocket(state: EioSocketState): null | EioSocket {
        return this.delegate.recallSocket(state)
    }
}

