import * as forwardEverything from "../app/forward-everything";
import {
    createEioActor,
    createSioActor,
    createDebugLogger,
    setEnabledLoggerNamespace,
    generateBase64id
} from "socket.io-serverless/dist/cf";
import type {DurableObjectNamespace} from '@cloudflare/workers-types';
import type {Server} from 'socket.io'

const debugLogger = createDebugLogger('socket.io-serverless:demo:cf-main');

/**
 * enable debug loggers in engine.io / socket.io / socket.io-serverless
 */
setEnabledLoggerNamespace([
    // 'engine:',
    // 'socket.io:',
    // 'socket.io:socket',
    // 'sio-serverless',
    // 'sio-serverless:eio:EngineActorBase',
    // 'sio-serverless:eio:AlarmTimer',
    // 'sio-serverless:sio:SioServer',
    // 'sio-serverless:sio:Persister',
    'sio-serverless:',
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
    // @ts-expect-error
    engineActor: DurableObjectNamespace<EngineActor>
    // @ts-expect-error
    socketActor: DurableObjectNamespace<SocketActor>
}

export default {
    async fetch(req: Request, env: WorkerBindings) {
        const parsedUrl = new URL(req.url);

        if (!parsedUrl.pathname.startsWith('/socket.io/')) {
            return new Response(null, {status: 404})
        }

        if (req.headers.get('upgrade') !== 'websocket') {
            return new Response('websocket only', {status: 400})
        }

        const actorId = env.engineActor.idFromName("singleton");
        const engineActorStub = env.engineActor.get(actorId);

        /**
         * generate session id, it will be used as
         * 1. eio.Socket#id
         * 2. socket.io Client#id
         */
        const sessionId = generateBase64id()
        return engineActorStub.fetch(`https://eioServer.internal/socket.io/?eio_sid=${sessionId}`, req);

        // return new Response(res.body, res);
    }
}
