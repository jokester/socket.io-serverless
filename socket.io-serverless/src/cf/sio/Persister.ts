import type * as CF from '@cloudflare/workers-types';
import debugModule from 'debug';
import { EioSocketStub } from './EioSocketStub';
import type * as sio from 'socket.io/lib';
import { SioClient } from './SioClient';
const debugLogger = debugModule('sio-serverless:sio:Persister');

interface PersistedSioServerStateNamespaces {
  concreteNamespaces: string[];
}

interface PersistedSioServerStateClients {
  clientIds: Set<string>; // Client#id equal to eioSocket.id
}

export interface PersistedSioClientState {
  clientId: string;
  engineActorId: string;
  namespaces: Map<
    /* concrete nsp.name*/ string,
    {
      socketId: string;
      // NOTE socketPid is not implemented as a part of session recovery
      // socketPid: string;
      // TODO maybe persist rooms too (would require hooking in Adapter)
      // rooms: string[];
    }
  >;
}

const DEBUG_KEY_PREFIX = ''; // '_00003_'
const KEY_GLOBAL_STATE_NAMESPACES = `${DEBUG_KEY_PREFIX}_namespaces`;
const KEY_GLOBAL_STATE_CLIENTS = `${DEBUG_KEY_PREFIX}_clients`;
const KEY_CLIENT_STATE_PREFIX = `${DEBUG_KEY_PREFIX}_client_`;

export class Persister {
  constructor(private readonly sioCtx: CF.DurableObjectState) {}

  async DEV_resetState() {
    await this.sioCtx.storage.deleteAll();
  }

  async loadServerState(): Promise<
    PersistedSioServerStateNamespaces & PersistedSioServerStateClients
  > {
    // await this.DEV_resetState();
    const s1 = await this.sioCtx.storage.get<PersistedSioServerStateNamespaces>(
      KEY_GLOBAL_STATE_NAMESPACES,
    );
    const s2 = await this.sioCtx.storage.get<PersistedSioServerStateClients>(
      KEY_GLOBAL_STATE_CLIENTS,
    );

    const loaded = {
      concreteNamespaces: s1?.concreteNamespaces ?? [],
      clientIds: new Set(s2?.clientIds ?? []),
    };
    debugLogger('loadServerState', loaded);
    return loaded;
  }

  async loadClientStates(
    clientIds: Set<string>,
  ): Promise<Map<string, PersistedSioClientState>> {
    if (!clientIds.size) {
      return new Map();
    }
    const realKeys = [...clientIds].map(
      (id) => `${KEY_CLIENT_STATE_PREFIX}${id}`,
    );
    // FIXME should prefix the key
    const loaded = await this.sioCtx.storage.get<PersistedSioClientState>(realKeys);
    // debugLogger('loadClientStates raw', loaded)
    const keyRemoved = new Map<string, PersistedSioClientState>();
    for (const [k, v] of loaded) {
      keyRemoved.set(k.slice(KEY_CLIENT_STATE_PREFIX.length), v);
    }
    debugLogger('loadClientStates', keyRemoved);
    return keyRemoved;
  }

  async onNewNamespace(concreteNs: string) {
    await this.replaceGlobalState<PersistedSioServerStateNamespaces>(
      KEY_GLOBAL_STATE_NAMESPACES,
      (prev) => ({
        concreteNamespaces: [...(prev?.concreteNamespaces ?? []), concreteNs],
      }),
    );
  }

  async onRemoveNamespace(concreteNs: string) {
    await this.replaceGlobalState<PersistedSioServerStateNamespaces>(
      KEY_GLOBAL_STATE_NAMESPACES,
      (prev) => ({
        concreteNamespaces: (prev?.concreteNamespaces ?? []).filter(
          (ns) => ns !== concreteNs,
        ),
      }),
    );
  }

  async persistRestoredNamespaces(concreteNamespaces: string[]) {
    await this.replaceGlobalState<PersistedSioServerStateNamespaces>(
      KEY_GLOBAL_STATE_NAMESPACES,
      prev => ({concreteNamespaces}),
    );
  }
  /**
   * remove dead client ids in storage
   */
  async persistRestoredClients(savedClientIds: ReadonlySet<string>, aliveClientIds: ReadonlySet<string>) {
    await this.replaceGlobalState<PersistedSioServerStateClients>(
      KEY_GLOBAL_STATE_CLIENTS,
      prev => ({clientIds: new Set(aliveClientIds)}),
    );
    for (const i of savedClientIds) {
      if (!aliveClientIds.has(i)) {
        debugLogger('persistRestoredClients removing', i);
        // TODO: maybe this can be run concurrently
        await this.replaceClientState(i, () => null);
      }
    }
  }

