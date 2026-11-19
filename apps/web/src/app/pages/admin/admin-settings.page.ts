import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { SystemSettings, AuditLogEntry } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { AdminReportTabsComponent } from '../../components/admin-report-tabs.component';
import { auditActionLabel, auditEntityLabel } from '../../shared/labels';
import { auditMetaLines, type AuditMetaLine } from '../../shared/audit-meta';

@Component({
  standalone: true,
  imports: [PaginationComponent, FormsModule, DatePipe, RouterLink, AdminReportTabsComponent],
  template: `
    <div class="admin-settings-container">
      @if (activeTab() === 'audit') {
        <fc-admin-report-tabs active="audit" />
        <header class="au-head">
          <div>
            <h1 class="au-title">Báo cáo và Phân quyền</h1>
            <p class="au-sub">Nhật ký ghi lại các thao tác quan trọng của quản trị viên và nhân viên.</p>
          </div>
        </header>
      } @else {
        <header class="st-head">
          <div>
            <h1 class="st-title">Cấu hình hệ thống</h1>
            <p class="st-sub">Biểu phí vận chuyển, ngưỡng cảnh báo tồn kho và hạn ngạch trải nghiệm AI.</p>
          </div>
          <a class="btn-outline" routerLink="/admin/audit">Xem nhật ký hoạt động</a>
        </header>
      }

      <!-- CẤU HÌNH HỆ THỐNG (GET/PATCH /admin/settings, GET/PATCH /admin/ai-quotas) -->
      @if (activeTab() === 'settings') {
        @if (loading()) {
          <div class="au-state" role="status"><span class="au-spinner"></span><p>Đang tải cấu hình hệ thống…</p></div>
        } @else {
          <div class="st-layout">
            <section class="st-card" aria-labelledby="st-ship">
              <header class="st-card-head">
                <h2 id="st-ship">Vận chuyển</h2>
                <p>Phí giao hàng và điều kiện miễn phí vận chuyển cho đơn trong nước.</p>
              </header>
              <div class="st-grid">
                <label class="st-field">
                  <span class="st-label">Phí giao hàng chuẩn *</span>
                  <span class="st-input"><input type="number" [(ngModel)]="standardShippingFee" min="0" step="1000" /><span class="st-unit">đ</span></span>
                  @if (feeError()) { <span class="st-err" role="alert">{{ feeError() }}</span> }
                  @else { <span class="st-hint">Áp dụng cho đơn chưa đạt ngưỡng miễn phí.</span> }
                </label>
                <label class="st-field">
                  <span class="st-label">Ngưỡng miễn phí vận chuyển *</span>
                  <span class="st-input"><input type="number" [(ngModel)]="freeShippingThreshold" min="0" step="50000" /><span class="st-unit">đ</span></span>
                  @if (thresholdError()) { <span class="st-err" role="alert">{{ thresholdError() }}</span> }
                  @else { <span class="st-hint">Đơn có tiền hàng từ mức này trở lên được miễn phí giao hàng.</span> }
                </label>
              </div>
            </section>

            <section class="st-card" aria-labelledby="st-stock">
              <header class="st-card-head">
                <h2 id="st-stock">Tồn kho</h2>
                <p>Mức tồn kho để hệ thống đánh dấu sản phẩm sắp hết hàng.</p>
              </header>
              <div class="st-grid">
                <label class="st-field">
                  <span class="st-label">Ngưỡng cảnh báo tồn thấp *</span>
                  <span class="st-input"><input type="number" [(ngModel)]="lowStockThreshold" min="1" max="100" /><span class="st-unit">sản phẩm</span></span>
                  @if (stockError()) { <span class="st-err" role="alert">{{ stockError() }}</span> }
                  @else { <span class="st-hint">Biến thể có số lượng khả dụng từ mức này trở xuống sẽ được gắn cảnh báo.</span> }
                </label>
              </div>
            </section>

            <section class="st-card" aria-labelledby="st-ai">
              <header class="st-card-head">
                <h2 id="st-ai">Hạn ngạch AI</h2>
                <p>Giới hạn số lượt trải nghiệm AI của mỗi khách hàng trong một ngày.</p>
              </header>
              <div class="st-grid">
                <div class="st-field">
                  <span class="st-label">Số lượt tối đa mỗi khách mỗi ngày</span>
                  <strong class="st-readonly">{{ aiQuotaLoaded() ? aiDailyJobs + ' lượt/ngày' : '—' }}</strong>
                </div>
              </div>
              <p class="st-hint">Hạn ngạch này dùng chung cho Thử đồ và Mix &amp; Match: lượt chạy của hai tính năng cộng dồn vào cùng một giới hạn mỗi ngày.</p>
              <div class="st-card-foot">
                <a class="btn-outline" routerLink="/admin/ai">Cấu hình tại AI Workflow</a>
              </div>
            </section>

            <div class="st-actions">
              <span class="st-updated">Cập nhật lần cuối: {{ fmtUpdated() }}</span>
              <button type="button" class="btn-primary" [disabled]="saving() || hasErrors()" (click)="saveAllSettings()">
                {{ saving() ? 'Đang lưu…' : 'Lưu thay đổi' }}
              </button>
            </div>
          </div>
        }
      }

      <!-- NHẬT KÝ HOẠT ĐỘNG (GET /admin/audit-logs) -->
      @if (activeTab() === 'audit') {
        <div class="au-filters">
          <label>Loại đối tượng
            <select [(ngModel)]="auditEntityType" (change)="filterAuditLogs()" name="auditEntityType">
              <option value="">Tất cả đối tượng</option>
              <option value="order">Đơn hàng</option>
              <option value="product">Sản phẩm</option>
              <option value="variant">Biến thể</option>
              <option value="voucher">Mã giảm giá</option>
              <option value="refund">Hoàn tiền</option>
              <option value="user">Người dùng / Nhân sự</option>
            </select>
          </label>
          <label>Mã định danh đối tượng
            <input type="text" [(ngModel)]="auditEntityId" name="auditEntityId" placeholder="Nhập mã cần lọc…" (keyup.enter)="filterAuditLogs()" />
          </label>
          <button type="button" class="btn-primary" (click)="filterAuditLogs()">Lọc nhật ký</button>
          <button type="button" class="btn-outline" (click)="resetAuditFilter()">Làm mới</button>
        </div>

        @if (loadingAudit()) {
          <div class="au-state" role="status"><span class="au-spinner"></span><p>Đang tải nhật ký hoạt động…</p></div>
        } @else if (auditLogs().length === 0) {
          <div class="au-state"><p>Không có nhật ký nào phù hợp với bộ lọc.</p></div>
        } @else {
          <div class="au-wrap">
            <table class="au-tbl">
              <thead>
                <tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Mã định danh</th><th>Chi tiết</th></tr>
              </thead>
              <tbody>
                @for (log of auditLogs(); track log.id) {
                  <tr>
                    <td class="nowrap">{{ log.createdAt | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                    <td>{{ actorName(log.actorId) }}</td>
                    <td><span class="au-tag" [attr.title]="log.action">{{ actionText(log.action) }}</span></td>
                    <td>{{ entityText(log.entityType) }}</td>
                    <td><code class="au-id">{{ log.entityId }}</code></td>
                    <td>
                      @if (hasMeta(log)) {
                        <details><summary>Xem</summary><dl class="au-meta">@for (line of metaLines(log); track $index) { <div><dt>{{ line.label }}:</dt> <dd>{{ line.value }}</dd></div> }</dl></details>
                      } @else { — }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="au-note">Hiển thị {{ auditLogs().length }} / {{ auditTotal() }} bản ghi.</p>
        }
      }
    </div>

    @if (activeTab() === 'audit') {<fc-pagination label="Nhật ký hệ thống" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loadingAudit()" (pageChange)="paginationChanged($event)" />}
`,
  styles: [`
    :host { display: block; }
    .admin-settings-container { display: flex; flex-direction: column; gap: 16px; }
    .st-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .st-title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .st-sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .st-head a { text-decoration: none; display: inline-flex; align-items: center; }
    .st-layout { display: flex; flex-direction: column; gap: 16px; max-width: 880px; }
    .st-card { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .st-card-head h2 { margin: 0; font: 500 22px/30px var(--font-serif); }
    .st-card-head p { margin: 2px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .st-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
    .st-field { display: flex; flex-direction: column; gap: 6px; }
    .st-label { font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .st-input { display: flex; align-items: stretch; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); }
    .st-input:focus-within { border-color: var(--ui-ink); }
    .st-input input { flex: 1; min-width: 0; border: 0; padding: 10px 12px; background: transparent; font: 400 14px/20px var(--font-sans); color: var(--ui-ink); outline: none; }
    .st-unit { display: inline-flex; align-items: center; padding: 0 12px; background: var(--ui-bg-soft); border-left: 1px solid var(--ui-line); font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); white-space: nowrap; }
    .st-readonly { font: 600 15px/22px var(--font-sans); color: var(--ui-ink); }
    .st-hint { margin: 0; font-size: 12px; line-height: 16px; color: var(--ui-subtle); }
    .st-err { font-size: 12px; line-height: 16px; color: var(--ui-danger); }
    .st-card-foot { display: flex; justify-content: flex-end; }
    .st-actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding-top: 4px; }
    .st-updated { font-size: 12px; color: var(--ui-subtle); }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Nhật ký hoạt động */
    .au-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .au-title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .au-sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .au-filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .au-filters label { display: flex; flex-direction: column; gap: 4px; font: 600 11px/14px var(--font-sans); color: var(--ui-ink-soft); min-width: 200px; }
    .au-filters select, .au-filters input { box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .au-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .au-tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 900px; }
    .au-tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .au-tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: top; }
    .au-tbl tbody tr:last-child td { border-bottom: 0; }
    .nowrap { white-space: nowrap; }
    .au-tag { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--ui-pink-soft); color: var(--ui-accent); font: 600 11px/16px var(--font-sans); }
    .au-id { font: 400 12px/16px ui-monospace, monospace; overflow-wrap: anywhere; }
    .au-tbl summary { cursor: pointer; color: var(--ui-accent); font-weight: 600; }
    .au-meta { margin: 6px 0 0; padding: 8px; background: var(--ui-bg-soft); font-size: 12px; line-height: 18px; max-width: 320px; display: grid; gap: 2px; }
    .au-meta div { display: flex; gap: 6px; flex-wrap: wrap; }
    .au-meta dt { margin: 0; color: var(--ui-ink-soft); font-weight: 600; }
    .au-meta dd { margin: 0; overflow-wrap: anywhere; }
    .au-note { margin: 0; font-size: 12px; color: var(--ui-subtle); text-align: right; }
    .au-state { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .au-spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin 0.8s linear infinite; }
  `],
})
export class AdminSettingsPage implements OnInit {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadAuditLogs(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly activeTab = signal<'settings' | 'audit'>('settings');

  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly savingQuota = signal<boolean>(false);
  readonly aiQuotaLoaded = signal<boolean>(false);

  // Settings & Quotas (GET/PATCH /admin/settings & GET/PATCH /admin/ai-quotas)
  standardShippingFee = 30000;
  freeShippingThreshold = 1000000;
  lowStockThreshold = 5;
  aiDailyJobs = 10;
  readonly updatedAt = signal<string | null>(null);

  // Audit logs (GET /admin/audit-logs)
  readonly auditLogs = signal<AuditLogEntry[]>([]);
  readonly loadingAudit = signal<boolean>(false);
  readonly auditTotal = signal<number>(0);
  auditEntityType = '';
  auditEntityId = '';
  readonly actorNames = signal<Record<string, string>>({});

  ngOnInit(): void {
    // Route /admin/audit dùng chung component này với data.view = 'audit'
    if (this.route.snapshot?.data?.['view'] === 'audit') {
      this.activeTab.set('audit');
      this.loadActorNames();
      this.loadAuditLogs();
    } else {
      this.loadSettings();
    }
  }

  loadSettings(): void {
    this.loading.set(true);
    // Load general settings
    this.api.adminGetSettings().subscribe({
      next: (s) => {
        this.standardShippingFee = s.standardShippingFee ?? 30000;
        this.freeShippingThreshold = s.freeShippingThreshold ?? 1000000;
        this.lowStockThreshold = s.lowStockThreshold ?? 5;
        this.updatedAt.set(s.updatedAt ?? null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    // Load AI Quota directly from GET /admin/ai-quotas
    this.api.adminGetAiQuota().subscribe({
      next: (quota) => {
        if (quota && typeof quota.dailyJobs === 'number') {
          this.aiDailyJobs = quota.dailyJobs;
          this.aiQuotaLoaded.set(true);
        }
      },
    });
  }

  // --- Kiểm tra giá trị nhập (khớp ràng buộc của API: số nguyên, không âm) ---
  private intError(value: unknown, min: number, max: number | null, label: string): string {
    if (value === null || value === undefined || value === '' || typeof value !== 'number' || !Number.isInteger(value)) return `${label} phải là số nguyên.`;
    if (value < min) return min === 0 ? `${label} không được âm.` : `${label} tối thiểu là ${min}.`;
    if (max !== null && value > max) return `${label} tối đa là ${max}.`;
    return '';
  }
  feeError(): string { return this.intError(this.standardShippingFee, 0, null, 'Phí giao hàng'); }
  thresholdError(): string { return this.intError(this.freeShippingThreshold, 0, null, 'Ngưỡng miễn phí vận chuyển'); }
  stockError(): string { return this.intError(this.lowStockThreshold, 1, 100, 'Ngưỡng tồn thấp'); }
  quotaError(): string { return this.intError(this.aiDailyJobs, 1, 100, 'Hạn ngạch AI'); }
  hasErrors(): boolean { return !!(this.feeError() || this.thresholdError() || this.stockError() || this.quotaError()); }

  fmtUpdated(): string {
    const value = this.updatedAt();
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  saveAiQuotaOnly(): void {
    const invalid = this.quotaError();
    if (invalid) { this.toast.error(invalid); return; }
    this.savingQuota.set(true);
    // PATCH /admin/ai-quotas
    this.api.adminUpdateAiQuota({ dailyJobs: this.aiDailyJobs }).subscribe({
      next: (res) => {
        this.savingQuota.set(false);
        this.aiDailyJobs = res.dailyJobs;
        this.toast.success(`Hạn ngạch AI cập nhật thành công (${res.dailyJobs} lượt/ngày).`);
      },
      error: (err) => {
        this.savingQuota.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật hạn ngạch AI.');
      },
    });
  }

  saveAllSettings(): void {
    const invalid = this.feeError() || this.thresholdError() || this.stockError() || this.quotaError();
    if (invalid) { this.toast.error(invalid); return; }
    this.saving.set(true);
    this.api.adminUpdateSettings({
      standardShippingFee: this.standardShippingFee,
      freeShippingThreshold: this.freeShippingThreshold,
      lowStockThreshold: this.lowStockThreshold,
      aiDailyJobs: this.aiDailyJobs,
    }).subscribe({
      next: (res) => {
        if (res?.updatedAt) this.updatedAt.set(res.updatedAt);
        this.saving.set(false);
        this.toast.success('Đã lưu toàn bộ cấu hình hệ thống.');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể lưu cấu hình.');
      },
    });
  }

  // --- Audit Logs (GET /admin/audit-logs) ---

  loadAuditLogs(): void {
    this.loadingAudit.set(true);
    // GET /admin/audit-logs
    this.pagination.load(() => this.api.adminListAuditLogs({ page: this.pagination.page(), limit: this.pagination.limit, entityType: this.auditEntityType || undefined, entityId: this.auditEntityId.trim() || undefined }), {
      next: (res) => {
        this.auditLogs.set(res.items);
        this.auditTotal.set(res.total);
        this.loadingAudit.set(false);
      },
      error: (err) => {
        this.loadingAudit.set(false);
        this.toast.error(err.error?.message || 'Không thể tải nhật ký kiểm toán.');
      },
    });
  }

  resetAuditFilter(): void {
    this.pagination.reset();
    this.auditEntityType = '';
    this.auditEntityId = '';
    this.loadAuditLogs();
  }

  filterAuditLogs(): void { this.pagination.reset(); this.loadAuditLogs(); }

  // --- Hiển thị nhật ký ---
  private loadActorNames(): void {
    const merge = (items: Array<{ id: string; fullName: string; email: string }>) =>
      this.actorNames.update(m => ({ ...m, ...Object.fromEntries(items.map(u => [u.id, u.fullName || u.email])) }));
    this.api.adminListUsers(1, 50, 'ADMIN').subscribe({ next: r => merge(r.items), error: () => undefined });
    this.api.adminListUsers(1, 50, 'STAFF').subscribe({ next: r => merge(r.items), error: () => undefined });
  }

  actorName(id: string | null | undefined): string {
    if (!id) return 'Hệ thống';
    return this.actorNames()[id] ?? `Tài khoản …${id.slice(-6)}`;
  }
  actionText(action: string): string { return auditActionLabel(action); }
  entityText(type: string): string { return auditEntityLabel(type); }
  hasMeta(log: AuditLogEntry): boolean { return !!log.metadata && Object.keys(log.metadata).length > 0; }
  metaLines(log: AuditLogEntry): AuditMetaLine[] {
    return auditMetaLines(log.entityType, log.action, log.metadata, (id) => this.actorName(id));
  }
}
