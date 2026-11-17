import { Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../services/auth.service';

type AccountItem = 'overview' | 'profile' | 'orders' | 'addresses' | 'ai-history' | 'notifications' | 'password';

@Component({
  selector: 'fc-account-sidebar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <aside class="account-sidebar" aria-label="Điều hướng tài khoản">
      <div class="identity">
        <span class="avatar" aria-hidden="true">@if (auth.currentUser()?.avatarUrl; as url) { <img [src]="url" alt="" /> } @else { {{ userInitial }} }</span>
        <div><strong>{{ auth.currentUser()?.fullName || 'Tài khoản MUSE' }}</strong><span>{{ auth.currentUser()?.email || '' }}</span></div>
      </div>

      <nav class="account-nav">
        <a routerLink="/account" [class.active]="current() === 'overview'" [attr.aria-current]="current() === 'overview' ? 'page' : null">
          <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/></svg><span>Tổng quan</span>
        </a>
        <a routerLink="/profile" [class.active]="current() === 'profile'" [attr.aria-current]="current() === 'profile' ? 'page' : null">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6H5Z"/></svg><span>Hồ sơ cá nhân</span>
        </a>
        <a routerLink="/orders" [class.active]="current() === 'orders'" [attr.aria-current]="current() === 'orders' ? 'page' : null">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 5h14v16H5z"/><path d="M8 5V3h8v2M9 10h6"/></svg><span>Đơn hàng của tôi</span>
        </a>
        <a routerLink="/addresses" [class.active]="current() === 'addresses'" [attr.aria-current]="current() === 'addresses' ? 'page' : null">
          <svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>Sổ địa chỉ</span>
        </a>
        <a routerLink="/ai/history" [class.active]="current() === 'ai-history'" [attr.aria-current]="current() === 'ai-history' ? 'page' : null">
          <svg viewBox="0 0 24 24" fill="none"><path d="m12 2 1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2ZM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"/></svg><span>Lịch sử AI</span>
        </a>
        <a routerLink="/notifications" [class.active]="current() === 'notifications'" [attr.aria-current]="current() === 'notifications' ? 'page' : null">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 17h12l-1.5-2.5V9a4.5 4.5 0 0 0-9 0v5.5L6 17Z"/><path d="M10 20h4"/></svg><span>Thông báo</span>
        </a>
        <a routerLink="/profile" [queryParams]="{ tab: 'password' }" [class.active]="current() === 'password'" [attr.aria-current]="current() === 'password' ? 'page' : null">
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
    .avatar { overflow:hidden; } .avatar img { width:100%; height:100%; object-fit:cover; display:block; }
    svg { width:18px; height:18px; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
    .logout { width:100%; min-height:42px; margin-top:12px; padding:8px 12px; border:0; background:#fff; display:flex; align-items:center; gap:12px; color:#de233f; font:400 14px/22px 'Montserrat',sans-serif; cursor:pointer; }
    .logout:hover,.logout:focus-visible { background:#fff3f4; }
    @media (max-width:980px) {
      :host { min-width:0; }
      .account-sidebar { width:100%; min-height:0; padding:12px 16px; display:flex; flex-direction:column; gap:8px; }
      .identity { min-height:0; padding-bottom:12px; }
      .account-nav { display:flex; gap:8px; padding:4px 0 12px; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; -webkit-overflow-scrolling:touch; }
      .account-nav a { flex:0 0 auto; min-height:44px; margin:0; padding:10px 14px; border:1px solid #e3e2e2; border-left-width:1px; white-space:nowrap; }
      .account-nav a.active { border-color:#000; }
      .logout { width:auto; align-self:flex-start; margin-top:0; }
    }
    @media (max-width:640px) { .avatar { width:44px; height:44px; font-size:16px; } .identity { gap:12px; } }
  `],
})
export class AccountSidebarComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  // Không bắt buộc: mục đang chọn tự xác định theo URL hiện tại.
  @Input() activeItem?: AccountItem;
  readonly current = signal<AccountItem>(this.fromUrl(this.router.url));
  private readonly sub: Subscription = this.router.events
    .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
    .subscribe(() => this.current.set(this.fromUrl(this.router.url)));

  get userInitial(): string { return this.auth.currentUser()?.fullName?.trim()?.[0] || 'M'; }
  ngOnDestroy(): void { this.sub.unsubscribe(); }

  private fromUrl(url: string): AccountItem {
    const tree = this.router.parseUrl(url);
    const path = '/' + tree.root.children['primary']?.segments.map(s => s.path).join('/');
    if (path === '/account') return 'overview';
    if (path === '/profile') return tree.queryParams['tab'] === 'password' ? 'password' : 'profile';
    if (path === '/orders' || path.startsWith('/orders/')) return 'orders';
    if (path === '/addresses') return 'addresses';
    if (path === '/notifications') return 'notifications';
    if (path === '/ai/history') return 'ai-history';
    return this.activeItem ?? 'profile';
  }
}
