import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@chatmail/core': r('./packages/core/src/index.ts'),
      '@chatmail/ui': r('./packages/ui/src/index.ts'),
      '@chatmail/adapter-gmail': r('./packages/adapters/gmail/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['packages/**/test/**/*.test.ts'],
  },
});
