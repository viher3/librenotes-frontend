import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vite.config.ts'

// Opt-in tests against a running backend (`npm run test:e2e`). Excluded from the normal `npm test`.
export default defineConfig((env) =>
  mergeConfig(
    typeof base === 'function' ? base(env) : base,
    defineConfig({
      test: { include: ['src/**/*.e2e.ts'], testTimeout: 30_000, hookTimeout: 60_000 },
    }),
  ),
)
