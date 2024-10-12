import { Client as OrigSioClient } from "socket.io/lib/client";
import { EventsMap } from "socket.io/lib/typed-events";
import debugModule from "debug";
import { SioServer } from "./SioServer";
import { EioSocketStub } from "./EioSocketStub";

const debugLogger = debugModule('sio-serverless:sio:SioClient');

// @ts-expect-error this.conn is not a eio.Socket
export class SioClient extends OrigSioClient<EventsMap, EventsMap, EventsMap> {
    constructor(private override readonly server: SioServer, override readonly conn: EioSocketStub) {
        super(server, conn);
        debugLogger('SioClient#constructor', conn.eioSocketId)
    }

    /** rewrites OrigSioClient#setup() */
    protected override setup() {
        // @ts-expect-error use of private
        this.decoder.on("decoded", packet => {
            debugLogger('SioClient#ondecoded', packet)
            // @ts-expect-error calling private method
            this.ondecoded(packet);
        });
        this.conn.on("data", data => {
            debugLogger('SioClient#ondata', data)
            // @ts-expect-error calling private method
            this.ondata(data);
        });
        this.conn.on("error", error => {
            debugLogger('SioClient#onerror', error)
            // @ts-expect-error calling private method
            this.onerror(error);
        });
        this.conn.on("close", (reason, desc) => {
            debugLogger('SioClient#onclose', reason, desc)
            // @ts-expect-error calling private method
            this.onclose(reason, desc);
            this.server.persister.onRemoveClient(this.conn)
        });
        // NOT supported: connectTimeout
    }
}