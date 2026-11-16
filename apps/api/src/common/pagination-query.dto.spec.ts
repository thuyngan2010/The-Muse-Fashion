import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto.js';

describe('PaginationQueryDto', () => {
  it.each([
    { page: 'Infinity' }, { page: '-1' }, { page: '1.5' }, { page: '1000001' },
    { limit: 'Infinity' }, { limit: '0' }, { limit: '51' },
  ])('rejects invalid pagination query %j', (query) => {
    expect(validateSync(plainToInstance(PaginationQueryDto, query))).not.toHaveLength(0);
  });

  it('accepts bounded integers and converts query strings to numbers', () => {
    const query = plainToInstance(PaginationQueryDto, { page: '2', limit: '50' });
    expect(validateSync(query)).toHaveLength(0);
    expect(query).toMatchObject({ page: 2, limit: 50 });
  });
});
