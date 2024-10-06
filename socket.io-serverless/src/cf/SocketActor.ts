import type * as CF from '@cloudflare/workers-types';
// @ts-expect-error
import {DurableObject} from "cloudflare:workers";
import type {WorkerBindings} from "./workerApp";
import debug from 'debug'
import * as forwardEverything from "../app/forward-everything";
import {SioServer} from './sio/SioServer'
import {EioSocketStub} from "./sio/EioSocketStub";
import {lazyThenable} from "@jokester/ts-commonutil/lib/concurrency/lazy-thenable";
import {createSioServer} from "./sio/factory";

const debugLogger = debug('sio-serverless:SocketActor');

export class SocketActor extends DurableObject<WorkerBindings> implements CF.DurableObject {

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

    async setupSioServer(s: SioServer) {
        // XXX how to support such use with re-created nsps / sockets?
        s.of(forwardEverything.parentNamespace)
            .on('connection', (socket: Socket) => {
                debugLogger('SocketActor#setupSioServer', 'connection', socket.id)
                forwardEverything.onConnection(socket);
            });
    }

    private readonly sioServer = lazyThenable(async () => {
        const s = await createSioServer(this.ctx, this.env.engineActor)
        await this.setupSioServer(s)
        await s.restoreState()
        s.startPersisting()
        return s
    })
}

