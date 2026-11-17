import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type { Order, OrderStatus } from '@fashion/contracts';
import { AccountSidebarComponent } from '../components/account-sidebar.component';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { orderStatusLabel } from '../shared/labels';
import { STORE_ACCOUNT_CONTENT } from '../shared/store-content';

/** Giá trị một ô số liệu: đang tải, có số hoặc lỗi (hiện "--"). */
type Stat = { state: 'loading' | 'ok' | 'error'; value: number };

@Component({
  standalone: true,
  imports: [RouterLink, AccountSidebarComponent, DatePipe, CurrencyPipe],
  template: `
    <main class="account-shell">
      <fc-account-sidebar activeItem="overview" />

      <section class="account-content">
        <header class="page-header">
          <h1>{{ content.title }}</h1>
          <p>{{ content.subtitle }}</p>
        </header>

        <section class="welcome" aria-label="Lời chào">
          <h2>Xin chào, {{ displayName() }}</h2>
          <p>{{ content.greetingText }}</p>
          <span class="welcome-email">{{ auth.currentUser()?.email }}</span>
        </section>

        <section class="stats" aria-label="Số liệu tài khoản">
          @for (card of statCards(); track card.key) {
            <article class="stat">
              <span class="stat-label">{{ card.label }}</span>
              <strong class="stat-value">{{ card.display }}</strong>
              <p>{{ card.hint }}</p>
              <a [routerLink]="card.link">{{ card.cta }} <span aria-hidden="true">→</span></a>
            </article>
          }
        </section>

        <section class="block">
          <header class="block-head"><div><h2>{{ content.profile.title }}</h2><p>{{ content.profile.subtitle }}</p></div></header>
          <div class="profile-card">
            <span class="avatar" aria-hidden="true">{{ initial() }}</span>
            <div class="profile-fields">
              <div class="field"><span class="field-label">HỌ VÀ TÊN</span><p class="field-value">{{ auth.currentUser()?.fullName }}</p></div>
              <div class="field"><span class="field-label">EMAIL ĐĂNG NHẬP</span><p class="field-value readonly">{{ auth.currentUser()?.email }}</p><small>{{ content.profile.emailNote }}</small></div>
            </div>
            <div class="profile-actions"><a routerLink="/profile" class="btn-pink">{{ content.profile.cta }}</a></div>
          </div>
        </section>

        <section class="block">
          <header class="block-head block-head--line">
            <h2>{{ content.recentOrders.title }}</h2>
            <a routerLink="/orders" class="view-all">{{ content.recentOrders.viewAll }} <span aria-hidden="true">→</span></a>
          </header>
          @if (ordersState() === 'loading') {
            <p class="notice" role="status">Đang tải đơn hàng...</p>
          } @else if (ordersState() === 'error') {
            <p class="notice notice--error" role="alert">{{ content.recentOrders.error }}</p>
          } @else if (recentOrders().length === 0) {
            <p class="notice">{{ content.recentOrders.empty }}</p>
          } @else {
            @for (order of recentOrders(); track order.id) {
              <article class="order">
                <div class="order-top">
                  <div><strong>#{{ order.code || order.id.slice(0, 8).toUpperCase() }}</strong>@if (order.createdAt) { <span class="order-date">{{ order.createdAt | date:'dd/MM/yyyy' }}</span> }</div>
                  <span class="status" [class.status--pending]="order.state === 'PENDING_PAYMENT'">{{ statusLabel(order.state) }}</span>
                </div>
                <div class="order-body">
                  <div class="order-info">
                    <strong>{{ order.items[0]?.productName }}</strong>
                    <span>Số lượng: {{ totalQuantity(order) }}@if (order.items.length > 1) { · {{ order.items.length }} sản phẩm }</span>
                  </div>
                  <div class="order-total"><span>TỔNG GIÁ TRỊ</span><strong>{{ order.money.payableTotal | currency:'VND':'symbol':'1.0-0' }}</strong></div>
                  <div class="order-actions">
                    @if (order.state === 'PENDING_PAYMENT') { <a [routerLink]="['/payment', order.id]" class="btn-pink">THANH TOÁN</a> }
                    <a [routerLink]="['/orders', order.id]" class="btn-outline">XEM CHI TIẾT</a>
                  </div>
                </div>
              </article>
            }
          }
        </section>
      </section>
    </main>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Playfair+Display:wght@400;500&display=swap');
    :host { display: block; background: #fff; color: #171414; } * { box-sizing: border-box; }
    .account-shell { width: min(1184px, calc(100% - 48px)); margin: 0 auto; padding: 40px 0 96px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 32px; align-items: start; font-family: 'Montserrat', sans-serif; }
    .account-content { min-width: 0; }
    .page-header { padding-bottom: 24px; border-bottom: 1px solid #e3e2e2; }
    .page-header h1 { margin: 0 0 8px; font: 400 40px/48px 'Playfair Display', serif; letter-spacing: -1px; color: #000; }
    .page-header p { margin: 0; color: #444748; font-size: 14px; line-height: 22px; letter-spacing: .14px; }
    .welcome { margin-top: 32px; padding: 40px 32px; border: 1px solid #5f5353; }
    .welcome h2 { margin: 0 0 8px; font: 500 28px/36px 'Playfair Display', serif; color: #000; }
    .welcome p { margin: 0 0 12px; color: #444748; font-size: 14px; line-height: 22px; }
    .welcome-email { color: #747878; font-size: 12px; letter-spacing: .3px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 32px; }
    .stat { display: flex; flex-direction: column; min-height: 193px; padding: 24px; border: 1px solid #5f5353; }
    .stat-label { color: #171414; font-size: 11px; font-weight: 600; letter-spacing: 1.1px; }
    .stat-value { margin: 16px 0 6px; font: 400 40px/48px 'Playfair Display', serif; }
    .stat p { flex: 1; margin: 0 0 12px; color: #444748; font-size: 12px; line-height: 18px; }
    .stat a { color: #dd3d40; font-size: 11px; font-weight: 700; letter-spacing: 1.1px; text-decoration: none; }
    .stat a:hover { text-decoration: underline; text-underline-offset: 4px; }
    .block { margin-top: 48px; }
    .block-head { margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #5f5353; }
    .block-head h2 { margin: 0; font: 400 24px/32px 'Playfair Display', serif; color: #000; }
    .block-head p { margin: 2px 0 0; color: #444748; font-size: 12px; }
    .block-head--line { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
    .view-all { color: #171414; font-size: 11px; font-weight: 700; letter-spacing: 1.1px; text-decoration: none; white-space: nowrap; }
    .profile-card { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 32px; padding: 32px; border: 1px solid #5f5353; }
    .avatar { display: grid; width: 92px; height: 92px; place-items: center; border: 1px solid #e3e2e2; border-radius: 50%; background: #ffd9e1; color: #000; font: 500 32px 'Playfair Display', serif; text-transform: uppercase; }
    .profile-fields { display: grid; gap: 20px; }
    .field-label { display: block; margin-bottom: 6px; color: #171414; font-size: 11px; font-weight: 600; letter-spacing: 1.1px; }
    .field-value { margin: 0; padding-bottom: 10px; border-bottom: 1px solid #e3e2e2; font-size: 15px; }
    .field-value.readonly { padding: 10px 12px; border: 0; background: #f5f3f3; color: #444748; font-size: 14px; }
    .field small { display: block; margin-top: 6px; color: #747878; font-size: 12px; }
    .profile-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; padding-top: 24px; border-top: 1px solid #e3e2e2; }
    .btn-pink, .btn-outline { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; padding: 0 22px; border: 1px solid #171414; font-size: 11px; font-weight: 700; letter-spacing: 1.1px; text-decoration: none; color: #171414; }
    .btn-pink { background: #f4b8c1; } .btn-pink:hover { background: #171414; color: #fff; }
    .btn-outline { background: #fff; } .btn-outline:hover { background: #f5f3f3; }
    .order { margin-bottom: 16px; padding: 24px; border: 1px solid #5f5353; }
    .order-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #e3e2e2; font-size: 14px; }
    .order-date { margin-left: 12px; color: #747878; font-size: 12px; }
    .status { padding: 4px 10px; border: 1px solid #e3e2e2; background: #f5f3f3; font-size: 11px; font-weight: 600; letter-spacing: .6px; }
    .status--pending { border-color: #f1d9a8; background: #fff8e8; color: #8a5a00; }
    .order-body { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-top: 18px; }
    .order-info { display: grid; gap: 6px; min-width: 0; flex: 1 1 220px; }
    .order-info strong { font: 400 17px/24px 'Playfair Display', serif; }
    .order-info span { color: #444748; font-size: 12px; }
    .order-total { display: grid; gap: 4px; text-align: right; }
    .order-total span { color: #444748; font-size: 10px; font-weight: 600; letter-spacing: 1.1px; }
    .order-total strong { font-size: 16px; }
    .order-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .notice { padding: 28px; border: 1px solid #e3e2e2; color: #444748; font-size: 13px; text-align: center; }
    .notice--error { color: #9b2c2c; }
    :is(a, button):focus-visible { outline: 2px solid #8f485d; outline-offset: 3px; }
    @media (max-width: 1000px) { .account-shell { grid-template-columns: 1fr; } .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .stats { grid-template-columns: 1fr; } .profile-card { grid-template-columns: 1fr; padding: 22px 18px; } .welcome { padding: 28px 20px; } .order-total { text-align: left; } }
  `],
})
export class AccountPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly content = STORE_ACCOUNT_CONTENT;
  private readonly requests = new Subscription();

  private readonly orders = signal<Stat>({ state: 'loading', value: 0 });
  private readonly addresses = signal<Stat>({ state: 'loading', value: 0 });
  private readonly aiJobs = signal<Stat>({ state: 'loading', value: 0 });
  private readonly unread = signal<Stat>({ state: 'loading', value: 0 });
  readonly recentOrders = signal<Order[]>([]);
  readonly ordersState = signal<'loading' | 'ok' | 'error'>('loading');

  readonly displayName = computed(() => this.auth.currentUser()?.fullName?.trim() || 'bạn');
  readonly initial = computed(() => this.auth.currentUser()?.fullName?.trim()?.[0] || 'M');
  readonly statCards = computed(() => {
    const c = this.content.stats;
    const show = (s: Stat) => s.state === 'error' ? '--' : s.state === 'loading' ? '…' : String(s.value).padStart(2, '0');
    return [
      { key: 'orders', ...c.orders, link: '/orders', display: show(this.orders()) },
      { key: 'addresses', ...c.addresses, link: '/addresses', display: show(this.addresses()) },
      { key: 'ai', ...c.ai, link: '/ai/history', display: show(this.aiJobs()) },
      { key: 'notifications', ...c.notifications, link: '/notifications', display: show(this.unread()) },
    ];
  });

  ngOnInit(): void {
    // Mỗi ô tải độc lập: một ô lỗi chỉ hiện "--", các ô khác vẫn chạy.
    this.requests.add(this.api.listOrders(1, 10).subscribe({
      next: res => {
        this.orders.set({ state: 'ok', value: res.total });
        const sorted = [...res.items].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        this.recentOrders.set(sorted.slice(0, 2));
        this.ordersState.set('ok');
      },
      error: () => { this.orders.set({ state: 'error', value: 0 }); this.ordersState.set('error'); },
    }));
    this.requests.add(this.api.listAddresses().subscribe({
      next: res => this.addresses.set({ state: 'ok', value: res.items.length }),
      error: () => this.addresses.set({ state: 'error', value: 0 }),
    }));
    this.requests.add(this.api.listAiJobs(1, 1).subscribe({
      next: res => this.aiJobs.set({ state: 'ok', value: res.total }),
      error: () => this.aiJobs.set({ state: 'error', value: 0 }),
    }));
    this.requests.add(this.api.listNotifications(1, 1).subscribe({
      next: res => this.unread.set({ state: 'ok', value: res.unreadCount ?? 0 }),
      error: () => this.unread.set({ state: 'error', value: 0 }),
    }));
  }

  ngOnDestroy(): void { this.requests.unsubscribe(); }

  statusLabel(state: OrderStatus): string { return orderStatusLabel(state).toUpperCase(); }
  totalQuantity(order: Order): number { return order.items.reduce((sum, item) => sum + item.quantity, 0); }
}
