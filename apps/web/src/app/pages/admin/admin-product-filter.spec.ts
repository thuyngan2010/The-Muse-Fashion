import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./admin-products.page.ts', import.meta.url), 'utf8');

describe('Bộ lọc trạng thái sản phẩm admin', () => {
  it('only offers Tất cả, Đang bán and Đã lưu trữ (no Bản nháp)', () => {
    const select = source.slice(source.indexOf('(ngModelChange)="setStatusFilter($event)"'), source.indexOf('</select>', source.indexOf('setStatusFilter($event)')));
    expect(select).toContain('<option value="">Tất cả</option>');
    expect(select).toContain('<option value="PUBLISHED">');
    expect(select).toContain('<option value="ARCHIVED">');
    expect(select).not.toContain('value="DRAFT"');
  });
});
