import debugModule from 'debug'
import type * as CF from '@cloudflare/workers-types';

// @ts-expect-error
import {DurableObject} from "cloudflare:workers";
import {Hono} from "hono";
import {lazy} from "../../utils/lazy";
import {EngineDelegate} from "./EngineDelegate";
import {SocketActor} from "../sio/SocketActor";
import {EioSocket} from "./EioSocket";
import {WebsocketTransport} from "./WebsocketTransport";

const debugLogger = debugModule('sio-serverless:eio:EngineActorBase');

declare const self: CF.ServiceWorkerGlobalScope;

/**
 * non-serializable state for a WebSocket connection
 * across EngineActor lifecycles they get reconstructed
 */
export interface EioSocketState {
    eioActorId: CF.DurableObjectId,
    eioSocketId: string
    socketActorStub: CF.DurableObjectStub<SocketActor>
}

export abstract class EngineActorBase<Env = unknown> extends DurableObject<Env> implements CF.DurableObject {
    /**
     * webSocket* : called by CF runtime
     */
    webSocketMessage(ws: CF.WebSocket, message: string | ArrayBuffer){
        const socketState = this.recallSocketStateForConn(ws)
        const socket = socketState && this.recallSocket(socketState)
        debugLogger('EngineActor#webSocketMessage', socketState?.eioSocketId, socket?.constructor)
        debugLogger('EngineActor#webSocketMessage', message)
        socket?.onCfMessage(message as string)
    }

    webSocketClose(ws: CF.WebSocket, code: number, reason: string, wasClean: boolean) {
        const socketState = this.recallSocketStateForConn(ws)
        const socket = socketState && this.recallSocket(socketState)
        debugLogger('EngineActor#webSocketClose',socketState?.eioSocketId, socket?.constructor)
        debugLogger('EngineActor#webSocketClose',code, reason, wasClean)
        socket?.onCfClose(code, reason, wasClean)
    }

    webSocketError(ws: CF.WebSocket, error: unknown) {
        const socketState = this.recallSocketStateForConn(ws)
        const socket = socketState && this.recallSocket(socketState)
        debugLogger('EngineActor#webSocketError', socketState?.eioSocketId, socket?.constructor)
        debugLogger('EngineActor#webSocketError', error)
        socket?.onCfError(String(error))
    }

    /**
     * called by SocketActor which thinks it's writing to eio.Socket
     * FIXME should be named 'onServerMessage'
     */
    async sendMessage(eioSocketId: string, message: string | Buffer): Promise<boolean> {
        const socketState = this.recallSocketStateForId(eioSocketId)
        const socket = socketState && this.recallSocket(socketState)
        if (!socket) {
            debugLogger('EngineActor#sendMessage', 'socket not found', eioSocketId)
            return false
        }
        try {
            socket.write(message);
        } catch (e) {
            debugLogger('EngineActor#sendMessage ERROR', e)
            return false
        }
        return true
    }
    protected abstract get delegate(): EngineDelegate

    // @ts-ignore
    fetch(request: Request): Response | Promise<Response> {
        return this.honoApp.value.fetch(request)
    }

    protected get _ctx(): CF.DurableObjectState {
        // @ts-ignore
        return this.ctx
    }

    protected get _env(): Env {
        // @ts-ignore
        return this.env
    }

    /**
     * extension point for load-balancing
     */
    protected abstract getSocketActorStub(sessionId: string): CF.DurableObjectStub<SocketActor>
    // called on outgoing client messages
    protected abstract recallSocketStateForId(eioSocketId: string): null | EioSocketState;
    // called on incoming client messages
    protected abstract recallSocketStateForConn(ws: CF.WebSocket): null | EioSocketState
    protected abstract recallSocket(state: EioSocketState): null | EioSocket;

    async onNewConnection(eioSocketId: string, serverSocket: CF.WebSocket): Promise<{state: EioSocketState, socket: EioSocket}> {
        const transport = WebsocketTransport.create(serverSocket);
        const sioActorStub = this.getSocketActorStub(eioSocketId)
        const newSocketState: EioSocketState = {
            eioActorId: this._ctx.id,
            eioSocketId,
            socketActorStub: sioActorStub,
        }
        const eioSocket = new EioSocket(newSocketState, transport);

        await sioActorStub.onEioSocketConnection(newSocketState.eioActorId, eioSocketId)
        return {
            state: newSocketState, socket: eioSocket
        }
    }

    private readonly honoApp = lazy(() => createHandler(this, this._ctx))
}

// FIXME: drop hono for plain JS
function createHandler(actor: EngineActorBase, actorCtx: CF.DurableObjectState) {
    return new Hono()
        // @ts-ignore hono.Response is not CF.Response
        .get('/socket.io/*', async ctx => {
            if (ctx.req.header('Upgrade') !== 'websocket') {
                return new Response(null, {
                    status: 426,
                    statusText: 'Not a Upgrade request',
                });
            }

            const socketId = ctx.req.query('eio_sid')!
            if (socketId?.length !== 10) {
                // FIXME: should limit minimal length instaed
                return new Response(null, {
                    status: 400,
                    statusText: `invalid eio_sid: ${socketId}`,
                })
            }

            debugLogger('new ws connection', ctx.req.url, socketId);
            const {0: clientSocket, 1: serverSocket} = new self.WebSocketPair();

            const sid = socketId
            const tags = [`sid:${sid}`];
            actorCtx.acceptWebSocket(serverSocket, tags);
            debugLogger('accepted ws connection', sid, tags);
            await actor.onNewConnection(sid, serverSocket)
            return new self.Response(null, {status: 101, webSocket: clientSocket});
        })
}
