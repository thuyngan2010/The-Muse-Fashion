import { describe, expect, it } from 'vitest';
import { buildEmailMessage, createMailContext, formatVnd, formatVnDateTime, KNOWN_TEMPLATES } from './index.js';

const contact: Record<string, string> = {
  MAIL_SUPPORT_EMAIL: 'support@muse.test',
  MAIL_SUPPORT_PHONE: '1900 1234',
  MAIL_ADDRESS: '1 Lê Lợi, TP.HCM',
};
const ctx = createMailContext('http://localhost:4200/', (name) => contact[name], new Date('2026-11-18T05:00:00Z'));
const bare = createMailContext('https://muse.example', () => undefined, new Date('2026-11-18T05:00:00Z'));
const TOKEN = 'a b&c/d';
const ENCODED = encodeURIComponent(TOKEN);

function expectComplete(message: { subject: string; text: string; html: string }) {
  expect(message.subject).toBeTruthy();
  expect(message.text).toContain('Architectural elegance & modern romance.');
  expect(message.text).toContain('© 2026 MUSE');
  expect(message.html).toContain('<html lang="vi"');
  expect(message.html).toContain('color-scheme');
  expect(message.html).not.toMatch(/display:\s*(flex|grid)|position:|<script/i);
  expect(message.html).not.toContain('/account/orders');
  expect(message.text).not.toContain('/account/orders');
}

describe('account email templates', () => {
  it('verify email: subject, link in html and text, greeting with name', () => {
    const message = buildEmailMessage('user.verify_email', { token: TOKEN, fullName: 'Nguyễn Thị Ánh' }, ctx);
    const link = `http://localhost:4200/verify-email?token=${ENCODED}`;
    expect(message.subject).toBe('Xác thực email để kích hoạt tài khoản MUSE');
    expect(message.html).toContain(`href="${link}"`);
    expect(message.html).toContain('XÁC THỰC EMAIL');
    expect(message.html).toContain('Xin chào Nguyễn Thị Ánh,');
    expect(message.text).toContain(link);
    expect(message.text).toContain('60 phút');
    expectComplete(message);
  });

  it('verify email still renders without fullName', () => {
    const message = buildEmailMessage('user.verify_email', { token: 'abc' }, ctx);
    expect(message.html).toContain('Xin chào, chỉ còn một bước nữa');
    expect(message.html).toContain('/verify-email?token=abc');
  });

  it('escapes special characters in dynamic data', () => {
    const message = buildEmailMessage('user.verify_email', { token: 'abc', fullName: '<script>alert(1)</script> & "Tú"' }, ctx);
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Tú&quot;');
    const invite = buildEmailMessage('staff.invite', { token: 'x', email: '<b>a</b>@x.test' }, ctx);
    expect(invite.html).not.toContain('<b>a</b>');
    expect(invite.html).toContain('&lt;b&gt;a&lt;/b&gt;@x.test');
  });

  it('truncates very long names', () => {
    const message = buildEmailMessage('user.verify_email', { token: 'abc', fullName: 'Nguyễn '.repeat(100) }, ctx);
    expect(message.html).toContain('…');
    expect(message.html.length).toBeLessThan(20_000);
  });

  it('reset password: link, rule notice and expiry', () => {
    const message = buildEmailMessage('user.reset_password', { token: TOKEN }, ctx);
    const link = `http://localhost:4200/reset-password?token=${ENCODED}`;
    expect(message.subject).toBe('Đặt lại mật khẩu tài khoản MUSE');
    expect(message.html).toContain(`href="${link}"`);
    expect(message.html).toContain('ĐẶT MẬT KHẨU MỚI');
    expect(message.html).toContain('12–128 ký tự');
    expect(message.text).toContain(link);
    expect(message.text).toContain('12–128 ký tự');
    expectComplete(message);
  });

  it('staff invite: reset link, admin login link, 24 hour expiry, uses recipient when payload has no email', () => {
    const message = buildEmailMessage('staff.invite', { token: TOKEN }, ctx, 'nv@muse.test');
    expect(message.subject).toBe('Lời mời tham gia hệ thống quản trị MUSE');
    expect(message.html).toContain(`href="http://localhost:4200/reset-password?token=${ENCODED}"`);
    expect(message.html).toContain('href="http://localhost:4200/admin/login"');
    expect(message.html).toContain('ĐẶT MẬT KHẨU &amp; KÍCH HOẠT');
    expect(message.html).toContain('nv@muse.test');
    expect(message.text).toContain('http://localhost:4200/admin/login');
    expect(message.text).toContain('24 giờ');
    expectComplete(message);
  });

  it('password changed: Vietnam time, reset link, support button only with MAIL_SUPPORT_EMAIL', () => {
    const message = buildEmailMessage('user.password_changed', { changedAt: '2026-11-18T05:30:00Z' }, ctx);
    expect(message.subject).toBe('Mật khẩu tài khoản MUSE vừa được thay đổi');
    expect(message.html).toContain('18/11/2026 12:30');
    expect(message.html).toContain('href="http://localhost:4200/forgot-password"');
    expect(message.html).toContain('href="mailto:support@muse.test"');
    expect(message.text).toContain('Thời điểm: 18/11/2026 12:30');
    expectComplete(message);
    const withoutSupport = buildEmailMessage('user.password_changed', {}, bare);
    expect(withoutSupport.html).not.toContain('LIÊN HỆ HỖ TRỢ');
    expect(withoutSupport.html).not.toContain('mailto:');
    expect(withoutSupport.html).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });

  it('default template points at the home page', () => {
    const message = buildEmailMessage('something.unknown', {}, ctx);
    expect(message.subject).toBe('Thông báo từ MUSE');
    expect(message.html).toContain('MỞ MUSE');
    expect(message.html).toContain('href="http://localhost:4200/"');
    expectComplete(message);
  });

  it('footer shows only configured contact lines', () => {
    const full = buildEmailMessage('system.notice', {}, ctx);
    expect(full.html).toContain('mailto:support@muse.test');
    expect(full.html).toContain('Hotline: 1900 1234');
    expect(full.html).toContain('Địa chỉ: 1 Lê Lợi, TP.HCM');
    const none = buildEmailMessage('system.notice', {}, bare);
    expect(none.html).not.toContain('Hotline');
    expect(none.html).not.toContain('Địa chỉ');
    expect(none.text).not.toContain('Hotline');
  });

  it('logo image is used only over https', () => {
    expect(buildEmailMessage('system.notice', {}, ctx).html).not.toContain('<img');
    expect(buildEmailMessage('system.notice', {}, bare).html)
      .toContain('src="https://muse.example/assets/brand/muse-logo-black.png"');
  });

  it('every known template renders html and text', () => {
    for (const template of KNOWN_TEMPLATES) {
      const message = buildEmailMessage(template, { token: 'abc' }, ctx, 'a@b.test');
      expect(message.html).toContain('</html>');
      expect(message.text.length).toBeGreaterThan(10);
    }
  });
});

describe('formatting helpers', () => {
  it('formats money and Vietnam time', () => {
    expect(formatVnd(1250000)).toBe('1.250.000đ');
    expect(formatVnd('abc')).toBe('0đ');
    expect(formatVnDateTime('2026-11-18T17:05:00Z')).toBe('19/11/2026 00:05');
  });
});
