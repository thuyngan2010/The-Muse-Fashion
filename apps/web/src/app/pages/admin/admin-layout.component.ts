import { NgTemplateOutlet } from '@angular/common';
import { ModalComponent } from '../../components/modal.component';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true,
  imports: [NgTemplateOutlet, ModalComponent, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="admin-shell">
      <!-- Admin Sidebar Navigation -->
      <aside class="admin-sidebar">
        <div class="sidebar-brand">
          <span class="brand-tag">PORTAL</span>
          <h2 class="brand-name">FASHION ADMIN</h2>
        </div>

        <ng-container [ngTemplateOutlet]="adminNavigation" />

        <div class="sidebar-footer">
          <a routerLink="/" class="back-store-btn">← Quay lại cửa hàng</a>
        </div>
      </aside>

      <!-- Admin Content Area -->
      <div class="admin-main">
        <header class="admin-topbar">
          <button type="button" class="admin-mobile-menu" [attr.aria-expanded]="mobileNavOpen()" (click)="mobileNavOpen.set(true)">☰ Menu quản trị</button>
          <div class="topbar-title">
            <span>Hệ thống quản trị vận hành thương mại thời trang</span>
          </div>
          <div class="topbar-user">
            <div class="user-meta">
              <strong>{{ auth.currentUser()?.fullName }}</strong>
              <span class="user-role">{{ auth.currentUser()?.role }}</span>
            </div>
            <button type="button" class="btn-logout" (click)="logout()">Thoát</button>
          </div>
        </header>

        <div class="admin-page-content">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
    <ng-template #adminNavigation>        <nav class="sidebar-menu">
          @if (auth.isAdmin()) {
          <a routerLink="/admin/reports" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M7 15v-4m5 4V5m5 10V8"/></svg></span>
            <span>Báo cáo doanh thu</span>
          </a>
          }
          @if (auth.can('order.read')) { <a routerLink="/admin/orders" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l9 4"/></svg></span>
            <span>Quản lý đơn hàng</span>
          </a> }
          @if (auth.can('catalog.manage')) { <a routerLink="/admin/products" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13 11 22 2 13V4h9l9 9Z"/><circle cx="7" cy="9" r="1"/></svg></span>
            <span>Sản phẩm & Biến thể</span>
          </a> }
          @if (auth.can('catalog.manage')) { <a routerLink="/admin/lookbooks" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="15" cy="8" r="1"/></svg></span><span>Lookbook</span>
          </a> }
          @if (auth.can('inventory.manage')) { <a routerLink="/admin/inventory" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5v17h14V4h-4M8 10h8M8 15h8"/><rect x="9" y="2" width="6" height="4" rx="1"/></svg></span>
            <span>Kho hàng & Sổ cái</span>
          </a> }
          @if (auth.isAdmin()) {
          <a routerLink="/admin/vouchers" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Zm12 0v3m0 3v2m0 3v3"/></svg></span>
            <span>Mã giảm giá Voucher</span>
          </a>
          }
          @if (auth.can('refund.propose') || auth.canGlobal('payment.read')) { <a routerLink="/admin/refunds" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-6 5h3"/></svg></span>
            <span>Hoàn tiền & Đối soát</span>
          </a> }
          @if (auth.can('content.moderate')) { <a routerLink="/admin/moderation" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
            <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 9 3 3 5-5"/></svg></span>
            <span>Kiểm duyệt nội dung</span>
          </a> }
          @if (auth.isAdmin()) {
            <a routerLink="/admin/users" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
              <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5"/></svg></span>
              <span>Người dùng & Nhân sự</span>
            </a>
            <a routerLink="/admin/settings" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="menu-item">
              <span class="item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg></span>
              <span>Cấu hình hệ thống</span>
            </a>
          }
        </nav></ng-template>
    <fc-modal [isOpen]="mobileNavOpen()" title="Điều hướng quản trị" maxWidth="340px" (close)="mobileNavOpen.set(false)">
      <ng-container [ngTemplateOutlet]="adminNavigation" />
    </fc-modal>
  `,
  styles: [`
    .admin-mobile-menu { display:none; }
    .admin-main, .admin-page-content { min-width:0; }
    .admin-shell {
      display: grid;
      grid-template-columns: 260px 1fr;
      min-height: 100vh;
      background: #f4f3f0;
      color: var(--color-text);
    }
    .admin-sidebar {
      background: var(--color-text);
      color: var(--color-surface);
      display: flex;
      flex-direction: column;
      border-right: 1px solid #2b2824;
      position: sticky;
      top: 0;
      height: 100vh;
    }
    .sidebar-brand {
      padding: 24px 20px;
      border-bottom: 1px solid #2b2824;
    }
    .brand-tag {
      font-size: 0.68rem;
      letter-spacing: 0.25em;
      color: #c9ab8d;
      font-weight: 700;
    }
    .brand-name {
      font-family: Georgia, serif;
      font-size: 1.25rem;
      margin: 4px 0 0;
      letter-spacing: 0.05em;
      color: var(--color-surface);
    }
    .sidebar-menu {
      flex: 1;
      overflow-y: auto;
      padding: 16px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 6px;
      color: #b5b0a7;
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 500;
      transition: all 0.15s;
    }
    .menu-item:hover {
      background: #252422;
      color: var(--color-surface);
    }
    .menu-item.active {
      background: #2f2d2a;
      color: var(--color-surface);
      font-weight: 600;
    }
    .item-icon {
      font-size: 1.05rem;
    }
    .sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid #2b2824;
    }
    .back-store-btn {
      color: #c9ab8d;
      font-size: 0.82rem;
      text-decoration: none;
      display: block;
    }
    .admin-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .admin-topbar {
      height: 64px;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 30px;
    }
    .topbar-title {
      font-size: 0.86rem;
      color: var(--color-muted);
    }
    .topbar-user {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .user-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .user-meta strong {
      font-size: 0.88rem;
      color: var(--color-text);
    }
    .user-role {
      font-size: 0.72rem;
      color: var(--color-muted);
      text-transform: uppercase;
      font-weight: 600;
    }
    .btn-logout {
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      padding: 5px 12px;
      border-radius: var(--radius-control);
      font-size: 0.8rem;
      cursor: pointer;
    }
    .admin-page-content {
      padding: 30px;
      flex: 1;
      overflow-y: auto;
    }
    @media (max-width: 900px) {
      .admin-shell {
        grid-template-columns: 1fr;
      }
      .admin-sidebar { display:none; }
      .admin-mobile-menu { display:block; padding:10px; border:1px solid #745136; border-radius: var(--radius-control); background:white; color:var(--color-text); }
      .topbar-title { display:none; }
      .admin-page-content { padding:16px; overflow-x:auto; }
      .admin-topbar { padding:12px; gap:8px; }
      .user-meta strong { max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      fc-modal .sidebar-menu a { color:var(--color-text); }
      fc-modal .sidebar-menu .menu-item.active { background:#eee9e3; color:var(--color-text); }
    }

    .admin-shell { background:var(--color-canvas); }
    .sidebar-brand { padding:28px 24px; } .brand-name { font-family:inherit; font-size:1rem; letter-spacing:.06em; margin-top:8px; }
    .sidebar-menu { padding:16px 12px; gap:6px; }
    .menu-item { min-height:44px; padding:12px; border-radius:var(--radius-control); line-height:1.4; }
    .menu-item.active { background:#38332d; box-shadow:inset 3px 0 #c9ab8d; }
    .item-icon { width:20px; height:20px; flex-shrink:0; display:inline-flex; }
    .item-icon svg { width:20px; height:20px; }
    .admin-topbar { min-height:76px; height:auto; padding:16px 30px; gap:20px; }
    .topbar-title { line-height:1.5; } .user-role { font-size:.6875rem; letter-spacing:.08em; margin-top:3px; }
    .btn-logout { min-height:40px; padding:8px 14px; }
    @media (max-width:900px) { .admin-topbar { padding:12px 16px; gap:12px; } .topbar-user { gap:8px; } .admin-mobile-menu { font-size:.8125rem; min-height:44px; } fc-modal .menu-item:hover { background:var(--color-accent-soft); color:var(--color-text); } }


  `],
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthService);
  readonly mobileNavOpen = signal(false);
  logout(): void {
    this.auth.logout();
  }
}
