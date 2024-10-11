import {EventEmitter} from "events";
import type * as CF from "@cloudflare/workers-types";
import {SioServer} from "./SioServer";
import debugModule   from "debug";

const debugLogger = debugModule('sio-serverless:sio:EioSocketStub');

/**
 * replaces eio.Socket
 */
export class EioSocketStub extends EventEmitter {
    constructor(readonly eioSocketId: string, readonly ownerActor: CF.DurableObjectId, readonly server: SioServer) {
        super()
    }

    get request(): {} {
        /**
         * queried by
         * sio.Socket#buildHandshake()
         */
        return {
            remoteAddress: 'unknown',
            headers: {},
            connection: {
                encrypted: true,
            },
            url: `https://localhost:5173/dummy`

        }
    }

    get protocol() {
        return 4
    }

    get readyState(): string {
        return 'open'
    }

    get transport() {
        return {
            writable: true
        }
    }

    write(packet: string | Buffer, opts: unknown) {
        debugLogger('EioSocketStub#write', packet, opts)
        // FIXME can we keep a reference in this object?
        this.server._sendEioPacket(this, packet)
    }

    /**
     * called on
     * 1. eio socket 'error' event, from sio.Client#onerror
     * 2. sio.Client decode error
     * 3. sio.Server#close() which is not called in worker
     */
    close() {
        this.server.closeConn(this)
        // this.emit('close', 'EioSocketStub#close()')
        // TODO: should this call EioWorker to close the real conn?
    }
}

