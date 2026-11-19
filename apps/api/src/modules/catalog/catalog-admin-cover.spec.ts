import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service.js';

const lean = <T>(value: T) => ({ lean: () => ({ exec: async () => value }) });
const M1 = '64b7f0c2a1b2c3d4e5f60001';
const M2 = '64b7f0c2a1b2c3d4e5f60002';

function build(rows: Array<Record<string, unknown>>, media: Array<Record<string, unknown>>) {
  const find = vi.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => lean(rows) }) }) });
  const countDocuments = vi.fn().mockReturnValue({ exec: async () => rows.length });
  const mediaFind = vi.fn().mockReturnValue(lean(media));
  const storage = { publicUrl: vi.fn(() => null), signedReadUrl: vi.fn(async (key: string) => `https://signed/${key}`) };
  const service = new CatalogService({ find, countDocuments } as never, {} as never, {} as never,
    { find: mediaFind } as never, storage as never, {} as never, {} as never);
  return { service, mediaFind, storage };
}

describe('CatalogService.listAdmin ảnh bìa (coverImage)', () => {
  it('uses the first uploaded image when the product has no manual image URL', async () => {
    const { service, storage } = build(
      [{ _id: 'p1', name: 'Áo', status: 'PUBLISHED', images: [], imageMediaIds: [M1, M2], price: 1 }],
      [{ _id: M1, key: 'k1', visibility: 'PRIVATE' }, { _id: M2, key: 'k2', visibility: 'PRIVATE' }],
    );
    const res = await service.listAdmin();
    expect(res.items[0].coverImage).toBe('https://signed/k1');
    expect(res.items[0].images).toEqual([]);
    expect(storage.signedReadUrl).toHaveBeenCalledTimes(1);
  });

  it('keeps the manual URL first and does not touch media for it', async () => {
    const { service, mediaFind } = build(
      [{ _id: 'p1', name: 'Áo', status: 'DRAFT', images: ['https://cdn/a.jpg'], imageMediaIds: [M1], price: 1 }], [],
    );
    const res = await service.listAdmin();
    expect(res.items[0].coverImage).toBe('https://cdn/a.jpg');
    expect(mediaFind).not.toHaveBeenCalled();
  });

  it('returns null when the product has no usable image', async () => {
    const { service } = build([{ _id: 'p1', name: 'Áo', status: 'DRAFT', images: [], imageMediaIds: [M1], price: 1 }], []);
    const res = await service.listAdmin();
    expect(res.items[0].coverImage).toBeNull();
  });
});
