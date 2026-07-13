---
description: Run the demo server locally in Node.js mode
agent: build
---
Start the demo server in Node.js mode by running `pnpm run --filter ./demo-server dev:node` from the repo root. This uses tsx to run `src/node/main.ts` directly without Cloudflare Workers.

The server should start and listen for connections. Report the port/host it's listening on.
