import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Order, OrderStatus } from '@fashion/contracts';
import { PaginationComponent, PaginationState } from '../components/pagination.component';
import { ApiService } from '../services/api.service';
import { STORE_ORDERS_CONTENT } from '../shared/store-content';

type OrderItem = Order['items'][number];

@Component({
  standalone: true,
  imports: [PaginationComponent, RouterLink, CurrencyPipe, DatePipe],
  template: `
    <main class="account-shell">
      <aside class="account-sidebar" aria-label="Điều hướng tài khoản">
        <div class="account-identity">
          <span class="account-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4.3 3.4-6.5 8-6.5s7.3 2.2 8 6.5"/></svg>
          </span>
          <div><span class="account-kicker">TÀI KHOẢN</span><strong>Tài khoản của bạn</strong></div>
        </div>

        <nav class="account-nav" aria-label="Các mục tài khoản">
          <a routerLink="/account">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4.3 3.4-6.5 8-6.5s7.3 2.2 8 6.5"/></svg>
            <span>Thông tin cá nhân</span><span aria-hidden="true">→</span>
          </a>
          <a routerLink="/addresses">
            <svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
            <span>Sổ địa chỉ</span><span aria-hidden="true">→</span>
          </a>
          <a routerLink="/orders" class="active" aria-current="page">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14l-1 14H6L5 7Z"/><path d="M9 9V5a3 3 0 0 1 6 0v4"/></svg>
            <span>Đơn hàng của tôi</span><span aria-hidden="true">→</span>
          </a>
        </nav>

        <div class="sidebar-help">
          <span>CẦN HỖ TRỢ?</span>
          <p>Xem thông tin và thao tác phù hợp trong trang chi tiết của từng đơn hàng.</p>
        </div>
      </aside>

      <section class="orders-content">
        <header class="page-header">
          <h1>Đơn hàng của tôi</h1>
          <p>Theo dõi trạng thái và xem lại các đơn hàng của bạn.</p>
        </header>

        <div class="status-tabs" aria-label="Trạng thái đơn hàng" data-ui-only>
          @for (tab of statusTabs; track tab.value) {
            <button type="button" [class.active]="activeStatus() === tab.value" [attr.aria-pressed]="activeStatus() === tab.value" (click)="activeStatus.set(tab.value)" data-ui-only>{{ tab.label }}</button>
          }
        </div>

        <div class="orders-toolbar">
          <label class="search-control" data-ui-only>
            <span class="visually-hidden">Tìm đơn hàng</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input type="search" placeholder="Tìm theo mã đơn hoặc tên sản phẩm..." [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" data-ui-only />
          </label>

          <label class="sort-control" data-ui-only>
            <span>SẮP XẾP</span>
            <select [value]="sortMode()" (change)="sortMode.set($any($event.target).value)" data-ui-only>
              <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option>
            </select>
          </label>
        </div>

        @if (loading()) {
          <div class="state-panel" aria-live="polite">
            <span class="spinner" aria-hidden="true"></span><h2>Đang tải đơn hàng</h2><p>Danh sách đơn hàng của bạn đang được cập nhật.</p>
          </div>
        } @else if (error()) {
          <div class="state-panel state-error" role="alert">
            <span class="state-icon" aria-hidden="true">!</span><h2>Không thể tải đơn hàng</h2><p>{{ error() }}</p>
            <button type="button" class="button button-primary" (click)="loadOrders()">THỬ LẠI</button>
          </div>
        } @else if (orders().length === 0) {
          <div class="state-panel empty-state">
            <span class="empty-bag" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M10 15h28l-2 27H12l-2-27Z"/><path d="M17 19v-6a7 7 0 0 1 14 0v6"/></svg></span>
            <span class="state-eyebrow">LỊCH SỬ MUA SẮM</span><h2>Bạn chưa có đơn hàng</h2>
            <p>Khi bạn hoàn tất mua sắm, đơn hàng sẽ xuất hiện tại đây.</p>
            <a routerLink="/products" class="button button-primary">KHÁM PHÁ SẢN PHẨM <span aria-hidden="true">→</span></a>
          </div>
        } @else {
          <div class="orders-list">
            @for (order of orders(); track order.id) {
              <article class="order-card">
                <header class="order-card-header">
                  <div><strong>ĐƠN HÀNG #{{ order.code || order.id.slice(0, 8).toUpperCase() }}</strong><span>Đặt ngày {{ order.createdAt | date:'dd/MM/yyyy' }}</span></div>
                  <span class="status-pill" [class]="'status-pill status-' + order.state.toLowerCase()">{{ formatStatus(order.state) }}</span>
                </header>

                <div class="order-card-body">
                  <div class="order-products">
                    @for (item of order.items; track item.variantId) {
                      <div class="product-row">
                        <div class="product-image">
                          @if (itemImage(item); as imageUrl) { <img [src]="imageUrl" [alt]="item.productName" /> } @else { <span aria-hidden="true">MUSE</span> }
                        </div>
                        <div class="product-copy">
                          <span class="product-label">SẢN PHẨM</span><h2>{{ item.productName }}</h2>
                          <div class="product-meta">@if (item.sku) { <span>SKU: {{ item.sku }}</span> }<span>Số lượng: {{ item.quantity }}</span></div>
                          <strong>{{ (item.unitPrice * item.quantity) | currency:'VND':'symbol':'1.0-0' }}</strong>
                        </div>
                      </div>
                    }
                  </div>

                  <div class="order-status-copy">
                    @if (order.state === 'PENDING_PAYMENT') { <p><span aria-hidden="true">○</span>{{ policy.pendingPaymentNote }}</p> }
                    @if (order.state === 'SHIPPING') {
                      <p><span aria-hidden="true">○</span>Đơn hàng đang được vận chuyển.</p>
                      @if (shipmentCarrier(order); as carrier) { <p>Đơn vị vận chuyển: <strong>{{ carrier }}</strong></p> }
                      @if (trackingCode(order); as code) { <p>Mã vận đơn: <strong>{{ code }}</strong></p> }
                    }
                    @if (order.state === 'DELIVERED') { <p><span aria-hidden="true">○</span>Đơn hàng đã được giao.</p> }
                  </div>

                  <div class="order-total"><span>TỔNG CỘNG</span><strong>{{ order.money.payableTotal | currency:'VND':'symbol':'1.0-0' }}</strong></div>
                  <div class="order-actions">
                    @if (order.state === 'PENDING_PAYMENT') { <a [routerLink]="['/orders', order.id]" class="cancel-link">HỦY ĐƠN HÀNG</a> }
                    <span class="action-spacer"></span>
                    <a [routerLink]="['/orders', order.id]" class="button button-outline">XEM CHI TIẾT</a>
                    @if (order.state === 'PENDING_PAYMENT') { <a [routerLink]="['/payment', order.id]" class="button button-primary">THANH TOÁN NGAY <span aria-hidden="true">→</span></a> }
                    @if (order.state === 'SHIPPING') { <a [routerLink]="['/orders', order.id]" class="button button-primary">THEO DÕI VẬN ĐƠN <span aria-hidden="true">→</span></a> }
                    @if (order.state === 'DELIVERED') { <a [routerLink]="['/orders', order.id]" class="button button-primary">ĐÁNH GIÁ SẢN PHẨM <span aria-hidden="true">→</span></a> }
                  </div>
                </div>
              </article>
            }
          </div>

          <div class="pagination-wrap"><fc-pagination label="Phân trang đơn hàng" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" /></div>
        }
      </section>
    </main>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Outfit:wght@300;400;500;600&family=Playfair+Display:wght@400;500&display=swap');
    :host { display: block; color: #1f1b1b; background: #fff; }
    * { box-sizing: border-box; }
    .account-shell { width: min(1184px, calc(100% - 48px)); margin: 0 auto; padding: 40px 0 88px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 32px; font-family: 'Montserrat', sans-serif; }
    .account-sidebar { align-self: start; border: 1px solid #5f5353; padding: 24px; min-height: 492px; }
    .account-identity { display: flex; align-items: center; gap: 14px; padding-bottom: 24px; border-bottom: 1px solid #dedada; }
    .account-avatar { width: 48px; height: 48px; border-radius: 50%; background: #f6e7e9; display: grid; place-items: center; flex: 0 0 auto; }
    .account-avatar svg { width: 24px; stroke: #1f1b1b; stroke-width: 1.5; }
    .account-kicker { display: block; font: 500 10px/1.4 'Montserrat', sans-serif; letter-spacing: 1.5px; color: #786f6f; margin-bottom: 3px; }
    .account-identity strong { font: 500 17px/1.3 'Outfit', sans-serif; }
    .account-nav { padding: 18px 0; display: grid; gap: 4px; border-bottom: 1px solid #dedada; }
    .account-nav a { min-height: 50px; padding: 0 12px; display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 12px; color: #312b2b; text-decoration: none; font-size: 12px; letter-spacing: .25px; }
    .account-nav a:hover, .account-nav a:focus-visible { background: #f8f5f5; }
    .account-nav a.active { background: #f5e6e8; font-weight: 600; }
    .account-nav svg { width: 19px; stroke: currentColor; stroke-width: 1.4; }
    .sidebar-help { padding-top: 24px; }
    .sidebar-help span { font-size: 10px; font-weight: 600; letter-spacing: 1.4px; }
    .sidebar-help p { margin: 9px 0 0; font: 300 13px/1.65 'Outfit', sans-serif; color: #706767; }
    .orders-content { min-width: 0; }
    .page-header { padding-bottom: 24px; border-bottom: 1px solid #5f5353; }
    .page-header h1 { margin: -8px 0 9px; font: 400 clamp(34px, 4vw, 40px)/1.2 'Playfair Display', serif; letter-spacing: -1px; }
    .page-header p { margin: 0; font: 300 16px/26px 'Outfit', sans-serif; color: #675e5e; }
    .status-tabs { display: flex; flex-wrap: wrap; gap: 8px; padding: 24px 0 32px; }
    .status-tabs button { min-height: 32px; border: 1px solid #e3e0e0; background: #fff; padding: 7px 14px; color: #3f3838; font: 600 10px/1.4 'Montserrat', sans-serif; letter-spacing: .9px; text-transform: uppercase; cursor: pointer; }
    .status-tabs button:hover, .status-tabs button:focus-visible { border-color: #1f1b1b; }
    .status-tabs button.active { background: #1f1b1b; border-color: #1f1b1b; color: #fff; }
    .orders-toolbar { min-height: 64px; padding: 12px 16px; margin-bottom: 24px; background: #faf9f9; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .search-control { width: min(448px, 60%); height: 40px; border: 1px solid #cfcaca; background: #fff; display: flex; align-items: center; padding: 0 13px; }
    .search-control svg { width: 18px; flex: 0 0 auto; stroke: #494242; stroke-width: 1.5; }
    .search-control input { min-width: 0; flex: 1; border: 0; outline: 0; padding: 0 0 0 11px; font: 400 12px 'Montserrat', sans-serif; color: #1f1b1b; background: transparent; }
    .search-control input::placeholder { color: #8a8282; }
    .sort-control { display: flex; align-items: center; gap: 12px; }
    .sort-control > span { font-size: 10px; font-weight: 600; letter-spacing: 1.1px; white-space: nowrap; }
    .sort-control select { width: 134px; height: 32px; border: 1px solid #cfcaca; background: #fff; padding: 0 10px; font: 500 11px 'Montserrat', sans-serif; color: #302a2a; }
    .orders-list { display: grid; gap: 24px; }
    .order-card { border: 1px solid #5f5353; background: #fff; }
    .order-card-header { min-height: 65px; padding: 13px 20px; display: flex; align-items: center; justify-content: space-between; gap: 20px; background: rgba(245, 243, 243, .4); border-bottom: 1px solid #d6d1d1; }
    .order-card-header > div { display: grid; gap: 5px; }
    .order-card-header strong { font-size: 12px; line-height: 1.4; letter-spacing: 1.15px; }
    .order-card-header div span { font-size: 11px; color: #756d6d; }
    .status-pill { padding: 6px 10px; border: 1px solid currentColor; font-size: 9px; font-weight: 600; letter-spacing: .9px; text-transform: uppercase; white-space: nowrap; }
    .status-pending_payment { color: #976315; background: #fff9ed; } .status-confirmed { color: #245b45; background: #eff8f3; } .status-preparing { color: #435c79; background: #f0f5fa; }
    .status-shipping { color: #3e4f83; background: #f1f3fb; } .status-delivered { color: #2c674b; background: #edf7f1; } .status-cancelled { color: #9a3838; background: #fff1f1; } .status-cancel_pending_refund { color: #8d5827; background: #fff5e9; }
    .order-card-body { padding: 24px; }
    .order-products { display: grid; gap: 20px; }
    .product-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 20px; min-height: 128px; }
    .product-row + .product-row { padding-top: 20px; border-top: 1px solid #e6e2e2; }
    .product-image { width: 96px; height: 128px; border: 1px solid #dedada; background: #f4f1f1; overflow: hidden; display: grid; place-items: center; }
    .product-image img { width: 100%; height: 100%; object-fit: cover; }
    .product-image span { font: 500 13px 'Playfair Display', serif; letter-spacing: 2px; color: #8b8282; }
    .product-copy { display: flex; flex-direction: column; align-items: flex-start; padding: 3px 0; }
    .product-label { font-size: 9px; font-weight: 600; letter-spacing: 1.3px; color: #826c5c; }
    .product-copy h2 { margin: 8px 0 9px; font: 500 15px/1.45 'Montserrat', sans-serif; }
    .product-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; color: #736b6b; font-size: 11px; line-height: 1.6; }
    .product-copy > strong { margin-top: auto; font-size: 13px; }
    .order-status-copy { margin: 20px 0 0 116px; color: #655d5d; font: 400 11px/1.65 'Montserrat', sans-serif; }
    .order-status-copy p { margin: 3px 0; } .order-status-copy p > span { margin-right: 8px; color: #bc7b85; }
    .order-total { margin-top: 20px; padding: 16px 0; border-top: 1px solid #d6d1d1; display: flex; justify-content: flex-end; align-items: baseline; gap: 18px; }
    .order-total span { font-size: 10px; font-weight: 600; letter-spacing: 1.1px; } .order-total strong { font: 500 20px 'Montserrat', sans-serif; }
    .order-actions { padding-top: 20px; border-top: 1px solid #d6d1d1; display: flex; align-items: center; gap: 12px; }
    .action-spacer { flex: 1; }
    .cancel-link { color: #a33d3d; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-decoration: underline; text-underline-offset: 4px; }
    .button { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 12px; padding: 10px 17px; border: 1px solid #1f1b1b; text-decoration: none; font: 600 10px/1.3 'Montserrat', sans-serif; letter-spacing: 1.05px; color: #1f1b1b; cursor: pointer; }
    .button-outline { background: #fff; } .button-primary { background: #f4b8c1; }
    .button:hover, .button:focus-visible { box-shadow: inset 0 0 0 1px #1f1b1b; }
    .pagination-wrap { display: flex; justify-content: flex-end; margin-top: 28px; }
    .state-panel { min-height: 420px; border: 1px solid #5f5353; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 48px 24px; }
    .state-panel h2 { margin: 12px 0 8px; font: 400 30px/1.25 'Playfair Display', serif; }
    .state-panel p { max-width: 460px; margin: 0 0 24px; color: #6d6464; font: 300 15px/1.7 'Outfit', sans-serif; }
    .spinner { width: 36px; height: 36px; border: 2px solid #e0dcdc; border-top-color: #1f1b1b; border-radius: 50%; animation: spin .8s linear infinite; }
    .state-icon { width: 42px; height: 42px; border: 1px solid #a33d3d; border-radius: 50%; display: grid; place-items: center; color: #a33d3d; font: 500 24px 'Playfair Display', serif; }
    .empty-bag { width: 58px; height: 58px; display: grid; place-items: center; } .empty-bag svg { width: 48px; stroke: #1f1b1b; stroke-width: 1.2; }
    .state-eyebrow { margin-top: 16px; color: #8a6752; font-size: 9px; font-weight: 600; letter-spacing: 1.6px; }
    .empty-state h2 { margin-top: 8px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 900px) {
      .account-shell { grid-template-columns: 1fr; width: min(100% - 32px, 720px); padding-top: 24px; gap: 24px; }
      .account-sidebar { min-height: 0; } .account-identity, .sidebar-help { display: none; }
      .account-nav { padding: 0; border: 0; grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .account-nav a { grid-template-columns: 18px 1fr; padding: 8px 10px; text-align: center; } .account-nav a > span:last-child { display: none; }
    }
    @media (max-width: 640px) {
      .account-shell { width: 100%; padding: 20px 16px 64px; } .account-sidebar { padding: 10px; }
      .account-nav { grid-template-columns: 1fr; } .account-nav a { text-align: left; }
      .page-header h1 { font-size: 34px; }
      .status-tabs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 22px; } .status-tabs button { flex: 0 0 auto; }
      .orders-toolbar { align-items: stretch; flex-direction: column; gap: 12px; } .search-control { width: 100%; }
      .sort-control { justify-content: space-between; } .sort-control select { flex: 1; max-width: 190px; }
      .order-card-header { align-items: flex-start; flex-direction: column; }
      .product-row { grid-template-columns: 82px minmax(0, 1fr); gap: 14px; } .product-image { width: 82px; height: 110px; }
      .order-status-copy { margin-left: 0; } .order-actions { flex-wrap: wrap; } .action-spacer { display: none; }
      .order-actions .button { width: 100%; } .cancel-link { width: 100%; padding: 8px 0; } .order-total { justify-content: space-between; }
    }
  `],
})
export class OrdersPage implements OnInit {
  readonly pagination = new PaginationState(20);
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly activeStatus = signal<string>('ALL');
  readonly searchTerm = signal('');
  readonly sortMode = signal('newest');
  readonly policy = STORE_ORDERS_CONTENT;
  readonly statusTabs: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'ALL', label: 'Tất cả' }, { value: 'PENDING_PAYMENT', label: 'Chờ thanh toán' },
    { value: 'CONFIRMED', label: 'Đã xác nhận' }, { value: 'PREPARING', label: 'Đang chuẩn bị' },
    { value: 'SHIPPING', label: 'Đang giao' }, { value: 'DELIVERED', label: 'Đã giao' },
    { value: 'CANCELLED', label: 'Đã hủy' },
    { value: 'CANCEL_PENDING_REFUND', label: 'Chờ hoàn tiền' },
  ];
  private readonly api = inject(ApiService);

  ngOnInit(): void { this.loadOrders(); }
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadOrders(); }
  loadOrders(): void {
    this.loading.set(true); this.error.set('');
    this.pagination.load(() => this.api.listOrders(this.pagination.page(), this.pagination.limit), {
      next: (res) => { this.orders.set(res.items); this.loading.set(false); },
      error: () => { this.error.set('Không thể tải lịch sử đơn hàng.'); this.loading.set(false); },
    });
  }
  itemImage(item: OrderItem): string {
    const image = item as unknown as { imageUrl?: string; productImage?: string; image?: { url?: string } };
    return image.imageUrl || image.productImage || image.image?.url || '';
  }
  shipmentCarrier(order: Order): string {
    return (order as unknown as { shipment?: { carrier?: string } }).shipment?.carrier || '';
  }
  trackingCode(order: Order): string {
    return (order as unknown as { shipment?: { trackingCode?: string } }).shipment?.trackingCode || '';
  }
  formatStatus(state: OrderStatus): string {
    switch (state) {
      case 'PENDING_PAYMENT': return 'Chờ thanh toán';
      case 'CONFIRMED': return 'Đã xác nhận';
      case 'PREPARING': return 'Đang chuẩn bị hàng';
      case 'SHIPPING': return 'Đang giao hàng';
      case 'DELIVERED': return 'Đã giao thành công';
      case 'CANCELLED': return 'Đã hủy';
      case 'CANCEL_PENDING_REFUND': return 'Hủy - Chờ hoàn tiền';
      default: return state;
    }
  }
}
