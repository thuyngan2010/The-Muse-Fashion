import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'fc-account-sidebar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <aside class="account-sidebar" aria-label="Điều hướng tài khoản">
      <div class="identity">
        <span class="avatar" aria-hidden="true">{{ userInitial }}</span>
        <div><strong>{{ auth.currentUser()?.fullName || 'Tài khoản MUSE' }}</strong><span>{{ auth.currentUser()?.email || '' }}</span></div>
      </div>

      <nav class="account-nav">
        <a routerLink="/profile" [class.active]="activeItem === 'overview'">
          <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg><span>Tổng quan</span>
        </a>
        <a routerLink="/profile" [class.active]="activeItem === 'profile'" [attr.aria-current]="activeItem === 'profile' ? 'page' : null">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6H5Z"/></svg><span>Hồ sơ cá nhân</span>
        </a>
        <a routerLink="/orders" [class.active]="activeItem === 'orders'">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 5h14v16H5z"/><path d="M8 5V3h8v2M9 10h6"/></svg><span>Đơn hàng của tôi</span>
        </a>
        <a routerLink="/addresses" [class.active]="activeItem === 'addresses'">
          <svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>Sổ địa chỉ</span>
        </a>
        <a routerLink="/ai/try-on" [class.active]="activeItem === 'ai-history'">
          <svg viewBox="0 0 24 24" fill="none"><path d="m12 2 1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2ZM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"/></svg><span>Lịch sử AI</span>
        </a>
        <a routerLink="/notifications" [class.active]="activeItem === 'notifications'">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 17h12l-1.5-2.5V9a4.5 4.5 0 0 0-9 0v5.5L6 17Z"/><path d="M10 20h4"/></svg><span>Thông báo</span>
        </a>
        <a routerLink="/profile" fragment="change-password" [class.active]="activeItem === 'password'">
          <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="11"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg><span>Đổi mật khẩu</span>
        </a>
      </nav>

      <button type="button" class="logout" (click)="auth.logout()">
        <svg viewBox="0 0 24 24" fill="none"><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></svg><span>Đăng xuất</span>
      </button>
    </aside>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Outfit:wght@300;400;500&display=swap');
    :host { display:block; }
    .account-sidebar { width:280px; min-height:523px; border:1px solid #5f5353; background:#fff; padding:24px; color:#444748; font-family:'Montserrat',sans-serif; }
    .identity { min-height:81px; padding-bottom:24px; border-bottom:1px solid #e3e2e2; display:flex; align-items:flex-start; gap:16px; }
    .avatar { width:56px; height:56px; flex:0 0 auto; border:1px solid #e3e2e2; border-radius:50%; display:grid; place-items:center; background:#ffd9e1; color:#000; font:500 20px 'Outfit',sans-serif; text-transform:uppercase; }
    .identity div { min-width:0; padding-top:7px; } .identity strong,.identity span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .identity strong { color:#000; font:500 16px/24px 'Outfit',sans-serif; } .identity div span { font-size:12px; line-height:18px; letter-spacing:.24px; }
    .account-nav { padding:4px 0 20px; border-bottom:1px solid #e3e2e2; }
    .account-nav a { min-height:50px; margin-top:0; padding:12px; display:grid; grid-template-columns:18px minmax(0,1fr); gap:12px; align-items:center; color:#444748; text-decoration:none; font-size:14px; line-height:22px; letter-spacing:.14px; border-left:3px solid transparent; }
    .account-nav a:hover,.account-nav a:focus-visible { background:#f7f5f5; color:#000; } .account-nav a.active { background:#ffd9e1; border-left-color:#000; color:#000; }
    svg { width:18px; height:18px; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
    .logout { width:100%; min-height:42px; margin-top:12px; padding:8px 12px; border:0; background:#fff; display:flex; align-items:center; gap:12px; color:#de233f; font:400 14px/22px 'Montserrat',sans-serif; cursor:pointer; }
    .logout:hover,.logout:focus-visible { background:#fff3f4; }
    @media (max-width:900px) { .account-sidebar { width:100%; min-height:0; padding:16px; } .identity { min-height:0; } .account-nav { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); padding-top:12px; } }
    @media (max-width:520px) { .account-nav { grid-template-columns:1fr; } }
  `],
})
export class AccountSidebarComponent {
  readonly auth = inject(AuthService);
  @Input() activeItem: 'overview' | 'profile' | 'orders' | 'addresses' | 'ai-history' | 'notifications' | 'password' = 'profile';
  get userInitial(): string { return this.auth.currentUser()?.fullName?.trim()?.[0] || 'M'; }
}
