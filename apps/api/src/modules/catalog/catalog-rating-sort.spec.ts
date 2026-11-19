import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service.js';

function serviceWithAggregate() {
  const aggregate = vi.fn().mockReturnValue({ exec: async () => [{ items: [], count: [] }] });
  const find = vi.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: () => ({ exec: async () => [] }) }) }) }) });
  const countDocuments = vi.fn().mockReturnValue({ exec: async () => 0 });
  const service = new CatalogService({ aggregate, find, countDocuments } as never, {} as never, {} as never, {} as never,
    { publicUrl: () => null } as never, {} as never, {} as never);
  return { service, aggregate, find };
}

describe('CatalogService sort=rating (Sản phẩm nổi bật)', () => {
  it('keeps only products with public reviews and sorts by average stars, then review count, then newest', async () => {
    const { service, aggregate } = serviceWithAggregate();
    await service.listPublished({ sort: 'rating', page: 1, limit: 4 });
    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, any>>;
    const reviewLookup = pipeline.find((stage) => stage.$lookup?.from === 'reviews');
    expect(reviewLookup.$lookup.pipeline[0].$match).toMatchObject({ status: 'PUBLIC', deletedAt: null });
    expect(pipeline).toContainEqual({ $match: { 'ratingMatch.0': { $exists: true } } });
    const facet = pipeline.at(-1)!.$facet;
    expect(facet.items[0]).toEqual({ $sort: { avgStars: -1, reviewCount: -1, createdAt: -1, _id: 1 } });
    expect(facet.items[3].$project).toMatchObject({ ratingMatch: 0, avgStars: 0, reviewCount: 0 });
  });

  it('does not touch the plain newest listing', async () => {
    const { service, aggregate, find } = serviceWithAggregate();
    await service.listPublished({ sort: 'newest', page: 1, limit: 8 });
    expect(aggregate).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalled();
  });
});
