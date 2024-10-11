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

- Support  and [Hibernation]() to save costs.
    - To make socket.io code work across Durable Object ([hibernates, internal states are persisted with [storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/), 

<!-- [Alarm](https://developers.cloudflare.com/durable-objects/api/alarms/) -->

While it works (in my cases ^{TM}), extra limitations exist:

- socket.io event callbacks must be configured when Durable Object initializes.

<!-- otherwise they won't be recovered after hibernation -->

- Only WebSocket transport is supported

- Defining parent namespace with a function is not supported

 <!-- Allowing so would make it impossible to hydrate in new DO lifetime -->

- Rooms

<!-- Unlike other harder limitations this should be doable. I just don't have a plan yet -->

- Load splitting with multiple running instances. Currently 1 DO to run engine.io code, and 

## Internal stuff
