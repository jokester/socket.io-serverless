# socket.io-serverless

A custom [socket.io](https://socket.io/) build for serverless environments. Currently [Cloudflare Worker + Durable Objects](https://developers.cloudflare.com/durable-objects/).

## How to run in Cloudflare Worker

The following example assumes you already know the Cloudflare products and `wrangler` CLI.

### 1. Install the package

```
npm install --save socket.io-serverless
npm install --save-dev socket.io
```

### 2. Create Durable Object classes and worker entrypoint

Please check the example in [demo-server/](demo-server/).

### 3. Run

Write a `wrangler.toml` and run `wrangler dev`

## Features and limitations

This lib heavily rewires things to run in and take advantage of Durable Objects.

- *Simpler* socket.io-based server should still work.

- Support [Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/) to save costs.
    - Across Durable Object lifecycles, internal states are persisted with [storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/)

<!-- [Alarm](https://developers.cloudflare.com/durable-objects/api/alarms/) -->

While it works (in my cases ^{TM}), extra limitations exist:

- socket.io event callbacks must be configured when Durable Object initializes.

<!-- otherwise they won't be recovered after hibernation -->

- Only WebSocket transport is supported

- [message acknowledgement](https://socket.io/docs/v4/emitting-events/#acknowledgements) is not supported. <!-- TODO really? -->

- [connection state recovery](https://socket.io/docs/v4/tutorial/step-6) is not supported
    - Each underlying WebSocket connection will occur as independent to engine.io and socket.io

- Defining parent namespace with a function is not supported

- socket.io server middleware and namespace middleware is *not tested*

 <!-- Allowing so would make it impossible to hydrate in new DO lifetime // TODO: really? -->

- Rooms

- Load splitting with multiple running instances. Currently 1 DO to run engine.io code, and 1 to run socket.io code.

<!-- Unlike other harder limitations the last 2 should be doable. I just don't have a plan yet -->

<!-- less important ?

- engine.io server middleware

-->

## Internal stuff
