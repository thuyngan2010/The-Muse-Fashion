import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { InventoryItem, InventoryLedgerEntry } from '@fashion/contracts';
import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminCatalogTabsComponent } from '../../components/admin-catalog-tabs.component';
import { ledgerTypeLabel } from '../../shared/labels';

const DEFAULT_LOW_STOCK = 10;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Component({
  standalone: true,
  imports: [PaginationComponent, FormsModule, ModalComponent, AdminCatalogTabsComponent],
  template: `
    <div class="ai">
      <fc-admin-catalog-tabs active="inventory" />

      <section class="kpis" aria-label="Chỉ số tồn kho">
        <article class="kpi"><span class="kpi-label">Biến thể (SKU)</span><strong class="kpi-value">{{ loading() ? '—' : inventory().length }}</strong><span class="kpi-note">Toàn kho</span></article>
        <article class="kpi"><span class="kpi-label">Cảnh báo tồn thấp</span><strong class="kpi-value">{{ loading() ? '—' : lowCount() }}</strong><span class="kpi-note">Tồn khả dụng ≤ {{ threshold() }}</span></article>
        <article class="kpi"><span class="kpi-label">Hết hàng</span><strong class="kpi-value">{{ loading() ? '—' : outCount() }}</strong><span class="kpi-note">Tồn khả dụng bằng 0</span></article>
      </section>

      <div class="sub-tabs" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="activeTab() === 'stock'" class="sub-tab" [class.active]="activeTab() === 'stock'" (click)="activeTab.set('stock')">Tồn kho hiện tại</button>
        <button type="button" role="tab" [attr.aria-selected]="activeTab() === 'ledger'" class="sub-tab" [class.active]="activeTab() === 'ledger'" (click)="activeTab.set('ledger')">Lịch sử sổ cái</button>
      </div>

      @if (activeTab() === 'stock') {
        <section class="filters">
          <label class="f-search"><span class="sr-only">Tìm theo SKU hoặc tên sản phẩm</span>
            <input type="search" name="q" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Tìm theo SKU hoặc tên sản phẩm" />
          </label>
          <label class="f-sel">Tồn kho
            <select name="filter" [ngModel]="filter()" (ngModelChange)="filter.set($event)">
              <option value="all">Tất cả</option>
              <option value="low">Tồn thấp</option>
              <option value="out">Hết hàng</option>
            </select>
          </label>
        </section>

        @if (loading()) {
          <div class="state-box"><div class="spinner"></div><p>Đang tải dữ liệu tồn kho…</p></div>
        } @else if (loadError()) {
          <div class="state-box"><p>{{ loadError() }}</p><button type="button" class="btn-outline" (click)="loadData()">Thử lại</button></div>
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>SKU</th><th>Sản phẩm</th><th class="c-num">Tồn thực tế</th><th class="c-num">Đang giữ</th><th class="c-num">Khả dụng</th><th>Phiên bản</th><th class="c-act">Thao tác</th></tr></thead>
              <tbody>
                @for (item of filtered(); track item.variantId) {
                  <tr>
                    <td class="mono">{{ item.sku }}</td>
                    <td><strong class="p-name">{{ item.productName }}</strong></td>
                    <td class="c-num">{{ item.stockOnHand }}</td>
                    <td class="c-num muted">{{ item.reserved }}</td>
                    <td class="c-num"><strong [class.stock-low]="item.available > 0 && item.available <= threshold()" [class.stock-out]="item.available === 0">{{ item.available }}</strong></td>
                    <td class="muted">v{{ item.version }}</td>
                    <td class="c-act"><button type="button" class="btn-outline small" (click)="openAdjustModal(item)">Điều chỉnh tồn</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="empty-cell">{{ inventory().length === 0 ? 'Chưa có bản ghi tồn kho nào.' : 'Không có biến thể khớp bộ lọc.' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Loại biến động</th><th>Biến thể</th><th class="c-num">Số lượng</th><th>Lý do</th><th>Người thực hiện</th></tr></thead>
            <tbody>
              @for (entry of ledger(); track entry.id) {
                <tr>
                  <td>{{ ledgerTypeLabel(entry.type) }}</td>
                  <td><span class="mono" [title]="entry.variantId || ''">{{ skuOf(entry.variantId) }}</span></td>
                  <td class="c-num"><strong [class.stock-out]="entry.quantity < 0">{{ entry.quantity > 0 ? '+' + entry.quantity : entry.quantity }}</strong></td>
                  <td class="reason">{{ entry.reason || '—' }}</td>
                  <td [class.mono]="!entry.actorName" [title]="entry.actorId">{{ entry.actorName || entry.actorId.slice(0, 8) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty-cell">Chưa có lịch sử biến động kho.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <fc-pagination label="bản ghi sổ cái" [page]="ledgerPagination.page()" [total]="ledgerPagination.total()" [limit]="ledgerPagination.limit" [loading]="loading()" (pageChange)="ledgerPaginationChanged($event)" />
      }
    </div>

    <fc-modal [isOpen]="adjustModalOpen()" title="Điều chỉnh số lượng tồn kho" (close)="adjustModalOpen.set(false)">
      @if (selectedItem(); as it) {
        <form (ngSubmit)="saveAdjustment()" class="modal-form">
          <p>Sản phẩm: <strong>{{ it.productName }} ({{ it.sku }})</strong></p>
          <p>Tồn hiện tại: <strong>{{ it.stockOnHand }}</strong> (khả dụng: {{ it.available }})</p>
          <label>Số lượng điều chỉnh
            <input type="number" [(ngModel)]="adjustDelta" name="delta" placeholder="+10 nhập thêm, -5 xuất hủy hoặc kiểm kê" required />
          </label>
          <label>Lý do điều chỉnh *
            <input type="text" [(ngModel)]="adjustReason" name="reason" placeholder="VD: Nhập lô mới, kiểm kê hàng hỏng, cân đối kho định kỳ" required />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="adjustModalOpen.set(false)">Hủy</button>
            <button type="submit" class="btn-primary" [disabled]="saving() || adjustDelta === 0 || !adjustReason.trim()">{{ saving() ? 'Đang cập nhật…' : 'Xác nhận điều chỉnh' }}</button>
          </div>
        </form>
      }
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .ai { display: flex; flex-direction: column; gap: 20px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .muted { color: var(--ui-subtle); }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 18px 20px; display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 30px/36px var(--font-serif); color: var(--ui-ink); }
    .kpi-note { font-size: 11px; color: var(--ui-subtle); }
    .sub-tabs { display: inline-flex; gap: 0; border: 1px solid var(--admin-line); align-self: flex-start; }
    .sub-tab { padding: 8px 18px; border: 0; background: var(--ui-bg); font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); cursor: pointer; }
    .sub-tab + .sub-tab { border-left: 1px solid var(--admin-line); }
    .sub-tab.active { background: var(--ui-pink-soft); color: var(--ui-accent); }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .f-search { flex: 1 1 260px; }
    .f-search input, .f-sel select, .modal-form input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .f-sel { display: flex; flex-direction: column; gap: 4px; font: 600 11px/14px var(--font-sans); color: var(--ui-ink-soft); min-width: 160px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: var(--admin-canvas); }
    .c-num { text-align: right; font-variant-numeric: tabular-nums; } .c-act { text-align: right; white-space: nowrap; }
    .p-name { font-weight: 600; overflow-wrap: anywhere; }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; color: var(--ui-ink-soft); }
    .reason { overflow-wrap: anywhere; color: var(--ui-ink-soft); }
    .stock-low { color: var(--ui-warning); } .stock-out { color: var(--ui-danger); }
    .empty-cell { text-align: center; padding: 40px 14px !important; color: var(--ui-subtle); }
    .btn-outline.small { padding: 6px 12px; font-size: 12px; }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .modal-form { display: flex; flex-direction: column; gap: 14px; }
    .modal-form p { margin: 0; font-size: 14px; }
    .modal-form label { display: flex; flex-direction: column; gap: 6px; font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
    @media (max-width: 640px) { .kpis { grid-template-columns: 1fr; } }
  `],
})
export class AdminInventoryPage implements OnInit {
  readonly ledgerPagination = new PaginationState(20);
  ledgerPaginationChanged(page: number): void { this.ledgerPagination.page.set(page); this.loadLedger(); }

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly ledgerTypeLabel = ledgerTypeLabel;

