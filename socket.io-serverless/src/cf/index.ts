import type * as sio from "socket.io/lib";
import type * as CF from '@cloudflare/workers-types'
import { EngineActorBase } from './eio/EngineActorBase';
import { DurableObjectNamespace } from "@cloudflare/workers-types";
import { SocketActorBase } from "./sio/SocketActorBase";

export function createEioActor<Bindings>(options: EioActorOptions<Bindings>) {
    return class EioActor extends EngineActorBase<Bindings> {
        override getSocketActorNamespace(bindings: Bindings): DurableObjectNamespace<SocketActorBase> {
            return options.getSocketActorNamespace(bindings)
        }

    }
}
export function createSioActor<Bindings>(options: SioActorOptions) {}

interface EioActorOptions<Bindings> {
    getSocketActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<SocketActorBase>

}
interface SioActorOptions {
  onServerCreated(server: sio.Server): void;
}
