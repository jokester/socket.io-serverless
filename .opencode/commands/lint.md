---
description: Run ESLint on the socket.io-serverless library
agent: build
---
Run `pnpm run --filter socket.io-serverless lint` from the repo root to check for linting errors in `socket.io-serverless/src/`.

Report any lint errors found. If fixes are needed, run `pnpm run --filter socket.io-serverless lint:fix` to auto-fix.
