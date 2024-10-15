import { Namespace, Server as OrigSioServer, Socket } from 'socket.io/lib/index';
import type * as CF from '@cloudflare/workers-types';
import debugModule from 'debug';
import { EioSocketStub } from './EioSocketStub';
import { SioClient } from './SioClient';
import { EngineActorBase } from '../eio/EngineActorBase';
import type * as sio from 'socket.io/lib';
import { PersistedSioClientState, Persister } from './Persister';

const debugLogger = debugModule('sio-serverless:sio:SioServer');

const unsupportedOptionKeys: readonly (keyof sio.ServerOptions)[] = [
  // socket.io
  'path',
  'serveClient',
  'parser',
  'connectTimeout',
  'connectionStateRecovery',
  'cleanupEmptyChildNamespaces',
  // engine.io AttachOptions
  'path',
  'destroyUpgrade',
  'destroyUpgradeTimeout',
  'addTrailingSlash',
  // engine.io ServerOptions
  'pingTimeout',
  'pingInterval',
  'upgradeTimeout',
  'maxHttpBufferSize',
  'allowRequest',
  'transports',
  'allowUpgrades',
  'perMessageDeflate',
  'httpCompression',
  'wsEngine',
  'initialPacket',
  'cookie',
  'cors',
  'allowEIO3',
];

interface RestoreServerStateReport {
  persistedClientIds: Set<string>;
  clientIds: Set<string>;
}

export class SioServer extends OrigSioServer {
  private readonly connStubs = new Map<string, EioSocketStub>();

  constructor(
    options: Partial<sio.ServerOptions>,
    private readonly socketActorCtx: CF.DurableObjectState,
    private readonly engineActorNs: CF.DurableObjectNamespace<EngineActorBase>,
    readonly persister: Persister,
  ) {
    debugLogger('CustomSioServer#constructor');
    const overlapedOptions = unsupportedOptionKeys.filter(key => options[key] !== undefined);
    if (overlapedOptions.length) {
      throw new Error(`Unsupported socket.io ServerOptions: ${overlapedOptions.join(' , ')}`);
    }

    super(undefined, {
      ...options,
      adapter: options.adapter!,
      transports: ['websocket'],
      allowEIO3: false,
      serveClient: false,
      // connectionStateRecovery: undefined,
      cleanupEmptyChildNamespaces: true,
    });
  }

  async restoreState(): Promise<RestoreServerStateReport> {
    const s = await this.persister.loadServerState();
    debugLogger('restore server state', s);
    const recoveredNsps = new Map<string, Namespace>();
    // TODO think about if we should recover all concrete namespaces
    // - a concrete namespace may or may not have a parent ns
    // - user may or may not want to recover empty NS
    for (const nsName of s.concreteNamespaces) {
      if (nsName == '/') {
        // root ns is created by default
        continue;
      }
      // this will rebuild the namespaces, and (when name matches) add them to parentNsp.children
      debugLogger('recreating namespace', nsName);
      recoveredNsps.set(nsName, this.of(nsName));
    }

    // FIXME should this be batched?
    const clientStates = await this.persister.loadClientStates(s.clientIds);

    const revivedClientIds = new Set<string>();
    for (const [clientId, clientState] of clientStates) {
      // revive client only if the underlying ws conn is alive
      const revived = await this.reviveClientState(clientId, clientState, recoveredNsps);
      if (revived) {
        revivedClientIds.add(clientId);
      }
    }
    return {
      persistedClientIds: s.clientIds,
      clientIds: revivedClientIds,
      // concreteNamespaces: revov
    };
  }

  private async reviveClientState(
    clientId: string,
    clientState: PersistedSioClientState,
    recoveredNsps: ReadonlyMap<string, Namespace>,
  ): Promise<boolean> {
    {
      const engineActorStub = deserializeDoStub(this.engineActorNs, clientState.engineActorId);
      if (!await engineActorStub.getConnLiveness(clientId)) {
        debugLogger('SioServer#reviveClientState() false', clientId);
        return false;
      }
    }
    const conn = new EioSocketStub(clientId, clientState.engineActorId, this);
    this.connStubs.set(conn.eioSocketId, conn);
    const client = new SioClient(this, conn);
    clientState.namespaces.forEach((nspState, nspName) => {
      debugLogger('recreate sio.Socket', clientId, nspState);
      const nsp = recoveredNsps.get(nspName);

      if (!nsp) {
        debugLogger('WARNING nsp was referenced but not recreated', clientId, nspName);
        return;
      }

      // replay Namespace#_add() , to not call Namespace#_doConnect()
      const socket = new Socket(nsp, client as any, {}, {
        sid: nspState.socketId,
        pid: nspState.socketPid,
        rooms: nspState.rooms,
        missedPackets: [],
        data: null,
      });

      {
        // replaces Namespace#_doConnect
        nsp.sockets.set(socket.id, socket);
        // @ts-expect-error
        nsp.emitReserved('connect', socket);
        // @ts-expect-error
        nsp.emitReserved('connection', socket);
        // not calling Socket#_onconnect
      }

      {
        // replaces Socket#_onconnect
        // this is needed to not send Packet.CONNECTED to all socket again
        socket.connected = true;
        socket.join(socket.id);
      }

      {
        // replaces Client#doConnect
        // @ts-expect-error
        client.sockets.set(socket.id, socket);
        // @ts-expect-error
        client.nsps.set(nsp.name, socket);
      }

      // @ts-expect-error
      debugLogger('recreated sio.Socket', socket.id, socket.pid);
    });
    // @ts-expect-error
    debugLogger('recreated SioClient', conn.eioSocketId, /* equals private client.id */ Array.from(client.nsps.keys()));
    return true;
  }

