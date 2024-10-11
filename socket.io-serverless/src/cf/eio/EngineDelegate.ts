import debugModule from 'debug'
import type * as CF from '@cloudflare/workers-types';
import {EioSocketState} from "./EngineActorBase";
import type {SocketActorBase} from "../sio/SocketActorBase";
import {EioSocket, RevivedEioSocket} from "./EioSocket";
import {WebsocketTransport} from "./WebsocketTransport";

const debugLogger = debugModule('sio-serverless:eio:EngineDelegate');

/**
 * extension points for EngineActorBase classes
 */
export interface EngineDelegate {
    /**
     * extension point for load-balancing
     */
    getSocketActorStub(sessionId: string): 
    // @ts-expect-error
    CF.DurableObjectStub<SocketActorBase>
    // called on outgoing client messages
    recallSocketStateForId(eioSocketId: string): null | EioSocketState;
    // called on incoming client messages
    recallSocketStateForConn(ws: CF.WebSocket): null | EioSocketState
    createEioSocket(eioSocketId: string, serverSocket: CF.WebSocket): Promise<EioSocket>
    reviveEioSocket(state: EioSocketState): null | EioSocket
}

export class DefaultEngineDelegate implements EngineDelegate {

    private readonly _liveConnections = new Map<string, EioSocket>()

    constructor(private readonly eioActorState: CF.DurableObjectState, 
        // @ts-expect-error
        private readonly sioActorNs: CF.DurableObjectNamespace<SocketActorBase>) {
    }

    /**
     * @note in future this can be overridden for load-balancing
     */
    getSocketActorStub(sessionId: string):
    // @ts-expect-error
        CF.DurableObjectStub<SocketActorBase> {
        const ns = this.sioActorNs;
        const addr = ns.idFromName('singleton')
        return ns.get(addr)
    }

    recallSocketStateForId(eioSocketId: string): null | EioSocketState {
        const socketActorStub = this.getSocketActorStub(eioSocketId)
        return {
            eioSocketId,
            eioActorId: this.eioActorState.id,
            socketActorStub,
        }
    }

    recallSocketStateForConn(ws: CF.WebSocket): null | EioSocketState {
        const tags = this.eioActorState.getTags(ws)
        debugLogger('recallSocketStateForConn', ws, tags)
        const sessionTag = tags.find(tag => tag.startsWith('sid:'))
        if (!sessionTag) {
            debugLogger("WARNING no conn state found for cf.WebSocket", ws)
            return null
        }
        const eioSocketId = sessionTag.slice('sid:'.length)

        return {
            eioSocketId,
            eioActorId: this.eioActorState.id,
            socketActorStub: this.getSocketActorStub(eioSocketId)
        }
    }

    async createEioSocket(eioSocketId: string, serverSocket: CF.WebSocket): Promise<EioSocket> {
        const transport = WebsocketTransport.create(serverSocket);
        const sioActorStub = this.getSocketActorStub(eioSocketId)
        const socketState: EioSocketState = {
            eioActorId: this.eioActorState.id,
            eioSocketId,
            socketActorStub: sioActorStub,
        }
        const created = new EioSocket(socketState, transport, false);

        // @ts-ignore
        await sioActorStub.onEioSocketConnection(socketState.eioActorId, eioSocketId)
        created.setupOutgoingEvents(socketState)
        this._liveConnections.set(eioSocketId, created)
        debugLogger('created new EioSocket', eioSocketId)
        return created;
    }

    reviveEioSocket(state: EioSocketState): null | EioSocket {
        {
            // if already revived in this DO life, use that instance
            const alive = this._liveConnections.get(state.eioSocketId)
            if (alive) {
                debugLogger('found alive eio.Socket for sid', state.eioSocketId)
                return alive
            }
        }
        const tag = `sid:${state.eioSocketId}`

        const ws = this.eioActorState.getWebSockets(tag)
        if (ws.length !== 1) {
            debugLogger(`WARNING no websocket found for tag: ${JSON.stringify(tag)}`, ws.length)

            const wss = this.eioActorState.getWebSockets()
            debugLogger(`DEBUG cf websockets`, wss.length)
            for (const w of wss) {
                debugLogger(`DEBUG cf ws`, this.eioActorState.getTags(w))
            }
            return null
        }
        const transport = WebsocketTransport.create(ws[0]!)
        const revived = new RevivedEioSocket(state, transport) as unknown as EioSocket
        revived.setupOutgoingEvents(state)
        this._liveConnections.set(state.eioSocketId, revived);
        debugLogger('revived EioSocket', state.eioSocketId)
        return revived
    }
}
