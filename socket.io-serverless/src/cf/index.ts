import type * as exported from "../../dist/cf";
import type * as sio from "socket.io/lib";
import type * as CF from "@cloudflare/workers-types";
import { EngineActorBase } from "./eio/EngineActorBase";
import { DurableObjectNamespace } from "@cloudflare/workers-types";
import { SocketActorBase } from "./sio/SocketActorBase";
import { SioServer } from "./sio/SioServer";

export const createEioActor: typeof exported.createEioActor = function <
  Bindings,
>(options: exported.EioActorOptions<Bindings>) {
  return class EioActor extends EngineActorBase<Bindings> {
    override getSocketActorNamespace(
      bindings: Bindings,
    ): DurableObjectNamespace<SocketActorBase> {
      return options.getSocketActorNamespace(bindings);
    }
  };
};

export const createSioActor: typeof exported.createSioActor = function <
  Bindings,
>(options: exported.SioActorOptions) {
  return class SioActor extends SocketActorBase<Bindings> {
    override async onServerCreated(s: SioServer): Promise<void> {
      await options.onServerCreated?.(s);
    }
    getEngineActorNamespace(
      bindings: Bindings,
    ): CF.DurableObjectNamespace<EngineActorBase> {
      return options.getEngineActorNamespace(bindings);
    }
  };
};
