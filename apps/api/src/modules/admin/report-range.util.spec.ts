import { describe, expect, it } from 'vitest';
import { resolveSalesReportRange, vnMonthStartUtc } from './report-range.util.js';

describe('resolveSalesReportRange', () => {
  it('defaults to the current month in Asia/Ho_Chi_Minh', () => {
    const sample = new Date('2026-10-15T10:00:00.000Z');
    const start = vnMonthStartUtc(sample);
    expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    const range = resolveSalesReportRange(undefined, undefined);
    expect(range.from.getTime()).toBeLessThanOrEqual(range.to.getTime());
  });

  it('rejects invalid custom ranges', () => {
    expect(() => resolveSalesReportRange('2026-10-02T00:00:00.000Z', '2026-10-01T00:00:00.000Z')).toThrow();
  });
});
