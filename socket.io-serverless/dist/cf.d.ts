import type * as CF from '@cloudflare/worker-types'
import type * as sio from 'socket.io'

export function createEioActor<Bindings>(options: EioActorOptions<Bindings>): unknown;
export function createSioActor<Bindings>(options: SioActorOptions<Bindings>): unknown;
export function createDebugLogger(namespace: string): DebugLogger;
export function setEnabledLoggerNamespace(namespacePrefixes: string[]): void;

export function generateBase64id(): string

interface EioActorOptions<Bindings> {
    getSocketActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<SocketActorBase>;
}

interface SioActorOptions<Bindings> {
    getEngineActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<SocketActorBase>;
    onServerCreated?(server: sio.Server): void | Promise<void>
}

interface DebugLogger {
    (...args: unknown[]): void
}