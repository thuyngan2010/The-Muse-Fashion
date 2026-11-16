import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { SystemSettings, AuditLogEntry } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';

@Component({
  standalone: true,
  imports: [PaginationComponent, FormsModule, DatePipe, JsonPipe],
  template: `
    <div class="admin-settings-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Hệ thống & Kiểm toán</h1>
          <p class="page-desc">Quản lý biểu phí, hạn ngạch trải nghiệm AI và nhật ký kiểm toán hành vi hệ thống.</p>
        </div>
      </header>

      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'settings'"
          (click)="activeTab.set('settings')"
        >
          ⚙ Cấu hình & Hạn ngạch AI
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'audit'"
          (click)="switchToAuditTab()"
        >
          📜 Nhật ký kiểm toán (Audit Logs)
        </button>
      </div>

      <!-- TAB 1: SYSTEM SETTINGS & AI QUOTAS -->
      @if (activeTab() === 'settings') {
        @if (loading()) {
          <div class="loading-box">
            <div class="spinner"></div>
            <p>Đang tải cấu hình hệ thống...</p>
          </div>
        } @else {
          <div class="settings-form-layout">
            <!-- Shipping Settings -->
            <section class="card">
              <h3>Chính sách vận chuyển & Giao hàng</h3>
              <div class="form-grid">
                <label>
                  <span>Phí vận chuyển tiêu chuẩn (VND) *</span>
                  <input type="number" [(ngModel)]="standardShippingFee" min="0" step="1000" />
                  <span class="hint">Áp dụng cho mọi đơn hàng giao trong nước chưa đạt ngưỡng miễn phí.</span>
                </label>

                <label>
                  <span>Ngưỡng miễn phí vận chuyển (Free shipping threshold) *</span>
                  <input type="number" [(ngModel)]="freeShippingThreshold" min="0" step="50000" />
                  <span class="hint">Đơn hàng có giá trị tiền hàng từ mức này trở lên sẽ được miễn 100% phí ship.</span>
                </label>
              </div>
            </section>

            <!-- Inventory & Warehouse Settings -->
            <section class="card">
              <h3>Cảnh báo Kho hàng & Tồn kho</h3>
              <div class="form-grid">
                <label>
                  <span>Ngưỡng cảnh báo sắp hết hàng (Low Stock Threshold) *</span>
                  <input type="number" [(ngModel)]="lowStockThreshold" min="1" max="100" />
                  <span class="hint">Khi số lượng khả dụng của biến thể xuống dưới ngưỡng này, hệ thống sẽ gắn nhãn cảnh báo đỏ.</span>
                </label>
              </div>
            </section>

            <!-- AI Quotas (GET /admin/ai-quotas, PATCH /admin/ai-quotas) -->
            <section class="card">
              <div class="card-header-flex">
                <h3>Hạn ngạch AI Try-On & Mix-Match (AI Quota)</h3>
                <span class="badge-accent">Quản lý GPU</span>
              </div>
              <div class="form-grid">
                <label>
                  <span>Số lượt chạy AI tối đa mỗi ngày / người dùng *</span>
                  <div class="quota-input-group">
                    <input type="number" [(ngModel)]="aiDailyJobs" min="1" max="500" />
                    <button type="button" class="btn-sub-action" [disabled]="savingQuota()" (click)="saveAiQuotaOnly()">
                      {{ savingQuota() ? 'Đang lưu...' : 'Lưu riêng hạn ngạch AI' }}
                    </button>
                  </div>
                  <span class="hint">Giới hạn số job AI Try-On & Mix-Match mỗi ngày cho mỗi tài khoản để bảo toàn tài nguyên GPU.</span>
                </label>
              </div>
            </section>

            <div class="actions-bar">
              <button type="button" class="btn-primary" [disabled]="saving()" (click)="saveAllSettings()">
                {{ saving() ? 'Đang lưu toàn bộ...' : 'Lưu toàn bộ thay đổi' }}
              </button>
            </div>
          </div>
        }
      }

      <!-- TAB 2: AUDIT LOGS (GET /admin/audit-logs) -->
      @if (activeTab() === 'audit') {
        <div class="audit-layout">
          <!-- Filter Bar -->
          <div class="audit-filter-card">
            <div class="filter-inputs">
              <label>
                <span>Loại đối tượng (Entity Type)</span>
                <select [(ngModel)]="auditEntityType" (change)="loadAuditLogs()">
                  <option value="">-- Tất cả đối tượng --</option>
                  <option value="order">Đơn hàng (order)</option>
                  <option value="product">Sản phẩm (product)</option>
                  <option value="variant">Biến thể (variant)</option>
                  <option value="voucher">Mã giảm giá (voucher)</option>
                  <option value="refund">Hoàn tiền (refund)</option>
                  <option value="user">Người dùng / Nhân sự (user)</option>
                </select>
              </label>

              <label>
                <span>Mã đối tượng (Entity ID)</span>
                <input
                  type="text"
                  [(ngModel)]="auditEntityId"
                  placeholder="Nhập ID cần lọc..."
                  (keyup.enter)="filterAuditLogs()"
                />
              </label>
            </div>

            <div class="filter-actions">
              <button type="button" class="btn-primary-sm" (click)="filterAuditLogs()">🔍 Lọc nhật ký</button>
              <button type="button" class="btn-outline-sm" (click)="resetAuditFilter()">Làm mới</button>
            </div>
          </div>

          @if (loadingAudit()) {
            <div class="loading-box">
              <div class="spinner"></div>
              <p>Đang tải nhật ký kiểm toán...</p>
            </div>
          } @else if (auditLogs().length === 0) {
            <div class="empty-state">
              <p>Không tìm thấy nhật ký kiểm toán nào phù hợp với bộ lọc.</p>
            </div>
          } @else {
            <div class="audit-table-card">
              <div class="audit-table-header">
                <span>Thời gian</span>
                <span>Hành động (Action)</span>
                <span>Đối tượng</span>
                <span>Tác nhân (Actor)</span>
                <span>Chi tiết thay đổi</span>
              </div>

              @for (log of auditLogs(); track log.id) {
                <div class="audit-table-row">
                  <span class="time-col">{{ log.createdAt | date:'HH:mm:ss dd/MM/yyyy' }}</span>
                  <div>
                    <span class="action-tag">{{ log.action }}</span>
                  </div>
                  <div class="entity-col">
                    <strong class="entity-type">{{ log.entityType }}</strong>
                    <code class="entity-id">{{ log.entityId }}</code>
                  </div>
                  <span class="actor-col">{{ log.actorId || 'SYSTEM' }}</span>
                  <div class="meta-col">
                    <pre class="meta-json">{{ log.metadata | json }}</pre>
                  </div>
                </div>
              }
            </div>

            <!-- Pagination info -->
            <div class="pagination-info">
              <span>Hiển thị {{ auditLogs().length }} / {{ auditTotal() }} bản ghi kiểm toán</span>
            </div>
          }
        </div>
      }
    </div>

    @if (activeTab() === 'audit') {<fc-pagination label="Nhật ký hệ thống" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loadingAudit()" (pageChange)="paginationChanged($event)" />}
`,
  styles: [`
    .admin-settings-container {
      max-width: 1000px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .page-header {
      margin-bottom: 4px;
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
    .tab-nav {
      display: flex;
      gap: 12px;
      border-bottom: 1px solid var(--color-divider);
      padding-bottom: 8px;
    }
    .tab-btn {
      background: none;
      border: 0;
      padding: 8px 16px;
      font-size: 0.92rem;
      font-weight: 500;
      color: var(--color-muted);
      border-radius: var(--radius-control);
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab-btn.active {
      background: var(--color-text);
      color: var(--color-surface);
      font-weight: 600;
    }
    .settings-form-layout {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .card-header-flex {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--color-divider);
    }
    .card h3 {
      font-family: Georgia, serif;
      font-size: 1.2rem;
      margin: 0 0 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--color-divider);
      font-weight: 500;
      color: var(--color-text);
    }
    .card-header-flex h3 {
      margin: 0 !important;
      padding-bottom: 0 !important;
      border-bottom: 0 !important;
    }
    .badge-accent {
      background: #f4efe9;
      color: #745136;
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: 600;
    }
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .form-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.88rem;
      color: #333;
    }
    .form-grid input, .form-grid select {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 10px 14px;
      font-size: 0.95rem;
      max-width: 400px;
      outline: none;
    }
    .quota-input-group {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .quota-input-group input {
      width: 140px;
    }
    .btn-sub-action {
      padding: 8px 14px;
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      font-size: 0.82rem;
      cursor: pointer;
      color: #555;
      transition: all 0.15s;
    }
    .btn-sub-action:hover {
      background: var(--color-divider);
      color: var(--color-text);
    }
    .hint {
      font-size: 0.78rem;
      color: var(--color-muted);
      line-height: 1.4;
    }
    .actions-bar {
      display: flex;
      justify-content: flex-end;
      padding-top: 10px;
    }
    .loading-box, .empty-state {
      text-align: center;
      padding: 60px 0;
      color: var(--color-muted);
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-text);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 14px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Audit Logs Styles */
    .audit-layout {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .audit-filter-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 16px;
    }
    .filter-inputs {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .filter-inputs label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.82rem;
      color: #555;
    }
    .filter-inputs select, .filter-inputs input {
      padding: 8px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      font-size: 0.88rem;
      outline: none;
    }
    .filter-actions {
      display: flex;
      gap: 8px;
    }
    .btn-primary-sm {
      padding: 8px 16px;
      background: var(--color-text);
      color: var(--color-surface);
      border: 0;
      border-radius: var(--radius-control);
      font-size: 0.85rem;
      cursor: pointer;
    }
    .btn-outline-sm {
      padding: 8px 14px;
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      font-size: 0.85rem;
      cursor: pointer;
    }
    .audit-table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
    }
    .audit-table-header {
      display: grid;
      grid-template-columns: 1.5fr 1.6fr 1.8fr 1.2fr 2fr;
      padding: 10px 14px;
      background: var(--color-canvas);
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--color-divider);
    }
    .audit-table-row {
      display: grid;
      grid-template-columns: 1.5fr 1.6fr 1.8fr 1.2fr 2fr;
      padding: 12px 14px;
      border-bottom: 1px solid #f6f5f2;
      align-items: center;
      font-size: 0.84rem;
    }
    .time-col {
      color: var(--color-muted);
      font-size: 0.8rem;
    }
    .action-tag {
      display: inline-block;
      padding: 2px 8px;
      background: #f2efe9;
      border-radius: var(--radius-control);
      font-size: 0.75rem;
      font-family: monospace;
      color: #5d4530;
      font-weight: 600;
    }
    .entity-col {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .entity-type {
      color: var(--color-text);
      font-size: 0.82rem;
    }
    .entity-id {
      color: var(--color-muted);
      font-size: 0.75rem;
    }
    .actor-col {
      color: var(--color-muted);
      font-size: 0.8rem;
      font-family: monospace;
    }
    .meta-col {
      max-height: 70px;
      overflow-y: auto;
    }
    .meta-json {
      margin: 0;
      font-size: 0.72rem;
      background: var(--color-canvas);
      padding: 6px 8px;
      border-radius: var(--radius-control);
      color: #444;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .pagination-info {
      font-size: 0.82rem;
      color: var(--color-muted);
      text-align: right;
    }
  `],
})
export class AdminSettingsPage implements OnInit {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadAuditLogs(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly activeTab = signal<'settings' | 'audit'>('settings');

  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly savingQuota = signal<boolean>(false);

  // Settings & Quotas (GET/PATCH /admin/settings & GET/PATCH /admin/ai-quotas)
  standardShippingFee = 30000;
  freeShippingThreshold = 1000000;
  lowStockThreshold = 5;
  aiDailyJobs = 10;

  // Audit logs (GET /admin/audit-logs)
  readonly auditLogs = signal<AuditLogEntry[]>([]);
  readonly loadingAudit = signal<boolean>(false);
  readonly auditTotal = signal<number>(0);
  auditEntityType = '';
  auditEntityId = '';

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading.set(true);
    // Load general settings
    this.api.adminGetSettings().subscribe({
      next: (s) => {
        this.standardShippingFee = s.standardShippingFee ?? 30000;
        this.freeShippingThreshold = s.freeShippingThreshold ?? 1000000;
        this.lowStockThreshold = s.lowStockThreshold ?? 5;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    // Load AI Quota directly from GET /admin/ai-quotas
    this.api.adminGetAiQuota().subscribe({
      next: (quota) => {
        if (quota && typeof quota.dailyJobs === 'number') {
          this.aiDailyJobs = quota.dailyJobs;
        }
      },
    });
  }

  saveAiQuotaOnly(): void {
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
    this.saving.set(true);
    this.api.adminUpdateSettings({
      standardShippingFee: this.standardShippingFee,
      freeShippingThreshold: this.freeShippingThreshold,
      lowStockThreshold: this.lowStockThreshold,
      aiDailyJobs: this.aiDailyJobs,
    }).subscribe({
      next: () => {
        // Also update AI quota
        this.api.adminUpdateAiQuota({ dailyJobs: this.aiDailyJobs }).subscribe();
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

  switchToAuditTab(): void {
    this.activeTab.set('audit');
    if (this.auditLogs().length === 0) {
      this.loadAuditLogs();
    }
  }

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
}
