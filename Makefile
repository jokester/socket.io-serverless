lib:
	cd socket.io-serverless && node build.mjs

lib-watch:
	cd socket.io-serverless && node build.mjs --watch

run-demo-client:
	pnpm run --filter ./demo-client dev

run-demo-server:
	pnpm run --filter ./demo-server dev:cf

build-demo-server:
	pnpm run --filter ./demo-server build:cf
