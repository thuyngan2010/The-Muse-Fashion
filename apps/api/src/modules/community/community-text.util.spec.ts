import { describe, expect, it } from 'vitest';
import { assertSafeCommunityText } from './community-text.util.js';

describe('assertSafeCommunityText', () => {
  it('rejects script markup', () => {
    expect(() => assertSafeCommunityText('body', 'hello<script>')).toThrow();
  });

  it('returns trimmed plain text', () => {
    expect(assertSafeCommunityText('body', '  nice outfit  ')).toBe('nice outfit');
  });
});
