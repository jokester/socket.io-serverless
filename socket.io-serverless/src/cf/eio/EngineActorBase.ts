import debugModule from 'debug'
import type * as CF from '@cloudflare/workers-types';

// @ts-expect-error
import { DurableObject } from "cloudflare:workers";
import { DefaultEngineDelegate, EngineDelegate } from './EngineDelegate';
import { SocketActorBase } from "../sio/SocketActorBase";

const debugLogger = debugModule('sio-serverless:eio:EngineActorBase');

declare const self: CF.ServiceWorkerGlobalScope;

/**
 * non-serializable state for a WebSocket connection
 * across EngineActor lifecycles they get reconstructed
 */
export interface EioSocketState {
    eioActorId: CF.DurableObjectId,
    eioSocketId: string
    // @ts-expect-error
    socketActorStub: CF.DurableObjectStub<SocketActorBase<unknown>>
    ws?: CF.WebSocket
}

export abstract class EngineActorBase<Bindings = unknown> extends DurableObject<Bindings> implements CF.DurableObject {

    private readonly delegate: EngineDelegate
    constructor(readonly state: CF.DurableObjectState, readonly env: Bindings) {
        super(state, env)
        this.delegate = new DefaultEngineDelegate(state, this.getSocketActorNamespace(env))
    }

    // @ts-ignore
    abstract getSocketActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<SocketActorBase>

    /**
     * webSocket* : called by CF runtime
     */
    webSocketMessage(ws: CF.WebSocket, message: string | ArrayBuffer) {
        debugLogger('EngineActor#webSocketMessage', message)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.reviveEioSocket(socketState)
        debugLogger('EngineActor#webSocketMessage', socketState?.eioSocketId, socket?.constructor)
        socket?.onCfMessage(message as string)
    }

    webSocketClose(ws: CF.WebSocket, code: number, reason: string, wasClean: boolean) {
        debugLogger('EngineActor#webSocketClose', code, reason, wasClean)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.reviveEioSocket(socketState)
        debugLogger('EngineActor#webSocketClose', socketState?.eioSocketId, socket?.constructor)
        socket?.onCfClose(code, reason, wasClean)
    }

    webSocketError(ws: CF.WebSocket, error: unknown) {
        debugLogger('EngineActor#webSocketError', error)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.reviveEioSocket(socketState)
        debugLogger('EngineActor#webSocketError', socketState?.eioSocketId, socket?.constructor)
        socket?.onCfError(String(error))
    }

    /**
     * called by EioSocketStub
     */
    async writeEioMessage(eioSocketId: string, packet: string | Buffer): Promise<boolean> {
        const socketState = this.delegate.recallSocketStateForId(eioSocketId)
        const socket = socketState && this.delegate.reviveEioSocket(socketState)
        if (!socket) {
            debugLogger('EngineActor#writeEioMessage', 'socket not found', eioSocketId)
            return false
        }
        try {
            socket.write(packet);
        } catch (e) {
            debugLogger('EngineActor#writeEioMessage ERROR', e)
            return false
        }
        return true
    }

    async closeEioConn(eioSocketId: string): Promise<boolean> {
        const conn = this.delegate.getCfWebSocket(eioSocketId)
        if (!conn) {
            debugLogger('EngineActor#closeEioConn WebSocket not found', eioSocketId)
            return false
        }
        conn.close();
        return true;
    }

    async getConnLiveness(eioSocketId: string): Promise<boolean> {
        return !!this.delegate.getCfWebSocket(eioSocketId)
    }

    async fetch(request: CF.Request): Promise<CF.Response> {

        if (request.headers.get('upgrade') !== 'websocket') {
            return new self.Response(null, {
                status: 426,
                statusText: 'Not a Upgrade request',
            });
        }

        const reqUrl = new URL(request.url)

        const socketId = reqUrl.searchParams.get('eio_sid')!
        if (!(typeof socketId === 'string' && socketId.length >= 10)) {
            return new self.Response(null, {
                status: 400,
                statusText: `invalid eio_sid: ${socketId}`,
            })
        }

        debugLogger('new ws connection', reqUrl, socketId);

        const { 0: clientSocket, 1: serverSocket } = new self.WebSocketPair();

        const sid = socketId
        const tags = [`sid:${sid}`];
        this.state.acceptWebSocket(serverSocket, tags);
        debugLogger('accepted ws connection', sid, tags);
        await this.delegate.createEioSocket(sid, serverSocket)
        return new self.Response(null, { status: 101, webSocket: clientSocket });
    }
}