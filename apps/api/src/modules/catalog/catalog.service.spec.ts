import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

describe('CatalogService size guide', () => {
  it('requires at least one measurement for size suggestion', async () => {
    const service = new CatalogService({} as never, {} as never, {} as never, {} as never, { publicUrl: () => null } as never, {} as never, {} as never);
    expect(() => service.suggestSize('demo', {})).toThrow(BadRequestException);
  });

  it('picks the closest size row from measurements', async () => {
    const findOne = vi.fn().mockReturnValue({
      lean: () => ({
        exec: async () => ({
          _id: 'p1',
          slug: 'demo',
          status: 'PUBLISHED',
          sizeGuide: [
            { size: 'M', measurements: { bust: 90, waist: 75 } },
            { size: 'L', measurements: { bust: 96, waist: 81 } },
          ],
        }),
      }),
    });
    const service = new CatalogService({ findOne } as never, {} as never, {} as never, {} as never, { publicUrl: () => null } as never, {} as never, {} as never);
    const result = await service.suggestSize('demo', { bust: 95, waist: 80 });
    expect(result.suggestedSize).toBe('L');
  });
});
