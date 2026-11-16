import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { InventoryItem, InventoryLedgerEntry } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';

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
  imports: [PaginationComponent, FormsModule, ModalComponent],
  template: `
    <div class="admin-inventory-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Kho hàng & Sổ cái tồn kho</h1>
          <p class="page-desc">Theo dõi tồn kho thực tế, số lượng đang giữ (Reserved) và lịch sử biến động sổ cái.</p>
        </div>

        <div class="tabs-bar">
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'stock'"
            (click)="activeTab.set('stock')"
          >
            Tồn kho hiện tại
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'ledger'"
            (click)="activeTab.set('ledger')"
          >
            Lịch sử sổ cái (Ledger)
          </button>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Đang tải dữ liệu tồn kho...</p>
        </div>
      } @else if (activeTab() === 'stock') {
        <div class="table-card">
          <div class="table-header">
            <span>SKU</span>
            <span>Tên sản phẩm</span>
            <span>Tồn thực tế</span>
            <span>Đang giữ</span>
            <span>Khả dụng</span>
            <span>Phiên bản</span>
            <span>Thao tác</span>
          </div>

          @for (item of inventory(); track item.variantId) {
            <div class="table-row" [class.low-stock]="item.available < 10">
              <span class="sku-cell">{{ item.sku }}</span>
              <strong class="name-cell">{{ item.productName }}</strong>
              <span>{{ item.stockOnHand }}</span>
              <span class="text-reserved">{{ item.reserved }}</span>
              <div>
                <strong class="available-badge" [class.urgent]="item.available <= 5">
                  {{ item.available }}
                </strong>
              </div>
              <span class="version-cell">v{{ item.version }}</span>
              <div>
                <button type="button" class="btn-action" (click)="openAdjustModal(item)">Điều chỉnh tồn</button>
              </div>
            </div>
          } @empty {
            <p class="empty-note">Chưa có bản ghi tồn kho nào trong hệ thống.</p>
          }
        </div>
      } @else {
        <!-- Ledger History -->
        <div class="table-card">
          <div class="ledger-header">
            <span>Loại biến động</span>
            <span>Biến thể</span>
            <span>Số lượng</span>
            <span>Lý do biến động</span>
            <span>Người thực hiện</span>
          </div>

          @for (entry of ledger(); track entry.id) {
            <div class="ledger-row">
              <span>{{ entry.type }}</span>
              <span class="date-cell" [title]="entry.variantId || ''">{{ entry.variantId?.slice(0, 8) || '—' }}</span>
              <strong>{{ entry.quantity }}</strong>
              <span class="reason-cell">{{ entry.reason }}</span>
              <span class="actor-cell">{{ entry.actorId.slice(0, 8) }}</span>
            </div>
          } @empty {
            <p class="empty-note">Chưa có lịch sử sổ cái biến động kho.</p>
          }
        </div>
      }
    </div>

    <!-- Adjust Stock Modal -->
    <fc-modal
      [isOpen]="adjustModalOpen()"
      title="Điều chỉnh số lượng tồn kho"
      (close)="adjustModalOpen.set(false)"
    >
      @if (selectedItem(); as it) {
        <form (ngSubmit)="saveAdjustment()" class="modal-form">
          <p>Sản phẩm: <strong>{{ it.productName }} ({{ it.sku }})</strong></p>
          <p>Tồn hiện tại: <strong>{{ it.stockOnHand }}</strong> (Khả dụng: {{ it.available }})</p>

          <label>
            Số lượng điều chỉnh (Delta)
            <input
              type="number"
              [(ngModel)]="adjustDelta"
              name="delta"
              placeholder="+10 nhập thêm, hoặc -5 xuất hủy/kiểm kê"
              required
            />
          </label>

          <label>
            Lý do điều chỉnh kho *
            <input
              type="text"
              [(ngModel)]="adjustReason"
              name="reason"
              placeholder="VD: Nhập lô hàng mới, Kiểm kê hỏng lỗi, Cân đối kho định kỳ..."
              required
            />
          </label>

          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="adjustModalOpen.set(false)">Hủy</button>
            <button type="submit" class="btn-primary" [disabled]="saving() || adjustDelta === 0 || !adjustReason.trim()">
              {{ saving() ? 'Đang cập nhật...' : 'Xác nhận điều chỉnh' }}
            </button>
          </div>
        </form>
      }
    </fc-modal>

    @if (activeTab() === 'ledger') {<fc-pagination label="Lịch sử kho" [page]="ledgerPagination.page()" [total]="ledgerPagination.total()" [limit]="ledgerPagination.limit" [loading]="loading()" (pageChange)="ledgerPaginationChanged($event)" />}
`,
  styles: [`
    .admin-inventory-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 16px;
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
    .tabs-bar {
      display: flex;
      gap: 8px;
    }
    .tab-btn {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      cursor: pointer;
      color: var(--color-muted);
      font-weight: 500;
    }
    .tab-btn.active {
      background: var(--color-text);
      color: var(--color-surface);
      border-color: var(--color-text);
      font-weight: 600;
    }
    .table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .table-header, .ledger-header {
      display: grid;
      padding: 12px 16px;
      background: var(--color-canvas);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-muted);
      border-bottom: 1px solid var(--color-divider);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .table-header {
      grid-template-columns: 1.5fr 2fr 1fr 1fr 1fr 1fr 1.3fr;
    }
    .ledger-header {
      grid-template-columns: 1.6fr 1.2fr 1.2fr 2.5fr 1.2fr;
    }
    .table-row, .ledger-row {
      display: grid;
      padding: 14px 16px;
      border-bottom: 1px solid #f6f5f2;
      align-items: center;
      font-size: 0.88rem;
    }
    .table-row {
      grid-template-columns: 1.5fr 2fr 1fr 1fr 1fr 1fr 1.3fr;
    }
    .ledger-row {
      grid-template-columns: 1.6fr 1.2fr 1.2fr 2.5fr 1.2fr;
    }
    .sku-cell {
      font-family: monospace;
      color: var(--color-text);
    }
    .name-cell {
      color: var(--color-text);
    }
    .text-reserved {
      color: #e65100;
    }
    .available-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: var(--radius-control);
      background: #e8f5e9;
      color: #2e7d32;
    }
    .available-badge.urgent {
      background: #ffebee;
      color: #c62828;
    }
    .version-cell {
      font-size: 0.78rem;
      color: var(--color-muted);
    }
    .btn-action {
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      padding: 4px 10px;
      border-radius: var(--radius-control);
      font-size: 0.78rem;
      cursor: pointer;
    }
    .delta-cell.positive { color: #2e7d32; }
    .delta-cell.negative { color: #c62828; }
    .empty-note {
      text-align: center;
      padding: 40px;
      color: var(--color-muted);
    }
    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .modal-form label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: #444;
    }
    .modal-form input {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 10px;
      font-size: 0.9rem;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 10px;
    }
    .loading-box {
      text-align: center;
      padding: 60px 0;
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
    .date-cell { font-variant-numeric:tabular-nums; } .reason-cell,.actor-cell { overflow-wrap:anywhere; font-size:.8125rem; color:var(--color-muted); }

  `],
})
export class AdminInventoryPage implements OnInit {
  readonly ledgerPagination = new PaginationState(20);
  ledgerPaginationChanged(page: number): void { this.ledgerPagination.page.set(page); this.loadData(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly activeTab = signal<'stock' | 'ledger'>('stock');
  readonly inventory = signal<InventoryItem[]>([]);
  readonly ledger = signal<InventoryLedgerEntry[]>([]);
  readonly loading = signal<boolean>(true);

  readonly adjustModalOpen = signal<boolean>(false);
  readonly selectedItem = signal<InventoryItem | null>(null);
  readonly saving = signal<boolean>(false);

  adjustDelta = 0;
  adjustReason = '';

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.api.adminListInventory().subscribe({
      next: (res) => {
        this.inventory.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

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
        this.toast.success('Đã cập nhật số lượng tồn kho thành công.');
        this.loadData();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể điều chỉnh tồn kho (xung đột phiên bản).');
      },
    });
  }
}
