import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/audit-regressions.spec.ts'] } });
