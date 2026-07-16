import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    // accept unhandled rejections surfaced by pool-workers when it defensively
    // probes RPC accessors on the DO wrapper proxy (e.g. ".call", ".entries").
    dangerouslyIgnoreUnhandledErrors: true,
  },
})