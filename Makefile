lib-build:
	pnpm run --filter socket.io-serverless build

lib-watch:
	pnpm run --filter socket.io-serverless build:watch

demo-client-dev:
	pnpm run --filter ./demo-client dev

demo-server-dev:
	pnpm run --filter ./demo-server dev:cf

demo-server-bundle:
	pnpm run --filter ./demo-server build:cf

patch-upstream:
	cd socket.io && git reset --hard socket.io@4.8.1 && git reset . && git checkout -- . && git apply < ../patches/0001-workarounds-to-upstream-socket.io.patch
