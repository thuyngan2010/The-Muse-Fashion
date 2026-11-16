import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['reports/audit-2026-10-29/frontend-repro.spec.ts'] },
});
