import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AiJobWriteDto } from './ai.dto.js';

const base = { inputMediaId: '507f1f77bcf86cd799439011', productIds: ['507f1f77bcf86cd799439012'], consentPolicyVersion: 'v1' };
const check = (extra: Record<string, unknown>) => validateSync(Object.assign(new AiJobWriteDto(), base, extra)).map(e => e.property);

describe('AiJobWriteDto body measurements', () => {
  it('accepts missing and in-range measurements', () => {
    expect(check({})).toEqual([]);
    expect(check({ heightCm: 165, weightKg: 52 })).toEqual([]);
    expect(check({ heightCm: 120, weightKg: 200 })).toEqual([]);
  });
  it('rejects values outside the allowed range', () => {
    expect(check({ heightCm: 300 })).toEqual(['heightCm']);
    expect(check({ heightCm: 119 })).toEqual(['heightCm']);
    expect(check({ heightCm: 165.5 })).toEqual(['heightCm']);
    expect(check({ weightKg: 29 })).toEqual(['weightKg']);
    expect(check({ weightKg: 201 })).toEqual(['weightKg']);
  });
});
