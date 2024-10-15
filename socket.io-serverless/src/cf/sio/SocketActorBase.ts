import type * as CF from '@cloudflare/workers-types';
import { DurableObject } from 'cloudflare:workers';
import debug from 'debug';
import { SioServer } from './SioServer';
import { EioSocketStub } from './EioSocketStub';
import { lazyThenable } from '@jokester/ts-commonutil/lib/concurrency/lazy-thenable';
import { EngineActorBase } from '../eio/EngineActorBase';
import { Persister } from './Persister';
import { SingleActorAdapter } from './SingleActorAdapter';

const debugLogger = debug('sio-serverless:sio:SocketActor');

export abstract class SocketActorBase<Bindings = unknown> extends DurableObject<Bindings> {
  private readonly engineActorNs: CF.DurableObjectNamespace<EngineActorBase>;

  constructor(readonly state: CF.DurableObjectState, override readonly env: Bindings) {
    super(state as any, env);
    this.engineActorNs = this.getEngineActorNamespace(env);
  }

  override fetch(req: unknown): Promise<never> {
    throw new Error('Method not implemented.');
  }

  async onEioSocketConnection(actorAddr_: string, socketId: string) {
    debugLogger('SocketActor#onEioSocketConnection', actorAddr_, socketId);
    const sioServer = await this.sioServer;
    const stubConn = new EioSocketStub(socketId, actorAddr_, sioServer);
    await sioServer.onEioConnection(stubConn);
  }

  async onEioSocketData(actorAddr: string, socketId: string, data: unknown) {
    debugLogger('SocketActor#onEioSocketData', actorAddr, socketId, data);
    const sioServer = await this.sioServer;
    sioServer.onEioData(socketId, data);
  }

  async onEioSocketClose(actorAddr: string, socketId: string, code: number, reason: string) {
    debugLogger('SocketActor#onEioSocketClose', actorAddr, socketId, code, reason);
    const sioServer = await this.sioServer;
    sioServer.onEioClose(socketId, code, reason);
  }

  async onEioSocketError(actorAddr: string, socketId: string, error: unknown) {
    debugLogger('SocketActor#onEioSocketError', actorAddr, socketId, error);
    const sioServer = await this.sioServer;
    sioServer.onEioError(socketId, error);
  }

  abstract getEngineActorNamespace(bindings: Bindings): CF.DurableObjectNamespace<EngineActorBase>;

  /**
   * extension point
   */
  async onServerCreated(s: SioServer) {
    debugLogger('SocketActor#onServerCreated');
  }

  async onServerStateRestored(s: SioServer) {
    debugLogger('SocketActor#onServerRestored');
  }

  private readonly sioServer = lazyThenable(async () => {
    const s = await createSioServer(this.state, this.getEngineActorNamespace(this.env));
    await this.onServerCreated(s);
    const restored = await s.restoreState();
    await s.persister.persistRestoredClients(restored.persistedClientIds, restored.clientIds);
    await s.persister.persistRestoredNamespaces(restored.concreteNamespaces);
    await this.onServerStateRestored(s);
    s.startPersistingStateChange();
    /**
     * NOTE from now on the server is ready to accept new events
     */
    return s;
  });
}

async function createSioServer(
  ctx: CF.DurableObjectState,
  engineActorNs: CF.DurableObjectNamespace<EngineActorBase>,
): Promise<SioServer> {
  const persister = new Persister(ctx);
  /**
   * adapter class should exist per DO
   */
  class BoundAdapter extends SingleActorAdapter {
    override get persister() {
      return persister;
    }
  }
  return new SioServer(
    // @ts-expect-error
    {adapter: BoundAdapter},
    ctx,
    engineActorNs,
    persister,
  );
}
