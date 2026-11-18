import { describe, expect, it } from 'vitest';
import { escapeRegex } from './escape-regex.js';

describe('escapeRegex', () => {
  it('escapes every regex metacharacter so input matches literally', () => {
    const input = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
    const re = new RegExp(escapeRegex(input), 'i');
    expect(re.test(input)).toBe(true);
    expect(re.test('aXb')).toBe(false);
  });

  it('does not throw on an unbalanced pattern', () => {
    expect(() => new RegExp(escapeRegex('(['), 'i')).not.toThrow();
  });
});
