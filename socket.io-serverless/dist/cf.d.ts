import type * as CF from '@cloudflare/worker-types'
import type * as sio from 'socket.io'

export function createEioActor<Bindings>(options: EioActorOptions<Bindings>): any;
export function createSioActor<Bindings>(options: SioActorOptions<Bindings>): any;

interface EioActorOptions<Bindings> {
    getSocketActorNamespace(bindings): CF.DurableObjectNamespace<SocketActorBase>;
}

interface SioActorOptions<Bindings> {
    getEngineActorNamespace(bindings): CF.DurableObjectNamespace<SocketActorBase>;
    onServerCreated?(server: sio.Server): void | Promise<void>
}