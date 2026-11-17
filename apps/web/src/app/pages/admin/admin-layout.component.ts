import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ModalComponent } from '../../components/modal.component';
import { AuthService } from '../../services/auth.service';

type NavIcon = 'dashboard' | 'catalog' | 'orders' | 'customers' | 'promo' | 'ai' | 'reports' | 'settings';
type NavItem = { key: string; label: string; icon: NavIcon; link: string; match: string[] };

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

@Component({
  standalone: true,
  imports: [NgTemplateOutlet, ModalComponent, RouterLink, RouterOutlet],
  template: `
    <div class="admin-shell">
      <aside class="admin-sidebar" aria-label="Điều hướng quản trị">
        <div class="sidebar-brand">
          <a routerLink="/admin" class="brand-logo" aria-label="MUSE Admin Portal"><img src="/assets/brand/muse-logo-black.png" alt="MUSE" /></a>
          <span class="brand-tag">Admin Portal</span>
        </div>
        <ng-container [ngTemplateOutlet]="adminNavigation" />
        <div class="sidebar-footer"><ng-container [ngTemplateOutlet]="userCard" /></div>
      </aside>

      <div class="admin-main">
        <header class="admin-topbar">
          <button type="button" class="admin-mobile-menu" aria-haspopup="dialog" [attr.aria-expanded]="mobileNavOpen()" (click)="mobileNavOpen.set(true)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            <span>Menu</span>
          </button>
          <div class="topbar-right">
            <span class="topbar-date">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4m8-4v4"/></svg>
              {{ today }}
            </span>
            <span class="topbar-divider" aria-hidden="true"></span>
            <div class="topbar-user">
              <span class="avatar" aria-hidden="true">{{ initial() }}</span>
              <span class="user-meta">
                <strong>{{ auth.currentUser()?.fullName }}</strong>
                <span class="user-role">{{ roleLabel() }}</span>
              </span>
            </div>
          </div>
        </header>
        <div class="admin-page-content"><router-outlet></router-outlet></div>
      </div>
    </div>

    <ng-template #adminNavigation>
      <nav class="sidebar-nav">
        @if (navItems().length) {
          <span class="nav-group">Quản trị hệ thống</span>
          <ul class="nav-list">
            @for (item of navItems(); track item.key) {
              <li><a [routerLink]="item.link" class="menu-item" [class.active]="isActive(item)" [attr.aria-current]="isActive(item) ? 'page' : null" (click)="mobileNavOpen.set(false)">
                <ng-container [ngTemplateOutlet]="navIcon" [ngTemplateOutletContext]="{ $implicit: item.icon }" />
                <span>{{ item.label }}</span>
              </a></li>
            }
          </ul>
          <hr class="nav-divider" />
        }
        <ul class="nav-list">
          @if (settingsItem(); as item) {
            <li><a [routerLink]="item.link" class="menu-item" [class.active]="isActive(item)" [attr.aria-current]="isActive(item) ? 'page' : null" (click)="mobileNavOpen.set(false)">
              <ng-container [ngTemplateOutlet]="navIcon" [ngTemplateOutletContext]="{ $implicit: item.icon }" />
              <span>{{ item.label }}</span>
            </a></li>
          }
          <li><a routerLink="/" class="menu-item menu-item--store" (click)="mobileNavOpen.set(false)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/></svg>
            <span>Quay lại cửa hàng</span>
            <svg class="store-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a></li>
        </ul>
      </nav>
    </ng-template>

    <ng-template #userCard>
      <div class="user-card">
        <span class="avatar" aria-hidden="true">{{ initial() }}</span>
        <span class="user-meta">
          <strong>{{ auth.currentUser()?.fullName }}</strong>
          <span class="user-role">{{ roleLabel() }}</span>
        </span>
        <button type="button" class="btn-logout" (click)="logout()" aria-label="Đăng xuất" title="Đăng xuất">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg>
        </button>
      </div>
    </ng-template>

    <ng-template #navIcon let-icon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        @switch (icon) {
          @case ('dashboard') { <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/> }
          @case ('catalog') { <path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/> }
          @case ('orders') { <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6"/> }
          @case ('customers') { <circle cx="9" cy="8" r="3.2"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 5a3 3 0 0 1 0 6m2 2a5 5 0 0 1 3 5v2"/> }
          @case ('promo') { <path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1"/> }
          @case ('ai') { <path d="m4 20 10-10M13 5l1.5 2L17 7.5 15 9l.5 2.5L13 10l-2.5 1.5L11 9 9 7.5 11.5 7 13 5Zm6 8 .8 1.7 1.7.8-1.7.8L19 18l-.8-1.7-1.7-.8 1.7-.8L19 13Z"/> }
          @case ('reports') { <rect x="3" y="3" width="18" height="18"/><path d="M8 17v-5m4 5V8m4 9v-3"/> }
          @case ('settings') { <circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/> }
        }
      </svg>
    </ng-template>

    <fc-modal [isOpen]="mobileNavOpen()" title="Điều hướng quản trị" maxWidth="340px" (close)="mobileNavOpen.set(false)">
      <div class="mobile-nav">
        <ng-container [ngTemplateOutlet]="adminNavigation" />
        <div class="mobile-user"><ng-container [ngTemplateOutlet]="userCard" /></div>
      </div>
    </fc-modal>
  `,
  styles: [`
    :host { display: block; font-family: var(--font-sans); }
    .admin-shell { display: grid; grid-template-columns: var(--admin-sidebar-w, 250px) minmax(0, 1fr); min-height: 100vh; background: var(--admin-canvas, #faf9f9); color: var(--ui-ink, #171717); }
    .admin-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; background: var(--ui-bg, #fff); border-right: 1px solid var(--admin-line, #e5e5e5); }
    .sidebar-brand { height: var(--admin-topbar-h, 72px); flex-shrink: 0; display: flex; align-items: center; gap: 20px; padding: 0 16px; border-bottom: 1px solid var(--admin-line, #e5e5e5); }
    .brand-logo { display: block; width: 90px; height: 29px; flex-shrink: 0; }
    .brand-logo img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .brand-tag { font: 400 10px/12px var(--font-serif); letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; }
    .sidebar-nav { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 8px; }
    .nav-group { display: block; padding: 4px 12px 6px; font: 700 10px/12px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: rgba(23, 23, 23, .6); }
    .nav-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .nav-divider { margin: 12px 4px; border: 0; border-top: 1px solid var(--admin-line, #e5e5e5); }
    .menu-item { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 8px 12px; border-left: 2px solid transparent; border-radius: 4px; color: var(--ui-ink, #171717); font: 400 13px/18px var(--font-sans); transition: background-color .15s; }
    .menu-item svg { width: 18px; height: 18px; flex-shrink: 0; }
    .menu-item:hover { background: var(--admin-nav-hover-bg, #f5f3f3); }
    .menu-item.active { padding-left: 10px; border-left-color: var(--admin-nav-active-edge, #805159); background: var(--admin-nav-active-bg, #f4b8c1); font-weight: 700; }
    .menu-item--store span { flex: 1; }
    .menu-item--store .store-arrow { width: 12px; height: 12px; }
    .sidebar-footer { flex-shrink: 0; padding: 13px 12px 12px; border-top: 1px solid var(--admin-line, #e5e5e5); }
    .user-card { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .avatar { width: 32px; height: 32px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #000; color: #fff; font: 700 13px/1 var(--font-sans); }
    .user-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .user-meta strong { font: 700 13px/15px var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .user-role { font: 500 10px/12.5px var(--font-sans); letter-spacing: .5px; color: var(--ui-subtle, #747878); }
    .btn-logout { width: 32px; height: 32px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 2px; background: none; color: var(--ui-ink, #171717); }
    .btn-logout:hover { background: var(--admin-nav-hover-bg, #f5f3f3); }
    .admin-main { display: flex; flex-direction: column; min-width: 0; }
    .admin-topbar { height: var(--admin-topbar-h, 72px); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 24px; background: var(--ui-bg, #fff); border-bottom: 1px solid var(--admin-line-soft, #e9e8e7); }
    .admin-mobile-menu { display: none; }
    .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 16px; min-width: 0; }
    .topbar-date { display: inline-flex; align-items: center; gap: 6px; font: 400 12px/16px var(--font-sans); color: var(--ui-ink-soft, #444748); white-space: nowrap; }
    .topbar-divider { width: 1px; height: 24px; background: var(--admin-line-soft, #e9e8e7); }
    .topbar-user { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .topbar-user .user-meta { flex: none; }
    .topbar-user .user-meta strong { font-size: 12px; line-height: 15px; max-width: 160px; }
    .topbar-user .user-role { font-weight: 400; color: var(--ui-ink-soft, #444748); }
    .admin-page-content { flex: 1; min-width: 0; padding: 30px; }
    .mobile-user { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--admin-line, #e5e5e5); }
    .mobile-nav .sidebar-nav { padding: 0; overflow: visible; }
    @media (max-width: 900px) {
      .admin-shell { grid-template-columns: minmax(0, 1fr); }
      .admin-sidebar { display: none; }
      .admin-topbar { padding: 0 16px; }
      .admin-mobile-menu { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border: 1px solid var(--admin-line, #e5e5e5); border-radius: 2px; background: var(--ui-bg, #fff); color: var(--ui-ink, #171717); font: 600 12px var(--font-sans); }
      .topbar-date { display: none; }
      .topbar-divider { display: none; }
      .topbar-user .user-meta strong { max-width: 110px; }
      .admin-page-content { padding: 16px; overflow-x: auto; }
    }
    @media (max-width: 480px) { .topbar-user .user-meta { display: none; } }
  `],
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly mobileNavOpen = signal(false);
  readonly today = formatToday();

  private readonly url = toSignal(
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map(event => event.urlAfterRedirects), startWith(this.router.url)),
    { initialValue: this.router.url },
  );

  readonly initial = computed(() => (this.auth.currentUser()?.fullName ?? this.auth.currentUser()?.email ?? '').trim().charAt(0).toLocaleUpperCase('vi-VN') || '?');
  readonly roleLabel = computed(() => (this.auth.isAdmin() ? 'Quản trị viên' : this.auth.isStaff() ? 'Nhân viên' : ''));

  /** Mục trong nhóm "Quản trị hệ thống": mỗi mục chỉ hiện khi người dùng có quyền (đúng như guard của route) và route đã tồn tại. */
  readonly navItems = computed<NavItem[]>(() => {
    const a = this.auth;
    const items: NavItem[] = [];
    if (a.isAdmin() && this.hasRoute('dashboard')) items.push({ key: 'dashboard', label: 'Dashboard', icon: 'dashboard', link: '/admin/dashboard', match: ['/admin/dashboard'] });
    const catalogLink = a.can('catalog.manage') ? '/admin/products' : a.can('inventory.manage') ? '/admin/inventory' : null;
    if (catalogLink) items.push({ key: 'catalog', label: 'Sản phẩm & Kho hàng', icon: 'catalog', link: catalogLink, match: ['/admin/products', '/admin/inventory', '/admin/lookbooks'] });
    const orderLink = a.can('order.read') ? '/admin/orders' : (a.can('refund.propose') || a.canGlobal('payment.read')) ? '/admin/refunds' : null;
    if (orderLink) items.push({ key: 'orders', label: 'Đơn hàng', icon: 'orders', link: orderLink, match: ['/admin/orders', '/admin/refunds'] });
    if (a.isAdmin() && this.hasRoute('customers')) items.push({ key: 'customers', label: 'Khách hàng', icon: 'customers', link: '/admin/customers', match: ['/admin/customers'] });
    const promoLink = a.isAdmin() ? '/admin/vouchers' : a.can('content.moderate') ? '/admin/moderation' : null;
    if (promoLink) items.push({ key: 'promo', label: 'Khuyến mãi & Đánh giá', icon: 'promo', link: promoLink, match: ['/admin/vouchers', '/admin/moderation'] });
    if (a.isAdmin() && this.hasRoute('ai')) items.push({ key: 'ai', label: 'AI Workflow', icon: 'ai', link: '/admin/ai', match: ['/admin/ai'] });
    if (a.isAdmin()) items.push({ key: 'reports', label: 'Báo cáo & Phân quyền', icon: 'reports', link: '/admin/reports', match: ['/admin/reports', '/admin/users'] });
    return items;
  });

  readonly settingsItem = computed<NavItem | null>(() =>
    this.auth.isAdmin() ? { key: 'settings', label: 'Cài đặt', icon: 'settings', link: '/admin/settings', match: ['/admin/settings'] } : null);

  isActive(item: NavItem): boolean {
    const path = this.url().split(/[?#]/)[0];
    return item.match.some(prefix => path === prefix || path.startsWith(prefix + '/'));
  }

  /** Route con của /admin đã được khai báo chưa (Dashboard, Khách hàng, AI Workflow tạo ở block sau). */
  private hasRoute(path: string): boolean {
    const admin = this.router.config.find(route => route.path === 'admin');
    return !!admin?.children?.some(child => child.path === path);
  }

  logout(): void {
    this.mobileNavOpen.set(false);
    this.auth.logout();
  }
}

function formatToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${WEEKDAYS[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}
