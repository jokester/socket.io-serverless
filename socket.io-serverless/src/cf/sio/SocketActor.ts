import type * as CF from '@cloudflare/workers-types';
// @ts-expect-error
import {DurableObject} from "cloudflare:workers";
import debug from 'debug'
import {SioServer} from './SioServer'
import {EioSocketStub} from "./EioSocketStub";
import {lazyThenable} from "@jokester/ts-commonutil/lib/concurrency/lazy-thenable";
import {createSioServer} from "./factory";

const debugLogger = debug('sio-serverless:SocketActor');

export class SocketActor<WorkerBindings> extends DurableObject<WorkerBindings> implements CF.DurableObject {

    fetch(req: CF.Request) {
        throw new Error('Method not implemented.');
    }

    async onEioSocketConnection(actorAddr: CF.DurableObjectId, socketId: string) {
        debugLogger('SocketActor#onEioSocketConnection', actorAddr, socketId)
        const sioServer = await this.sioServer
        const stubConn = new EioSocketStub(socketId, actorAddr, sioServer)
        await sioServer.onEioConnection(stubConn)
    }

    async onEioSocketData(actorAddr: CF.DurableObjectId, socketId: string, data: unknown) {
        debugLogger('SocketActor#onEioSocketData', actorAddr, socketId, data)
        const sioServer = await this.sioServer
        sioServer.onEioData(socketId, data)
    }

    async onEioSocketClose(actorAddr: CF.DurableObjectId, socketId: string, code: number, reason: string) {
        debugLogger('SocketActor#onEioSocketClose', actorAddr, socketId, code, reason)
        const sioServer = await this.sioServer
        sioServer.onEioClose(socketId, code, reason)
    }

    async onEioSocketError(actorAddr: CF.DurableObjectId, socketId: string, error: unknown) {
        debugLogger('SocketActor#onEioSocketError', actorAddr, socketId, error)
        const sioServer = await this.sioServer
        sioServer.onEioError(socketId, error)
    }

    /**
     * extension point
     */
    async onServerCreated(s: SioServer) {
        debugLogger('SocketActor#onServerCreated')
    }

    private readonly sioServer = lazyThenable(async () => {
        const s = await createSioServer(this.ctx, this.env.engineActor)
        await this.onServerCreated(s)
        await s.restoreState()
        s.startPersisting()
        return s
    })
}