  async onNewClient(stub: EioSocketStub) {
    debugLogger('onNewClient', stub.eioSocketId);
    const clientId = stub.eioSocketId;
    await this.replaceGlobalState<PersistedSioServerStateClients>(
      KEY_GLOBAL_STATE_CLIENTS,
      (prev) => {
        const clientIds = new Set(prev?.clientIds ?? []);
        clientIds.add(clientId);
        return {
          clientIds,
        };
      },
    );
    await this.replaceClientState(clientId, (prev) => ({
      clientId,
      // must this be persisted as string?
      engineActorId: stub.ownerActorId.toString(),
      namespaces: new Map(),
    }));
  }

  async onRemoveClient(stub: EioSocketStub) {
    debugLogger('onRemoveClient', stub.eioSocketId);
    await this.replaceGlobalState<PersistedSioServerStateClients>(
      KEY_GLOBAL_STATE_CLIENTS,
      (prev) => {
        const clientIds = new Set(prev?.clientIds ?? []);
        clientIds.delete(stub.eioSocketId);
        return {
          clientIds,
        };
      },
    );
    await this.replaceClientState(stub.eioSocketId, whatever => null);
  }

  /**
   * called when a sio.Client joins a sio.Namespace
   */
  async onSocketConnect(socket: sio.Socket) {
    const clientId = (socket.client as unknown as SioClient).conn.eioSocketId;
    debugLogger('onSocketConnect', clientId, socket.nsp.name);

    await this.replaceClientState(clientId, (prev) => {
      // HOPEFULLY this will not be in parallel onNewClient
      prev!.namespaces.set(socket.nsp.name, {
        socketId: socket.id,
        // socketPid: socket.pid,
        // rooms: [],
      });
      return {...prev!};
    });
  }

  /**
   * called when a sio.Client leaves a sio.Namespace
   */
  async onSocketDisconnect(socket: sio.Socket) {
    const clientId = (socket.client as unknown as SioClient).conn.eioSocketId;
    debugLogger('onSocketDisconnect', clientId, socket.nsp.name);
    await this.replaceClientState(clientId, (prev) => {
      prev!.namespaces.delete(socket.nsp.name);
      return {...prev!};
    });
  }

  private async replaceGlobalState<T>(
    key: string,
    f: (prev: T | undefined) => T,
  ) {
    const prev = await this.sioCtx.storage.get<T>(key);
    debugLogger('replaceGlobalState prev', key, prev);
    const updated = f(prev);
    await this.sioCtx.storage.put({[key]: updated});
    debugLogger('replaceGlobalState updated', key, updated);
  }

  private async replaceClientState(
    clientId: string,
    f: (
      prev: PersistedSioClientState | undefined,
    ) => PersistedSioClientState | null,
  ) {
    const prev = await this.sioCtx.storage.get<PersistedSioClientState>(
      `${KEY_CLIENT_STATE_PREFIX}${clientId}`,
    );
    debugLogger('replaceClientState prev', clientId, prev);
    const updated = f(prev);
    if (updated) {
      await this.sioCtx.storage.put({
        [`${KEY_CLIENT_STATE_PREFIX}${clientId}`]: updated,
      });
    } else {
      await this.sioCtx.storage.delete(`${KEY_CLIENT_STATE_PREFIX}${clientId}`);
    }
    debugLogger('replaceClientState updated', clientId, updated);
  }
}

class Unused {
  async persistSioClient$$$(client: SioClient) {
    // @ts-expect-error
    client.sockets; // sioSocket.id => Socket
    // @ts-expect-error
    client.nsps; // nsp.name => Socket
  }

  persistSioSocket$$$(concreteNs: sio.Namespace, socket: sio.Socket) {
    socket.nsp; // the concrete ns
    socket.client; // the sio.Client
    socket.id;
    // @ts-expect-error
    socket.pid;
  }
}
