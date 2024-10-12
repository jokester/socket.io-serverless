import debugModule from 'debug'
import type * as CF from '@cloudflare/workers-types';
import { DurableObject } from 'cloudflare:workers';
import { DefaultEngineDelegate, EngineDelegate } from './EngineDelegate';
import { SocketActorBase } from "../sio/SocketActorBase";
// import { encodePacket, Packet, PacketType } from "engine.io-parser/lib";
import { PACKET_TYPES } from 'engine.io-parser/lib/commons'
import { wait } from '@jokester/ts-commonutil/lib/concurrency/timing';

const debugLogger = debugModule('sio-serverless:eio:EngineActorBase');

declare const self: CF.ServiceWorkerGlobalScope;

/**
 * non-serializable state for a WebSocket connection
 * across EngineActor lifecycles they get reconstructed
 */
export interface EioSocketState {
    eioActorId: CF.DurableObjectId,
    eioSocketId: string
    socketActorStub: CF.DurableObjectStub<SocketActorBase<unknown>>
    ws?: CF.WebSocket
}

const ALARM_INTERVAL = 30e3;
const ENCODED_PING = PACKET_TYPES['ping']

export abstract class EngineActorBase<Bindings = unknown> extends DurableObject<Bindings> implements CF.DurableObject {

    private readonly delegate: EngineDelegate
    constructor(readonly state: CF.DurableObjectState, override readonly env: Bindings) {
        super(state as any, env)
        this.delegate = new DefaultEngineDelegate(state, this.getSocketActorNamespace(env))
        this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL, { allowConcurrency: false })
    }

    // @ts-ignore
    abstract getSocketActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<SocketActorBase>

    override async alarm(): Promise<void> {
        const wokenAt = Date.now()
        debugLogger('EngineActor#alarm()', wokenAt)
        // const encoded = await new Promise<string>(f => encodePacket({ type: 'ping' }, false, f))
        for (const w of this.state.getWebSockets()) {
            try {
                w.send(ENCODED_PING);
                // NOT setting auto reponse pair:
                // assuming client will send pong before current DO enters hibernation again.
            } catch (e) {
                console.error('EngineActor#alarm() error send engine.io PING', e)
            }
        }
        if (Date.now() > wokenAt + ALARM_INTERVAL / 2) {
            console.warn("EngineActor#alarm(): Unexpectingly slow sending ping to engine.io clients. Maybe too connections.")
        }
        await this.state.storage.setAlarm(wokenAt + ALARM_INTERVAL)
    }

    // @ts-expect-error
    override webSocketMessage(ws: CF.WebSocket, message: string | ArrayBuffer) {
        debugLogger('EngineActor#webSocketMessage', message)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.reviveEioSocket(socketState)
        debugLogger('EngineActor#webSocketMessage', socketState?.eioSocketId, socket?.constructor)
        socket?.onCfMessage(message as string)
    }

    // @ts-expect-error
    webSocketClose(ws: CF.WebSocket, code: number, reason: string, wasClean: boolean) {
        debugLogger('EngineActor#webSocketClose', code, reason, wasClean)
        const socketState = this.delegate.recallSocketStateForConn(ws)
        const socket = socketState && this.delegate.reviveEioSocket(socketState)
        debugLogger('EngineActor#webSocketClose', socketState?.eioSocketId, socket?.constructor)
        socket?.onCfClose(code, reason, wasClean)
    }

    // @ts-expect-error
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

    // @ts-expect-error
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
        wait(0.1e3).then(() => this.delegate.createEioSocket(sid, serverSocket)).catch(e => {
            // without this delay, the send of engine.io 'open' packet may fail silently
            console.error('EngineActorBase#fetch() error creating EioSocket', e);
        })
        return new self.Response(null, { status: 101, webSocket: clientSocket });
    }
}