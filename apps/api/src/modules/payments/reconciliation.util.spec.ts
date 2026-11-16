import { describe, expect, it } from 'vitest';
import { extractReconciliationCodes, generateReconciliationCode } from './reconciliation.util.js';

describe('reconciliation codes', () => {
  it('generates FC-prefixed codes within VietQR length budget', () => {
    const code = generateReconciliationCode();
    expect(code).toMatch(/^FC[A-Z0-9]{8}$/);
    expect(code.length).toBeLessThanOrEqual(25);
  });

  it('extracts one code from noisy transfer content', () => {
    expect(extractReconciliationCodes('CK FCABCDEF12 thanks')).toEqual(['FCABCDEF12']);
  });

  it('flags ambiguous content with multiple codes', () => {
    expect(extractReconciliationCodes('FC11111111 FC22222222')).toHaveLength(2);
  });
});
