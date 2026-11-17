import { Component, ElementRef, HostListener, ViewChild, OnDestroy, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';

@Component({
  selector: 'fc-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="site-header">
      <div class="header-inner">
        <!-- Brand / Logo -->
        <a routerLink="/" class="logo">
          <img src="/assets/brand/muse-logo-black.png" alt="MUSE">
        </a>

        <!-- Desktop Navigation -->
        <nav class="desktop-nav" aria-label="Điều hướng chính">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">TRANG CHỦ</a>
          <a routerLink="/products" routerLinkActive="active">SẢN PHẨM</a>
          <a routerLink="/lookbooks" routerLinkActive="active">BỘ SƯU TẬP</a>
          <div class="nav-dropdown-trigger">
            <button type="button" id="ai-nav-trigger" class="ai-nav-button" (click)="toggleAiMenu($event)" [attr.aria-expanded]="aiMenuOpen()" aria-controls="ai-navigation">AI STUDIO <span aria-hidden="true">⌄</span></button>
            @if (aiMenuOpen()) {<div class="nav-dropdown-menu" id="ai-navigation">
              <a routerLink="/ai/try-on" routerLinkActive="active">Thử đồ trực tuyến (Try-on)</a>
              <a routerLink="/ai/mix-match" routerLinkActive="active">Gợi ý phối đồ (Mix & Match)</a>
              <a routerLink="/ai/history" routerLinkActive="active">Lịch sử thử đồ</a>
            </div>}
          </div>
          <a routerLink="/community" routerLinkActive="active">BLOG</a>
          @if (hasAboutRoute) { <a routerLink="/about" routerLinkActive="active">VỀ CHÚNG TÔI</a> }
          @if (auth.isStaff() || auth.isAdmin()) {
            <a routerLink="/admin" class="badge-link">
              <span class="admin-badge">TRANG QUẢN TRỊ</span>
            </a>
          }
        </nav>

        <!-- Right action icons -->
        <div class="header-actions">
          <!-- Tìm kiếm -->
          <div class="search-wrap" (click)="$event.stopPropagation()">
            @if (searchOpen()) {
              <form class="header-search" role="search" (submit)="submitSearch($event)">
                <input #searchInput type="search" name="q" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" placeholder="Tìm sản phẩm..." aria-label="Tìm kiếm sản phẩm" autocomplete="off">
              </form>
            }
            <button type="button" class="icon-btn search-btn" (click)="toggleSearch($event)" aria-label="Tìm kiếm" [attr.aria-expanded]="searchOpen()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"></circle><line x1="15" y1="15" x2="21" y2="21"></line></svg>
            </button>
          </div>

          @if (auth.isAuthenticated()) {
            <a routerLink="/notifications" class="icon-btn bell-btn" aria-label="Thông báo">
              <svg width="22" height="24" viewBox="0 0 22 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3v1.5"></path><path d="M4.5 17.5c1.2-1.2 1.8-3 1.8-5.2V10a4.7 4.7 0 0 1 9.4 0v2.3c0 2.2.6 4 1.8 5.2z"></path><path d="M3 17.5h16"></path><path d="M9.2 20.5a2 2 0 0 0 3.6 0"></path></svg>
              @if (unread() > 0) { <span class="badge bell-badge">{{ unread() > 99 ? '99+' : unread() }}</span> }
            </a>
          }

          <!-- Cart button with counter -->
          <a routerLink="/cart" class="icon-btn cart-btn" aria-label="Giỏ hàng">
            <svg width="20" height="24" viewBox="0 0 20 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="14" height="14" rx="3"></rect><path d="M6 8V6.5a3.5 3.5 0 0 1 7 0V8"></path></svg>
            <span class="badge cart-badge">{{ cart.itemCount() }}</span>
          </a>

          <!-- User menu / Account -->
          @if (auth.isAuthenticated()) {
            <div class="user-menu-wrapper">
              <button class="user-avatar-btn" (click)="toggleUserMenu($event)" aria-haspopup="true" [attr.aria-expanded]="userMenuOpen()">
                <div class="avatar-circle">
                  @if (auth.currentUser()?.avatarUrl; as url) { <img class="avatar-img" [src]="url" alt="" /> } @else { {{ auth.currentUser()?.fullName?.[0] || 'U' }} }
                </div>
                <span class="user-name">{{ auth.currentUser()?.fullName?.split(' ')?.[0] || 'Tài khoản' }}</span>
                <span class="arrow-down">▾</span>
              </button>

              @if (userMenuOpen()) {
                <div class="user-dropdown-menu">
                  <div class="dropdown-header">
                    <strong>{{ auth.currentUser()?.fullName }}</strong>
                    <span class="user-email">{{ auth.currentUser()?.email }}</span>
                    <span class="user-role-tag">{{ auth.currentUser()?.role }}</span>
                  </div>
                  <hr class="dropdown-divider">
                  <a routerLink="/account" (click)="userMenuOpen.set(false)">Tổng quan</a>
                  <a routerLink="/orders" (click)="userMenuOpen.set(false)">Đơn mua của tôi</a>
                  <a routerLink="/profile" (click)="userMenuOpen.set(false)">Hồ sơ cá nhân</a>
                  <a routerLink="/addresses" (click)="userMenuOpen.set(false)">Sổ địa chỉ</a>
                  <a routerLink="/notifications" (click)="userMenuOpen.set(false)">Thông báo</a>
                  @if (auth.isStaff() || auth.isAdmin()) {
                    <hr class="dropdown-divider">
                    <a routerLink="/admin" class="highlight-link" (click)="userMenuOpen.set(false)">Trang quản trị</a>
                  }
                  <hr class="dropdown-divider">
                  <button class="logout-btn" (click)="onLogout()">Đăng xuất</button>
                </div>
              }
            </div>
          } @else {
            <a routerLink="/auth" class="login-btn">ĐĂNG NHẬP</a>
          }

          <!-- Mobile Hamburger Toggle -->
          <button class="hamburger-btn" (click)="mobileMenuOpen.set(!mobileMenuOpen())" aria-label="Menu di động" [attr.aria-expanded]="mobileMenuOpen()" aria-controls="mobile-navigation">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              @if (mobileMenuOpen()) {
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              } @else {
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              }
            </svg>
          </button>
        </div>
      </div>

      <!-- Menu di động: ngăn kéo mở từ bên phải -->
      @if (mobileMenuOpen()) {
        <div class="m-overlay" (click)="closeMobile()" aria-hidden="true"></div>
        <aside class="m-drawer" id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Menu di động">
          <div class="m-head">
            <img src="/assets/brand/muse-logo-black.png" alt="MUSE" class="m-logo">
            <button type="button" class="m-close" (click)="closeMobile()" aria-label="Đóng menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <form class="m-search" role="search" (submit)="submitSearch($event)">
            <input type="search" name="mq" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" placeholder="Tìm sản phẩm..." aria-label="Tìm kiếm sản phẩm" autocomplete="off">
          </form>

          <nav class="m-nav" aria-label="Điều hướng di động">
            <a routerLink="/" routerLinkActive="active" ariaCurrentWhenActive="page" [routerLinkActiveOptions]="{ exact: true }" (click)="closeMobile()">TRANG CHỦ</a>
            <a routerLink="/products" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">SẢN PHẨM</a>
            <a routerLink="/lookbooks" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">BỘ SƯU TẬP</a>
            <button type="button" class="m-group" [attr.aria-expanded]="mobileAiOpen()" aria-controls="m-ai-list" (click)="mobileAiOpen.set(!mobileAiOpen())">
              <span>AI STUDIO</span><span aria-hidden="true">{{ mobileAiOpen() ? '−' : '+' }}</span>
            </button>
            @if (mobileAiOpen()) {
              <div class="m-sub" id="m-ai-list">
                <a routerLink="/ai/try-on" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Thử đồ trực tuyến</a>
                <a routerLink="/ai/mix-match" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Gợi ý phối đồ</a>
                <a routerLink="/ai/history" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Lịch sử thử đồ</a>
              </div>
            }
            <a routerLink="/community" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">BLOG</a>
            @if (hasAboutRoute) { <a routerLink="/about" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">VỀ CHÚNG TÔI</a> }
            @if (auth.isStaff() || auth.isAdmin()) { <a routerLink="/admin" class="highlight-link" (click)="closeMobile()">TRANG QUẢN TRỊ</a> }
          </nav>

          <div class="m-account">
            @if (auth.isAuthenticated()) {
              <div class="m-user"><strong>{{ auth.currentUser()?.fullName }}</strong><span>{{ auth.currentUser()?.email }}</span></div>
              <a routerLink="/account" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Tổng quan</a>
              <a routerLink="/orders" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Đơn mua của tôi</a>
              <a routerLink="/profile" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Hồ sơ cá nhân</a>
              <a routerLink="/addresses" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Sổ địa chỉ</a>
              <a routerLink="/notifications" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMobile()">Thông báo</a>
              <button type="button" class="drawer-logout" (click)="onLogout()">Đăng xuất</button>
            } @else {
              <a routerLink="/auth" class="m-login" (click)="closeMobile()">ĐĂNG NHẬP</a>
            }
          </div>
        </aside>
      }
    </header>
  `,
  styles: [`
    .site-header {
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-divider);
      position: sticky;
      top: 0;
      z-index: 900;
    }
    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 5vw;
      max-width: 1440px;
      margin: 0 auto;
    }
    .logo {
      font-weight: 700;
      letter-spacing: 0.18em;
      font-size: 1.15rem;
      color: var(--color-text);
    }
    .logo span {
      color: #805c41;
      font-weight: 400;
      margin-left: 2px;
    }
    .desktop-nav {
      display: flex;
      align-items: center;
      gap: 26px;
      font-size: 0.88rem;
    }
    .desktop-nav a {
      color: #55504a;
      transition: color 0.15s ease;
      font-weight: 500;
      padding: 6px 0;
      position: relative;
    }
    .desktop-nav a:hover, .desktop-nav a.active {
      color: var(--color-text);
    }
    .desktop-nav a.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--color-text);
    }
    .nav-dropdown-trigger {
      position: relative;
      cursor: pointer;
      color: #55504a;
      font-weight: 500;
      padding: 6px 0;
    }
    .ai-nav-button { border:0; background:none; color:inherit; font:inherit; cursor:pointer; padding:6px 0; }
    .ai-nav-button:focus-visible { outline:2px solid #745136; outline-offset:4px; }
    .nav-dropdown-trigger:hover {
      color: var(--color-text);
    }
    .nav-dropdown-menu {
      display: flex;
      position: absolute;
      top: 100%;
      left: 0;
      background: var(--color-surface);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      border-radius: 6px;
      border: 1px solid var(--color-divider);
      min-width: 220px;
      padding: 8px 0;
      flex-direction: column;
      z-index: 950;
    }
    .nav-dropdown-trigger:hover .nav-dropdown-menu {
      display: flex;
    }
    .nav-dropdown-menu a {
      padding: 10px 18px !important;
      white-space: nowrap;
      font-size: 0.86rem;
    }
    .nav-dropdown-menu a:hover {
      background: var(--color-canvas);
    }
    .admin-badge {
      background: var(--color-primary);
      color: var(--color-surface);
      font-size: 0.72rem;
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .icon-btn {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text);
      padding: 6px;
      border-radius: 50%;
      transition: background 0.15s ease;
    }
    .icon-btn:hover {
      background: #f4f2ee;
    }
    .badge {
      position: absolute;
      top: 0;
      right: 0;
      background: var(--color-accent);
      color: white;
      font-size: 0.7rem;
      font-weight: 700;
      min-width: 17px;
      height: 17px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }
    .login-btn {
      background: var(--color-primary);
      color: white;
      font-size: 0.85rem;
      padding: 8px 18px;
      border-radius: var(--radius-control);
      font-weight: 500;
      transition: background 0.15s;
    }
    .login-btn:hover {
      background: #3e3b37;
    }
    .user-menu-wrapper {
      position: relative;
    }
    .user-avatar-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: 0;
      padding: 4px 6px;
      cursor: pointer;
      border-radius: 20px;
      transition: background 0.15s;
    }
    .user-avatar-btn:hover {
      background: #f4f2ee;
    }
    .avatar-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--color-accent);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
      text-transform: uppercase;
    }
    .user-name {
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--color-text);
    }
    .arrow-down {
      font-size: 0.75rem;
      color: var(--color-muted);
    }
    .user-dropdown-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 10px;
      background: var(--color-surface);
      border-radius: var(--radius-card);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
      border: 1px solid var(--color-divider);
      width: 240px;
      padding: 8px 0;
      z-index: 950;
      animation: fadeIn 0.15s ease-out;
    }
    .dropdown-header {
      padding: 12px 18px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .dropdown-header strong {
      font-size: 0.92rem;
      color: var(--color-text);
    }
    .user-email {
      font-size: 0.78rem;
      color: var(--color-muted);
      word-break: break-all;
    }
    .user-role-tag {
      font-size: 0.68rem;
      color: var(--color-accent);
      font-weight: 600;
      margin-top: 3px;
      letter-spacing: 0.05em;
    }
    .dropdown-divider {
      border: 0;
      border-top: 1px solid #f0ede8;
      margin: 6px 0;
    }
    .user-dropdown-menu a, .logout-btn {
      display: block;
      width: 100%;
      padding: 9px 18px;
      font-size: 0.86rem;
      color: #444;
      text-align: left;
      background: none;
      border: 0;
      cursor: pointer;
    }
    .user-dropdown-menu a:hover, .logout-btn:hover {
      background: var(--color-canvas);
      color: var(--color-text);
    }
    .highlight-link {
      color: var(--color-accent) !important;
      font-weight: 600;
    }
    .logout-btn {
      color: #c62828 !important;
    }
    .hamburger-btn {
      display: none;
      background: none;
      border: 0;
      cursor: pointer;
      color: var(--color-text);
      padding: 4px;
    }
    .mobile-drawer {
      display: none;
      background: var(--color-surface);
      border-top: 1px solid var(--color-divider);
      padding: 16px 6vw 24px;
    }
    .mobile-nav {
      display: flex;
      flex-direction: column;
      gap: 14px;
      font-size: 1rem;
    }
    .drawer-divider {
      border: 0;
      border-top: 1px solid var(--color-divider);
      margin: 8px 0;
    }
    .drawer-logout {
      background: none;
      border: 0;
      color: #c62828;
      text-align: left;
      font-size: 1rem;
      padding: 0;
      cursor: pointer;
    }
    @media (max-width: 900px) {
      .desktop-nav {
        display: none;
      }
      .hamburger-btn {
        display: block;
      }
      .mobile-drawer {
        display: block;
      }
      .user-name {
        display: none;
      }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .header-inner { gap:24px; min-height:80px; }
    .logo { font-size:1rem; letter-spacing:.12em; white-space:nowrap; }
    .desktop-nav { gap:22px; }
    .header-actions { gap:12px; flex-shrink:0; }
    .icon-btn, .hamburger-btn { min-width:44px; min-height:44px; }
    .login-btn { display:inline-flex; align-items:center; min-height:44px; }
    .badge { background:var(--color-accent); border:2px solid white; min-width:21px; height:21px; }
    .avatar-circle { background:var(--color-accent); }
    .user-name { max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nav-dropdown-menu, .user-dropdown-menu { border-radius:var(--radius-card); box-shadow:var(--shadow-floating); padding:8px; }
    .nav-dropdown-menu a, .user-dropdown-menu a, .logout-btn { border-radius:var(--radius-control); min-height:42px; }
    .mobile-nav { gap:4px; }
    .mobile-nav a, .drawer-logout { padding:12px; border-radius:var(--radius-control); }
    .mobile-nav a.active { background:var(--color-accent-soft); color:var(--color-accent); font-weight:600; }
    .mobile-drawer { max-height:calc(100dvh - 76px); overflow:auto; }
    @media (max-width:1100px) { .desktop-nav { display:none; } .hamburger-btn,.mobile-drawer { display:block; } }
    @media (max-width:480px) {
      .header-inner { padding:12px 16px; gap:8px; min-height:72px; }
      .logo { font-size:.85rem; letter-spacing:.08em; }
      .logo span { display:block; font-size:.65rem; margin:2px 0 0; letter-spacing:.15em; }
      .header-actions { gap:4px; } .login-btn { padding:8px 12px; }
    }

    .mobile-nav a,.user-dropdown-menu a,.logout-btn { transition:background-color 150ms ease,color 150ms ease; }
    @media(prefers-reduced-motion:no-preference) {
      .mobile-drawer,.nav-dropdown-menu,.user-dropdown-menu { animation:fc-menu-in 160ms ease-out; }
    }

    /* MUSE shared header */
    .site-header {
      background: #fff;
      border-bottom-color: #c4c7c7;
    }
    .header-inner {
      width: 100%;
      max-width: 1280px;
      height: 80px;
      min-height: 80px;
      padding: 0 48px;
      gap: 0;
    }
    .logo {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
    }
    .logo img {
      display: block;
      width: 143px;
      height: auto;
    }
    .desktop-nav {
      align-self: stretch;
      gap: 40px;
      margin-left: 66px;
      font-size: 13px;
      white-space: nowrap;
    }
    .desktop-nav > a,
    .ai-nav-button {
      display: inline-flex;
      align-items: center;
      min-height: 80px;
      padding: 0;
      color: #444748;
      font-weight: 600;
      letter-spacing: 0.65px;
      line-height: 16px;
    }
    .desktop-nav > a:hover,
    .desktop-nav > a.active,
    .ai-nav-button:hover,
    .ai-nav-button[aria-expanded="true"] {
      color: #000;
    }
    .desktop-nav > a.active::after {
      right: 0;
      bottom: 29px;
      height: 2px;
      background: #000;
    }
    .nav-dropdown-trigger {
      display: flex;
      align-self: stretch;
      align-items: center;
      padding: 0;
    }
    .ai-nav-button { gap: 6px; }
    .ai-nav-button span { font-size: 14px; line-height: 1; }
    .nav-dropdown-menu {
      top: calc(100% - 14px);
      min-width: 248px;
      padding: 8px;
      border-color: #e4e4e4;
      border-radius: 0;
      background: #fff;
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.12);
    }
    .nav-dropdown-menu a {
      min-height: 42px;
      padding: 12px 14px !important;
      border-radius: 0;
      color: #171717;
      font-size: 0.82rem;
      letter-spacing: 0.03em;
    }
    .nav-dropdown-menu a:hover { background: #f8e2e6; }
    .admin-badge {
      background: #171717;
      color: #fff;
      border-radius: 0;
      letter-spacing: 0.08em;
    }
    .header-actions {
      margin-left: auto;
      gap: 22px;
    }
    .icon-btn {
      min-width: 40px;
      min-height: 40px;
      padding: 8px;
      border-radius: 0;
      color: #000;
    }
    .icon-btn:hover { background: #f8e2e6; }
    .badge {
      top: 1px;
      right: -1px;
      min-width: 15px;
      height: 15px;
      padding: 0 3px;
      border: 0;
      border-radius: 0;
      background: #000;
      color: #fff;
      font-size: 9px;
      line-height: 15px;
    }
    .login-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 170px;
      min-height: 40px;
      padding: 0 20px;
      border-radius: 0;
      background: #efb3bd;
      color: #171717;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1.3px;
    }
    .login-btn:hover { background: #e8a4b0; color: #000; }
    .user-avatar-btn {
      min-width: 44px;
      min-height: 44px;
      padding: 2px;
      border-radius: 50%;
    }
    .avatar-circle {
      width: 40px;
      height: 40px;
      border: 1px solid #fff;
      background: #f4c542;
      color: #171717;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
    }
    .user-name, .arrow-down { display: none; }
    .user-dropdown-menu {
      top: calc(100% + 4px);
      border-radius: 0;
      background: #fff;
    }
    .user-dropdown-menu a, .logout-btn { border-radius: 0; }
    .hamburger-btn:focus-visible,
    .login-btn:focus-visible,
    .icon-btn:focus-visible,
    .user-avatar-btn:focus-visible,
    .desktop-nav a:focus-visible {
      outline: 2px solid #000;
      outline-offset: 3px;
    }
    @media (max-width: 1100px) {
      .header-inner { padding: 0 24px; }
      .logo img { width: 128px; }
      .mobile-drawer {
        padding: 8px 24px 24px;
        border-top-color: #e4e4e4;
        background: #fff;
        box-shadow: 0 18px 30px rgba(0, 0, 0, 0.1);
      }
      .mobile-nav { gap: 0; }
      .mobile-nav a, .drawer-logout {
        min-height: 48px;
        padding: 15px 8px;
        border-radius: 0;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.65px;
      }
      .mobile-nav a.active {
        background: transparent;
        color: #000;
        text-decoration: underline;
        text-decoration-thickness: 2px;
        text-underline-offset: 7px;
      }
    }
    @media (max-width: 560px) {
      .header-inner { height: 72px; min-height: 72px; padding: 0 16px; }
      .logo img { width: 112px; }
      .header-actions { gap: 2px; }
      .login-btn { width: auto; min-height: 40px; padding: 0 13px; font-size: 11px; }
      .icon-btn, .hamburger-btn { min-width: 40px; min-height: 40px; }
      .avatar-circle { width: 36px; height: 36px; }
    }



    .search-wrap { display:flex; align-items:center; gap:6px; }
    .header-search input { width:220px; height:36px; padding:0 12px; border:1px solid #171717; border-radius:0; background:#fff; color:#171717; font:inherit; font-size:13px; }
    .header-search input:focus-visible { outline:2px solid #171717; outline-offset:2px; }
    .bell-badge { background:#f4b8c1; color:#171717; border:1px solid #000; }
    .login-btn { background:#f4b8c1; }
    .login-btn:hover { background:#efa5b2; }
    @media (max-width:560px) { .header-search input { width:140px; } }
    /* Cụm icon theo Figma: kính lúp, chuông, túi, avatar viền hồng */
    .header-actions { gap: 20px; }
    .header-actions .icon-btn { min-width: 32px; min-height: 32px; padding: 4px; background: transparent; }
    .header-actions .icon-btn:hover { background: transparent; opacity: .7; }
    .header-actions .badge { top: -4px; right: -10px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 0; font-size: 9px; font-weight: 700; line-height: 15px; }
    .header-actions .cart-badge { background: #000; color: #fff; border: 0; min-width: 13px; height: 13px; line-height: 13px; right: -8px; }
    .header-actions .bell-badge { background: #f4b8c1; color: #171717; border: 1px solid #000; line-height: 13px; }
    .header-actions .avatar-circle { width: 40px; height: 40px; border: 2px solid #fff; box-shadow: 0 0 0 3px #f8dfe2, 0 1px 2px rgba(0,0,0,.05); }
    .header-actions .user-avatar-btn { margin-left: 12px; padding: 3px; }
    .header-actions .search-btn { border: 0; outline: 0; box-shadow: none; background: transparent; appearance: none; cursor: pointer; }
    .header-actions .search-btn:focus:not(:focus-visible) { outline: 0; }

    /* Ngăn kéo menu di động */
    .m-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(23, 23, 23, .5); }
    .m-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 1001; display: flex; width: min(86vw, 360px); flex-direction: column; gap: 16px; padding: 20px 20px 28px; overflow-y: auto; background: #fff; box-shadow: -12px 0 32px rgba(0, 0, 0, .18); animation: m-slide 200ms ease-out; }
    @keyframes m-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .m-drawer { animation: none; } }
    .m-head { display: flex; align-items: center; justify-content: space-between; }
    .m-logo { display: block; width: 112px; height: auto; }
    .m-close { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; border: 0; background: none; color: #171717; cursor: pointer; }
    .m-search input { width: 100%; height: 44px; padding: 0 12px; border: 1px solid #171717; border-radius: 0; background: #fff; color: #171717; font: inherit; font-size: 14px; }
    .m-nav, .m-account { display: flex; flex-direction: column; }
    .m-nav a, .m-group, .m-account a, .drawer-logout { display: flex; min-height: 48px; align-items: center; justify-content: space-between; padding: 12px 4px; border: 0; border-bottom: 1px solid #e3e2e2; border-radius: 0; background: none; color: #171717; font: inherit; font-size: 13px; font-weight: 600; letter-spacing: .65px; text-align: left; text-decoration: none; cursor: pointer; }
    .m-nav a.active, .m-account a.active { color: #8f485d; }
    .m-sub { display: flex; flex-direction: column; padding-left: 16px; background: #f5f3f3; }
    .m-sub a { font-weight: 500; letter-spacing: .2px; }
    .m-account { margin-top: auto; padding-top: 8px; }
    .m-user { display: grid; gap: 2px; padding: 8px 4px 12px; }
    .m-user strong { font-size: 14px; }
    .m-user span { color: #747878; font-size: 12px; overflow-wrap: anywhere; }
    .drawer-logout { color: #9b2c2c; }
    .m-login { justify-content: center !important; border: 1px solid #171717 !important; background: #f4b8c1 !important; font-weight: 700 !important; letter-spacing: 1.3px !important; }
    @media (min-width: 1101px) { .m-overlay, .m-drawer { display: none; } }
    @media (max-width: 1100px) { .mobile-drawer { display: none !important; } }
    .avatar-circle { overflow: hidden; }
    .avatar-img { display: block; width: 100%; height: 100%; object-fit: cover; }
  `],
})
export class HeaderComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  readonly hasAboutRoute = this.router.config.some(r => r.path === 'about');
  readonly searchOpen = signal(false);
  readonly searchTerm = signal('');
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  readonly unread = signal(0);
  private unreadRequest?: Subscription;
  private readonly navSub: Subscription;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) this.loadUnread();
      else { this.unreadRequest?.unsubscribe(); this.unread.set(0); }
    });
    effect(() => {
      if (typeof document === 'undefined') return;
      document.body.style.overflow = this.mobileMenuOpen() ? 'hidden' : '';
    });
    this.navSub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.searchOpen.set(false);
      this.mobileMenuOpen.set(false);
      if (this.auth.isAuthenticated()) this.loadUnread();
    });
  }
  ngOnDestroy(): void { if (typeof document !== 'undefined') document.body.style.overflow = ''; this.navSub.unsubscribe(); this.unreadRequest?.unsubscribe(); }

  private loadUnread(): void {
    this.unreadRequest?.unsubscribe();
    this.unreadRequest = this.api.listNotifications(1, 1).subscribe({
      next: res => this.unread.set(res.unreadCount ?? 0),
      error: () => this.unread.set(0),
    });
  }

  toggleSearch(event: MouseEvent): void {
    event.stopPropagation();
    const open = !this.searchOpen();
    this.searchOpen.set(open);
    this.aiMenuOpen.set(false); this.userMenuOpen.set(false);
    if (open) setTimeout(() => this.searchInput?.nativeElement.focus());
  }
  submitSearch(event: Event): void {
    event.preventDefault();
    const q = this.searchTerm().trim();
    this.router.navigate(['/products'], { queryParams: q ? { q } : {} });
    this.searchOpen.set(false);
    this.mobileMenuOpen.set(false);
  }

  readonly aiMenuOpen = signal(false);
  toggleAiMenu(event: MouseEvent): void { event.stopPropagation(); this.aiMenuOpen.update(open => !open); this.userMenuOpen.set(false); }
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.searchOpen.set(false);
    if (this.aiMenuOpen()) { this.aiMenuOpen.set(false); document.getElementById('ai-nav-trigger')?.focus(); }
    this.userMenuOpen.set(false); this.mobileMenuOpen.set(false);
  }
  readonly userMenuOpen = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly mobileAiOpen = signal(false);
  closeMobile(): void { this.mobileMenuOpen.set(false); }

  toggleUserMenu(e: MouseEvent): void {
    e.stopPropagation();
    this.userMenuOpen.update((open) => !open);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.searchOpen.set(false);
    this.aiMenuOpen.set(false);
    this.userMenuOpen.set(false);
  }

  onLogout(): void {
    this.userMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
    this.auth.logout();
  }
}
