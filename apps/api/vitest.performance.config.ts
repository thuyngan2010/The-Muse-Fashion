import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/performance/**/*.perf-spec.ts'], hookTimeout: 240000, testTimeout: 180000, fileParallelism: false } });
