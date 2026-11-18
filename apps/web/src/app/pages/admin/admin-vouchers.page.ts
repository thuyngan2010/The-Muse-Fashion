import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Voucher } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { AdminPromoTabsComponent } from '../../components/admin-promo-tabs.component';
import { voucherStatusLabel, voucherTypeLabel } from '../../shared/labels';

function csvCell(value: string | number): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

@Component({
  standalone: true,
  imports: [FormsModule, ModalComponent, AdminDrawerComponent, AdminPromoTabsComponent],
  template: `
    <div class="av">
      <fc-admin-promo-tabs active="vouchers" />

      <header class="head">
        <div>
          <h1 class="title">Khuyến mãi và Đánh giá</h1>
          <p class="sub">Quản trị mã giảm giá và kiểm duyệt nội dung khách hàng đăng tải.</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn-outline" [disabled]="visible().length === 0" (click)="exportCsv()">Xuất dữ liệu</button>
          <button type="button" class="btn-primary" (click)="openCreateModal()">+ Tạo mã voucher mới</button>
        </div>
      </header>

      <section class="kpis" aria-label="Chỉ số voucher">
        <div class="kpi">
          <span class="kpi-label">Voucher đang chạy</span>
          <span class="kpi-value">{{ loaded() ? runningCount() : '—' }}</span>
          <span class="kpi-note">Mã đang bật và còn hạn</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Voucher ngưng dùng</span>
          <span class="kpi-value">{{ loaded() ? stoppedCount() : '—' }}</span>
          <span class="kpi-note">Mã đã vô hiệu hóa hoặc hết hạn</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Tổng lượt đã dùng</span>
          <span class="kpi-value">{{ loaded() ? totalUsed().toLocaleString('vi-VN') : '—' }}</span>
          <span class="kpi-note">Cộng dồn trên {{ vouchers().length }} mã</span>
        </div>
      </section>

      <div class="filters">
        <label class="sr-only" for="vc-search">Tìm theo mã voucher</label>
        <input id="vc-search" type="search" class="f-input" [ngModel]="search()" (ngModelChange)="search.set($event)" name="vcsearch" placeholder="Tìm theo mã voucher…" autocomplete="off" />
        <label class="sr-only" for="vc-type">Lọc loại giảm</label>
        <select id="vc-type" class="f-input" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)" name="vctype">
          <option value="">Tất cả loại giảm</option>
          <option value="PERCENT">Phần trăm</option>
          <option value="FIXED">Số tiền cố định</option>
        </select>
        @if (loaded()) { <span class="note">Hiển thị {{ visible().length }} trên {{ vouchers().length }} mã</span> }
      </div>

      @if (loading() && !loaded()) {
        <div class="state-box" role="status"><span class="spinner"></span><p>Đang tải danh sách voucher…</p></div>
      } @else if (error()) {
        <div class="state-box" role="alert"><p>{{ error() }}</p><button type="button" class="btn-outline" (click)="load()">Thử lại</button></div>
      } @else if (visible().length === 0) {
        <div class="state-box"><p>{{ vouchers().length === 0 ? 'Chưa có mã ưu đãi nào được tạo.' : 'Không có mã nào khớp bộ lọc.' }}</p></div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Mã voucher</th><th>Loại giảm</th><th>Giá trị giảm</th><th class="c-num">Đơn tối thiểu</th>
                <th>Thời hạn áp dụng</th><th>Đã dùng / giới hạn</th><th>Trạng thái</th><th class="c-act">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              @for (v of visible(); track v.id) {
                <tr [class.dim]="isStopped(v)">
                  <td><span class="code">{{ v.code }}</span></td>
                  <td>{{ typeLabel(v.type) }}</td>
                  <td>
                    <strong>{{ v.type === 'PERCENT' ? v.value + '%' : money(v.value) }}</strong>
                    @if (v.type === 'PERCENT' && v.maxDiscount) { <span class="sub-line">Tối đa {{ money(v.maxDiscount) }}</span> }
                  </td>
                  <td class="c-num nowrap">{{ money(v.minimumSubtotal) }}</td>
                  <td class="nowrap">{{ fmtDate(v.validFrom) }} – {{ fmtDate(v.validTo) }}</td>
                  <td>
                    <span class="usage"><strong>{{ (v.usedCount ?? 0).toLocaleString('vi-VN') }}</strong> / {{ v.usageLimit.toLocaleString('vi-VN') }} lượt</span>
                    <span class="bar" aria-hidden="true"><span class="bar-fill" [style.width.%]="usagePercent(v)"></span></span>
                  </td>
                  <td><span class="badge" [class]="'vs-' + stateOf(v)">{{ stateLabel(v) }}</span></td>
                  <td class="c-act">
                    <div class="acts">
                      <button type="button" class="link-btn" (click)="openEditModal(v)">Sửa</button>
                      <button type="button" class="link-btn" [disabled]="busyId() === v.id" (click)="toggleStatus(v)">{{ v.status === 'ACTIVE' ? 'Vô hiệu hóa' : 'Kích hoạt' }}</button>
                      <button type="button" class="link-btn danger" (click)="deleteTarget.set(v)">Xóa</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Tạo / sửa voucher (POST /admin/vouchers, PATCH /admin/vouchers/:voucherId) -->
    <fc-admin-drawer [isOpen]="drawerOpen()" eyebrow="Mã giảm giá" [title]="editingVoucherId ? 'Chỉnh sửa mã voucher' : 'Tạo mã voucher mới'" width="520px" (close)="drawerOpen.set(false)">
      <form id="voucher-form" (ngSubmit)="saveVoucher()" class="dform" autocomplete="off">
        <label>Mã voucher (in hoa, không dấu) *
          <input type="text" [(ngModel)]="formCode" [readonly]="!!editingVoucherId" name="code" placeholder="VD: SUMMER20" required style="text-transform: uppercase;" />
        </label>
        <label>Loại giảm giá *
          <select [(ngModel)]="formType" name="type">
            <option value="PERCENT">Giảm theo phần trăm</option>
            <option value="FIXED">Giảm số tiền cố định (đ)</option>
          </select>
        </label>
        <div class="row2">
          <label>Giá trị giảm ({{ formType === 'PERCENT' ? '%' : 'đ' }}) *
            <input type="number" [(ngModel)]="formValue" name="value" required min="1" />
          </label>
          <label>Đơn tối thiểu (đ) *
            <input type="number" [(ngModel)]="formMinSubtotal" name="minSubtotal" required min="0" step="10000" />
          </label>
        </div>
        <div class="row2">
          <label>Giảm tối đa (với loại %)
            <input type="number" [(ngModel)]="formMaxDiscount" name="maxDiscount" placeholder="Để trống nếu không giới hạn" />
          </label>
          <label>Giới hạn lượt dùng *
            <input type="number" [(ngModel)]="formUsageLimit" name="usageLimit" required min="1" />
          </label>
        </div>
        <div class="row2">
          <label>Hiệu lực từ ngày *
            <input type="date" [(ngModel)]="formValidFrom" name="validFrom" required />
          </label>
          <label>Đến hết ngày *
            <input type="date" [(ngModel)]="formValidTo" name="validTo" required />
          </label>
        </div>
        @if (editingVoucherId) {
          <label>Trạng thái voucher *
            <select [(ngModel)]="formStatus" name="status">
              <option value="ACTIVE">Đang chạy</option>
              <option value="DISABLED">Ngưng</option>
            </select>
          </label>
        }
      </form>
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="drawerOpen.set(false)">Hủy</button>
        <button type="submit" form="voucher-form" class="btn-primary" [disabled]="saving() || !formCode.trim()">
          {{ saving() ? 'Đang lưu…' : (editingVoucherId ? 'Cập nhật voucher' : 'Tạo mã voucher') }}
        </button>
      </div>
    </fc-admin-drawer>

    <fc-modal [isOpen]="!!deleteTarget()" title="Xóa mã voucher" maxWidth="440px" (close)="deleteTarget.set(null)">
      @if (deleteTarget(); as t) {
        <p class="confirm-text">Bạn chắc chắn muốn xóa mã <strong>{{ t.code }}</strong>? Thao tác này không thể hoàn tác.</p>
        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="deleteTarget.set(null)">Hủy</button>
          <button type="button" class="btn-primary" [disabled]="saving()" (click)="confirmDelete()">{{ saving() ? 'Đang xóa…' : 'Xóa voucher' }}</button>
        </div>
      }
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .av { display: flex; flex-direction: column; gap: 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .head-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 26px/32px var(--font-serif); }
    .kpi-note, .note { margin: 0; font-size: 12px; line-height: 16px; color: var(--ui-subtle); }
    .filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .f-input, .dform input, .dform select { box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .f-input { min-width: 220px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 1000px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .c-num { text-align: right; } .c-act { text-align: right; } .nowrap { white-space: nowrap; }
    .sub-line { display: block; margin-top: 2px; font-size: 12px; color: var(--ui-subtle); }
    .code { display: inline-block; padding: 3px 8px; background: var(--ui-bg-soft); border: 1px solid var(--admin-line); font: 700 12px/16px ui-monospace, monospace; letter-spacing: .3px; }
    .dim td { opacity: .55; }
    .dim .code { text-decoration: line-through; }
    .dim td:last-child { opacity: 1; }
    .usage { display: block; font-size: 12px; color: var(--ui-ink-soft); }
    .bar { display: block; height: 4px; margin-top: 6px; background: var(--ui-bg-soft); border-radius: 2px; overflow: hidden; min-width: 110px; }
    .bar-fill { display: block; height: 100%; background: var(--ui-accent); }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); white-space: nowrap; }
    .vs-running { background: var(--ui-success-bg); color: var(--ui-success); }
    .vs-disabled { background: var(--ui-bg-soft); color: var(--ui-ink-soft); }
    .vs-expired { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .acts { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
    .link-btn { background: none; border: 0; padding: 4px 6px; color: var(--ui-accent); font: 700 12px/16px var(--font-sans); cursor: pointer; text-decoration: underline; }
    .link-btn.danger { color: var(--ui-danger); }
    .link-btn:disabled { opacity: .5; cursor: default; }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .dform { display: flex; flex-direction: column; gap: 14px; }
    .dform label { display: flex; flex-direction: column; gap: 4px; font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); }
    .dform input, .dform select { width: 100%; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .confirm-text { margin: 0 0 16px; font-size: 14px; line-height: 22px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
  `],
})
export class AdminVouchersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly vouchers = signal<Voucher[]>([]);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly typeFilter = signal('');
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly deleteTarget = signal<Voucher | null>(null);

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

  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    return this.vouchers().filter(v => (!q || v.code.toLowerCase().includes(q)) && (!type || v.type === type));
  });
  readonly runningCount = computed(() => this.vouchers().filter(v => !this.isStopped(v)).length);
  readonly stoppedCount = computed(() => this.vouchers().filter(v => this.isStopped(v)).length);
  readonly totalUsed = computed(() => this.vouchers().reduce((sum, v) => sum + (v.usedCount ?? 0), 0));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.adminListVouchers().subscribe({
      next: res => {
        this.vouchers.set(res.items);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err?.error?.message || 'Không thể tải danh sách voucher.');
        this.loading.set(false);
      },
    });
  }

  // --- Trạng thái hiển thị ---
  isExpired(v: Voucher): boolean {
    const end = new Date(v.validTo).getTime();
    return !Number.isNaN(end) && Date.now() > end;
  }
  isStopped(v: Voucher): boolean { return v.status !== 'ACTIVE' || this.isExpired(v); }
  stateOf(v: Voucher): 'running' | 'disabled' | 'expired' {
    if (v.status !== 'ACTIVE') return 'disabled';
    return this.isExpired(v) ? 'expired' : 'running';
  }
  stateLabel(v: Voucher): string { return this.stateOf(v) === 'expired' ? 'Hết hạn' : voucherStatusLabel(v.status); }
  typeLabel(type: string): string { return voucherTypeLabel(type); }
  usagePercent(v: Voucher): number {
    if (!v.usageLimit) return 0;
    return Math.min(100, Math.round(((v.usedCount ?? 0) / v.usageLimit) * 100));
  }
  money(value: number): string { return `${Math.round(value).toLocaleString('vi-VN')}đ`; }
  fmtDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  // --- Form tạo / sửa ---
  openCreateModal(): void {
    this.editingVoucherId = null;
    this.formCode = '';
    this.formType = 'PERCENT';
    this.formValue = 10;
    this.formMinSubtotal = 500000;
    this.formMaxDiscount = null;
    this.formUsageLimit = 100;
    this.formStatus = 'ACTIVE';
    this.formValidFrom = new Date().toISOString().slice(0, 10);
    this.formValidTo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    this.drawerOpen.set(true);
  }

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
    this.drawerOpen.set(true);
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
          this.drawerOpen.set(false);
          this.toast.success('Cập nhật mã voucher thành công.');
          this.load();
        },
        error: err => {
          this.saving.set(false);
          this.toast.error(err.error?.message || 'Không thể cập nhật voucher.');
        },
      });
    } else {
      // POST /admin/vouchers
      this.api.adminCreateVoucher(payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.drawerOpen.set(false);
          this.toast.success('Đã tạo mã giảm giá voucher thành công.');
          this.load();
        },
        error: err => {
          this.saving.set(false);
          this.toast.error(err.error?.message || 'Không thể tạo voucher.');
        },
      });
    }
  }

  // --- Vô hiệu hóa / kích hoạt: PATCH status ---
  toggleStatus(v: Voucher): void {
    const next: 'ACTIVE' | 'DISABLED' = v.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    this.busyId.set(v.id);
    this.api.adminUpdateVoucher(v.id, {
      code: v.code, type: v.type, value: v.value, minimumSubtotal: v.minimumSubtotal,
      maxDiscount: v.maxDiscount ?? null, usageLimit: v.usageLimit,
      validFrom: new Date(v.validFrom).toISOString(), validTo: new Date(v.validTo).toISOString(),
      status: next,
    }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(next === 'DISABLED' ? 'Đã vô hiệu hóa voucher.' : 'Đã kích hoạt voucher.');
        this.load();
      },
      error: err => {
        this.busyId.set(null);
        this.toast.error(err.error?.message || 'Không thể cập nhật trạng thái voucher.');
      },
    });
  }

  confirmDelete(): void {
    const v = this.deleteTarget();
    if (!v || this.saving()) return;
    this.saving.set(true);
    this.api.adminDeleteVoucher(v.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.toast.success('Đã xóa voucher.');
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'Không thể xóa voucher.');
      },
    });
  }

  // --- Xuất CSV các mã đang hiển thị ---
  exportCsv(): void {
    const rows = this.visible();
    if (rows.length === 0) return;
    const header = ['Mã', 'Loại giảm', 'Giá trị', 'Giảm tối đa (đ)', 'Đơn tối thiểu (đ)', 'Từ ngày', 'Đến ngày', 'Đã dùng', 'Giới hạn', 'Trạng thái'];
    const lines = [header.map(csvCell).join(',')];
    for (const v of rows) {
      lines.push([
        v.code, voucherTypeLabel(v.type), v.value, v.maxDiscount ?? '', v.minimumSubtotal,
        this.fmtDate(v.validFrom), this.fmtDate(v.validTo), v.usedCount ?? 0, v.usageLimit, this.stateLabel(v),
      ].map(csvCell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voucher-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