  readonly activeTab = signal<'stock' | 'ledger'>('stock');
  readonly inventory = signal<InventoryItem[]>([]);
  readonly ledger = signal<InventoryLedgerEntry[]>([]);
  readonly loading = signal<boolean>(true);
  readonly loadError = signal('');
  readonly query = signal('');
  readonly filter = signal<'all' | 'low' | 'out'>('all');
  readonly settingsThreshold = signal<number | null>(null);
  readonly threshold = computed(() => this.settingsThreshold() ?? DEFAULT_LOW_STOCK);

  readonly lowCount = computed(() => this.inventory().filter(i => i.available <= this.threshold()).length);
  readonly outCount = computed(() => this.inventory().filter(i => i.available === 0).length);
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.filter();
    const t = this.threshold();
    return this.inventory().filter(i => {
      if (q && !i.sku.toLowerCase().includes(q) && !i.productName.toLowerCase().includes(q)) return false;
      if (f === 'out') return i.available === 0;
      if (f === 'low') return i.available > 0 && i.available <= t;
      return true;
    });
  });
  private readonly skuByVariant = computed(() => new Map(this.inventory().map(i => [i.variantId, i.sku])));

  readonly adjustModalOpen = signal<boolean>(false);
  readonly selectedItem = signal<InventoryItem | null>(null);
  readonly saving = signal<boolean>(false);

  adjustDelta = 0;
  adjustReason = '';
  private pendingAdjustId = '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.query.set(params.get('q') ?? '');
    this.pendingAdjustId = params.get('adjust') ?? '';
    if (this.auth.isAdmin()) {
      this.api.adminGetSettings().subscribe({ next: s => this.settingsThreshold.set(s.lowStockThreshold), error: () => this.settingsThreshold.set(null) });
    }
    this.loadData();
  }

  skuOf(variantId: string | null): string {
    if (!variantId) return '—';
    return this.skuByVariant().get(variantId) ?? variantId.slice(0, 8);
  }

  loadData(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.adminListInventory().subscribe({
      next: (res) => {
        this.inventory.set(res.items);
        this.loading.set(false);
        if (this.pendingAdjustId) {
          const item = res.items.find(i => i.variantId === this.pendingAdjustId);
          this.pendingAdjustId = '';
          if (item) this.openAdjustModal(item);
        }
      },
      error: (err) => { this.loading.set(false); this.loadError.set(err.error?.message || 'Không thể tải dữ liệu tồn kho.'); },
    });
    this.loadLedger();
  }

  private loadLedger(): void {
    this.ledgerPagination.load(() => this.api.adminListLedger(undefined, this.ledgerPagination.page(), this.ledgerPagination.limit), {
      next: (res) => this.ledger.set(res.items),
    });
  }

  openAdjustModal(item: InventoryItem): void {
    this.selectedItem.set(item);
    this.adjustDelta = 0;
    this.adjustReason = '';
    this.adjustModalOpen.set(true);
  }

  saveAdjustment(): void {
    const it = this.selectedItem();
    if (!it || this.adjustDelta === 0 || !this.adjustReason.trim()) return;

    this.saving.set(true);
    const key = generateUUID();

    this.api.adminAdjustInventory({
      variantId: it.variantId,
      delta: this.adjustDelta,
      reason: this.adjustReason.trim(),
      expectedVersion: it.version,
    }, key).subscribe({
      next: () => {
        this.saving.set(false);
        this.adjustModalOpen.set(false);
        this.toast.success('Đã cập nhật số lượng tồn kho.');
        this.loadData();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể điều chỉnh tồn kho (xung đột phiên bản).');
      },
    });
  }
}
