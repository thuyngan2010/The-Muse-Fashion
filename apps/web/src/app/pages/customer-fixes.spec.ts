import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Customer UI fixes', () => {
  it('footer "Sản phẩm" link goes to the product catalog, not the home page', () => {
    const footer = source('../components/footer.component.ts');
    expect(footer).toContain('<li><a routerLink="/products">Sản phẩm</a></li>');
    expect(footer).not.toContain('<li><a routerLink="/">Sản phẩm</a></li>');
  });
});
