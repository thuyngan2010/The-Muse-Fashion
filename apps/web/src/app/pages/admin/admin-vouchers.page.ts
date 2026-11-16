import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Voucher } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';

@Component({
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, ModalComponent],
  template: `
    <div class="admin-vouchers-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Mã giảm giá & Vouchers</h1>
          <p class="page-desc">Thiết lập các chương trình khuyến mãi, ưu đãi tỷ lệ phần trăm hoặc giảm tiền cố định.</p>
        </div>
        <button type="button" class="btn-primary" (click)="openCreateModal()">+ Tạo mã Voucher mới</button>
      </header>

      @if (loading()) {
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Đang tải danh sách voucher...</p>
        </div>
      } @else if (vouchers().length === 0) {
        <div class="empty-state">
          <p>Chưa có mã ưu đãi nào được tạo.</p>
        </div>
      } @else {
        <div class="table-card">
          <div class="table-header">
            <span>Mã Voucher</span>
            <span>Loại</span>
            <span>Giá trị giảm</span>
            <span>Đơn tối thiểu</span>
            <span>Lượt dùng</span>
            <span>Hạn dùng</span>
            <span>Trạng thái</span>
            <span>Thao tác</span>
          </div>

          @for (v of vouchers(); track v.id) {
            <div class="table-row">
              <span class="code-badge">{{ v.code }}</span>
              <span>{{ v.type === 'PERCENT' ? 'Phần trăm (%)' : 'Số tiền cố định' }}</span>
              <strong class="value-cell">
                {{ v.type === 'PERCENT' ? v.value + '%' : (v.value | currency:'VND':'symbol':'1.0-0') }}
              </strong>
              <span>{{ v.minimumSubtotal | currency:'VND':'symbol':'1.0-0' }}</span>
              <span>{{ v.usedCount ?? 0 }} / {{ v.usageLimit }}</span>
              <span class="date-cell">{{ v.validTo | date:'dd/MM/yyyy' }}</span>
              <div>
                <span class="status-badge" [class.active]="v.status === 'ACTIVE'">{{ v.status }}</span>
              </div>
              <div class="actions-cell">
                <button type="button" class="btn-action edit" (click)="openEditModal(v)">Sửa</button>
                <button type="button" class="btn-action del" (click)="deleteVoucher(v.id)">Xóa</button>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Create / Edit Voucher Modal (POST /admin/vouchers & PATCH /admin/vouchers/:voucherId) -->
    <fc-modal
      [isOpen]="voucherModalOpen()"
      [title]="editingVoucherId ? 'Chỉnh sửa mã voucher' : 'Tạo mã voucher khuyến mãi mới'"
      (close)="voucherModalOpen.set(false)"
    >
      <form (ngSubmit)="saveVoucher()" class="modal-form">
        <div class="form-row">
          <label>
            Mã voucher (In hoa, không dấu) *
            <input
              type="text"
              [(ngModel)]="formCode"
              [readonly]="!!editingVoucherId"
              name="code"
              placeholder="VD: SUMMER20"
              required
              style="text-transform: uppercase;"
            />
          </label>
          <label>
            Loại giảm giá *
            <select [(ngModel)]="formType" name="type">
              <option value="PERCENT">Giảm theo % (PERCENT)</option>
              <option value="FIXED">Giảm số tiền cố định (FIXED VND)</option>
            </select>
          </label>
        </div>

        <div class="form-row">
          <label>
            Giá trị giảm ({{ formType === 'PERCENT' ? '%' : 'VND' }}) *
            <input type="number" [(ngModel)]="formValue" name="value" required min="1" />
          </label>
          <label>
            Đơn tối thiểu (VND) *
            <input type="number" [(ngModel)]="formMinSubtotal" name="minSubtotal" required min="0" step="10000" />
          </label>
        </div>

        <div class="form-row">
          <label>
            Giảm tối đa (đối với %)
            <input type="number" [(ngModel)]="formMaxDiscount" name="maxDiscount" placeholder="Để trống nếu không giới hạn" />
          </label>
          <label>
            Giới hạn lượt dùng *
            <input type="number" [(ngModel)]="formUsageLimit" name="usageLimit" required min="1" />
          </label>
        </div>

        <div class="form-row">
          <label>
            Hiệu lực từ ngày *
            <input type="date" [(ngModel)]="formValidFrom" name="validFrom" required />
          </label>
          <label>
            Đến hết ngày *
            <input type="date" [(ngModel)]="formValidTo" name="validTo" required />
          </label>
        </div>

        @if (editingVoucherId) {
          <div class="form-row">
            <label>
              Trạng thái voucher *
              <select [(ngModel)]="formStatus" name="status">
                <option value="ACTIVE">ACTIVE (Đang hoạt động)</option>
                <option value="DISABLED">DISABLED (Tạm dừng)</option>
              </select>
            </label>
          </div>
        }

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="voucherModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || !formCode.trim()">
            {{ saving() ? 'Đang lưu...' : (editingVoucherId ? 'Cập nhật voucher' : 'Tạo mã voucher') }}
          </button>
        </div>
      </form>
    </fc-modal>
  `,
  styles: [`
    .admin-vouchers-container {
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
    .table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .table-header {
      display: grid;
      grid-template-columns: 1.5fr 1.3fr 1.3fr 1.4fr 1.1fr 1.2fr 1fr 110px;
      padding: 12px 16px;
      background: var(--color-canvas);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-muted);
      border-bottom: 1px solid var(--color-divider);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .table-row {
      display: grid;
      grid-template-columns: 1.5fr 1.3fr 1.3fr 1.4fr 1.1fr 1.2fr 1fr 110px;
      padding: 14px 16px;
      border-bottom: 1px solid #f6f5f2;
      align-items: center;
      font-size: 0.88rem;
    }
    .code-badge {
      font-family: monospace;
      font-weight: 700;
      color: var(--color-accent);
      background: var(--color-canvas);
      border: 1px dashed #c9ab8d;
      padding: 4px 8px;
      border-radius: var(--radius-control);
      display: inline-block;
      width: fit-content;
    }
    .value-cell {
      color: #2e7d32;
    }
    .date-cell {
      font-size: 0.82rem;
      color: var(--color-muted);
    }
    .status-badge {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 10px;
      background: #eee;
      color: var(--color-muted);
      font-weight: 600;
    }
    .status-badge.active {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .actions-cell {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn-action {
      background: none;
      border: 0;
      font-size: 0.8rem;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: var(--radius-control);
    }
    .btn-action.edit {
      color: #1565c0;
    }
    .btn-action.edit:hover {
      text-decoration: underline;
    }
    .btn-action.del {
      color: #c62828;
    }
    .btn-action.del:hover {
      text-decoration: underline;
    }
    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .modal-form label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: #444;
    }
    .modal-form input, .modal-form select {
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
    .loading-box, .empty-state {
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
  `],
})
export class AdminVouchersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly vouchers = signal<Voucher[]>([]);
  readonly loading = signal<boolean>(true);

  readonly voucherModalOpen = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  editingVoucherId: string | null = null;
  formCode = '';
  formType: 'PERCENT' | 'FIXED' = 'PERCENT';
  formValue = 10;
  formMinSubtotal = 500000;
  formMaxDiscount: number | null = null;
  formUsageLimit = 100;
  formValidFrom = '';
  formValidTo = '';
  formStatus: 'ACTIVE' | 'DISABLED' = 'ACTIVE';

  ngOnInit(): void {
    this.loadVouchers();
  }

  loadVouchers(): void {
    this.loading.set(true);
    this.api.adminListVouchers().subscribe({
      next: (res) => {
        this.vouchers.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCreateModal(): void {
    this.editingVoucherId = null;
    this.formCode = '';
    this.formType = 'PERCENT';
    this.formValue = 10;
    this.formMinSubtotal = 500000;
    this.formMaxDiscount = null;
    this.formUsageLimit = 100;
    this.formStatus = 'ACTIVE';

    const today = new Date();
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    this.formValidFrom = today.toISOString().slice(0, 10);
    this.formValidTo = nextMonth.toISOString().slice(0, 10);

    this.voucherModalOpen.set(true);
  }

  // --- PATCH /admin/vouchers/:voucherId ---
  openEditModal(v: Voucher): void {
    this.editingVoucherId = v.id;
    this.formCode = v.code;
    this.formType = v.type;
    this.formValue = v.value;
    this.formMinSubtotal = v.minimumSubtotal;
    this.formMaxDiscount = v.maxDiscount ?? null;
    this.formUsageLimit = v.usageLimit;
    this.formStatus = (v.status as 'ACTIVE' | 'DISABLED') || 'ACTIVE';
    this.formValidFrom = v.validFrom ? new Date(v.validFrom).toISOString().slice(0, 10) : '';
    this.formValidTo = v.validTo ? new Date(v.validTo).toISOString().slice(0, 10) : '';

    this.voucherModalOpen.set(true);
  }

  saveVoucher(): void {
    if (!this.formCode.trim()) return;

    this.saving.set(true);
    const payload = {
      code: this.formCode.trim().toUpperCase(),
      type: this.formType,
      value: this.formValue,
      minimumSubtotal: this.formMinSubtotal,
      maxDiscount: this.formMaxDiscount ?? null,
      usageLimit: this.formUsageLimit,
      validFrom: new Date(this.formValidFrom).toISOString(),
      validTo: new Date(this.formValidTo).toISOString(),
      status: this.formStatus,
    };

    if (this.editingVoucherId) {
      // PATCH /admin/vouchers/:voucherId
      this.api.adminUpdateVoucher(this.editingVoucherId, payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.voucherModalOpen.set(false);
          this.toast.success('Cập nhật mã voucher thành công.');
          this.loadVouchers();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(err.error?.message || 'Không thể cập nhật voucher.');
        },
      });
    } else {
      // POST /admin/vouchers
      this.api.adminCreateVoucher(payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.voucherModalOpen.set(false);
          this.toast.success('Đã tạo mã giảm giá voucher thành công.');
          this.loadVouchers();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(err.error?.message || 'Không thể tạo voucher.');
        },
      });
    }
  }

  deleteVoucher(id: string): void {
    if (!confirm('Bạn có chắc chắn muốn xóa mã voucher này?')) return;
    this.api.adminDeleteVoucher(id).subscribe({
      next: () => {
        this.toast.success('Đã xóa voucher.');
        this.loadVouchers();
      },
      error: () => {
        this.toast.error('Không thể xóa voucher.');
      },
    });
  }
}
