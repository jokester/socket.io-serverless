import { EventEmitter } from "events";
import type * as CF from "@cloudflare/workers-types";
import type * as http from 'http';
import * as eio from 'engine.io/lib/engine.io'
import { SioServer } from "./SioServer";
import debugModule from "debug";

const debugLogger = debugModule('sio-serverless:sio:EioSocketStub');

// eio.Socket stub to socket.io code
// @ts-expect-error
export class EioSocketStub extends EventEmitter implements eio.Socket {
    constructor(readonly eioSocketId: string, readonly ownerActor: CF.DurableObjectId, readonly server: SioServer) {
        super()
    }

    get request(): http.IncomingMessage {
        /**
         * queried by
         * sio.Socket#buildHandshake()
         */
        return {
            remoteAddress: 'unknown',
            headers: {},
            connection: {
                // @ts-expect-error maybe non-standard property
                encrypted: true,
            },
            url: `https://localhost:5173/dummy`
        }
    }

    get protocol() {
        return 4
    }

    get readyState(): 'open' {
        return 'open'
    }

    get transport(): eio.Transport {
        // @ts-ignore
        return {
            writable: true
        }
    }

    /**
     * works in places of real eio.Socket#write()
     * impled by forwarding through SioServer to EngineActor
     */
    write(packet: string | Buffer, opts?: unknown, callback?: unknown) {
        debugLogger('EioSocketStub#write', packet, opts, callback)
        // FIXME can we keep a reference in this object?
        this.server.writeEioMessage(this, packet).catch(e => {
            debugLogger('EioSocketStub#write ERROR', e);
            this.emit('error', e); // this will eventually cause this.close()
        })
        return this;
    }

    /**
     * called on
     * 1. eio socket 'error' event, from sio.Client#onerror
     * 2. sio.Client decode error
     * 3. sio.Server#close() which is not called in worker
     */
    close() {
        this.server.closeEioConn(this)
    }
}

