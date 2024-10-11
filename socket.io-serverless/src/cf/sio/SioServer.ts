// @ts-ignore
import { Server as OrigSioServer, Socket, Namespace } from 'socket.io/lib/index';
// import type {Client} from 'socket.io/lib/client'
import type * as CF from "@cloudflare/workers-types";
import debugModule from "debug";
import { EioSocketStub } from "./EioSocketStub";
import { SioClient } from "./SioClient";
import { EngineActorBase } from "../eio/EngineActorBase";
import type * as sio from 'socket.io/lib'
import { PersistedSioClientState, Persister } from './Persister';

const debugLogger = debugModule('sio-serverless:sio:SioServer');

export class SioServer extends OrigSioServer {
    private readonly connStubs = new Map<string, EioSocketStub>()

    constructor(
        options: Partial<sio.ServerOptions>,
        private readonly socketActorCtx: CF.DurableObjectState,
        // @ts-expect-error
        private readonly engineActorNs: CF.DurableObjectNamespace<EngineActorBase>,
        readonly persister: Persister
    ) {
        debugLogger('CustomSioServer#constructor')
        if (options.connectionStateRecovery) {
            throw new Error('options.connectionStateRecovery is not supported')
        }

        super(undefined, {
            ...options,
            adapter: options.adapter!,
            transports: ['websocket'],
            allowEIO3: false,
            serveClient: false,
            // connectionStateRecovery: undefined,
            cleanupEmptyChildNamespaces: true,
        },);
    }

    _sendEioPacket(stub: EioSocketStub, msg: string | Buffer) {
        /**
         * NOTE the ownerActor received from RPC lacks something
         * and needs to be before used to call RPC
         */
        const destId = this.engineActorNs.idFromString(stub.ownerActor.toString())
        debugLogger('CustomSioServer#_sendEioPacket', destId, stub.eioSocketId, msg)
        const engineActorStub = this.engineActorNs.get(destId)
        // @ts-expect-error
        engineActorStub.sendMessage(stub.eioSocketId, msg).then(
            (sentFromEioActor: boolean) => {
                // TODO: handle closed connection
                debugLogger('sent', stub.eioSocketId, sentFromEioActor, msg)
            },
            (e: unknown) => {
                debugLogger('failed to send', stub.eioSocketId, msg, e)
            })
    }

    async restoreState() {
        const s = await this.persister.loadServerState()
        debugLogger('restore server state', s)
        const recoveredNsps = new Map<string, Namespace>()
        // TODO think about if we should recover all concrete namespaces
        // - a concrete namespace may or may not have a parent ns
        // - user may or may not want to recover empty NS
        for (const nsName of s.concreteNamespaces) {
            if (nsName == '/') {
                // root ns is created by default
                continue
            }
            // this will rebuild the namespaces, and (when name matches) add them to parentNsp.children
            debugLogger('recreating namespace', nsName)
            recoveredNsps.set(nsName, this.of(nsName))
        }

        // FIXME should be batched
        const clientStates = await this.persister.loadClientStates(s.clientIds)

        const revivedClientIds: string[] = []
        for (const [clientId, clientState] of clientStates) {
            const revived = await this.reviveClientState(clientId, clientState, recoveredNsps)
            if (revived) {
                revivedClientIds.push(clientId)
            }
        }
        await this.persister.onAliveClientsVerified(revivedClientIds)
    }

    private async reviveClientState(clientId: string, clientState: PersistedSioClientState, recoveredNsps: ReadonlyMap<string, Namespace>,): Promise<boolean> {
        {
            // TODO: call isAlive()
            // const isAlive = await this.engineActorNs.
        }
        const conn = new EioSocketStub(clientId, clientState.engineActorId, this)
        this.connStubs.set(conn.eioSocketId, conn)
        const client = new SioClient(this, conn)
        clientState.namespaces.forEach((nspState, nspName) => {
            debugLogger('recreate sio.Socket', clientId, nspState)
            const nsp = recoveredNsps.get(nspName)

            if (!nsp) {
                debugLogger('WARNING nsp was referenced but not recreated', nspName)
                return
            }

            // replay Namespace#_add() , to not call Namespace#_doConnect()
            const socket = new Socket(nsp, client as any, {}, {
                sid: nspState.socketId,
                pid: nspState.socketPid,
                rooms: nspState.rooms,
                missedPackets: [],
                data: null
            })

            // modified version of Namespace#_doConnect , to not call Socket#_onconnect
            // this is needed to not send
            nsp.sockets.set(socket.id, socket)
            // @ts-expect-error
            nsp.emitReserved("connect", socket);
            // @ts-expect-error
            nsp.emitReserved("connection", socket);

            // replay Socket#_onconnect
            socket.connected = true
            socket.join(socket.id)

            // replay: Client#doConnect
            // @ts-expect-error
            client.sockets.set(socket.id, socket)
            // @ts-expect-error
            client.nsps.set(nsp.name, socket)

            // @ts-expect-error
            debugLogger('recreated sio.Socket', socket.id, socket.pid)
        })
        // @ts-expect-error
        debugLogger('recreated SioClient', client.conn.eioSocketId, Array.from(client.nsps.keys()))

    }

    startPersisting() {
        for (const nsp of this._nsps.values()) {
            nsp.on('connection', (socket: Socket) => this.persister.onSocketConnect(socket))
        }
        /**
         * state changes from now on get persisted
         */
        this.on('new_namespace', nsp => {
            const nspNames = [...this._nsps.keys()]
            this.persister.onNewNamespace(nsp.name)
            nsp.on('connection', (socket: Socket) => {
                this.persister.onSocketConnect(socket)
                socket.on('disconnect', (reason, desc) => {
                    this.persister.onSocketDisconnect(socket)
                })
            })
        })

        // NOTE SioClient creation will only be triggered later
    }

    override of(
        name: string | RegExp | Function,
        fn?: (
            socket: Socket<never, never, never>
        ) => void
    ): Namespace {
        if (typeof name === 'function') {
            throw new TypeError('Defining parent namespace with function is not supported')
        }
        return super.of(name, fn)
    }
    /**
     * replaces onconnection(conn: eio.Socket)
     */
    async onEioConnection(conn: EioSocketStub): Promise<void> {
        if (this.connStubs.has(conn.eioSocketId)) {
            console.warn(new Error(`eio socket ${conn.eioSocketId} already exists`))
            return
        }
        this.connStubs.set(conn.eioSocketId, conn)
        new SioClient(this, conn)
        await this.persister.onNewClient(conn)
    }

    onEioData(eioSocketId: string, data: any) {
        if (!this.connStubs.has(eioSocketId)) {
            console.warn(new Error(`eio socket ${eioSocketId} not found`))
            return
        }
        this.connStubs.get(eioSocketId)!.emit('data', data)
    }

    onEioClose(eioSocketId: string, code: number, reason: string) {
        if (!this.connStubs.has(eioSocketId)) {
            console.warn(new Error(`eio socket ${eioSocketId} not found`))
            return
        }
        this.connStubs.get(eioSocketId)!.emit('close', reason, `code: ${code}`)
    }

    onEioError(eioSocketId: string, error: any) {
        if (!this.connStubs.has(eioSocketId)) {
            throw new Error(`eio socket ${eioSocketId} not found`)
        }
        this.connStubs.get(eioSocketId)!.emit('error', error)
    }

    closeConn(stub: EioSocketStub) {

    }

}

export function reviveSio(dons: CF.DurableObjectNamespace, s: PersistedSioClientState): CF.DurableObjectStub {

}