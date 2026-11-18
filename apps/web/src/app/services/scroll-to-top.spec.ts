import { describe, expect, it } from 'vitest';
import { shouldScrollToTop, urlPath } from './scroll-to-top';

describe('scroll to top on page change', () => {
  it('scrolls to the top when a link opens another page', () => {
    expect(shouldScrollToTop('/', '/products?sort=newest', 'imperative')).toBe(true);
    expect(shouldScrollToTop('/about', '/ai/try-on', 'imperative')).toBe(true);
    expect(shouldScrollToTop('/products/ao-a', '/products/ao-b', 'imperative')).toBe(true);
  });

  it('keeps the position for query-only changes, fragments, back/forward and the first load', () => {
    expect(shouldScrollToTop('/products', '/products?category=ao', 'imperative')).toBe(false);
    expect(shouldScrollToTop('/products?page=1', '/products?page=2', 'imperative')).toBe(false);
    expect(shouldScrollToTop('/about', '/community#posts', 'imperative')).toBe(false);
    expect(shouldScrollToTop('/products', '/', 'popstate')).toBe(false);
    expect(shouldScrollToTop(null, '/products', 'imperative')).toBe(false);
  });

  it('compares only the path part of the URL', () => {
    expect(urlPath('/products?sort=newest#top')).toBe('/products');
    expect(urlPath('')).toBe('/');
  });
});
