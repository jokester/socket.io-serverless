### how the code is developed and built

Because socket.io does not publish original TS code in NPM, I included the `socket.io` repo ([now a monorepo too](https://github.com/socketio/socket.io/issues/3533)) as a git submodule. My monorepo therefore contains packages like `socket.io-serverless` `socket.io/packages/socket.io` ``socket.io/packages/engine.io` `

Some socket.io code need to be patched, including export map in `package.json`. The patches are contained in the monorepo and applied by Makefile.

`esbuild` bundle `socket.io-serverless` code , along with Socket.io and other deps, into a non minified bundle.

A `esbuild` [build script](https://github.com/jokester/socket.io-serverless/blob/main/socket.io-serverless/build.mjs) is used to customize the deps resolution process. Some npm packages are replaced with CF-compatible implementation (like `debug`), or simple stubbed (like `node:http` ).

