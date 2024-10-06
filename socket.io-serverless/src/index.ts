import type * as sio from "socket.io/lib";
import { EngineActorBase } from './cf/EngineActor';

export function createEioActor<Bindings>(options: EioActorOptions) {
    return class EioActor extends EngineActorBase {

    }
}
export function createSioActor<Bindings>(options: SioActorOptions) {}

interface EioActorOptions {}
interface SioActorOptions {
  onServerCreated(server: sio.Server): void;
}
