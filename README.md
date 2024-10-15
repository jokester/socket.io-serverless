# socket.io-serverless

A custom [socket.io](https://socket.io/) build for serverless environments. Currently [Cloudflare Worker + Durable Objects](https://developers.cloudflare.com/durable-objects/).

## Getting started

The following example assumes you already know the Cloudflare products and `wrangler` CLI.

### 1. Install the package

```
npm install --save socket.io-serverless
npm install --save-dev socket.io # this provides type declarations of socket.io
```

### 2. Create Durable Object classes and worker entrypoint

A typical worker app built with this library will have the following exports:

1. a `EngineActor` Durable Object class, to run engine.io code
2. a `SocketActor` Durable Object class, to run socket.io code
3. a entrypoint default export, to handle HTTP request

[demo-server/](https://github.com/jokester/socket.io-serverless/tree/main/demo-server) provides a minimal implementation.

### 3. Run

Write a [wrangler.toml](https://developers.cloudflare.com/workers/wrangler/configuration/), and run `wrangler dev` or `wrangler deploy`.

Again [demo-server/](https://github.com/jokester/socket.io-serverless/tree/main/demo-server) contains a wrangler.toml you can start with.

[demo-client/](https://github.com/jokester/socket.io-serverless/tree/main/demo-client) contains a frontend socket.io client app.

## Features

This lib heavily rewires things to run in and take advantage of Durable Objects.

- *Simpler* socket.io server applications should be compatible.

- Support [Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/) to save costs.
    - Across Durable Object lifecycles, internal states are persisted with [storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/). Read on to find the details.

- Drive server-inititiated ping check by [Alarm](https://developers.cloudflare.com/durable-objects/api/alarms/) rather than `setInterval` timer.

## Limitations

- Parent namespaces need to be defined in `onServerCreated` callback
    - defining parent namespace with a function is not supported

- Only a certain subset of socket.io server internal state get restored after hibernation
    - Your application logic need to be consistent with this
    - concrete namespaces, connected client ids, and namespaces they joined (but not the [rooms](https://socket.io/docs/v4/rooms/))

<!-- otherwise they won't be recovered after hibernation -->

- Only WebSocket transport is supported

- Only engine.io protocol v4 (where a server starts ping-pong checks) is supported

- [message acknowledgement](https://socket.io/docs/v4/emitting-events/#acknowledgements) is not supported.

<!--
- due to possible hibernation it's hard to do right
- it's better to not expect a transport to provide application-level ACK anyway
-->

- [socket.io connection state recovery](https://socket.io/docs/v4/tutorial/step-6) is not supported
    - Each underlying WebSocket connection will occur as independent to engine.io and socket.io

- socket.io server middleware and namespace middleware is *not tested*

 <!-- Allowing so would make it impossible to hydrate in new DO lifetime // TODO: really? -->

- Load splitting like cluster-adapter is not supported. Currently this library uses a single DO to run engine.io code, and another to run socket.io code.

<!-- Unlike other harder limitations the last 2 should be doable. I just don't have a plan yet -->

<!-- less important ?

- engine.io server middleware
- engine.io Server and socket.io Server support much fewer options

-->

### License

BSD

