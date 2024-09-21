import {EventEmitter} from "events";
import type * as CF from "@cloudflare/workers-types";
import type {WebSocket as WsWebSocket} from "ws";
import debugModule from 'debug';

const debugLogger = debugModule('sio-serverless:eio:WebSocketStub');

/**
 * stub for ws.WebSocket
 */
export class WebSocketStub extends EventEmitter {
    static create(cfWebSocket: CF.WebSocket): WsWebSocket & WebSocketStub {
        return new WebSocketStub(cfWebSocket) as any;
    }

    private constructor(private readonly cfWebSocket: CF.WebSocket) {
        super();
    }

    get _socket() {
        return {
            remoteAddress: 'FIXME: 127.0.0.1',
        }
    }

    send(
        data: string | Buffer,
        // _opts?: unknown,
        _callback?: (error?: any) => void
    ) {
        try {
            this.cfWebSocket.send(data);
            debugLogger('WebSocketStub.send', data);
            _callback?.();
        } catch (e: any) {
            debugLogger('WebSocketStub.send error', data, e);
            _callback?.(e);
        }
    }
    close() {
        this.cfWebSocket.close()
    }

}
