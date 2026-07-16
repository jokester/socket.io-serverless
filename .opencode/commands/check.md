---
description: Build + typecheck + lint the library (full CI check)
agent: build
---
Run the full verification pipeline for the socket.io-serverless library in order:

1. `make lib-build` — build with esbuild
2. `pnpm run --filter socket.io-serverless typecheck` — typecheck with tsc
3. `pnpm run --filter socket.io-serverless lint` — lint with eslint

Report the results of each step. Stop and report errors if any step fails.
