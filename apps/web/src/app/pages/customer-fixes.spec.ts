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

describe('Home page links', () => {
  it('"XEM CỘNG ĐỒNG" goes to the community blog page', () => {
    const home = source('./home.page.ts');
    expect(home).toContain('<a routerLink="/community" class="btn-outline">{{ content.craft.secondary }}</a>');
  });
});

describe('Home new arrivals', () => {
  it('"XEM TẤT CẢ" of BỘ SƯU TẬP MỚI goes to the collections page', () => {
    const home = source('./home.page.ts');
    expect(home).toContain('<a class="btn-outline" routerLink="/lookbooks">{{ content.newArrivals.viewAll }}');
  });
});

describe('AI Mix & Match hero links', () => {
  it('"Xem lịch sử" uses the same plain text-link style as "Về trang Thử đồ" (no outlined box)', () => {
    const page = source('./ai-mix-match.page.ts');
    expect(page).toContain('<a routerLink="/ai/history" class="text-link">{{ content.historyLink }}</a>');
    expect(page).toContain('<a routerLink="/ai/try-on" class="text-link">{{ content.tryOnLink }}</a>');
  });

  it('both hero links are written in the same all-caps style', () => {
    const content = source('../shared/store-content.ts');
    expect(content).toContain("historyLink: 'XEM LỊCH SỬ',");
    expect(content).toContain("tryOnLink: 'VỀ TRANG THỬ ĐỒ',");
  });
});

describe('AI Try-on hero links', () => {
  it('history and Mix & Match links sit in a spaced flex row with the same font size', () => {
    const page = source('./ai-try-on.page.ts');
    const row = page.indexOf('<div class="hero-links">');
    expect(row).toBeGreaterThan(-1);
    expect(page.indexOf('class="history-link"')).toBeGreaterThan(row);
    expect(page.indexOf('class="text-link">Khám phá Mix &amp; Match')).toBeGreaterThan(row);
    expect(page).toMatch(/\.hero-links\{display:flex;[^}]*gap:/);
    expect(page).toMatch(/\.history-link\{[^}]*font-size:12px/);
    expect(page).toMatch(/\.text-link\{[^}]*font-size:12px/);
  });
});

describe('Community cover post badge', () => {
  it('labels the auto-picked cover post as the newest post', () => {
    const page = source('./community.page.ts');
    expect(page).toContain('<span class="cover-badge">BÀI MỚI NHẤT</span>');
    expect(page).not.toContain('COVER STORY');
  });
});
