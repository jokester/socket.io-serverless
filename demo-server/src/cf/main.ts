import * as forwardEverything from "../app/forward-everything";
import { createEioActor, createSioActor, createDebugLogger, setEnabledLoggerNamespace, generateBase64id } from "socket.io-serverless/dist/cf.js";
import { Hono } from 'hono';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Namespace, Server } from 'socket.io/lib'

const debugLogger = createDebugLogger('socket.io-serverless:demo:cf-main');

/**
 * enable debug loggers in engine.io / socket.io / socket.io-serverless 
 */
setEnabledLoggerNamespace([
    // 'engine:',
    // 'socket.io:',
    // 'socket.io:socket',
    // 'sio-serverless',
    // 'sio-serverless:eio:EngineActor',
    // 'sio-serverless:sio:SioServer',
    // 'sio-serverless:sio:Persister',
    'socket.io-serverless:demo',
]);

export const EngineActor = createEioActor<WorkerBindings>({
    getSocketActorNamespace(bindings: WorkerBindings) {
        return bindings.socketActor;
    }
});

export const SocketActor = createSioActor({
    /**
     * callback when socket.io Server created
     * used to set parent namespace etc
     */
    async onServerCreated(s: Server) {
    debugLogger('SioServer created')
    // add parent namespace with regex
    s.of(forwardEverything.parentNamespace)
        .on('connection', (socket) => {
            // forward
            debugLogger('sio.Socket created', socket.nsp.name, socket.id)
            forwardEverything.onConnection(socket);
        });


    },
    /**
     * callback when namespaces / clients / sockets restored
     */
    async onServerStateRestored(server) {
        for (const [name, namespace] of server._nsps) {
            debugLogger('onServerStateRestored', 'namespaces', name);
            for (const [sioSocketId, sioSocket] of namespace.sockets) {
                debugLogger('active client', sioSocketId, sioSocket.client.id);
            }
        }
    },
    getEngineActorNamespace(bindings: WorkerBindings) {
        return bindings.engineActor
    }
});

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
         * generate session id, it will be used as
         * 1. eio.Socket#id
         * 2. socket.io Client#id
         */
        const sessionId = generateBase64id()
        // @ts-ignore
        const res = await engineActorStub.fetch(`https://eioServer.internal/socket.io/?eio_sid=${sessionId}`, ctx.req.raw);
        // @ts-ignore
        return new Response(res.body, res);
    }
);

export default workerApp;
