import {WebSocketStub} from "./WebSocketStub";
import type * as CF from "@cloudflare/workers-types";
import type { EngineRequest } from "engine.io/lib/transport";
import {WebSocket as EioWebSocketTransport} from 'engine.io/lib/transports/websocket';
import debugModule from '../../debug'
import type {WebSocket as WsWebSocket} from "ws";

const debugLogger = debugModule('sio-serverless:eio:CustomEioWebsocketTransport');

function createStubRequest(
    websocket: WsWebSocket
): EngineRequest {
    return {
        _query: {
            sid: 'TODO',
            EIO: '4',
        },
        websocket,
    } as any;
}

export class WebsocketTransport extends EioWebSocketTransport {
    constructor(readonly _stubWs: WebSocketStub, stubReq: EngineRequest) {
        super(stubReq);
    }

    get _socket() {
        // @ts-expect-error use of private
        return this.socket;
    }

    static create(cfWebSocket: CF.WebSocket): WebsocketTransport {
        const stubWebSocket = WebSocketStub.create(cfWebSocket);
        const stubReq = createStubRequest(stubWebSocket);
        const transport = new WebsocketTransport(stubWebSocket, stubReq);
        debugLogger('sio-serverless:CustomEioWebsocketTransport created')
        return transport;
    }
}
