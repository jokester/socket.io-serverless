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

patch-upstream:
	cd socket.io && git reset --hard socket.io@4.8.0 && git reset . && git checkout -- . && git apply < ../patches/0001-workarounds-to-upstream-socket.io.patch