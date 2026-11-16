import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { SalesReport } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { Subscription } from 'rxjs';
import { salesReportDateRange, vietnamDate } from '../../services/report-date-range';

@Component({
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule],
  template: `
    <div class="reports-container">
      <header class="section-header">
        <div>
          <h1 class="page-title">Báo cáo doanh thu & Vận hành</h1>
          <p class="page-desc">Tổng hợp chỉ số kinh doanh thực tế, đối soát thanh toán và xu hướng bán hàng.</p>
        </div>

        <div class="filter-controls">
          <label>
            Từ ngày:
            <input type="date" [(ngModel)]="fromDate" (change)="loadReport()" />
          </label>
          <label>
            Đến ngày:
            <input type="date" [(ngModel)]="toDate" (change)="loadReport()" />
          </label>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Đang tổng hợp số liệu báo cáo...</p>
        </div>
      } @else if (error()) {
        <div role="alert" class="loading-box">
          <p>{{ error() }}</p>
          <button type="button" (click)="loadReport()">Thử lại</button>
        </div>
      } @else if (report(); as rep) {
        <!-- KPI Cards Grid -->
        <div class="kpi-grid">
          <div class="kpi-card highlight">
            <span class="kpi-label">Doanh thu thuần (Net)</span>
            <strong class="kpi-value">{{ rep.netRevenue | currency:'VND':'symbol':'1.0-0' }}</strong>
            <span class="kpi-sub">Đã trừ các khoản hoàn tiền</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Tổng thực thu (Paid)</span>
            <strong class="kpi-value">{{ rep.paidRevenue | currency:'VND':'symbol':'1.0-0' }}</strong>
            <span class="kpi-sub">Giao dịch VietQR thành công</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Tổng tiền hoàn (Refunds)</span>
            <strong class="kpi-value text-danger">{{ rep.refundedAmount | currency:'VND':'symbol':'1.0-0' }}</strong>
            <span class="kpi-sub">Đối soát hoàn trả khách hàng</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Số đơn đã thanh toán</span>
            <strong class="kpi-value">{{ rep.orderCount | number }}</strong>
            <span class="kpi-sub">Đơn có giao dịch thành công trong kỳ</span>
          </div>
        </div>

        <div class="details-layout">
          <!-- Daily Performance Table -->
          <div class="table-card">
            <h3>Chi tiết doanh thu theo ngày</h3>
            @if (rep.daily && rep.daily.length > 0) {
              <div class="daily-table">
                <div class="table-head">
                  <span>Ngày</span>
                  <span>Doanh thu thu</span>
                  <span>Hoàn tiền</span>
                  <span>Doanh thu thuần</span>
                  <span>Số GD</span>
                </div>
                @for (d of rep.daily; track d.date) {
                  <div class="table-row">
                    <span class="date-cell">{{ d.date }}</span>
                    <span>{{ d.paidRevenue | currency:'VND':'symbol':'1.0-0' }}</span>
                    <span class="text-danger">{{ d.refundedAmount | currency:'VND':'symbol':'1.0-0' }}</span>
                    <strong class="net-cell">{{ d.netRevenue | currency:'VND':'symbol':'1.0-0' }}</strong>
                    <span>{{ d.paymentCount }}</span>
                  </div>
                }
              </div>
            } @else {
              <p class="empty-note">Không có giao dịch nào trong khoảng thời gian đã chọn.</p>
            }
          </div>

          <!-- Order Status Counts & Top Products -->
          <div class="side-col">
            <div class="table-card">
              <h3>Tình trạng phân bổ đơn hàng</h3>
              <div class="status-summary-list">
                @for (entry of getStatusEntries(rep.orderStatusCounts); track entry.key) {
                  <div class="status-count-row">
                    <span>{{ entry.key }}</span>
                    <strong>{{ entry.value }} đơn</strong>
                  </div>
                }
              </div>
            </div>

            <div class="table-card">
              <h3>Top sản phẩm bán chạy</h3>
              @if (rep.topProducts && rep.topProducts.length > 0) {
                <div class="top-products-list">
                  @for (p of rep.topProducts; track p.productId) {
                    <div class="top-product-row">
                      <span class="p-id">{{ p.productName }}</span>
                      <strong>Đã bán: {{ p.quantity }}</strong>
                    </div>
                  }
                </div>
              } @else {
                <p class="empty-note">Chưa có dữ liệu sản phẩm trong kỳ.</p>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .reports-container {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 20px;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: 1.8rem;
      margin: 0 0 6px;
      font-weight: 500;
    }
    .page-desc {
      color: var(--color-muted);
      font-size: 0.9rem;
      margin: 0;
    }
    .filter-controls {
      display: flex;
      gap: 14px;
      background: var(--color-surface);
      padding: 10px 16px;
      border-radius: 6px;
      border: 1px solid var(--color-divider);
    }
    .filter-controls label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.82rem;
      color: #555;
    }
    .filter-controls input {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 6px 8px;
      font-size: 0.85rem;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
    }
    .kpi-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .kpi-card.highlight {
      border-left: 4px solid var(--color-accent);
    }
    .kpi-label {
      font-size: 0.82rem;
      color: var(--color-muted);
    }
    .kpi-value {
      font-size: 1.7rem;
      color: var(--color-text);
      font-family: Georgia, serif;
      font-weight: 500;
    }
    .kpi-sub {
      font-size: 0.74rem;
      color: #999;
    }
    .text-danger {
      color: #c62828 !important;
    }
    .details-layout {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 24px;
    }
    .table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 24px;
      margin-bottom: 24px;
    }
    .table-card h3 {
      font-family: Georgia, serif;
      font-size: 1.15rem;
      margin: 0 0 16px;
      font-weight: 500;
    }
    .daily-table {
      display: flex;
      flex-direction: column;
    }
    .table-head {
      display: grid;
      grid-template-columns: 1.2fr 1.2fr 1.2fr 1.2fr 80px;
      padding: 10px 12px;
      background: var(--color-canvas);
      border-radius: var(--radius-control);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-muted);
    }
    .table-row {
      display: grid;
      grid-template-columns: 1.2fr 1.2fr 1.2fr 1.2fr 80px;
      padding: 12px;
      border-bottom: 1px solid var(--color-canvas);
      font-size: 0.88rem;
      align-items: center;
    }
    .date-cell {
      font-family: monospace;
      color: #555;
    }
    .net-cell {
      color: #2e7d32;
    }
    .status-summary-list, .top-products-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .status-count-row, .top-product-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--color-canvas);
      border-radius: var(--radius-control);
      font-size: 0.88rem;
    }
    .empty-note {
      color: var(--color-muted);
      font-size: 0.88rem;
      margin: 0;
    }
    .loading-box {
      text-align: center;
      padding: 80px 0;
      color: var(--color-muted);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-text);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 960px) {
      .details-layout {
        grid-template-columns: 1fr;
      }
    }
    .side-col { min-width:0; } .p-id { font-family:ui-monospace,monospace; font-size:.75rem; color:var(--color-muted); overflow-wrap:anywhere; }

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

  getStatusEntries(counts?: Record<string, number>): Array<{ key: string; value: number }> {
    if (!counts) return [];
    return Object.entries(counts).map(([key, value]) => ({ key, value }));
  }
}
