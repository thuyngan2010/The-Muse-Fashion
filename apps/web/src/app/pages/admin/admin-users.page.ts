import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { UserSummary, StaffPermissionName, StaffPermissionGrant } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';

interface PermissionConfigItem {
  name: StaffPermissionName;
  label: string;
  desc: string;
}

const ALL_STAFF_PERMISSIONS: PermissionConfigItem[] = [
  { name: 'catalog.manage', label: 'Quản lý Catalog', desc: 'Thêm, sửa danh mục, sản phẩm và biến thể' },
  { name: 'inventory.manage', label: 'Quản lý Kho hàng', desc: 'Kiểm kê và điều chỉnh số lượng tồn kho' },
  { name: 'order.read', label: 'Xem Đơn hàng', desc: 'Xem danh sách và chi tiết đơn hàng khách đặt' },
  { name: 'order.manage', label: 'Xử lý Đơn hàng', desc: 'Cập nhật tiến trình xác nhận, chuẩn bị đơn' },
  { name: 'order.cancel', label: 'Hủy Đơn hàng', desc: 'Được phép hủy đơn hàng theo yêu cầu' },
  { name: 'shipment.manage', label: 'Vận chuyển', desc: 'Cập nhật hãng vận chuyển và mã vận đơn' },
  { name: 'payment.read', label: 'Xem Thanh toán', desc: 'Xem giao dịch và lịch sử thanh toán' },
  { name: 'refund.propose', label: 'Đề xuất Hoàn tiền', desc: 'Tạo phiếu đề xuất hoàn tiền khách trả hàng' },
  { name: 'content.moderate', label: 'Kiểm duyệt Nội dung', desc: 'Quản lý bài viết và bình luận cộng đồng' },
];

