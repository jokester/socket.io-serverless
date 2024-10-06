import debugModule from 'debug'
import type * as CF from '@cloudflare/workers-types';

// @ts-expect-error
import {DurableObject} from "cloudflare:workers";
import {Hono} from "hono";
import {lazy} from "../../utils/lazy";
import {DefaultEngineDelegate, EngineDelegate} from "./EngineDelegate";
import {SocketActorBase} from "../sio/SocketActorBase";
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
    // @ts-expect-error
    socketActorStub: CF.DurableObjectStub<SocketActorBase<unknown>>
}

export abstract class EngineActorBase<Bindings = unknown> extends DurableObject<Bindings> implements CF.DurableObject{

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
    webSocketMessage(ws: CF.WebSocket, message: string | ArrayBuffer){
        debugLogger('EngineActor#webSocketMessage', message)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.recallSocket(socketState)
        debugLogger('EngineActor#webSocketMessage', socketState?.eioSocketId, socket?.constructor)
        socket?.onCfMessage(message as string)
    }

    webSocketClose(ws: CF.WebSocket, code: number, reason: string, wasClean: boolean) {
        debugLogger('EngineActor#webSocketClose',code, reason, wasClean)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.recallSocket(socketState)
        debugLogger('EngineActor#webSocketClose',socketState?.eioSocketId, socket?.constructor)
        socket?.onCfClose(code, reason, wasClean)
    }

    webSocketError(ws: CF.WebSocket, error: unknown) {
        debugLogger('EngineActor#webSocketError', error)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.recallSocket(socketState)
        debugLogger('EngineActor#webSocketError', socketState?.eioSocketId, socket?.constructor)
        socket?.onCfError(String(error))
    }

    /**
     * called by EioSocketStub
     * FIXME should be named 'onServerMessage'
     */
    async sendMessage(eioSocketId: string, message: string | Buffer): Promise<boolean> {
        const socketState = this.delegate.recallSocketStateForId(eioSocketId)
        const socket = socketState && this.delegate.recallSocket(socketState)
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

    // @ts-ignore
    fetch(request: Request): Response | Promise<Response> {
        return this.honoApp.value.fetch(request)
    }

    async onNewConnection(eioSocketId: string, serverSocket: CF.WebSocket): Promise<{state: EioSocketState, socket: EioSocket}> {
        const transport = WebsocketTransport.create(serverSocket);
        const sioActorStub = this.delegate.getSocketActorStub(eioSocketId)
        const socketState: EioSocketState = {
            eioActorId: this.state.id,
            eioSocketId,
            socketActorStub: sioActorStub,
        }
        const eioSocket = new EioSocket(socketState, transport);

        // @ts-ignore
        await sioActorStub.onEioSocketConnection(socketState.eioActorId, eioSocketId)
        eioSocket.setupOutgoingEvents(socketState)
        this.delegate.onNewSocket(eioSocketId, eioSocket)
        debugLogger('created new CustomEioSocket', eioSocketId)

        return {
            state: socketState, socket: eioSocket
        }
    }

    private readonly honoApp = lazy(() => createHandler(this))
}

// FIXME: drop hono for plain JS
function createHandler(actor: EngineActorBase) {
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
            actor.state.acceptWebSocket(serverSocket, tags);
            debugLogger('accepted ws connection', sid, tags);
            await actor.onNewConnection(sid, serverSocket)
            return new self.Response(null, {status: 101, webSocket: clientSocket});
        })
}
