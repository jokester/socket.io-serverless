import type * as CF from '@cloudflare/worker-types'
import type * as sio from 'socket.io'

export function createEioActor<Bindings>(options: EioActorOptions<Bindings>): unknown;
export function createSioActor<Bindings>(options: SioActorOptions<Bindings>): unknown;

interface EioActorOptions<Bindings> {
    getSocketActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<SocketActorBase>;
}

interface SioActorOptions<Bindings> {
    getEngineActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<SocketActorBase>;
    onServerCreated?(server: sio.Server): void | Promise<void>
}