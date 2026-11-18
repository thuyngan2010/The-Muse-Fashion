import { PaginationComponent } from '../../components/pagination.component';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, forkJoin, map, of } from 'rxjs';
import type { UserSummary, StaffPermissionName, StaffPermissionGrant } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { AdminReportTabsComponent } from '../../components/admin-report-tabs.component';
import { roleLabel, userStatusLabel } from '../../shared/labels';

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

type Scope = 'GLOBAL' | 'ASSIGNED';
type PermState = Record<string, { enabled: boolean; scope: Scope }>;
type RowPerms = StaffPermissionGrant[] | 'loading' | 'error';

function csvCell(value: string | number): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

@Component({
  standalone: true,
  imports: [PaginationComponent, FormsModule, ModalComponent, AdminDrawerComponent, AdminReportTabsComponent],
  template: `
    <div class="au">
      <fc-admin-report-tabs active="users" />

      <header class="head">
        <div>
          <h1 class="title">Báo cáo và Phân quyền</h1>
          <p class="sub">Quản lý tài khoản nhân viên và quyền truy cập theo từng chức năng.</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn-outline" [disabled]="rows().length === 0" (click)="exportCsv()">Xuất danh sách</button>
          <button type="button" class="btn-primary" (click)="openStaffModal()">+ Thêm nhân viên mới</button>
        </div>
      </header>

      <section class="kpis" aria-label="Quy mô nhân sự">
        <div class="kpi">
          <span class="kpi-label">Tổng nhân sự</span>
          <span class="kpi-value">{{ totalStaffAll() === null ? '—' : totalStaffAll()!.toLocaleString('vi-VN') }}</span>
          <span class="kpi-note">Tài khoản quản trị và nhân viên đang hoạt động{{ search().trim() ? ', khớp từ khóa' : '' }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Quản trị viên</span>
          <span class="kpi-value">{{ adminTotal() === null ? '—' : adminTotal()!.toLocaleString('vi-VN') }}</span>
          <span class="kpi-note">Toàn quyền hệ thống</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Nhân viên vận hành</span>
          <span class="kpi-value">{{ staffTotal() === null ? '—' : staffTotal()!.toLocaleString('vi-VN') }}</span>
          <span class="kpi-note">Phân quyền chi tiết theo chức năng</span>
        </div>
      </section>
      <div class="filters">
        <label class="sr-only" for="staff-search">Tìm nhân viên</label>
        <input id="staff-search" type="search" class="f-input" [ngModel]="search()" (ngModelChange)="onSearch($event)" name="staffsearch" placeholder="Tìm theo tên hoặc email…" autocomplete="off" />
        <label class="sr-only" for="staff-status">Lọc theo trạng thái</label>
        <select id="staff-status" class="f-input f-select" [ngModel]="statusFilter()" (ngModelChange)="setStatusFilter($event)" name="staffstatus">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="ACTIVE">{{ userStatusText('ACTIVE') }}</option>
          <option value="PENDING_VERIFICATION">Chờ kích hoạt</option>
          <option value="SUSPENDED">{{ userStatusText('SUSPENDED') }}</option>
        </select>
      </div>

      @if (loading() && rows().length === 0) {
        <div class="state-box" role="status"><span class="spinner"></span><p>Đang tải danh sách nhân sự…</p></div>
      } @else if (error()) {
        <div class="state-box" role="alert"><p>{{ error() }}</p><button type="button" class="btn-outline" (click)="load()">Thử lại</button></div>
      } @else if (rows().length === 0) {
        <div class="state-box"><p>{{ search().trim() || statusFilter() !== 'ALL' ? 'Không có tài khoản nào khớp tìm kiếm hoặc bộ lọc.' : 'Chưa có tài khoản nhân sự nào.' }}</p></div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Nhân viên</th><th>Email hệ thống</th><th>Vai trò</th><th>Trạng thái</th><th>Quyền hạn đã gán</th><th>Phạm vi</th><th class="c-act">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              @for (u of rows(); track u.id) {
                <tr>
                  <td>
                    <div class="who">
                      <span class="avatar" aria-hidden="true">{{ initial(u) }}</span>
                      <span class="strong">{{ u.fullName || '—' }}</span>
                    </div>
                  </td>
                  <td class="email">{{ u.email }}</td>
                  <td><span class="badge" [class]="'role-' + u.role.toLowerCase()">{{ roleText(u.role) }}</span></td>
                  <td><span class="badge" [class]="'us-' + u.status.toLowerCase()">{{ statusText(u) }}</span></td>
                  <td class="perm-cell">
                    @if (u.role === 'ADMIN') {
                      <strong>Toàn quyền</strong><span class="sub-line">{{ allPermissions.length }}/{{ allPermissions.length }} quyền</span>
                    } @else {
                      @let g = grantsOf(u);
                      @if (g === 'loading') { <span class="muted">Đang tải…</span> }
                      @else if (g === 'error') { <span class="muted">Không tải được quyền</span> }
                      @else if (g.length === 0) { <span class="muted">Chưa cấp quyền</span> }
                      @else {
                        <strong>{{ g.length }} quyền cấp phát</strong>
                        <span class="sub-line" [attr.title]="codesOf(g)">{{ shortCodes(g) }}</span>
                      }
                    }
                  </td>
                  <td>{{ scopeText(u) }}</td>
                  <td class="c-act">
                    <div class="acts">
                      @if (u.role === 'STAFF') { <button type="button" class="link-btn" (click)="openPermissions(u)">Sửa quyền</button> }
                      @if (u.role === 'STAFF' && u.status === 'PENDING_VERIFICATION') {
                        <button type="button" class="link-btn" [disabled]="resendingId() === u.id" (click)="resendInvitation(u)">Gửi lại lời mời</button>
                      }
                      @if (u.status === 'ACTIVE') {
                        @if (isSelf(u)) {
                          <button type="button" class="link-btn danger" disabled title="Không thể khóa tài khoản đang đăng nhập">Khóa</button>
                        } @else {
                          <button type="button" class="link-btn danger" (click)="lockTarget.set(u)">Khóa</button>
                        }
                      } @else if (u.status === 'SUSPENDED') {
                        <button type="button" class="link-btn" [disabled]="busyId() === u.id" (click)="setStatus(u, 'ACTIVE')">Mở khóa</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="note">Phân trang theo nhân viên đang hoạt động.</p>
        <fc-pagination label="nhân viên" [page]="page()" [total]="listTotal()" [limit]="limit" [loading]="loading()" (pageChange)="pageChanged($event)" />
      }
    </div>

    <!-- Drawer phân quyền (GET/POST/PATCH /admin/staff/:staffId/permissions) -->
    <fc-admin-drawer [isOpen]="permOpen()" eyebrow="Phân quyền nhân viên" [title]="selectedStaff()?.fullName || 'Phân quyền'" [subtitle]="selectedStaff()?.email || ''" width="460px" (close)="closePermissions()">
      @if (loadingPerms()) {
        <p class="muted pad">Đang tải quyền hiện tại…</p>
      } @else {
        <section class="scope-box" aria-label="Phạm vi áp dụng">
          <span class="box-label">Phạm vi áp dụng</span>
          <p class="note">Mỗi quyền có phạm vi riêng: <strong>Toàn bộ</strong> (mọi đơn hàng, kho, mã hàng) hoặc <strong>Được giao</strong> (chỉ đơn quản trị viên giao cho nhân viên).</p>
          <div class="quick">
            <button type="button" class="btn-outline sm" (click)="applyScopeAll('GLOBAL')">Áp dụng Toàn bộ cho tất cả</button>
            <button type="button" class="btn-outline sm" (click)="applyScopeAll('ASSIGNED')">Áp dụng Được giao cho tất cả</button>
          </div>
        </section>

        <div class="perm-head">
          <span class="box-label">Danh mục quyền hạn ({{ allPermissions.length }} mã chuẩn)</span>
          <span class="granted">Đã cấp {{ grantedCount() }}/{{ allPermissions.length }} quyền</span>
        </div>
        <div class="perm-list">
          @for (perm of allPermissions; track perm.name) {
            <div class="perm" [class.on]="perm$(perm.name).enabled">
              <label class="perm-main">
                <input type="checkbox" [checked]="perm$(perm.name).enabled" (change)="togglePerm(perm.name, $event)" />
                <span>
                  <strong class="perm-title">{{ perm.label }}</strong>
                  <code class="perm-code">{{ perm.name }}</code>
                  <span class="perm-desc">{{ perm.desc }}</span>
                </span>
              </label>
              @if (perm$(perm.name).enabled) {
                <div class="seg" role="group" [attr.aria-label]="'Phạm vi của ' + perm.name">
                  <button type="button" [class.active]="perm$(perm.name).scope === 'GLOBAL'" [attr.aria-pressed]="perm$(perm.name).scope === 'GLOBAL'" (click)="setScope(perm.name, 'GLOBAL')">Toàn bộ</button>
                  <button type="button" [class.active]="perm$(perm.name).scope === 'ASSIGNED'" [attr.aria-pressed]="perm$(perm.name).scope === 'ASSIGNED'" (click)="setScope(perm.name, 'ASSIGNED')">Được giao</button>
                </div>
              }
            </div>
          }
        </div>

        <div class="notice" role="note">
          <strong>Lưu ý bảo mật:</strong> Không cho phép nhân viên tự cấp quyền cho chính mình. Không thể vô hiệu hóa quản trị viên hoạt động cuối cùng của hệ thống.
        </div>
        <p class="note">
          <strong>Bổ sung quyền đã chọn:</strong> giữ nguyên quyền hiện có và thêm những quyền đang chọn.
          <strong>Lưu phân quyền:</strong> thay toàn bộ quyền hiện có bằng đúng những quyền đang chọn.
        </p>
      }
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="closePermissions()">Hủy</button>
        <button type="button" class="btn-outline" [disabled]="savingPerms() || loadingPerms()" title="Giữ lại các quyền hiện có và thêm quyền đã chọn" (click)="savePermissions('grant')">
          {{ savingPerms() ? 'Đang lưu…' : 'Bổ sung quyền đã chọn' }}
        </button>
        <button type="button" class="btn-primary" [disabled]="savingPerms() || loadingPerms()" title="Thay toàn bộ quyền hiện có bằng những quyền đang chọn" (click)="savePermissions('replace')">
          {{ savingPerms() ? 'Đang lưu…' : 'Lưu phân quyền' }}
        </button>
      </div>
    </fc-admin-drawer>

    <!-- Drawer mời nhân viên (POST /admin/staff) -->
    <fc-admin-drawer [isOpen]="staffOpen()" eyebrow="Nhân viên" title="Thêm nhân viên mới" width="440px" (close)="staffOpen.set(false)">
      <form id="staff-form" (ngSubmit)="saveStaff()" class="dform" autocomplete="off">
        <label>Họ và tên nhân viên *
          <input type="text" [(ngModel)]="staffName" name="fullName" placeholder="VD: Trần Thị B" required />
        </label>
        <label>Email công việc *
          <input type="email" [(ngModel)]="staffEmail" name="email" placeholder="staff@fashioncommerce.com" required />
        </label>
        <p class="note">Hệ thống sẽ tạo tài khoản nhân viên và gửi email kích hoạt cùng hướng dẫn đăng nhập. Sau khi mời, hãy mở "Sửa quyền" để cấp quyền.</p>
      </form>
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="staffOpen.set(false)">Hủy</button>
        <button type="submit" form="staff-form" class="btn-primary" [disabled]="saving() || !staffName.trim() || !staffEmail.trim()">{{ saving() ? 'Đang gửi…' : 'Gửi lời mời nhân viên' }}</button>
      </div>
    </fc-admin-drawer>

    <fc-modal [isOpen]="!!lockTarget()" title="Khóa tài khoản" maxWidth="440px" (close)="lockTarget.set(null)">
      @if (lockTarget(); as t) {
        <p class="confirm-text">Tài khoản <strong>{{ t.fullName || t.email }}</strong> sẽ không thể đăng nhập cho đến khi được mở khóa. Bạn chắc chắn muốn khóa?</p>
        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="lockTarget.set(null)">Hủy</button>
          <button type="button" class="btn-primary" [disabled]="busyId() === t.id" (click)="confirmLock()">{{ busyId() === t.id ? 'Đang cập nhật…' : 'Khóa tài khoản' }}</button>
        </div>
      }
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .au { display: flex; flex-direction: column; gap: 16px; }
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
    .muted { color: var(--ui-subtle); font-size: 12px; } .pad { padding: 16px 0; }
    .filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .f-input, .dform input { box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .f-input { width: 100%; max-width: 380px; }
    .f-select { width: auto; max-width: 220px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 980px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .c-act { text-align: right; } .strong { font-weight: 600; color: var(--ui-ink); }
    .email { overflow-wrap: anywhere; }
    .sub-line { display: block; margin-top: 2px; font-size: 12px; color: var(--ui-subtle); max-width: 240px; overflow-wrap: anywhere; }
    .who { display: flex; align-items: center; gap: 12px; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--ui-pink-soft); color: var(--ui-accent); display: inline-flex; align-items: center; justify-content: center; font: 700 14px var(--font-sans); flex: none; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); white-space: nowrap; }
    .role-admin { background: var(--ui-ink); color: #fff; }
    .role-staff { background: var(--ui-info-bg); color: var(--ui-info); }
    .us-active { background: var(--ui-success-bg); color: var(--ui-success); }
    .us-pending_verification { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .us-suspended { background: var(--ui-danger-bg); color: var(--ui-danger); }
    .acts { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
    .link-btn { background: none; border: 0; padding: 4px 6px; color: var(--ui-accent); font: 700 12px/16px var(--font-sans); cursor: pointer; text-decoration: underline; }
    .link-btn.danger { color: var(--ui-danger); }
    .link-btn:disabled { opacity: .5; cursor: default; }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-outline.sm { padding: 6px 10px; font-size: 12px; }
    .scope-box { background: var(--ui-bg-soft); padding: 12px; border-radius: 4px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .box-label { font: 700 11px/14px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .quick { display: flex; gap: 8px; flex-wrap: wrap; }
    .perm-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
    .granted { font: 700 11px/14px var(--font-sans); color: var(--ui-accent); white-space: nowrap; }
    .perm-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .perm { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px; background: var(--ui-bg-soft); border-radius: 2px; opacity: .8; }
    .perm.on { opacity: 1; }
    .perm-main { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; min-width: 0; }
    .perm-main input { margin-top: 3px; accent-color: var(--ui-ink); }
    .perm-title { display: block; font-size: 13px; }
    .perm-code { display: block; font: 400 11px/14px ui-monospace, monospace; color: var(--ui-ink-soft); }
    .perm-desc { display: block; font-size: 11px; line-height: 14px; color: var(--ui-subtle); margin-top: 2px; }
    .seg { display: inline-flex; flex: none; border: 1px solid var(--ui-line); border-radius: 2px; overflow: hidden; }
    .seg button { border: 0; background: var(--ui-bg); padding: 5px 9px; font: 600 11px/14px var(--font-sans); color: var(--ui-ink-soft); cursor: pointer; }
    .seg button.active { background: var(--ui-ink); color: #fff; }
    .notice { background: var(--ui-pink-soft); padding: 12px; border-radius: 2px; font-size: 12px; line-height: 16px; margin-bottom: 12px; }
    .dform { display: flex; flex-direction: column; gap: 14px; }
    .dform label { display: flex; flex-direction: column; gap: 4px; font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); }
    .dform input { width: 100%; }
    .confirm-text { margin: 0 0 16px; font-size: 14px; line-height: 22px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
  `],
})
export class AdminUsersPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private loadSub?: Subscription;
  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();
  private firstParams = true;

  readonly limit = 20;
  readonly page = signal(1);
  readonly allPermissions = ALL_STAFF_PERMISSIONS;

  readonly rows = signal<UserSummary[]>([]);
  readonly adminTotal = signal<number | null>(null);
  readonly staffTotal = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'ALL' | 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED'>('ALL');
  readonly listTotal = signal(0);
  readonly rowPerms = signal<Record<string, RowPerms>>({});

  readonly staffOpen = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly resendingId = signal<string | null>(null);
  readonly lockTarget = signal<UserSummary | null>(null);

  readonly permOpen = signal(false);
  readonly selectedStaff = signal<UserSummary | null>(null);
  readonly savingPerms = signal(false);
  readonly loadingPerms = signal(false);
  readonly perm = signal<PermState>({});
  staffName = '';
  staffEmail = '';

  readonly totalStaffAll = computed(() => (this.adminTotal() === null || this.staffTotal() === null ? null : this.adminTotal()! + this.staffTotal()!));
  readonly grantedCount = computed(() => Object.values(this.perm()).filter(p => p.enabled).length);

  ngOnInit(): void {
    // Ô tìm: chờ 300ms sau khi ngừng gõ rồi ghi ?q= lên URL; URL đổi thì tải lại từ trang 1.
    this.subs.add(this.search$.pipe(map(v => v.trim()), debounceTime(300), distinctUntilChanged()).subscribe(value => this.patchUrl({ q: value || null })));
    this.subs.add(this.route.queryParamMap.subscribe(params => this.applyParams(params)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.loadSub?.unsubscribe();
  }

  private patchUrl(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private applyParams(params: ParamMap): void {
    const q = params.get('q')?.trim() ?? '';
    const raw = params.get('status');
    const status = raw === 'ACTIVE' || raw === 'PENDING_VERIFICATION' || raw === 'SUSPENDED' ? raw : 'ALL';
    const changed = this.firstParams || q !== this.search().trim() || status !== this.statusFilter();
    this.search.set(q);
    this.statusFilter.set(status);
    this.firstParams = false;
    if (changed) { this.page.set(1); this.load(); }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.search$.next(value);
  }

  setStatusFilter(value: 'ALL' | 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED'): void {
    this.statusFilter.set(value);
    this.patchUrl({ status: value === 'ALL' ? null : value });
  }

  userStatusText(status: string): string { return userStatusLabel(status); }

  /**
   * Nhân sự = quản trị viên + nhân viên. Danh sách lấy qua API với bộ lọc tên/email và trạng thái
   * (mặc định "Tất cả" gồm cả nhân viên chờ kích hoạt hoặc bị khóa). Quản trị viên chỉ ghép vào trang đầu.
   */
  load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    const first = this.page() === 1;
    const filter = { q: this.search().trim() || undefined, status: this.statusFilter() };
    this.loadSub = forkJoin({
      staff: this.api.adminListUsers(this.page(), this.limit, 'STAFF', filter),
      admins: first ? this.api.adminListUsers(1, 50, 'ADMIN', filter) : of(null),
    }).subscribe({
      next: ({ staff, admins }) => {
        this.listTotal.set(staff.total);
        this.staffTotal.set(staff.statusCounts?.ACTIVE ?? 0);
        if (admins) this.adminTotal.set(admins.statusCounts?.ACTIVE ?? 0);
        const seen = new Set<string>();
        const merged: UserSummary[] = [];
        const add = (u: UserSummary) => { if (!seen.has(u.id)) { seen.add(u.id); merged.push(u); } };
        admins?.items.forEach(add);
        staff.items.forEach(add);
        this.rows.set(merged);
        this.loading.set(false);
        merged.filter(u => u.role === 'STAFF').forEach(u => this.fetchGrants(u.id));
      },
      error: err => {
        this.error.set(err?.error?.message || 'Không thể tải danh sách nhân sự.');
        this.loading.set(false);
      },
    });
  }

  pageChanged(page: number): void {
    this.page.set(page);
    this.load();
  }

  private fetchGrants(staffId: string): void {
    this.rowPerms.update(m => ({ ...m, [staffId]: 'loading' }));
    this.api.adminGetStaffPermissions(staffId).subscribe({
      next: res => this.rowPerms.update(m => ({ ...m, [staffId]: res.grants })),
      error: () => this.rowPerms.update(m => ({ ...m, [staffId]: 'error' })),
    });
  }

  // --- Hiển thị ---
  roleText(role: string): string { return roleLabel(role); }
  statusText(u: UserSummary): string {
    return u.role === 'STAFF' && u.status === 'PENDING_VERIFICATION' ? 'Chờ kích hoạt' : userStatusLabel(u.status);
  }
  initial(u: UserSummary): string { return (u.fullName || u.email || '?').trim().charAt(0).toUpperCase(); }
  isSelf(u: UserSummary): boolean { return this.auth.currentUser()?.id === u.id; }
  grantsOf(u: UserSummary): RowPerms { return this.rowPerms()[u.id] ?? 'loading'; }
  codesOf(grants: StaffPermissionGrant[]): string { return grants.map(g => g.permission).join(', '); }
  shortCodes(grants: StaffPermissionGrant[]): string {
    const codes = grants.map(g => g.permission);
    return codes.length > 3 ? `${codes.slice(0, 3).join(', ')} +${codes.length - 3}` : codes.join(', ');
  }
  scopeText(u: UserSummary): string {
    if (u.role === 'ADMIN') return 'Toàn bộ';
    const g = this.grantsOf(u);
    if (!Array.isArray(g) || g.length === 0) return '—';
    const scopes = new Set(g.map(x => x.scope));
    if (scopes.size > 1) return 'Hỗn hợp';
    return scopes.has('GLOBAL') ? 'Toàn bộ' : 'Được giao';
  }

  // --- Mời nhân viên (POST /admin/staff) ---
  openStaffModal(): void {
    this.staffName = '';
    this.staffEmail = '';
    this.staffOpen.set(true);
  }

  saveStaff(): void {
    if (!this.staffName.trim() || !this.staffEmail.trim()) return;
    this.saving.set(true);
    this.api.adminCreateStaff({ fullName: this.staffName.trim(), email: this.staffEmail.trim() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.staffOpen.set(false);
        this.toast.success('Đã gửi thư mời nhân viên mới.');
        this.page.set(1);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo tài khoản nhân viên.');
      },
    });
  }

  resendInvitation(user: UserSummary): void {
    this.resendingId.set(user.id);
    this.api.adminResendStaffInvitation(user.id).subscribe({
      next: () => {
        this.resendingId.set(null);
        this.toast.success('Đã gửi lại email kích hoạt nhân viên.');
      },
      error: err => {
        this.resendingId.set(null);
        this.toast.error(err.error?.message || 'Không thể gửi lại lời mời.');
      },
    });
  }

  // --- Khóa / mở khóa (PATCH /admin/users/:id/status) ---
  confirmLock(): void {
    const u = this.lockTarget();
    if (!u) return;
    this.setStatus(u, 'SUSPENDED', () => this.lockTarget.set(null));
  }

  setStatus(user: UserSummary, newStatus: 'ACTIVE' | 'SUSPENDED', done?: () => void): void {
    if (this.isSelf(user) && newStatus === 'SUSPENDED') return;
    this.busyId.set(user.id);
    this.api.adminUpdateUserStatus(user.id, newStatus).subscribe({
      next: updated => {
        this.rows.update(list => list.map(u => (u.id === user.id ? { ...u, status: updated.status } : u)));
        this.busyId.set(null);
        done?.();
        this.toast.success(newStatus === 'SUSPENDED' ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
      },
      error: err => {
        this.busyId.set(null);
        done?.();
        this.toast.error(err.error?.message || 'Không thể cập nhật trạng thái.');
      },
    });
  }

  // --- Phân quyền ---
  perm$(name: string): { enabled: boolean; scope: Scope } {
    return this.perm()[name] ?? { enabled: false, scope: 'GLOBAL' };
  }

  openPermissions(staff: UserSummary): void {
    this.selectedStaff.set(staff);
    const initial: PermState = {};
    for (const p of this.allPermissions) initial[p.name] = { enabled: false, scope: 'GLOBAL' };
    this.perm.set(initial);
    this.permOpen.set(true);
    this.loadingPerms.set(true);
    this.api.adminGetStaffPermissions(staff.id).subscribe({
      next: result => {
        if (this.selectedStaff()?.id !== staff.id) return;
        const next: PermState = { ...initial };
        for (const grant of result.grants) {
          if (next[grant.permission]) next[grant.permission] = { enabled: true, scope: grant.scope };
        }
        this.perm.set(next);
        this.loadingPerms.set(false);
      },
      error: () => {
        this.loadingPerms.set(false);
        this.permOpen.set(false);
        this.toast.error('Không thể tải quyền hiện tại.');
      },
    });
  }

  closePermissions(): void {
    if (this.savingPerms()) return;
    this.permOpen.set(false);
  }

  togglePerm(name: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.perm.update(p => ({ ...p, [name]: { ...(p[name] ?? { scope: 'GLOBAL' }), enabled: checked } }));
  }

  setScope(name: string, scope: Scope): void {
    this.perm.update(p => ({ ...p, [name]: { ...(p[name] ?? { enabled: true }), scope } }));
  }

  applyScopeAll(scope: Scope): void {
    this.perm.update(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, scope }])));
  }

  savePermissions(mode: 'grant' | 'replace'): void {
    if (this.loadingPerms() || this.savingPerms()) return;
    const st = this.selectedStaff();
    if (!st) return;
    const grants: StaffPermissionGrant[] = [];
    for (const p of this.allPermissions) {
      const state = this.perm()[p.name];
      if (state?.enabled) grants.push({ permission: p.name, scope: state.scope });
    }
    this.savingPerms.set(true);
    const call$ = mode === 'grant'
      // POST /admin/staff/:staffId/permissions
      ? this.api.adminGrantStaffPermissions(st.id, grants)
      // PATCH /admin/staff/:staffId/permissions
      : this.api.adminReplaceStaffPermissions(st.id, grants);
    call$.subscribe({
      next: res => {
        this.savingPerms.set(false);
        this.permOpen.set(false);
        const count = res.grants?.length ?? grants.length;
        this.toast.success(`Đã lưu ${count} quyền cho nhân viên ${st.fullName}.`);
        this.fetchGrants(st.id);
      },
      error: err => {
        this.savingPerms.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật quyền nhân viên.');
      },
    });
  }

  // --- Xuất CSV các tài khoản đang hiển thị ---
  exportCsv(): void {
    const rows = this.rows();
    if (rows.length === 0) return;
    const header = ['Họ tên', 'Email', 'Vai trò', 'Trạng thái', 'Số quyền', 'Mã quyền', 'Phạm vi'];
    const lines = [header.map(csvCell).join(',')];
    for (const u of rows) {
      const g = this.grantsOf(u);
      const grants = Array.isArray(g) ? g : [];
      lines.push([
        u.fullName ?? '', u.email, roleLabel(u.role), this.statusText(u),
        u.role === 'ADMIN' ? this.allPermissions.length : grants.length,
        u.role === 'ADMIN' ? 'Toàn quyền' : this.codesOf(grants), this.scopeText(u),
      ].map(csvCell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nhan-su-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
