import { Component, DestroyRef, OnInit, WritableSignal, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import type { AdminAiJobStats, AdminOrderSummary, InventoryItem, SalesReport } from '@fashion/contracts';
import { AdminChartDonutComponent, DonutSegment } from '../../components/admin-chart-donut.component';
import { AdminChartRevenueComponent, RevenueChartDay } from '../../components/admin-chart-revenue.component';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { salesReportDateRange, vietnamDate } from '../../services/report-date-range';
import { ORDER_STATUS_LABELS, orderStatusLabel } from '../../shared/labels';

type Period = 'today' | '7d' | 'month';
type Load<T> = { status: 'loading' | 'error' | 'ok'; data: T | null };
const loading = <T>(): Load<T> => ({ status: 'loading', data: null });

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày qua' },
  { key: 'month', label: 'Tháng này' },
];

const STATUS_ORDER = ['DELIVERED', 'SHIPPING', 'PREPARING', 'CONFIRMED', 'PENDING_PAYMENT', 'CANCEL_PENDING_REFUND', 'CANCELLED'] as const;
const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#805159', SHIPPING: '#f3b7c0', PREPARING: '#ffd9de', CONFIRMED: '#444748',
  PENDING_PAYMENT: '#c4c7c7', CANCEL_PENDING_REFUND: '#8c8186', CANCELLED: '#1b1c1c',
};
const STATUS_TONE: Record<string, string> = {
  PENDING_PAYMENT: 'warning', CONFIRMED: 'success', PREPARING: 'info', SHIPPING: 'info',
  DELIVERED: 'success', CANCELLED: 'danger', CANCEL_PENDING_REFUND: 'warning',
};

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const dmy = (iso: string): string => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const dm = (iso: string): string => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

function rangeFor(period: Period): { from: string; to: string } {
  const today = vietnamDate();
  if (period === 'today') return { from: today, to: today };
  if (period === '7d') return { from: addDays(today, -6), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}
function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const length = dayDiff(range.from, range.to) + 1;
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(length - 1)), to };
}

