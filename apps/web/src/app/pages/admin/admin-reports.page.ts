import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SalesReport } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { Subscription } from 'rxjs';
import { salesReportDateRange, vietnamDate } from '../../services/report-date-range';
import { AdminReportTabsComponent } from '../../components/admin-report-tabs.component';
import { AdminChartDonutComponent, DonutSegment } from '../../components/admin-chart-donut.component';
import { AdminChartRevenueComponent, RevenueChartDay } from '../../components/admin-chart-revenue.component';
import { ORDER_STATUS_LABELS, orderStatusLabel } from '../../shared/labels';

const STATUS_ORDER = ['DELIVERED', 'SHIPPING', 'PREPARING', 'CONFIRMED', 'PENDING_PAYMENT', 'CANCEL_PENDING_REFUND', 'CANCELLED'] as const;
const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#805159', SHIPPING: '#f3b7c0', PREPARING: '#ffd9de', CONFIRMED: '#444748',
  PENDING_PAYMENT: '#c4c7c7', CANCEL_PENDING_REFUND: '#8c8186', CANCELLED: '#1b1c1c',
};

@Component({
  standalone: true,
  imports: [FormsModule, AdminReportTabsComponent, AdminChartRevenueComponent, AdminChartDonutComponent],
  template: `
    <div class="rp">
      <fc-admin-report-tabs active="reports" />

      <header class="head">
        <div>
          <h1 class="title">Báo cáo và Phân quyền</h1>
          <p class="sub">Doanh thu kinh doanh theo khoảng ngày, đối soát hoàn tiền và xu hướng bán hàng.</p>
        </div>
        <div class="range">
          <label>Từ ngày
            <input type="date" [(ngModel)]="fromDate" (change)="loadReport()" name="fromDate" />
          </label>
          <label>Đến ngày
            <input type="date" [(ngModel)]="toDate" (change)="loadReport()" name="toDate" />
          </label>
        </div>
      </header>

      @if (loading()) {
        <div class="state-box" role="status"><span class="spinner"></span><p>Đang tổng hợp số liệu báo cáo…</p></div>
      } @else if (error()) {
        <div class="state-box" role="alert"><p>{{ error() }}</p><button type="button" class="btn-outline" (click)="loadReport()">Thử lại</button></div>
      } @else if (report(); as rep) {
        <section class="kpis" aria-label="Chỉ số doanh thu">
          <div class="kpi highlight">
            <span class="kpi-label">Doanh thu thuần</span>
            <span class="kpi-value">{{ money(rep.netRevenue) }}</span>
            <span class="kpi-note">Đã trừ các khoản hoàn tiền</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Doanh thu đã thu</span>
            <span class="kpi-value">{{ money(rep.paidRevenue) }}</span>
            <span class="kpi-note">Giao dịch VietQR thành công</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Tổng tiền hoàn</span>
            <span class="kpi-value danger">{{ money(rep.refundedAmount) }}</span>
            <span class="kpi-note">Đã hoàn trả khách hàng</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Số đơn đã thanh toán</span>
            <span class="kpi-value">{{ rep.orderCount.toLocaleString('vi-VN') }}</span>
            <span class="kpi-note">Đơn có giao dịch thành công trong kỳ</span>
          </div>
        </section>

        <section class="charts">
          <article class="card">
            <header class="card-head">
              <h2>Doanh thu theo ngày</h2>
              <p class="muted">{{ fmtIso(fromDate) }} – {{ fmtIso(toDate) }}</p>
            </header>
            @if (series().length > 0) {
              <fc-admin-chart-revenue [days]="series()" />
            } @else {
              <p class="empty">Không có giao dịch nào trong khoảng ngày đã chọn.</p>
            }
          </article>
          <article class="card">
            <header class="card-head"><h2>Phân bổ trạng thái đơn hàng</h2><p class="muted">Đơn trong kỳ đang chọn</p></header>
            <fc-admin-chart-donut [segments]="segments()" [centerValue]="completion()" centerLabel="HOÀN TẤT" />
          </article>
        </section>

        <section class="lower">
          <article class="card">
            <header class="card-head"><h2>Chi tiết doanh thu theo ngày</h2></header>
            @if (rep.daily && rep.daily.length > 0) {
              <div class="table-wrap">
                <table class="tbl">
                  <thead><tr><th>Ngày</th><th class="c-num">Doanh thu thu</th><th class="c-num">Hoàn tiền</th><th class="c-num">Doanh thu thuần</th><th class="c-num">Số giao dịch</th></tr></thead>
                  <tbody>
                    @for (d of rep.daily; track d.date) {
                      <tr>
                        <td class="nowrap">{{ fmtIso(d.date) }}</td>
                        <td class="c-num">{{ money(d.paidRevenue) }}</td>
                        <td class="c-num danger">{{ money(d.refundedAmount) }}</td>
                        <td class="c-num strong">{{ money(d.netRevenue) }}</td>
                        <td class="c-num">{{ d.paymentCount }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="empty">Không có giao dịch nào trong khoảng ngày đã chọn.</p>
            }
          </article>
          <article class="card">
            <header class="card-head"><h2>Top sản phẩm bán chạy</h2></header>
            @if (rep.topProducts && rep.topProducts.length > 0) {
              <div class="table-wrap">
                <table class="tbl">
                  <thead><tr><th>Sản phẩm</th><th>Mã SKU</th><th class="c-num">Đã bán</th><th class="c-num">Tổng doanh thu</th></tr></thead>
                  <tbody>
                    @for (p of rep.topProducts; track p.productId) {
                      <tr><td class="top-name">{{ p.productName }}</td><td class="mono">{{ p.sku || '—' }}</td><td class="c-num">{{ p.quantity.toLocaleString('vi-VN') }}</td><td class="c-num"><strong>{{ money(p.revenue) }}</strong></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="empty">Chưa có dữ liệu sản phẩm trong kỳ.</p>
            }
          </article>
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .rp { display: flex; flex-direction: column; gap: 16px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .range { display: flex; gap: 12px; flex-wrap: wrap; }
    .range label { display: flex; flex-direction: column; gap: 4px; font: 600 11px/14px var(--font-sans); color: var(--ui-ink-soft); }
    .range input { padding: 9px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .kpi.highlight { border-color: var(--ui-pink); background: var(--ui-pink-soft); }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 26px/32px var(--font-serif); overflow-wrap: anywhere; }
    .kpi-note { font-size: 11px; line-height: 16px; color: var(--ui-subtle); }
    .danger { color: var(--ui-danger); }
    .charts { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 16px; }
    .lower { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 16px; align-items: start; }
    .card { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 18px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .card-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
    .card-head h2 { margin: 0; font: 500 18px/24px var(--font-serif); }
    .muted { margin: 0; font-size: 12px; color: var(--ui-subtle); }
    .empty { margin: 0; padding: 24px 0; text-align: center; font-size: 13px; color: var(--ui-subtle); }
    .table-wrap { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 520px; }
    .tbl th { text-align: left; padding: 10px 12px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 10px 12px; border-bottom: 1px solid var(--admin-line-soft); }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .c-num { text-align: right; } .nowrap { white-space: nowrap; } .strong { font-weight: 600; }
    .top { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .top li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--admin-line-soft); font-size: 13px; }
    .top li:last-child { border-bottom: 0; }
    .top-name { overflow-wrap: anywhere; }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 1100px) { .charts, .lower { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class AdminReportsPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private reportSubscription?: Subscription;

  readonly report = signal<SalesReport | null>(null);
  readonly loading = signal<boolean>(true);
  readonly error = signal('');

  fromDate = '';
  toDate = '';

  readonly series = computed<RevenueChartDay[]>(() =>
    (this.report()?.daily ?? []).map(d => ({ date: d.date, revenue: d.paidRevenue, orders: d.paymentCount })));
  readonly segments = computed<DonutSegment[]>(() => {
    const counts = this.report()?.orderStatusCounts ?? {};
    return STATUS_ORDER.map(key => ({ key, label: ORDER_STATUS_LABELS[key], value: counts[key] ?? 0, color: STATUS_COLORS[key] }));
  });
  readonly completion = computed(() => {
    const total = this.segments().reduce((s, x) => s + x.value, 0);
    const done = this.segments().find(s => s.key === 'DELIVERED')?.value ?? 0;
    return total > 0 ? `${Math.round((done / total) * 100)}%` : '—';
  });

  ngOnInit(): void {
    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    this.fromDate = vietnamDate(thirtyDaysAgo);
    this.toDate = vietnamDate(now);
    this.loadReport();
  }

  loadReport(): void {
    this.reportSubscription?.unsubscribe();
    this.error.set('');
    let range: { from: string; to: string };
    try { range = salesReportDateRange(this.fromDate, this.toDate); }
    catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Khoảng ngày không hợp lệ.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.reportSubscription = this.api.adminGetSalesReport(range.from, range.to).subscribe({
      next: (rep) => {
        this.report.set(rep);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không thể tải báo cáo. Vui lòng thử lại.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void { this.reportSubscription?.unsubscribe(); }

  getStatusEntries(counts?: Record<string, number>): Array<{ key: string; label: string; value: number }> {
    if (!counts) return [];
    return Object.entries(counts).map(([key, value]) => ({ key, label: orderStatusLabel(key), value }));
  }

  money(value: number | null | undefined): string { return `${Math.round(value ?? 0).toLocaleString('vi-VN')}đ`; }

  /** Ngày dạng yyyy-MM-dd hoặc ISO → dd/MM/yyyy (không đổi múi giờ với yyyy-MM-dd). */
  fmtIso(value?: string | null): string {
    if (!value) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
}
