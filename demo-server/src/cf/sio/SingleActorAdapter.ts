import type {Namespace} from "socket.io";
import {Adapter} from "socket.io-adapter";
import debugModule from "debug";
import type { Persister } from "./Persister";

const debugLogger = debugModule('sio-serverless:sio:SingleActorAdapter');

/**
 * Works in place of InMemoryAdapter
 * - handles state recovery before/after DO hibernation
 */
export abstract class SingleActorAdapter extends Adapter {
    constructor(private readonly nsp: Namespace) {
        super(nsp);
        debugLogger('SingleActorAdapter#constructor', nsp.name)
    }

    abstract get persister(): Persister

    /**
     * called when namespace is closed
     * e.g. serverOpts.cleanupEmptyChildNamespaces
     */
    close() {
        debugLogger('Namespace close', this.nsp.name)
        this.persister.onRemoveNamespace(this.nsp.name)
    }

}
