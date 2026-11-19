import { readFileSync } from 'node:fs';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { ProfilePage } from './profile.page';

const source = readFileSync(new URL('./profile.page.ts', import.meta.url), 'utf8');

describe('Profile change-password show/hide toggle', () => {
  it('each password field has its own always-visible eye button', () => {
    for (const key of ['old', 'new', 'confirm']) {
      expect(source).toContain(`[type]="isShown('${key}') ? 'text' : 'password'"`);
      expect(source).toContain(`(click)="toggleShow('${key}')"`);
    }
    expect(source).toContain("'Ẩn mật khẩu' : 'Hiện mật khẩu'");
    expect(source).not.toContain('<input type="password"');
  });

  it('hides the browser built-in reveal button so only one eye icon shows', () => {
    expect(source).toContain('.pw-field input::-ms-reveal');
  });

  it('toggles visibility per field independently', () => {
    const page = Object.create(ProfilePage.prototype) as ProfilePage;
    (page as unknown as { shownPasswords: unknown }).shownPasswords = signal<Record<string, boolean>>({});
    expect(page.isShown('new')).toBe(false);
    page.toggleShow('new');
    expect(page.isShown('new')).toBe(true);
    expect(page.isShown('old')).toBe(false);
    page.toggleShow('new');
    expect(page.isShown('new')).toBe(false);
  });
});
