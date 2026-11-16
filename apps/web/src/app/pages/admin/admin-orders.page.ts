import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { AdminOrderSummary, OrderStatus, UserSummary } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true,
  imports: [PaginationComponent, CurrencyPipe, DatePipe, FormsModule, ModalComponent],
  template: `
    <div class="admin-orders-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Quản lý Đơn hàng</h1>
          <p class="page-desc">Xử lý trạng thái đơn hàng, phân công nhân sự và cập nhật thông tin vận chuyển.</p>
        </div>

        <div class="status-filter-pills">
          @for (s of statusFilters; track s.id) {
            <button
              type="button"
              class="filter-pill"
              [class.active]="selectedState() === s.id"
              (click)="changeFilter(s.id)"
            >
              {{ s.label }}
            </button>
          }
        </div>
      </header>

      @if (loading()) {
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Đang tải danh sách đơn hàng...</p>
        </div>
      } @else if (orders().length === 0) {
        <div class="empty-state">
          <p>Không có đơn hàng nào khớp với bộ lọc hiện tại.</p>
        </div>
      } @else {
        <div class="orders-table-card">
          <div class="table-header">
            <span>Mã đơn</span>
            <span>Khách hàng</span>
            <span>Số SP</span>
            <span>Tổng tiền</span>
            <span>Trạng thái</span>
            <span>Ngày tạo</span>
            <span>Thao tác</span>
          </div>

          @for (order of orders(); track order.id) {
            <div class="table-row">
              <span class="code-cell" [title]="order.code">#{{ order.code || order.id.slice(0, 8).toUpperCase() }}</span>
              <div class="customer-cell">
                <strong>{{ order.shippingSnapshot?.receiver || 'Khách vãng lai' }}</strong>
                <span>{{ order.shippingSnapshot?.phone || '' }}</span>
              </div>
              <span>{{ order.itemCount }} món</span>
              <strong class="price-cell">{{ order.money.payableTotal | currency:'VND':'symbol':'1.0-0' }}</strong>
              <div>
                <span class="status-badge" [class]="'status-' + order.state.toLowerCase()">
                  {{ order.state }}
                </span>
              </div>
              <span class="date-cell">{{ order.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
              <div class="actions-cell">
                <button type="button" class="btn-action" [disabled]="!auth.can('order.manage', order.assignedStaffId ?? null) || !canChangeStatus(order.state)" (click)="openStatusModal(order)">Đổi trạng thái</button>
                <button type="button" class="btn-action" [disabled]="!auth.can('shipment.manage', order.assignedStaffId ?? null) || !canUpdateShipment(order.state)" (click)="openShipmentModal(order)">Vận chuyển</button>
                @if (auth.isAdmin()) {
                  <button type="button" class="btn-action btn-assign" (click)="openAssignModal(order)">Phân công</button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Assign Staff Modal (PATCH /admin/orders/:orderId/assign) -->
    <fc-modal
      [isOpen]="assignModalOpen()"
      title="Phân công nhân sự xử lý đơn hàng"
      maxWidth="500px"
      (close)="assignModalOpen.set(false)"
    >
      <div class="modal-form-content">
        @if (selectedOrder(); as o) {
          <div class="order-summary-box">
            <p><strong>Mã đơn:</strong> #{{ o.code || o.id.slice(0, 8).toUpperCase() }}</p>
            <p><strong>Người nhận:</strong> {{ o.shippingSnapshot?.receiver || 'Khách vãng lai' }} ({{ o.shippingSnapshot?.phone }})</p>
            <p><strong>Giá trị:</strong> {{ o.money.payableTotal | currency:'VND':'symbol':'1.0-0' }}</p>
          </div>

          <label>
            Chọn nhân viên phụ trách:
            <select [(ngModel)]="selectedStaffId">
              <option value="">-- Chọn nhân viên (Staff) --</option>
              @for (st of staffList(); track st.id) {
                <option [value]="st.id">{{ st.fullName }} ({{ st.email }})</option>
              }
            </select>
            @if (staffList().length < staffTotal()) {
              <button type="button" class="btn-outline" (click)="loadStaff()" [disabled]="loadingStaff()">Tải thêm nhân viên</button>
            }
          </label>

          <label>
            Hoặc nhập trực tiếp mã nhân sự (Staff ID):
            <input type="text" [(ngModel)]="customStaffId" placeholder="24 ký tự hex ID của nhân viên..." />
          </label>

          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="assignModalOpen.set(false)">Hủy</button>
            <button
              type="button"
              class="btn-primary"
              [disabled]="saving() || (!selectedStaffId && !customStaffId.trim())"
              (click)="saveAssign()"
            >
              {{ saving() ? 'Đang phân công...' : 'Xác nhận phân công' }}
            </button>
          </div>
        }
      </div>
    </fc-modal>

    <!-- Status Change Modal -->
    <fc-modal
      [isOpen]="statusModalOpen()"
      title="Cập nhật trạng thái đơn hàng"
      (close)="statusModalOpen.set(false)"
    >
      <div class="modal-form-content">
        @if (selectedOrder(); as o) {
          <p>Đơn hàng: <strong>#{{ o.code || o.id.slice(0, 8).toUpperCase() }}</strong></p>
          <label>
            Trạng thái mới:
            <select [(ngModel)]="newStatus">
              @for (next of nextStatuses(o.state); track next) {
                <option [value]="next">{{ next === 'CANCELLED' ? 'Hủy đơn hàng' : next === 'CONFIRMED' ? 'Đã thanh toán' : next === 'PREPARING' ? 'Đang đóng gói' : next === 'SHIPPING' ? 'Đang giao' : 'Đã giao' }}</option>
              }
            </select>
          </label>

          <label>
            Lý do cập nhật:
            <textarea [(ngModel)]="statusReason" rows="3" placeholder="Ghi chú lý do chuyển trạng thái..."></textarea>
          </label>

          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="statusModalOpen.set(false)">Hủy</button>
            <button type="button" class="btn-primary" [disabled]="saving()" (click)="saveStatus()">
              {{ saving() ? 'Đang lưu...' : 'Xác nhận đổi trạng thái' }}
            </button>
          </div>
        }
      </div>
    </fc-modal>

    <!-- Shipment Modal -->
    <fc-modal
      [isOpen]="shipmentModalOpen()"
      title="Cập nhật thông tin vận chuyển"
      (close)="shipmentModalOpen.set(false)"
    >
      <div class="modal-form-content">
        <label>
          Đơn vị vận chuyển:
          <input type="text" [(ngModel)]="carrier" placeholder="GHTK, Viettel Post, GHN..." />
        </label>

        <label>
          Mã vận đơn (Tracking code):
          <input type="text" [(ngModel)]="trackingCode" placeholder="Mã vận đơn hãng vận chuyển..." />
        </label>

        <label>
          Tình trạng vận chuyển:
          <select [(ngModel)]="shipmentStatus">
            <option value="READY">READY (Sẵn sàng lấy hàng)</option>
            <option value="PICKED_UP">PICKED_UP (Đã bàn giao bưu tá)</option>
            <option value="IN_TRANSIT">IN_TRANSIT (Đang luân chuyển)</option>
            <option value="DELIVERED">DELIVERED (Giao thành công)</option>
            <option value="FAILED">FAILED (Giao thất bại)</option>
          </select>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="shipmentModalOpen.set(false)">Hủy</button>
          <button type="button" class="btn-primary" [disabled]="saving()" (click)="saveShipment()">
            {{ saving() ? 'Đang lưu...' : 'Lưu thông tin vận chuyển' }}
          </button>
        </div>
      </div>
    </fc-modal>

    <fc-pagination label="Phân trang" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />
`,
  styles: [`
    .admin-orders-container {
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
    .status-filter-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .filter-pill {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.8rem;
      cursor: pointer;
      color: #555;
      font-weight: 500;
      transition: all 0.15s;
    }
    .filter-pill.active {
      background: var(--color-text);
      color: var(--color-surface);
      border-color: var(--color-text);
    }
    .orders-table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow-x: auto;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .table-header {
      display: grid;
      grid-template-columns: 1.2fr 1.8fr 1fr 1.2fr 1.2fr 1.4fr 2fr;
      min-width: 1080px;
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
      grid-template-columns: 1.2fr 1.8fr 1fr 1.2fr 1.2fr 1.4fr 2fr;
      min-width: 1080px;
      padding: 14px 16px;
      border-bottom: 1px solid #f6f5f2;
      align-items: center;
      font-size: 0.88rem;
    }
    .code-cell {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: monospace;
      font-weight: 600;
      color: var(--color-text);
    }
    .customer-cell {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .customer-cell strong {
      color: var(--color-text);
    }
    .customer-cell span {
      font-size: 0.78rem;
      color: var(--color-muted);
    }
    .price-cell {
      color: var(--color-accent);
    }
    .status-badge {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
    }
    .status-pending_payment { background: #fff8e1; color: var(--color-warning); }
    .status-confirmed { background: #e8f5e9; color: #2e7d32; }
    .status-preparing { background: #e3f2fd; color: #1565c0; }
    .status-shipping { background: #ede7f6; color: #512da8; }
    .status-delivered { background: #e8f5e9; color: #1b5e20; }
    .status-cancelled { background: #ffebee; color: #c62828; }
    .status-cancel_pending_refund { background: #fff3e0; color: #e65100; }

    .date-cell {
      font-size: 0.8rem;
      color: var(--color-muted);
    }
    .actions-cell {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .btn-action {
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      padding: 4px 10px;
      border-radius: var(--radius-control);
      font-size: 0.78rem;
      cursor: pointer;
      font-weight: 500;
    }
    .btn-action:hover {
      background: var(--color-divider);
    }
    .btn-action:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-action.btn-assign {
      background: #f4efe9;
      color: #745136;
      border-color: #dfd4c5;
    }
    .order-summary-box {
      background: var(--color-canvas);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      padding: 12px;
      font-size: 0.85rem;
      line-height: 1.6;
    }
    .order-summary-box p {
      margin: 0;
    }
    .modal-form-content {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .modal-form-content label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: #444;
    }
    .modal-form-content input, .modal-form-content select, .modal-form-content textarea {
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
export class AdminOrdersPage implements OnInit {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadOrders(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly statusFilters = [
    { id: '', label: 'Tất cả' },
    { id: 'PENDING_PAYMENT', label: 'Chờ thanh toán' },
    { id: 'CONFIRMED', label: 'Đã xác nhận' },
    { id: 'PREPARING', label: 'Đang chuẩn bị' },
    { id: 'SHIPPING', label: 'Đang giao' },
    { id: 'DELIVERED', label: 'Đã giao' },
    { id: 'CANCELLED', label: 'Đã hủy' },
  ];

  readonly selectedState = signal<string>('');
  readonly orders = signal<AdminOrderSummary[]>([]);
  readonly loading = signal<boolean>(true);

  readonly statusModalOpen = signal<boolean>(false);
  readonly shipmentModalOpen = signal<boolean>(false);
  readonly assignModalOpen = signal<boolean>(false);
  readonly selectedOrder = signal<AdminOrderSummary | null>(null);
  readonly saving = signal<boolean>(false);

  // Staff assignment (PATCH /admin/orders/:orderId/assign)
  readonly staffList = signal<UserSummary[]>([]);
  readonly staffTotal = signal(0);
  readonly loadingStaff = signal(false);
  private staffPage = 0;
  selectedStaffId = '';
  customStaffId = '';

  newStatus = 'CONFIRMED';
  statusReason = '';

  carrier = '';
  trackingCode = '';
  shipmentStatus: 'READY' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' = 'READY';

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading.set(true);
    this.pagination.load(() => this.api.adminListOrders(this.selectedState() || undefined, this.pagination.page(), this.pagination.limit), {
      next: (res) => {
        this.orders.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  changeFilter(stateId: string): void {
    this.selectedState.set(stateId);
    this.pagination.reset();
    this.loadOrders();
  }

  nextStatuses(state: OrderStatus): string[] {
    switch (state) {
      case 'PENDING_PAYMENT': return ['CONFIRMED', 'CANCELLED'];
      case 'CONFIRMED': return ['PREPARING', 'CANCELLED'];
      case 'PREPARING': return ['SHIPPING', 'CANCELLED'];
      case 'SHIPPING': return ['DELIVERED'];
      default: return [];
    }
  }

  canChangeStatus(state: OrderStatus): boolean { return this.nextStatuses(state).length > 0; }
  canUpdateShipment(state: OrderStatus): boolean { return ['CONFIRMED', 'PREPARING', 'SHIPPING'].includes(state); }

  // --- Assign Staff (PATCH /admin/orders/:orderId/assign) ---
  openAssignModal(order: AdminOrderSummary): void {
    this.selectedOrder.set(order);
    this.selectedStaffId = (order as any).assignedStaffId || '';
    this.customStaffId = '';
    this.assignModalOpen.set(true);

    if (this.staffList().length === 0) {
      this.loadStaff();
    }
  }

  loadStaff(): void {
    if (this.loadingStaff()) return;
    this.loadingStaff.set(true);
    this.api.adminListUsers(this.staffPage + 1, 50, 'STAFF').subscribe({
      next: res => { this.staffPage++; this.staffTotal.set(res.total); this.staffList.update(rows => [...rows, ...res.items]); this.loadingStaff.set(false); },
      error: () => { this.loadingStaff.set(false); this.toast.error('Không thể tải danh sách nhân sự.'); },
    });
  }

  saveAssign(): void {
    const o = this.selectedOrder();
    const staffId = this.selectedStaffId || this.customStaffId.trim();
    if (!o || !staffId) return;

    this.saving.set(true);
    // PATCH /admin/orders/:orderId/assign
    this.api.adminAssignStaff(o.id, staffId).subscribe({
      next: () => {
        this.saving.set(false);
        this.assignModalOpen.set(false);
        this.toast.success('Đã phân công nhân viên phụ trách đơn hàng thành công.');
        this.loadOrders();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể phân công nhân viên.');
      },
    });
  }

  openStatusModal(order: AdminOrderSummary): void {
    this.selectedOrder.set(order);
    this.newStatus = this.nextStatuses(order.state)[0] || '';
    this.statusReason = '';
    this.statusModalOpen.set(true);
  }

  saveStatus(): void {
    const o = this.selectedOrder();
    if (!o) return;

    this.saving.set(true);
    const reason = this.statusReason.trim() || 'Nhân viên cập nhật trạng thái';
    const request = this.newStatus === 'CANCELLED'
      ? this.api.cancelOrder(o.id, reason, crypto.randomUUID())
      : this.api.adminUpdateOrderStatus(o.id, this.newStatus, reason);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.statusModalOpen.set(false);
        this.toast.success('Đã cập nhật trạng thái đơn hàng.');
        this.loadOrders();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật trạng thái.');
      },
    });
  }

  openShipmentModal(order: AdminOrderSummary): void {
    this.selectedOrder.set(order);
    this.carrier = '';
    this.trackingCode = '';
    this.shipmentStatus = 'READY';
    this.shipmentModalOpen.set(true);
    this.api.getOrder(order.id).subscribe({
      next: detail => {
        this.carrier = detail.shipment?.carrier || '';
        this.trackingCode = detail.shipment?.trackingCode || '';
        this.shipmentStatus = (detail.shipment?.status as typeof this.shipmentStatus) || 'READY';
      },
      error: () => this.toast.error('Không thể tải thông tin vận chuyển hiện tại.'),
    });
  }

  saveShipment(): void {
    const o = this.selectedOrder();
    if (!o) return;

    this.saving.set(true);
    this.api.adminUpdateShipment(o.id, {
      carrier: this.carrier,
      trackingCode: this.trackingCode,
      status: this.shipmentStatus,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.shipmentModalOpen.set(false);
        this.toast.success('Đã cập nhật thông tin vận chuyển.');
        this.loadOrders();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể lưu thông tin vận chuyển.');
      },
    });
  }
}