@Component({
  standalone: true,
  imports: [PaginationComponent, DatePipe, FormsModule, ModalComponent],
  template: `
    <div class="admin-users-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Người dùng & Nhân sự</h1>
          <p class="page-desc">Quản lý tài khoản khách hàng, tạo lời mời nhân viên vận hành và phân quyền truy cập chi tiết.</p>
        </div>
        <button type="button" class="btn-primary" (click)="openStaffModal()">+ Mời nhân viên mới</button>
      </header>

      @if (loading()) {
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Đang tải danh sách người dùng...</p>
        </div>
      } @else if (users().length === 0) {
        <div class="empty-state">
          <p>Chưa có tài khoản người dùng nào.</p>
        </div>
      } @else {
        <div class="table-card">
          <div class="table-header">
            <span>Họ và tên</span>
            <span>Email</span>
            <span>Vai trò</span>
            <span>Trạng thái</span>
            <span>Ngày đăng ký</span>
            <span>Thao tác</span>
          </div>

          @for (u of users(); track u.id) {
            <div class="table-row">
              <strong class="name-cell">{{ u.fullName }}</strong>
              <span class="email-cell">{{ u.email }}</span>
              <div>
                <span class="role-pill" [class]="'role-' + u.role.toLowerCase()">{{ u.role }}</span>
              </div>
              <div>
                <span class="status-pill" [class.active]="u.status === 'ACTIVE'">{{ u.status }}</span>
              </div>
              <span class="date-cell">{{ u.createdAt | date:'dd/MM/yyyy' }}</span>
              <div class="actions-cell">
                @if (u.role === 'STAFF') {
                  <button type="button" class="btn-action btn-perm" (click)="openPermissionsModal(u)">Phân quyền</button>
                  <button type="button" class="btn-action" (click)="resendInvitation(u.id)">Gửi lại thư mời</button>
                }
                @if (u.status === 'ACTIVE') {
                  <button type="button" class="btn-action danger" (click)="toggleStatus(u, 'SUSPENDED')">Khóa</button>
                } @else if (u.status === 'SUSPENDED') {
                  <button type="button" class="btn-action success" (click)="toggleStatus(u, 'ACTIVE')">Mở khóa</button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Staff Permissions Modal (POST /admin/staff/:staffId/permissions & PATCH /admin/staff/:staffId/permissions) -->
    <fc-modal
      [isOpen]="permissionsModalOpen()"
      title="Phân quyền nhân sự vận hành"
      maxWidth="680px"
      (close)="permissionsModalOpen.set(false)"
    >
      @if (selectedStaff(); as st) {
        <div class="perm-modal-body">
          <div class="staff-header-info">
            <p><strong>Nhân viên:</strong> {{ st.fullName }} (<code>{{ st.email }}</code>)</p>
            <p class="hint-text">Chọn quyền hạn và phạm vi áp dụng (GLOBAL: toàn hệ thống, ASSIGNED: chỉ đơn phụ trách).</p>
          </div>

          <div class="permissions-list">
            @for (perm of availablePermissions; track perm.name) {
              <div class="perm-item" [class.enabled]="permState[perm.name]?.enabled">
                <div class="perm-main">
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      [checked]="permState[perm.name]?.enabled"
                      (change)="togglePerm(perm.name, $event)"
                    />
                    <div>
                      <strong class="perm-title">{{ perm.label }}</strong>
                      <span class="perm-code">({{ perm.name }})</span>
                      <p class="perm-desc">{{ perm.desc }}</p>
                    </div>
                  </label>
                </div>

                @if (permState[perm.name]?.enabled) {
                  <div class="scope-box">
                    <span class="scope-lbl">Phạm vi:</span>
                    <select [(ngModel)]="permState[perm.name].scope" class="scope-select">
                      <option value="GLOBAL">GLOBAL (Toàn sàn)</option>
                      <option value="ASSIGNED">ASSIGNED (Được giao)</option>
                    </select>
                  </div>
                }
              </div>
            }
          </div>

          <div class="perm-actions">
            <button type="button" class="btn-outline" (click)="permissionsModalOpen.set(false)">Đóng</button>
            <button
              type="button"
              class="btn-sub-save"
              [disabled]="savingPerms() || loadingPerms()"
              (click)="savePermissions('grant')"
              title="Bổ sung quyền đã chọn, giữ lại các quyền hiện có"
            >
              {{ savingPerms() ? 'Đang lưu...' : '+ Thêm quyền' }}
            </button>
            <button
              type="button"
              class="btn-primary"
              [disabled]="savingPerms() || loadingPerms()"
              (click)="savePermissions('replace')"
              title="Thay toàn bộ quyền hiện có bằng những quyền đang được chọn"
            >
              {{ savingPerms() ? 'Đang lưu...' : 'Lưu thay thế quyền' }}
            </button>
          </div>
        </div>
      }
    </fc-modal>

    <!-- Invite Staff Modal -->
    <fc-modal
      [isOpen]="staffModalOpen()"
      title="Mời nhân viên vận hành mới"
      (close)="staffModalOpen.set(false)"
    >
      <form (ngSubmit)="saveStaff()" class="modal-form">
        <label>
          Họ và tên nhân viên *
          <input type="text" [(ngModel)]="staffName" name="fullName" placeholder="VD: Trần Thị B" required />
        </label>

        <label>
          Email công việc *
          <input type="email" [(ngModel)]="staffEmail" name="email" placeholder="staff@fashioncommerce.com" required />
        </label>

        <p class="modal-hint">
          Hệ thống sẽ khởi tạo tài khoản nhân viên và gửi email kích hoạt cùng hướng dẫn đăng nhập.
        </p>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="staffModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || !staffName || !staffEmail">
            {{ saving() ? 'Đang gửi...' : 'Gửi lời mời nhân viên' }}
          </button>
        </div>
      </form>
    </fc-modal>

    <fc-pagination label="Phân trang" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />
`,
  styles: [`
    .admin-users-container {
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
      overflow-x: auto;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .table-header {
      display: grid;
      grid-template-columns: minmax(160px, 1.6fr) minmax(220px, 2fr) 95px 160px 115px 230px;
      column-gap: 12px;
      min-width: 1050px;
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
      grid-template-columns: minmax(160px, 1.6fr) minmax(220px, 2fr) 95px 160px 115px 230px;
      column-gap: 12px;
      min-width: 1050px;
      padding: 14px 16px;
      border-bottom: 1px solid #f6f5f2;
      align-items: center;
      font-size: 0.88rem;
    }
    .name-cell {
      color: var(--color-text);
    }
    .email-cell {
      color: #555;
      overflow-wrap: anywhere;
    }
    .role-pill {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .role-admin { background: #ede7f6; color: #512da8; }
    .role-staff { background: #e3f2fd; color: #1565c0; }
    .role-customer { background: var(--color-canvas); color: var(--color-muted); border: 1px solid #eee; }

    .status-pill {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 10px;
      background: #ffebee;
      color: #c62828;
      font-weight: 600;
      white-space: nowrap;
    }
    .status-pill.active {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .date-cell {
      font-size: 0.82rem;
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
      padding: 4px 8px;
      border-radius: var(--radius-control);
      font-size: 0.78rem;
      cursor: pointer;
    }
    .btn-action.btn-perm {
      background: #f4efe9;
      color: #745136;
      border-color: #dfd4c5;
      font-weight: 600;
    }
    .btn-action.danger { color: #c62828; border-color: #ef9a9a; }
    .btn-action.success { color: #2e7d32; border-color: #a5d6a7; }

    /* Permissions Modal Styles */
    .perm-modal-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .staff-header-info {
      background: var(--color-canvas);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      padding: 12px 14px;
      font-size: 0.88rem;
    }
    .staff-header-info p {
      margin: 0 0 4px;
    }
    .hint-text {
      font-size: 0.8rem;
      color: var(--color-muted);
      margin: 0 !important;
    }
    .permissions-list {
      max-height: 420px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
    }
    .perm-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      gap: 12px;
      transition: background 0.15s;
    }
    .perm-item.enabled {
      background: #fbf9f6;
      border-color: #c9ab8d;
    }
    .checkbox-label {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      cursor: pointer;
      font-size: 0.88rem;
    }
    .checkbox-label input[type="checkbox"] {
      margin-top: 3px;
      width: 16px;
      height: 16px;
      accent-color: var(--color-text);
    }
    .perm-title {
      color: var(--color-text);
      font-size: 0.88rem;
    }
    .perm-code {
      font-family: monospace;
      font-size: 0.78rem;
      color: var(--color-muted);
      margin-left: 6px;
    }
    .perm-desc {
      font-size: 0.78rem;
      color: var(--color-muted);
      margin: 2px 0 0;
    }
    .scope-box {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .scope-lbl {
      font-size: 0.78rem;
      color: var(--color-muted);
    }
    .scope-select {
      font-size: 0.78rem;
      padding: 4px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      background: var(--color-surface);
    }
    .perm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--color-divider);
    }
    .btn-sub-save {
      padding: 8px 14px;
      background: #f4efe9;
      color: #745136;
      border: 1px solid #dfd4c5;
      border-radius: var(--radius-control);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
    }
    .btn-sub-save:hover {
      background: #ece3d8;
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
    .modal-hint {
      font-size: 0.8rem;
      color: var(--color-muted);
      line-height: 1.5;
      margin: 0;
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
    .perm-main { display:grid; gap:8px; min-width:0; overflow-wrap:anywhere; }

  `],
})
export class AdminUsersPage implements OnInit {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadUsers(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly users = signal<UserSummary[]>([]);
  readonly loading = signal<boolean>(true);

  readonly staffModalOpen = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  // Staff Permissions Modal (POST /admin/staff/:staffId/permissions & PATCH /admin/staff/:staffId/permissions)
  readonly permissionsModalOpen = signal<boolean>(false);
  readonly selectedStaff = signal<UserSummary | null>(null);
  readonly savingPerms = signal<boolean>(false);
  readonly loadingPerms = signal(false);
  readonly availablePermissions = ALL_STAFF_PERMISSIONS;

  permState: Record<string, { enabled: boolean; scope: 'GLOBAL' | 'ASSIGNED' }> = {};

  staffName = '';
  staffEmail = '';

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.pagination.load(() => this.api.adminListUsers(this.pagination.page(), this.pagination.limit), {
      next: (res) => {
        this.users.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openStaffModal(): void {
    this.staffName = '';
    this.staffEmail = '';
    this.staffModalOpen.set(true);
  }

  saveStaff(): void {
    if (!this.staffName || !this.staffEmail) return;

    this.saving.set(true);
    this.api.adminCreateStaff({
      fullName: this.staffName,
      email: this.staffEmail,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.staffModalOpen.set(false);
        this.toast.success('Đã gửi thư mời nhân viên mới.');
        this.loadUsers();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo tài khoản nhân viên.');
      },
    });
  }

  resendInvitation(staffId: string): void {
    this.api.adminResendStaffInvitation(staffId).subscribe({
      next: () => {
        this.toast.success('Đã gửi lại email kích hoạt nhân viên.');
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể gửi lại lời mời.');
      },
    });
  }

  toggleStatus(user: UserSummary, newStatus: 'ACTIVE' | 'SUSPENDED'): void {
    this.api.adminUpdateUserStatus(user.id, newStatus).subscribe({
      next: (updated) => {
        this.users.update((list) =>
          list.map((u) => (u.id === user.id ? { ...u, status: updated.status } : u))
        );
        this.toast.success(`Đã cập nhật trạng thái người dùng thành: ${newStatus}`);
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể cập nhật trạng thái.');
      },
    });
  }

  // --- Permissions Management ---
  openPermissionsModal(staff: UserSummary): void {
    this.selectedStaff.set(staff);

    // Initialize all permission states
    const initial: Record<string, { enabled: boolean; scope: 'GLOBAL' | 'ASSIGNED' }> = {};
    for (const p of this.availablePermissions) {
      initial[p.name] = { enabled: false, scope: 'GLOBAL' };
    }
    this.permState = initial;
    this.permissionsModalOpen.set(true);
    this.loadingPerms.set(true);
    this.api.adminGetStaffPermissions(staff.id).subscribe({
      next: result => {
        if (this.selectedStaff()?.id !== staff.id) return;
        for (const grant of result.grants) {
          const current = initial[grant.permission];
          if (current) initial[grant.permission] = { enabled: true,
            scope: current.enabled && current.scope === 'GLOBAL' ? 'GLOBAL' : grant.scope };
        }
        this.permState = initial;
        this.loadingPerms.set(false);
      },
      error: () => { this.loadingPerms.set(false); this.permissionsModalOpen.set(false); this.toast.error('Không thể tải quyền hiện tại.'); },
    });
  }

  togglePerm(name: StaffPermissionName, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (this.permState[name]) {
      this.permState[name].enabled = checked;
    }
  }

  savePermissions(mode: 'grant' | 'replace'): void {
    if (this.loadingPerms() || this.savingPerms()) return;
    const st = this.selectedStaff();
    if (!st) return;

    const grants: StaffPermissionGrant[] = [];
    for (const p of this.availablePermissions) {
      const state = this.permState[p.name];
      if (state && state.enabled) {
        grants.push({
          permission: p.name,
          scope: state.scope,
        });
      }
    }

    this.savingPerms.set(true);

    const call$ = mode === 'grant'
      // POST /admin/staff/:staffId/permissions
      ? this.api.adminGrantStaffPermissions(st.id, grants)
      // PATCH /admin/staff/:staffId/permissions
      : this.api.adminReplaceStaffPermissions(st.id, grants);

    call$.subscribe({
      next: (res) => {
        this.savingPerms.set(false);
        this.permissionsModalOpen.set(false);
        const count = res.grants?.length ?? grants.length;
        this.toast.success(`Đã lưu ${count} quyền cho nhân viên ${st.fullName}.`);
      },
      error: (err) => {
        this.savingPerms.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật quyền nhân viên.');
      },
    });
  }
}
