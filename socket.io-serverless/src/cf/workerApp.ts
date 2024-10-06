import {Hono} from 'hono';
import type {DurableObjectNamespace} from '@cloudflare/workers-types';
import {createDebugLogger} from '@jokester/socket.io-serverless/src/utils/logger';
import {EngineActor} from "./EngineActor";
import {SocketActor} from "./SocketActor";

export interface WorkerBindings extends Record<string, unknown> {
    // @ts-ignore
    engineActor: DurableObjectNamespace<EngineActor>
    // @ts-ignore
    socketActor: DurableObjectNamespace<SocketActor>
}

const debugLogger = createDebugLogger('sio-worker:workerApp');

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