@Component({
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, AdminChartRevenueComponent, AdminChartDonutComponent],
  template: `
    <div class="dash">
      <header class="head">
        <div>
          <h1>Dashboard</h1>
          <p class="sub">Theo dõi tình hình kinh doanh và vận hành cửa hàng MUSE.</p>
        </div>
        <div class="tools">
          <div class="seg" role="group" aria-label="Chọn kỳ báo cáo">
            @for (p of periods; track p.key) {
              <button type="button" [class.on]="period() === p.key" [attr.aria-pressed]="period() === p.key" (click)="setPeriod(p.key)">
                {{ p.label }}@if (period() === p.key) { <span class="range"> [{{ rangeText() }}]</span> }
              </button>
            }
          </div>
          <button type="button" class="refresh" (click)="reloadAll()" [disabled]="busy()">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.3M3 12A9 9 0 0 1 18.5 5.7M18 2v4h-4M6 22v-4h4"/></svg>
            {{ busy() ? 'Đang tải...' : 'Làm mới dữ liệu' }}
          </button>
        </div>
      </header>

      <!-- Ô số liệu -->
      <section class="kpis" aria-label="Chỉ số chính">
        <article class="kpi">
          <h2>Doanh thu đã thu <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="12" cy="12" r="3"/></svg></span></h2>
          @if (report().status === 'ok') {
            <p class="value">{{ money(report().data!.paidRevenue) }}</p>
            <p class="foot">@if (delta(report().data!.paidRevenue, prevReport().data?.paidRevenue); as d) { <span class="chip" [class.down]="d.negative">{{ d.arrow }} {{ d.text }}</span> <span class="muted">so với kỳ trước</span> } @else { <span class="muted">Đã thu trong kỳ</span> }</p>
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: report().status, retry: loadReports }" /> }
        </article>
        <article class="kpi">
          <h2>Doanh thu ròng <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18 10 12l4 4 6-8M15 8h5v5"/></svg></span></h2>
          @if (report().status === 'ok') {
            <p class="value">{{ money(report().data!.netRevenue) }}</p>
            <p class="foot"><span class="muted">Hoàn: {{ money(report().data!.refundedAmount) }}</span></p>
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: report().status, retry: loadReports }" /> }
        </article>
        <article class="kpi">
          <h2>Tổng đơn hàng <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6"/></svg></span></h2>
          @if (report().status === 'ok') {
            <p class="value">{{ report().data!.orderCount.toLocaleString('vi-VN') }} <small>đơn</small></p>
            <p class="foot">@if (delta(report().data!.orderCount, prevReport().data?.orderCount); as d) { <span class="chip" [class.down]="d.negative">{{ d.arrow }} {{ d.text }}</span> <span class="muted">so với kỳ trước</span> } @else { <span class="muted">Đơn đã thanh toán</span> }</p>
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: report().status, retry: loadReports }" /> }
        </article>
        <article class="kpi">
          <h2>Đơn chờ xử lý <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg></span></h2>
          @if (report().status === 'ok') {
            <p class="value">{{ pendingCount().toLocaleString('vi-VN') }} <small>đơn</small></p>
            <p class="foot"><span class="muted">Đã xác nhận + đang chuẩn bị (đơn tạo trong kỳ)</span></p>
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: report().status, retry: loadReports }" /> }
        </article>
        <article class="kpi">
          <h2>Sắp hết hàng <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3ZM12 10v4m0 3h.01"/></svg></span></h2>
          @if (lowStock(); as low) {
            <p class="value">{{ low.items.length.toLocaleString('vi-VN') }} <small>SKU</small></p>
            <p class="foot"><span class="muted">Còn ≤ {{ low.threshold }} sản phẩm</span></p>
          } @else if (inventory().status === 'error' || settings().status === 'error') {
            <ng-container *ngTemplateOutlet="state; context: { s: 'error', retry: loadStock }" />
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: 'loading' }" /> }
        </article>
        @if (auth.isAdmin()) {
          <article class="kpi">
            <h2>Lượt dùng AI <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/></svg></span></h2>
            @if (aiStats().status === 'ok') {
              <p class="value">{{ aiStats().data!.total.toLocaleString('vi-VN') }} <small>lượt</small></p>
              <p class="foot"><span class="muted">Thử đồ &amp; Mix &amp; Match · {{ aiDonePct() }} hoàn thành</span></p>
            } @else if (aiStats().status === 'error') { <p class="value">—</p><p class="foot"><span class="muted">Không tải được</span></p> }
            @else { <ng-container *ngTemplateOutlet="state; context: { s: 'loading' }" /> }
          </article>
        }
      </section>

      <!-- Biểu đồ -->
      <section class="charts">
        <article class="card">
          <header class="card-head">
            <div><h2>Biểu đồ Doanh thu &amp; Đơn hàng theo ngày</h2>
              <p class="muted">Dữ liệu tổng hợp từ {{ rangeSentence() }}</p></div>
          </header>
          @if (report().status === 'ok') {
            <fc-admin-chart-revenue [days]="series()" />
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: report().status, retry: loadReports }" /> }
        </article>
        <article class="card">
          <header class="card-head">
            <div><h2>Trạng thái đơn hàng</h2><p class="muted">Đơn tạo trong kỳ đang chọn</p></div>
            <span class="tag">{{ periodTag() }}</span>
          </header>
          @if (report().status === 'ok') {
            <fc-admin-chart-donut [segments]="segments()" [centerValue]="completion()" centerLabel="HOÀN TẤT" />
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: report().status, retry: loadReports }" /> }
        </article>
      </section>

      <!-- Đơn mới nhất + cảnh báo -->
      <section class="lower">
        <article class="card">
          <header class="card-head">
            <h2>Đơn hàng mới nhất</h2>
            <a routerLink="/admin/orders" class="link">Xem tất cả</a>
          </header>
          @if (orders().status === 'ok') {
            @if (orders().data!.length) {
              <div class="scroll">
                <table class="table">
                  <thead><tr><th scope="col">Mã đơn</th><th scope="col">Khách hàng</th><th scope="col" class="r">Tổng tiền</th><th scope="col">Trạng thái</th><th scope="col">Thời gian</th></tr></thead>
                  <tbody>
                    @for (o of orders().data!; track o.id) {
                      <tr class="row-link" tabindex="0" role="link" [attr.aria-label]="'Mở đơn hàng ' + o.code"
                          (click)="openOrder(o.id)" (keydown.enter)="openOrder(o.id)">
                        <td><a [routerLink]="['/admin/orders']" [queryParams]="{ orderId: o.id }" class="code" (click)="$event.stopPropagation()">{{ o.code }}</a></td>
                        <td><strong>{{ o.shippingSnapshot?.receiver || 'Khách vãng lai' }}</strong>@if (o.shippingSnapshot?.phone) { <span class="phone">{{ maskPhone(o.shippingSnapshot!.phone) }}</span> }</td>
                        <td class="r"><strong>{{ money(o.money.payableTotal) }}</strong></td>
                        <td><span [class]="'badge ' + tone(o.state)">{{ statusLabel(o.state) }}</span></td>
                        <td class="when" [title]="fullTime(o.createdAt)">{{ timeAgo(o.createdAt) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="note">Hiển thị {{ orders().data!.length }} đơn mới nhất</p>
            } @else { <p class="empty">Chưa có đơn hàng nào.</p> }
          } @else { <ng-container *ngTemplateOutlet="state; context: { s: orders().status, retry: loadOrders }" /> }
        </article>

        <article class="card">
          <header class="card-head">
            <h2>Cảnh báo vận hành</h2>
            @if (alerts().length) { <span class="tag">{{ alerts().length }} ưu tiên</span> }
          </header>
          @for (a of alerts(); track a.key) {
            <div class="alert">
              <h3>{{ a.title }}</h3>
              <p>{{ a.text }}</p>
              <a [routerLink]="a.link" class="btn-mini">{{ a.cta }}</a>
            </div>
          }
          @if (!alerts().length) {
            @if (alertsPending()) { <p class="empty">Đang tải...</p> }
            @else if (alertsFailed()) { <p class="empty">Không thể tải một số cảnh báo. <button type="button" class="link" (click)="loadAlerts()">Thử lại</button></p> }
            @else { <p class="empty">Hiện không có cảnh báo vận hành nào.</p> }
          } @else if (alertsFailed()) {
            <p class="note">Một số nguồn cảnh báo chưa tải được. <button type="button" class="link" (click)="loadAlerts()">Thử lại</button></p>
          }
          <a routerLink="/admin/settings" class="foot-link">Cấu hình ngưỡng cảnh báo hệ thống →</a>
        </article>
      </section>

      <!-- Top sản phẩm -->
      <section class="card">
        <header class="card-head">
          <div><h2>Top sản phẩm bán chạy nhất</h2><p class="muted">Xếp hạng theo sản lượng đã thanh toán, {{ periodLower() }}</p></div>
        </header>
        @if (report().status === 'ok') {
          @if (topRows().length) {
            <div class="scroll">
              <table class="table">
                <thead><tr><th scope="col">#</th><th scope="col">Sản phẩm</th><th scope="col">Mã SKU</th><th scope="col" class="r">Số lượng bán</th><th scope="col" class="r">Tổng doanh thu</th><th scope="col" class="r">Tồn kho</th></tr></thead>
                <tbody>
                  @for (row of topRows(); track row.productId; let i = $index) {
                    <tr><td>{{ i + 1 }}</td><td><strong>{{ row.productName }}</strong></td><td>{{ row.sku || '—' }}</td><td class="r">{{ row.quantity.toLocaleString('vi-VN') }}</td><td class="r">{{ money(row.revenue) }}</td><td class="r">{{ row.stock }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <p class="empty">Chưa có sản phẩm bán ra trong kỳ này.</p> }
        } @else { <ng-container *ngTemplateOutlet="state; context: { s: report().status, retry: loadReports }" /> }
      </section>
    </div>

    <ng-template #state let-s="s" let-retry="retry">
      @if (s === 'loading') { <p class="skeleton" role="status">Đang tải...</p> }
      @else { <p class="err" role="alert">Không thể tải dữ liệu. @if (retry) { <button type="button" class="link" (click)="retry()">Thử lại</button> }</p> }
    </ng-template>
  `,
  styles: [`
    :host { display: block; font-family: var(--font-sans); color: #1b1c1c; }
    .dash { display: flex; flex-direction: column; gap: 24px; }
    .head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    h1 { margin: 0; font: 700 28px/36px var(--font-serif); letter-spacing: -.7px; }
    .sub { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: #444748; }
    .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .seg { display: flex; flex-wrap: wrap; padding: 4px; border-radius: 4px; background: #efeded; }
    .seg button { padding: 4px 12px; border: 0; border-radius: 2px; background: none; color: #444748; font: 500 11px/14px var(--font-sans); letter-spacing: .44px; }
    .seg button.on { background: #fff; color: #1b1c1c; font-weight: 700; box-shadow: 0 1px 1px #0000000d; }
    .seg .range { font-weight: 400; }
    .refresh { display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px; border: 0; border-radius: 2px; background: #000; color: #fff; font: 700 11px/14px var(--font-sans); letter-spacing: .44px; }
    .refresh:disabled { opacity: .6; cursor: progress; }
    :focus-visible { outline: 2px solid #805159; outline-offset: 2px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); gap: 12px; }
    .kpi, .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 1px #0000000d, 0 0 0 1px #efeded; }
    .kpi { display: flex; flex-direction: column; gap: 4px; padding: 16px; min-width: 0; }
    .kpi h2 { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 4px; font: 700 11px/14px var(--font-sans); letter-spacing: .55px; text-transform: uppercase; color: #444748; }
    .ico { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: 2px; background: #efeded; color: #1b1c1c; }
    .value { margin: 0; font: 700 18px/28px var(--font-sans); letter-spacing: -.4px; overflow-wrap: anywhere; }
    .value small { font: 400 11px/16px var(--font-sans); color: #444748; letter-spacing: 0; }
    .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 8px 0 0; font-size: 11px; line-height: 16px; }
    .muted { color: #444748; font-size: 12px; line-height: 16px; margin: 0; }
    .foot .muted { font-size: 11px; }
    .chip { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 2px; background: #ffd9de80; color: #805159; font: 700 11px/12px var(--font-sans); letter-spacing: .5px; }
    .chip.down { background: var(--ui-danger-bg, #fff1f1); color: var(--ui-danger, #9b2c2c); }
    .charts { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 16px; }
    .lower { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 16px; }
    .card { padding: 20px; min-width: 0; }
    .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .card h2 { margin: 0; font: 700 16px/24px var(--font-serif); }
    .tag { padding: 2px 8px; border-radius: 12px; background: #ffd9de80; color: #653a42; font: 500 10px/12px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; }
    .link { padding: 0; border: 0; background: none; color: #1b1c1c; font: 700 11px/14px var(--font-sans); text-decoration: underline; text-underline-offset: 3px; }
    .link:hover { color: #805159; }
    .scroll { overflow-x: auto; }
    .table { width: 100%; border-collapse: collapse; min-width: 480px; }
    .table th { padding: 8px 12px; background: #f5f3f3; text-align: left; font: 700 10px/14px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: #444748; }
    .table td { padding: 12px; border-top: 1px solid #efeded; font-size: 13px; line-height: 18px; vertical-align: middle; }
    .table tbody tr:hover { background: #fbf9f9; }
    .table tbody tr.row-link { cursor: pointer; }
    .table tbody tr.row-link:focus-visible { outline: 2px solid var(--ui-ink, #1b1c1c); outline-offset: -2px; background: #fbf9f9; }
    .r { text-align: right !important; }
    .code { font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
    .phone { display: block; font-size: 11px; line-height: 14px; color: #444748; }
    .when { font-size: 12px; color: #444748; white-space: nowrap; }
    .badge { display: inline-flex; padding: 2px 8px; border: 1px solid currentColor; border-radius: 12px; font: 600 10px/14px var(--font-sans); letter-spacing: .4px; white-space: nowrap; }
    .badge.success { color: var(--ui-success, #276749); background: var(--ui-success-bg, #edf8f1); }
    .badge.warning { color: var(--ui-warning, #8c641a); background: var(--ui-warning-bg, #fff8e8); }
    .badge.info { color: var(--ui-info, #3f5f7e); background: var(--ui-info-bg, #eff5fa); }
    .badge.danger { color: var(--ui-danger, #9b2c2c); background: var(--ui-danger-bg, #fff1f1); }
    .note { margin: 12px 0 0; font-size: 12px; color: #444748; }
    .alert { padding: 12px; margin-bottom: 8px; border-radius: 4px; background: #f5f3f3; }
    .alert h3 { margin: 0 0 4px; font: 700 13px/20px var(--font-sans); }
    .alert p { margin: 0 0 8px; font-size: 12px; line-height: 16px; color: #444748; }
    .btn-mini { display: inline-flex; padding: 6px 12px; border-radius: 2px; background: #f3b7c0; color: #1b1c1c; font: 700 11px/12px var(--font-sans); }
    .btn-mini:hover { background: #000; color: #fff; }
    .foot-link { display: inline-block; margin-top: 8px; font: 700 11px/14px var(--font-sans); text-decoration: underline; text-underline-offset: 3px; }
    .empty, .skeleton, .err { margin: 16px 0; font-size: 13px; color: #444748; text-align: center; }
    .err { color: var(--ui-danger, #9b2c2c); }
    .skeleton { animation: dash-pulse 1.2s ease-in-out infinite; }
    .kpi .skeleton, .kpi .err { margin: 4px 0; text-align: left; font-size: 12px; }
    @keyframes dash-pulse { 50% { opacity: .45; } }
    @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
    @media (max-width: 1100px) { .charts, .lower { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class AdminDashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly subs = new Map<string, Subscription>();

  /** Mở đúng đơn trong trang Đơn hàng (?orderId=). */
  openOrder(orderId: string): void {
    void this.router.navigate(['/admin/orders'], { queryParams: { orderId } });
  }

  readonly periods = PERIODS;
  readonly period = signal<Period>('month');
  readonly range = computed(() => rangeFor(this.period()));

  readonly report = signal<Load<SalesReport>>(loading());
  readonly prevReport = signal<Load<SalesReport>>(loading());
  readonly inventory = signal<Load<InventoryItem[]>>(loading());
  readonly settings = signal<Load<number>>(loading());
  readonly orders = signal<Load<AdminOrderSummary[]>>(loading());
  readonly paymentEvents = signal<Load<number>>(loading());
  readonly refunds = signal<Load<number>>(loading());
  readonly aiStats = signal<Load<AdminAiJobStats>>(loading());

  readonly aiDonePct = computed(() => {
    const s = this.aiStats().data;
    return s && s.total ? `${Math.round(((s.byState.COMPLETED ?? 0) / s.total) * 100)}%` : '—';
  });

  readonly busy = computed(() => [this.report(), this.inventory(), this.settings(), this.orders(), this.paymentEvents(), this.refunds()].some(l => l.status === 'loading'));

  readonly rangeText = computed(() => {
    const { from, to } = this.range();
    return from === to ? dmy(to) : `${dm(from)} - ${dmy(to)}`;
  });
  readonly rangeSentence = computed(() => {
    const { from, to } = this.range();
    return from === to ? `ngày ${dmy(from)}` : `ngày ${dmy(from)} đến ${dmy(to)}`;
  });
  readonly periodTag = computed(() => {
    const to = this.range().to;
    return this.period() === 'month' ? `T${to.slice(5, 7)}/${to.slice(0, 4)}` : this.rangeText();
  });
  readonly periodLower = computed(() => this.period() === 'today' ? 'trong hôm nay' : this.period() === '7d' ? 'trong 7 ngày qua' : 'trong tháng này');

  /** Làm đủ các ngày trong kỳ: API chỉ trả ngày có phát sinh. `orders` là số thanh toán thành công trong ngày. */
  readonly series = computed<RevenueChartDay[]>(() => {
    const data = this.report().data;
    if (!data) return [];
    const byDate = new Map(data.daily.map(d => [d.date, d]));
    const { from, to } = this.range();
    const days: RevenueChartDay[] = [];
    for (let i = 0, n = dayDiff(from, to); i <= n; i++) {
      const date = addDays(from, i), row = byDate.get(date);
      days.push({ date, revenue: row?.paidRevenue ?? 0, orders: row?.paymentCount ?? 0 });
    }
    return days;
  });

  readonly pendingCount = computed(() => {
    const counts = this.report().data?.orderStatusCounts ?? {};
    return (counts['CONFIRMED'] ?? 0) + (counts['PREPARING'] ?? 0);
  });
  readonly segments = computed<DonutSegment[]>(() => {
    const counts = this.report().data?.orderStatusCounts ?? {};
    return STATUS_ORDER.map(key => ({ key, label: ORDER_STATUS_LABELS[key], value: counts[key] ?? 0, color: STATUS_COLORS[key] }));
  });
  readonly completion = computed(() => {
    const total = this.segments().reduce((s, x) => s + x.value, 0);
    const done = this.segments().find(s => s.key === 'DELIVERED')?.value ?? 0;
    return total > 0 ? `${Math.round((done / total) * 100)}%` : '—';
  });

  readonly lowStock = computed(() => {
    const items = this.inventory().data, threshold = this.settings().data;
    if (this.inventory().status !== 'ok' || this.settings().status !== 'ok' || !items || threshold === null) return null;
    return { threshold, items: items.filter(i => i.available <= threshold) };
  });

  readonly topRows = computed(() => {
    const top = this.report().data?.topProducts ?? [];
    const stock = new Map<string, number>();
    for (const item of this.inventory().data ?? []) {
      const key = item.productName.trim().toLowerCase();
      stock.set(key, (stock.get(key) ?? 0) + item.available);
    }
    return top.slice(0, 5).map(p => {
      const available = stock.get(p.productName.trim().toLowerCase());
      return { ...p, stock: this.inventory().status === 'ok' && available !== undefined ? available.toLocaleString('vi-VN') : '—' };
    });
  });

  readonly alerts = computed(() => {
    const list: Array<{ key: string; title: string; text: string; cta: string; link: string }> = [];
    const events = this.paymentEvents().data;
    if (events && events > 0) list.push({ key: 'payment', title: 'Sự kiện thanh toán chờ duyệt', text: `${events} sự kiện chuyển khoản cần xác nhận thủ công.`, cta: 'Mở đối soát', link: '/admin/refunds' });
    const low = this.lowStock();
    if (low && low.items.length > 0) {
      const names = [...low.items].sort((a, b) => a.available - b.available).slice(0, 2).map(i => `${i.productName} (${i.sku}): còn ${i.available}`).join('; ');
      list.push({ key: 'stock', title: 'Tồn kho thấp', text: `${names}${low.items.length > 2 ? ` và ${low.items.length - 2} SKU khác` : ''}.`, cta: 'Điều chỉnh tồn kho', link: '/admin/inventory' });
    }
    const refunds = this.refunds().data;
    if (refunds && refunds > 0) list.push({ key: 'refund', title: 'Yêu cầu hoàn tiền đang chờ', text: `${refunds} yêu cầu hoàn tiền chờ duyệt.`, cta: 'Xem hoàn tiền', link: '/admin/refunds' });
    return list.slice(0, 3);
  });
  readonly alertsPending = computed(() => [this.paymentEvents(), this.refunds(), this.inventory(), this.settings()].some(l => l.status === 'loading'));
  readonly alertsFailed = computed(() => [this.paymentEvents(), this.refunds(), this.inventory(), this.settings()].some(l => l.status === 'error'));

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.subs.forEach(s => s.unsubscribe()));
    this.reloadAll();
  }

  /** Mỗi nguồn dữ liệu tải riêng: một khối lỗi không làm hỏng các khối còn lại. */
  private fetch<T, U>(key: string, source: Observable<T>, target: WritableSignal<Load<U>>, pick: (value: T) => U): void {
    this.subs.get(key)?.unsubscribe();
    target.set(loading<U>());
    this.subs.set(key, source.subscribe({
      next: value => target.set({ status: 'ok', data: pick(value) }),
      error: () => target.set({ status: 'error', data: null }),
    }));
  }

  readonly loadReports = (): void => {
    const range = rangeFor(this.period()), prev = previousRange(range);
    const request = (r: { from: string; to: string }) => { const q = salesReportDateRange(r.from, r.to); return this.api.adminGetSalesReport(q.from, q.to); };
    this.fetch('report', request(range), this.report, r => r);
    this.fetch('prev', request(prev), this.prevReport, r => r);
  };
  readonly loadStock = (): void => {
    this.fetch('inventory', this.api.adminListInventory(), this.inventory, r => r.items);
    this.fetch('settings', this.api.adminGetSettings(), this.settings, r => r.lowStockThreshold);
  };
  readonly loadOrders = (): void => {
    this.fetch('orders', this.api.adminListOrders(undefined, 1, 4), this.orders, r => r.items);
  };
  readonly loadAi = (): void => {
    if (!this.auth.isAdmin()) return;
    this.fetch('ai', this.api.adminAiJobStats(), this.aiStats, r => r);
  };
  readonly loadAlerts = (): void => {
    this.fetch('events', this.api.adminListPaymentEvents(1, 1, 'OPEN'), this.paymentEvents, r => r.total);
    this.fetch('refunds', this.api.adminListRefunds('PENDING_APPROVAL', 1, 1), this.refunds, r => r.total);
    if (this.inventory().status === 'error') this.loadStock();
  };

  reloadAll(): void { this.loadReports(); this.loadStock(); this.loadOrders(); this.loadAlerts(); this.loadAi(); }
  setPeriod(period: Period): void {
    if (this.period() === period) return;
    this.period.set(period);
    this.loadReports();
  }

  /** % so với kỳ trước; ẩn khi kỳ trước chưa tải được hoặc bằng 0. */
  delta(current: number, previous: number | undefined): { text: string; arrow: string; negative: boolean } | null {
    if (previous === undefined || previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    const text = `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
    return { text, arrow: pct >= 0 ? '▲' : '▼', negative: pct < 0 };
  }
  money(value: number): string { return `${Math.round(value).toLocaleString('vi-VN')}đ`; }
  statusLabel(state: string): string { return orderStatusLabel(state); }
  tone(state: string): string { return STATUS_TONE[state] ?? 'info'; }
  maskPhone(phone: string): string {
    const digits = phone.replace(/\s/g, '');
    return digits.length >= 8 ? `${digits.slice(0, 4)} ••• ${digits.slice(-3)}` : '•••';
  }
  fullTime(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  timeAgo(iso: string | undefined): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff) || diff < 0) return this.fullTime(iso) || '—';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ trước`;
    return this.fullTime(iso) || '—';
  }
}
