import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isLandscape } from '../shared/ai-photo';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('AI photo guidance (face is enough)', () => {
  it.each(['./ai-try-on.page.ts', './ai-mix-match.page.ts'])('%s shows the always-visible photo guide and soft hints', (path) => {
    const page = source(path);
    expect(page).toContain('TẢI ẢNH CỦA BẠN');
    expect(page).not.toContain('TẢI ẢNH TOÀN THÂN');
    expect(page).toContain('Chỉ cần ảnh thấy rõ khuôn mặt. Nên dùng ảnh <strong>toàn thân, đứng thẳng, đủ sáng, một mình</strong>');
    expect(page).toContain('Ảnh nằm ngang thường không thấy toàn thân. Bạn có thể đổi sang ảnh dọc để kết quả đẹp hơn.');
    expect(page).toContain('@if (!height || !weight) { <p class="measure-hint">Nhập chiều cao và cân nặng giúp AI dựng dáng chính xác hơn, nhất là khi ảnh không toàn thân.</p> }');
  });

  it('flags only images wider than tall', () => {
    expect(isLandscape(4032, 3024)).toBe(true);
    expect(isLandscape(3024, 4032)).toBe(false);
    expect(isLandscape(1000, 1000)).toBe(false);
    expect(isLandscape(0, 0)).toBe(false);
  });
});
