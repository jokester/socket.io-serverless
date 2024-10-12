import type * as exports from '../../dist/cf';
// import type * as sio from "socket.io/lib";
import type * as CF from '@cloudflare/workers-types';
import { EngineActorBase } from './eio/EngineActorBase';
import { DurableObjectNamespace } from '@cloudflare/workers-types';
import { SocketActorBase } from './sio/SocketActorBase';
import { SioServer } from './sio/SioServer';
export { createDebugLogger, setEnabledLoggerNamespace } from '../debug';
import base64id from 'base64id';

export const createEioActor: typeof exports.createEioActor = function<
  Bindings,
>(options: exports.EioActorOptions<Bindings>) {
  return class EioActor extends EngineActorBase<Bindings> {
    override getSocketActorNamespace(
      bindings: Bindings,
    ): DurableObjectNamespace<SocketActorBase> {
      return options.getSocketActorNamespace(bindings);
    }
  };
};

export const createSioActor: typeof exports.createSioActor = function<
  Bindings,
>(options: exports.SioActorOptions<Bindings>) {
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

export const generateBase64id: typeof exports.generateBase64id = () => base64id.generateId();
