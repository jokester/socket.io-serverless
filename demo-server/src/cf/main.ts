import * as forwardEverything from "../app/forward-everything";
import { createEioActor, createSioActor } from "socket.io-serverless/src";
import {Hono} from 'hono';
import type {DurableObjectNamespace} from '@cloudflare/workers-types';
import debugModule from 'debug'
// export { EngineActor } from "../../../socket.io-serverless/src/cf/EngineActor";
// export { SocketActor } from "../../../socket.io-serverless/src/cf/SocketActor";

const debugLogger = debugModule('socket.io-serverless:demo:cf-main');

export const EioActor = createEioActor<WorkerBindings>({});

export const SioActor = createSioActor({ async onServerCreated(s) {
                console.debug('sio.Server created')
        // XXX how to support such use with re-created nsps / sockets?
        s.of(forwardEverything.parentNamespace)
            .on('connection', (socket) => {
                console.debug('sio.Socket created', socket.nsp.name, socket.id)
                forwardEverything.onConnection(socket);
            });
} });

export interface WorkerBindings extends Record<string, unknown> {
    // @ts-ignore
    engineActor: DurableObjectNamespace<EioActor>
    // @ts-ignore
    socketActor: DurableObjectNamespace<SocketActor>
}

export const workerApp = new Hono<{ Bindings: WorkerBindings }>().get(
    '/socket.io/*',
    async ctx => {
        // debugLogger('ws connection request', ctx.req.url);

        const actorId = ctx.env.engineActor.idFromName("singleton");
        const engineActorStub = ctx.env.engineActor.get(actorId);

        /**
         * generate session id for
         * 1. eio.Socket#id
         * 2. socket.io Socket
         */
        const sessionId = (Math.random()).toString(16).slice(2, 12)
        // @ts-ignore
        const res = await engineActorStub.fetch(`https://eioServer.internal/socket.io/?eio_sid=${sessionId}`, ctx.req.raw);
        // @ts-ignore
        return new Response(res.body, res);
    }
);

export default workerApp;
