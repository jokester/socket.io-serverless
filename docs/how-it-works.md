### how socket.io works

Socket.io (the top level library) have 2 main components: npm packages `socket.io` and `engine.io`.

The `socket.io` packages deals with the high level concepts: namespace / room / clustering / etc. It depends on `engine.io` which holds a `http.Server` instance and deals with the transport-aware logic.

In Node.js the 2 components just run in the same process, communicate with a event emitter API.

### develop for CF worker / DO

In CF DO / worker, JS runs in a non-Node.js special serverless environment. I think [workerd](https://github.com/cloudflare/workerd/tree/main/src/workerd) .

The biggest difference compared to Node.js / web for a JS developer is perhaps the volatile state.

In a traditional environment like Node.js process or a browser tab, the code just run till server down or tab close. But in CF the serverless environment they will stop running and destroy the in-memory state of your JS code when it is inactive. Having a JS `setTimeout` or `setInterval` timer counts as active. A pending HTTP request counts. An active WebSocket connection may or may not count (depending on the API used to accept the connection).

Specificlly, for DO the destruction of in-memory state is actually called [hibernation](). Developers can manually persist/revive state using provided KV store-like API.

<!--
For DO there is some guarantee like "no 2 instance of the same actor (identified by id) will exist at the same time". For worker I guess almost nothing is guaranteed. S
-->
Also the available standard libraries is different too.

The code using only JS language APIs should just work. Code requiring Node.js API can have Node.js polyfills behind Node.js compatibility flags.

Since sometime in 2024 the Node.js stdlib polyfill is based on [unenv]() , behind `nodejs_compat_v2` flag. This article has a quite complete explanation [Cloudflare Workersのnodejs\_compat\_v2で何が変わったのか](https://zenn.dev/laiso/articles/8280d026a08de0)

Prior to this, based on my non-authoritative investigation the `nodejs_compat` flag is eventually based on `ionic-team/rollup-plugin-node-polyfills` used by `@esbuild-plugins/node-modules-polyfill`, used by `esbuild`, used by `wrangler` CLI.

### how socket.io-serverless works

I used 2 DO to run heavily rewired `socket.io` `engine.io` code.

`class EngineActor extends DurableObject {...}` is the DO running `engine.io` code. It just accepts WebSocket connection, forwards bidirectional WS messages between `SocketActor` and real WS connection.

`class SocketActor extends DurableObject {...}` is the DO running `socket.io` code. It responds to RPC calls from `EngineActor`, emit messages into objects like `Namespace`. If application code above send message to a engine.io Socket (an abstraction of different transports), the message got forwarded to `EngineActor`, and flow to the other end of WS connection.

Therefore application logic code based on  on `sio.Namespace` `sio.Client` `sio.Room` should work as with the original Socket.io, but with [limitations](https://github.com/jokester/socket.io-serverless?tab=readme-ov-file#limitations).

Besides the 2 DOs , there will need to be a worker entrypoint, a simple HTTP handler to forward request to `EngineActor`

While it is not impossible to prevent aforementioned hibernation (I did this in a first simpler version), I decided that a serverless version should instead exploit hibernation to save energy and protect our earth.

The states inside `EngineActor` `SocketActor`, including connection IDs, possibly dynamically created namespaces and conn IDs within, are now persisted/revived across different life cycles.

Most of `engine.io` `socket.io` code is already driven by message events. But there was a ping timer to drive [heartbeat check](https://socket.io/docs/v4/engine-io-protocol/#heartbeat). I had to stub the original code to use [alarm]() instead.

Currently socket.io-serverless only creates 1 instance for each DO class. In the future if performance becomes a problem it should be able to split the load with more DOs (similar to the adapter/cluster structure used by Socket.io)


