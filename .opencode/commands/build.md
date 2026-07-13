---
description: Build the socket.io-serverless library with esbuild
agent: build
---
Build the socket.io-serverless library by running `make lib-build` from the repo root. This runs `pnpm run --filter socket.io-serverless build` which triggers the esbuild script in `build.mjs`.

After building, verify the output exists at `socket.io-serverless/dist/cf.js` and check for any build errors.
