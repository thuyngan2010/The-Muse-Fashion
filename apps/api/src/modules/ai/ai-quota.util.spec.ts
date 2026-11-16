import { describe, expect, it } from 'vitest';
import { nextUtcDayStart, utcDayStart } from './ai-quota.util.js';

describe('ai quota window', () => {
  it('uses UTC midnight boundaries', () => {
    const sample = new Date('2026-10-24T15:30:00.000Z');
    const start = utcDayStart(sample);
    expect(start.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(nextUtcDayStart(sample).toISOString()).toBe('2026-10-25T00:00:00.000Z');
  });
});
