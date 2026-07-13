---
description: Initialize or patch the socket.io git submodule
agent: build
---
Initialize and patch the upstream socket.io git submodule:

1. If not already initialized: `git submodule update --init`
2. Apply patches: `make patch-upstream`

The patches are in `patches/0001-workarounds-to-upstream-socket.io.patch` and fix export maps and import styles for esbuild bundling.
