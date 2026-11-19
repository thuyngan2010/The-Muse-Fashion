import { describe, expect, it } from 'vitest';
import type { ProductSummary } from '@fashion/contracts';
import { pickFeaturedProducts } from './home.page';

const p = (id: string) => ({ id, name: id, slug: id, price: 1, currency: 'VND', images: [], status: 'PUBLISHED' }) as ProductSummary;
const ids = (list: ProductSummary[]) => list.map((x) => x.id);

describe('Home "Sản phẩm nổi bật"', () => {
  it('shows the highest rated products first', () => {
    expect(ids(pickFeaturedProducts([p('r1'), p('r2'), p('r3'), p('r4')], [p('n1'), p('n2')]))).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('fills missing slots with the newest products without duplicates', () => {
    expect(ids(pickFeaturedProducts([p('n2')], [p('n1'), p('n2'), p('n3')]))).toEqual(['n2', 'n1', 'n3']);
  });

  it('keeps the old rule (5th–8th newest) when nothing is rated yet', () => {
    const newest = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'].map(p);
    expect(ids(pickFeaturedProducts([], newest))).toEqual(['n5', 'n6', 'n7', 'n8']);
  });

  it('repeats the newest products when the store has fewer than 5 products', () => {
    expect(ids(pickFeaturedProducts([], [p('n1'), p('n2'), p('n3')]))).toEqual(['n1', 'n2', 'n3']);
    expect(ids(pickFeaturedProducts([], [p('n1'), p('n2'), p('n3'), p('n4'), p('n5'), p('n6')]))).toEqual(['n5', 'n6', 'n1', 'n2']);
  });
});
