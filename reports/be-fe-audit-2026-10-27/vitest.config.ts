import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['reports/be-fe-audit-2026-10-27/repro.spec.ts'],
  },
});
