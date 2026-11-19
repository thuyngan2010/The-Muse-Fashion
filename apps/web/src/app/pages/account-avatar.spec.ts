import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./account.page.ts', import.meta.url), 'utf8');

describe('Ảnh đại diện ở trang Tổng quan tài khoản', () => {
  it('shows the uploaded avatar, falling back to the initial like the sidebar', () => {
    expect(source).toContain('@if (auth.currentUser()?.avatarUrl; as url) { <img [src]="url" alt="" /> } @else { {{ initial() }} }');
    expect(source).toContain('.avatar img { width: 100%; height: 100%; object-fit: cover;');
  });
});