  startPersisting() {
    for (const nsp of this._nsps.values()) {
      nsp.on('connection', (socket: Socket) => this.persister.onSocketConnect(socket));
    }
    /**
     * state changes from now on get persisted
     */
    this.on('new_namespace', nsp => {
      this.persister.onNewNamespace(nsp.name);
      nsp.on('connection', (socket: Socket) => {
        this.persister.onSocketConnect(socket);
        socket.on('disconnect', (reason, desc) => {
          this.persister.onSocketDisconnect(socket);
        });
      });
    });

    // NOTE removal

    // NOTE new SioClient creation will only be triggered later
  }

  override of(
    name: string | RegExp | Function,
    fn?: (
      socket: Socket<never, never, never>,
    ) => void,
  ): Namespace {
    if (typeof name === 'function') {
      throw new TypeError('Defining parent namespace with function is not supported');
    }
    return super.of(name, fn);
  }
  /**
   * replaces onconnection(conn: eio.Socket)
   */
  async onEioConnection(conn: EioSocketStub): Promise<void> {
    if (this.connStubs.has(conn.eioSocketId)) {
      console.warn(new Error(`eio socket ${conn.eioSocketId} already exists`));
      return;
    }
    this.connStubs.set(conn.eioSocketId, conn);
    new SioClient(this, conn);
    await this.persister.onNewClient(conn);
  }

  onEioData(eioSocketId: string, data: any) {
    if (!this.connStubs.has(eioSocketId)) {
      console.warn(`SioServer#onEioData() eio socket ${eioSocketId} not found`);
      return;
    }
    this.connStubs.get(eioSocketId)!.emit('data', data);
  }

  onEioClose(eioSocketId: string, code: number, reason: string) {
    if (!this.connStubs.has(eioSocketId)) {
      console.warn(`SioServer#onEioClose() eio socket ${eioSocketId} not found`);
      return;
    }
    this.connStubs.get(eioSocketId)!.emit('close', reason, `code: ${code}`);
  }

  onEioError(eioSocketId: string, error: any) {
    if (!this.connStubs.has(eioSocketId)) {
      console.warn(`SioServer#onEioError() eio socket ${eioSocketId} not found`);
    }
    this.connStubs.get(eioSocketId)!.emit('error', error);
  }

  async writeEioMessage(stub: EioSocketStub, msg: string | Buffer): Promise<void> {
    /**
     * NOTE the ownerActor received from RPC lacks something
     * and needs to be before used to call RPC
     */
    const engineActorStub = deserializeDoStub(this.engineActorNs, stub.ownerActorId);
    debugLogger('SioServer#writeEioMessage', engineActorStub.id, stub.eioSocketId, msg);

    const succeed = await engineActorStub.writeEioMessage(stub.eioSocketId, msg);
    if (!succeed) {
      debugLogger('SioServer#writeEioMessage FAIL');
      throw new Error(`Error EngineActor#writeEioMessage`);
    }
  }

  async closeEioConn(stub: EioSocketStub) {
    const engineActorStub = deserializeDoStub(this.engineActorNs, stub.ownerActorId);
    debugLogger('SioServer#closeEioConn', engineActorStub.id, stub.eioSocketId);

    const succeed = await engineActorStub.closeEioConn(stub.eioSocketId);
    if (!succeed) {
      debugLogger('SioServer#closeEioConn FAIL');
    }
  }
}

export function deserializeDoStub(
  ns: CF.DurableObjectNamespace<EngineActorBase>,
  actorId: string,
): CF.DurableObjectStub<EngineActorBase> {
  const destId = ns.idFromString(actorId.toString());
  return ns.get(destId);
}
