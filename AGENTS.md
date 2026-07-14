# socket.io-serverless

A custom socket.io build that runs in Cloudflare Workers + Durable Objects. This is a pnpm monorepo with the core library, demo server, and demo client.

## Project Structure

```
socket.io-serverless/   # Main library (the npm package)
  src/cf/index.ts       # Public API entry point
  src/cf/eio/           # Engine.IO layer rewired for Durable Objects
  src/cf/sio/           # Socket.IO layer rewired for Durable Objects
  src/debug/            # Custom debug logger replacement
  src/utils/            # Utility modules (lazy, persisted)
  build.mjs             # esbuild script (not wrangler) - custom resolution plugins
  dist/                 # Build output (esm format, non-minified)
  mocks/                # Stub modules replacing Node.js APIs for CF environment
demo-server/            # Backend demo app (CF Worker + Durable Objects)
  test/                 # Vitest + @cloudflare/vitest-pool-workers integration tests
  vitest.config.mts     # Vitest config (runs DOs in workerd via Miniflare)
demo-client/            # Frontend demo app (Preact + Vite + Tailwind)
shared-config/          # Shared tsconfig, eslint, dprint, jest configs
socket.io/              # Git submodule (upstream socket.io monorepo)
patches/                # Patches applied to the socket.io submodule
docs/                   # Development and architecture documentation
```

## Architecture

Two Durable Objects implement socket.io in a serverless environment:

1. **EngineActor** (`src/cf/eio/EngineActorBase.ts`) — Runs engine.io code. Accepts WebSocket connections, forwards messages bidirectionally between `SocketActor` and real WS connections. Singleton instance. Uses DO Alarms API for heartbeat instead of `setInterval`.

2. **SocketActor** (`src/cf/sio/SocketActorBase.ts`) — Runs socket.io code. Responds to RPC calls from `EngineActor`, emits into `Namespace`/`Client`/`Room` objects. Application logic lives in `onServerCreated` callback. Single instance (no cluster adapter yet).

A **Worker entrypoint** (thin HTTP handler) forwards upgrade requests to `EngineActor`. State inside DOs (connection IDs, namespaces, client IDs) is persisted/revived across hibernation via DO Storage API.

## Build & Development

### Prerequisites
- pnpm 9.12.0
- Node.js 20+
- The `socket.io` git submodule must be initialized: `git submodule update --init`
- Then patch it: `make patch-upstream` (or `cd socket.io && git reset --hard socket.io@4.8.1 && git reset . && git checkout -- . && git apply < ../patches/0001-workarounds-to-upstream-socket.io.patch`)

### Install
```bash
pnpm install
```

### Build the library
```bash
make lib-build          # pnpm run --filter socket.io-serverless build
make lib-watch          # pnpm run --filter socket.io-serverless build:watch
```

### Typecheck the library
```bash
# inside socket.io-serverless/
pnpm run typecheck      # tsc --noEmit
pnpm run typecheck:watch
```

### Lint & Format the library
```bash
# inside socket.io-serverless/
pnpm run lint           # eslint src
pnpm run lint:fix       # eslint --fix src
pnpm run format         # dprint fmt
```

### Run demos
```bash
make demo-server-dev    # wrangler dev (CF Worker + DO)
make demo-client-dev    # vite dev (Preact frontend)
make demo-server-bundle # wrangler deploy --dry-run
```

### Demo server also runs as plain Node.js
```bash
# inside demo-server/
pnpm run dev:node       # tsx watch src/node/main.ts
```

### Run integration tests
The tests use `@cloudflare/vitest-pool-workers` to spin up the real `workerd` runtime locally via Miniflare, with the Durable Object bindings from `demo-server/wrangler.toml` honored. They exercise the full Worker → EngineActor → SocketActor pipeline, inspect DO storage via `runInDurableObject`, and flush the 30 s heartbeat `AlarmTimer` via `runDurableObjectAlarm`.

```bash
make lib-build                 # the Worker imports the bundled library, so build it first
pnpm run --filter demo-server test        # vitest run
pnpm run --filter demo-server test:watch  # vitest watch
```

Available test APIs (imported from `cloudflare:test` / `cloudflare:workers`):
- `env.engineActor` / `env.socketActor` — DO namespace bindings, exactly as in production
- `exports.default.fetch(req)` — invoke the Worker entrypoint as a real upgrade request
- `runInDurableObject(stub, cb)` — inspect or seed DO instance state and `state.storage` directly
- `runDurableObjectAlarm(stub)` — fire the EngineActor's `AlarmTimer` heartbeat immediately
- `evictDurableObject(stub)` — test hibernation recovery (hibernatable WebSockets + persisted state)

## Key Technical Details

- **Build tooling**: esbuild (not wrangler) bundles `socket.io-serverless` with custom resolution plugins in `build.mjs`. Node.js stdlib imports (`http`, `fs`, `crypto`, etc.) are rewired to mock stubs in `mocks/`. Socket.io upstream TS source is imported directly (bypassing npm export maps).
- **Formatter**: dprint (config in `shared-config/dprint.json` or per-package)
- **Linter**: ESLint flat config (`.mjs` files in `shared-config/`)
- **TypeScript**: extends `@tsconfig/strictest`, moduleResolution is `bundler`
- **Integration tests** live in `demo-server/test/` and use Vitest + `@cloudflare/vitest-pool-workers` (no jest tests). See "Run integration tests" above.
- Only **WebSocket transport** is supported; engine.io protocol v4 only
- Parent namespaces must be defined in `onServerCreated` callback (no dynamic/function-based namespace creation)
- Room memberships do NOT survive DO hibernation
- No message acknowledgements, no connection state recovery

## Code Conventions

- TypeScript strict mode (from `@tsconfig/strictest`)
- Single quotes, no semicolons (dprint formatting)
- Use `src/debug/index.ts` instead of the `debug` npm package for logging
- Imports in the library are rewired at build time by esbuild plugins; be aware that some imports resolve to mocks in the CF environment
- Package is `type: "module"` — use ESM imports
