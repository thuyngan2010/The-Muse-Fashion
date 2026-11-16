import { describe, expect, it } from 'vitest';
import { HttpStatus, NotImplementedException } from '@nestjs/common';
import { FeatureScaffoldService } from './feature-scaffold.service.js';

describe('FeatureScaffoldService', () => {
  it('fails closed with an explicit stable code', () => {
    const service = new FeatureScaffoldService();
    try {
      service.pending('orders.create');
      throw new Error('expected pending capability to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NotImplementedException);
      const exception = error as NotImplementedException;
      expect(exception.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
      expect(exception.getResponse()).toMatchObject({ code: 'FEATURE_NOT_IMPLEMENTED' });
    }
  });
});
