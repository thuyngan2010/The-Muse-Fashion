import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['reports/review-2026-10-29/frontend-repro.spec.ts'],
  setupFiles: ['./apps/web/test/setup.ts'],
} });
