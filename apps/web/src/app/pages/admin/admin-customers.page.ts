import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, map } from 'rxjs';
import type { AdminUserDetail, AdminUserRow, UserSummary } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { AdminCustomerTabsComponent } from '../../components/admin-customer-tabs.component';
import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { orderStatusLabel, userStatusLabel } from '../../shared/labels';

function csvCell(value: string | number): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, ModalComponent, AdminDrawerComponent, AdminCustomerTabsComponent, PaginationComponent],
  template: `
    <div class="ac">
      <fc-admin-customer-tabs active="customers" />
      <header class="head">
        <div>
          <h1 class="title">Khách hàng</h1>
          <p class="sub">Xem thông tin tài khoản khách hàng và khóa hoặc mở khóa khi cần.</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn-outline" [disabled]="customers().length === 0" (click)="exportCsv()">Xuất dữ liệu</button>
        </div>
      </header>

      <section class="kpis" aria-label="Chỉ số khách hàng">
        <div class="kpi">
          <span class="kpi-label">Tổng khách hàng</span>
          <span class="kpi-value">{{ countOf('total') }}</span>
          <span class="kpi-note">Theo hệ thống{{ search().trim() ? ', khớp từ khóa tìm kiếm' : '' }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Đang hoạt động</span>
          <span class="kpi-value">{{ countOf('ACTIVE') }}</span>
          <span class="kpi-note">Tài khoản có thể đăng nhập</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Bị khóa</span>
          <span class="kpi-value">{{ countOf('SUSPENDED') }}</span>
          <span class="kpi-note">Tài khoản đang tạm khóa</span>
        </div>
      </section>

      <div class="search">
        <label class="sr-only" for="cust-search">Tìm khách hàng</label>
        <input id="cust-search" type="search" [ngModel]="search()" (ngModelChange)="onSearch($event)" name="search" placeholder="Tìm theo họ tên hoặc email…" autocomplete="off" />
        <label class="sr-only" for="cust-status">Lọc theo trạng thái</label>
        <select id="cust-status" [ngModel]="statusFilter()" (ngModelChange)="setStatus($event)" name="statusFilter">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="ACTIVE">{{ statusLabel('ACTIVE') }}</option>
          <option value="SUSPENDED">{{ statusLabel('SUSPENDED') }}</option>
        </select>
      </div>

      @if (loading() && customers().length === 0) {
        <div class="state-box" role="status"><span class="spinner"></span><p>Đang tải danh sách khách hàng…</p></div>
      } @else if (error()) {
        <div class="state-box" role="alert">
          <p>{{ error() }}</p>
          <button type="button" class="btn-outline" (click)="load()">Thử lại</button>
        </div>
      } @else if (customers().length === 0) {
        <div class="state-box"><p>{{ search().trim() || statusFilter() !== 'ALL' ? 'Không có khách hàng khớp tìm kiếm hoặc bộ lọc.' : 'Chưa có khách hàng.' }}</p></div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Khách hàng</th><th>Thông tin liên hệ</th><th>Ngày tạo</th><th class="c-num">Tổng chi tiêu</th><th>Trạng thái</th><th class="c-act">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              @for (u of customers(); track u.id) {
                <tr class="row" (click)="open(u)">
                  <td>
                    <div class="who">
                      <span class="avatar" aria-hidden="true">{{ initial(u) }}</span>
                      <span class="strong">{{ u.fullName || '—' }}</span>
                    </div>
                  </td>
                  <td>
                    <span>{{ u.email }}</span>
                    <span class="sub-line">{{ u.phone || '—' }}</span>
                  </td>
                  <td class="nowrap">{{ fmtDate(u.createdAt) }}</td>
                  <td class="c-num">
                    <strong class="strong">{{ money(u.totalSpent ?? 0) }}</strong>
                    <span class="sub-line">{{ u.orderCount ?? 0 }} đơn hàng</span>
                  </td>
                  <td><span class="badge" [class]="'us-' + u.status.toLowerCase()">{{ statusLabel(u.status) }}</span></td>
                  <td class="c-act" (click)="$event.stopPropagation()">
                    <button type="button" class="link-btn" (click)="open(u)">Xem hồ sơ</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <fc-pagination label="khách hàng" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="pageChanged($event)" />
      }

      <p class="note reminder">Quản lý tài khoản nhân viên ở <a routerLink="/admin/users">Báo cáo &amp; Phân quyền</a>.</p>
    </div>

    <fc-admin-drawer [isOpen]="drawerOpen()" eyebrow="Hồ sơ khách hàng" [title]="selected()?.fullName || 'Khách hàng'" width="460px" (close)="closeDrawer()">
      @if (selected(); as u) {
        <div class="d-top">
          <div class="who">
            <span class="avatar big" aria-hidden="true">{{ initial(u) }}</span>
            <span class="strong">{{ u.fullName || '—' }}</span>
          </div>
          <span class="badge" [class]="'us-' + u.status.toLowerCase()">{{ statusLabel(u.status) }}</span>
        </div>
        <dl class="info">
          <div><dt>Email</dt><dd>{{ u.email }}</dd></div>
          <div><dt>Điện thoại</dt><dd>{{ u.phone || '—' }}</dd></div>
          <div><dt>Ngày tham gia</dt><dd>{{ fmtDate(u.createdAt) }}{{ monthsText(u.createdAt) }}</dd></div>
        </dl>
      }
      @if (detailLoading()) {
        <p class="note pad" role="status">Đang tải địa chỉ và đơn hàng…</p>
      } @else if (detailError()) {
        <p class="note pad" role="alert">{{ detailError() }} <button type="button" class="link-btn" (click)="reloadDetail()">Thử lại</button></p>
      } @else if (detail(); as d) {
        <section class="d-sec">
          <h3 class="d-h">Chi tiêu</h3>
          <p class="spend"><strong>{{ money(d.totalSpent ?? 0) }}</strong> <span class="note">· {{ d.orderCount ?? 0 }} đơn đã thanh toán (không tính đơn hủy)</span></p>
        </section>
        <section class="d-sec">
          <h3 class="d-h">Địa chỉ nhận hàng mặc định</h3>
          @if (d.defaultAddress; as a) {
            <p class="addr"><strong>{{ a.receiver }}</strong> · {{ a.phone }}<br>{{ addressLine(a) }}@if (a.note) { <br><em>{{ a.note }}</em> }</p>
          } @else { <p class="note">Khách chưa lưu địa chỉ mặc định.</p> }
        </section>
        <section class="d-sec">
          <div class="d-row">
            <h3 class="d-h">Lịch sử đơn hàng gần nhất</h3>
            <a class="link-btn" routerLink="/admin/orders" [queryParams]="{ customerId: d.id }">Xem tất cả{{ allOrdersTotal() === null ? '' : ' (' + allOrdersTotal() + ')' }}</a>
          </div>
          @if (d.recentOrders.length === 0) { <p class="note">Khách chưa có đơn hàng.</p> }
          <ul class="orders">
            @for (o of d.recentOrders; track o.id) {
              <li>
                <a class="order" routerLink="/admin/orders" [queryParams]="{ orderId: o.id }" [attr.aria-label]="'Mở đơn hàng ' + o.code">
                  <span class="o-main"><strong class="strong">#{{ o.code }}</strong><span class="sub-line">{{ fmtDateTime(o.createdAt) }} · {{ o.itemCount }} sản phẩm</span></span>
                  <span class="o-side"><strong class="strong">{{ money(o.money.payableTotal) }}</strong><span class="sub-line">{{ orderStatusLabel(o.state) }}</span></span>
                </a>
              </li>
            }
          </ul>
        </section>
      }
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="closeDrawer()">Đóng</button>
        @if (selected(); as u) {
          <a class="btn-primary mail" [href]="mailto(u)">Gửi email hỗ trợ</a>
          @if (u.status === 'ACTIVE' || u.status === 'SUSPENDED') {
            @if (isSelf(u)) {
              <button type="button" class="btn-outline" disabled title="Không thể khóa tài khoản đang đăng nhập">Tạm khóa tài khoản</button>
            } @else if (u.status === 'ACTIVE') {
              <button type="button" class="btn-outline danger" (click)="askToggle(u)">Tạm khóa tài khoản</button>
            } @else {
              <button type="button" class="btn-outline" (click)="askToggle(u)">Mở khóa tài khoản</button>
            }
          }
        }
      </div>
    </fc-admin-drawer>

    <fc-modal [isOpen]="confirmOpen()" [title]="confirmTarget()?.status === 'ACTIVE' ? 'Tạm khóa tài khoản' : 'Mở khóa tài khoản'" maxWidth="440px" (close)="confirmOpen.set(false)">
      @if (confirmTarget(); as t) {
        <p class="confirm-text">
          @if (t.status === 'ACTIVE') {
            Khách <strong>{{ t.fullName || t.email }}</strong> sẽ không thể đăng nhập cho đến khi được mở khóa. Bạn chắc chắn muốn khóa?
          } @else {
            Khách <strong>{{ t.fullName || t.email }}</strong> sẽ có thể đăng nhập lại. Bạn chắc chắn muốn mở khóa?
          }
        </p>
        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="confirmOpen.set(false)">Hủy</button>
          <button type="button" class="btn-primary" [disabled]="saving()" (click)="confirmToggle()">{{ saving() ? 'Đang cập nhật…' : 'Xác nhận' }}</button>
        </div>
      }
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .ac { display: flex; flex-direction: column; gap: 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .head-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 26px/32px var(--font-serif); }
    .kpi-note, .note { margin: 0; font-size: 12px; line-height: 16px; color: var(--ui-subtle); }
    .reminder a { color: var(--ui-accent); }
    .search { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .search input { width: 100%; max-width: 360px; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .row { cursor: pointer; } .row:hover { background: var(--admin-canvas); }
    .c-act { text-align: right; } .nowrap { white-space: nowrap; }
    .strong { font-weight: 600; color: var(--ui-ink); }
    .sub-line { display: block; margin-top: 2px; font-size: 12px; color: var(--ui-subtle); }
    .who { display: flex; align-items: center; gap: 12px; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--ui-pink-soft); color: var(--ui-accent); display: inline-flex; align-items: center; justify-content: center; font: 700 14px var(--font-sans); flex: none; }
    .avatar.big { width: 48px; height: 48px; font-size: 18px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); white-space: nowrap; }
    .us-active { background: var(--ui-success-bg); color: var(--ui-success); }
    .us-pending_verification { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .us-suspended { background: var(--ui-danger-bg); color: var(--ui-danger); }
    .link-btn { background: none; border: 0; padding: 4px 6px; color: var(--ui-accent); font: 700 12px/16px var(--font-sans); cursor: pointer; text-decoration: underline; }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-outline.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
    .mail { display: inline-flex; align-items: center; text-decoration: none; }
    .d-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
    .info { margin: 0 0 16px; display: flex; flex-direction: column; gap: 12px; }
    .info div { display: flex; flex-direction: column; gap: 2px; }
    .info dt { font: 700 10px/12px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-subtle); }
    .info dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
    .c-num { text-align: right; } .pad { padding: 8px 0; }
    .search select { padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .d-sec { padding: 14px 0; border-top: 1px solid var(--admin-line-soft); }
    .d-h { margin: 0 0 8px; font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .d-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .d-row .d-h { margin: 0; }
    .spend, .addr { margin: 0; font-size: 13px; line-height: 20px; }
    .orders { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .order { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--admin-line); color: inherit; text-decoration: none; font-size: 13px; }
    .order:hover { background: var(--admin-canvas); }
    .o-side { text-align: right; }
    .confirm-text { margin: 0 0 16px; font-size: 14px; line-height: 22px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
  `],
})
export class AdminCustomersPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly orderStatusLabel = orderStatusLabel;
  readonly pagination = new PaginationState(20);
  readonly customers = signal<AdminUserRow[]>([]);
  readonly statusCounts = signal<Record<string, number> | null>(null);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  readonly selected = signal<UserSummary | null>(null);
  readonly drawerOpen = signal(false);
  readonly detail = signal<AdminUserDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly allOrdersTotal = signal<number | null>(null);
  readonly confirmOpen = signal(false);
  readonly confirmTarget = signal<UserSummary | null>(null);
  readonly saving = signal(false);

  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();
  private detailSub?: Subscription;
  private firstParams = true;
  private urlCustomerId = '';

  ngOnInit(): void {
    // Ô tìm: chờ 300ms sau khi ngừng gõ rồi ghi ?q= lên URL; URL đổi thì tải lại từ trang 1.
    this.subs.add(this.search$.pipe(map(v => v.trim()), debounceTime(300), distinctUntilChanged()).subscribe(value => this.patchUrl({ q: value || null })));
    this.subs.add(this.route.queryParamMap.subscribe(params => this.applyParams(params)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.detailSub?.unsubscribe();
    this.pagination.cancel();
  }

  private patchUrl(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Đọc ?q=, ?status=, ?customerId= (mở hồ sơ khách đó). */
  private applyParams(params: ParamMap): void {
    const q = params.get('q')?.trim() ?? '';
    const rawStatus = params.get('status');
    const status = rawStatus === 'ACTIVE' || rawStatus === 'SUSPENDED' ? rawStatus : 'ALL';
    const changed = this.firstParams || q !== this.search().trim() || status !== this.statusFilter();
    this.search.set(q);
    this.statusFilter.set(status);
    this.firstParams = false;
    if (changed) { this.pagination.reset(); this.load(); }
    const customerId = params.get('customerId') ?? '';
    if (customerId && customerId !== this.urlCustomerId) this.openById(customerId);
    this.urlCustomerId = customerId;
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.search$.next(value);
  }

  setStatus(value: 'ALL' | 'ACTIVE' | 'SUSPENDED'): void {
    this.statusFilter.set(value);
    this.patchUrl({ status: value === 'ALL' ? null : value });
  }

  countOf(key: 'total' | 'ACTIVE' | 'SUSPENDED'): string {
    const c = this.statusCounts();
    if (!c) return '—';
    const n = key === 'total' ? Object.values(c).reduce((sum, v) => sum + v, 0) : (c[key] ?? 0);
    return n.toLocaleString('vi-VN');
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.pagination.load(
      () => this.api.adminListUsers(this.pagination.page(), this.pagination.limit, 'CUSTOMER',
        { q: this.search().trim() || undefined, status: this.statusFilter() }),
      {
        next: res => {
          this.customers.set(res.items);
          this.statusCounts.set(res.statusCounts);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err?.error?.message || 'Không thể tải danh sách khách hàng.');
          this.loading.set(false);
        },
      },
    );
  }

  pageChanged(page: number): void {
    this.pagination.page.set(page);
    this.load();
  }

  open(u: UserSummary): void {
    this.selected.set(u);
    this.drawerOpen.set(true);
    this.loadDetail(u.id);
  }

  /** Mở hồ sơ theo id từ URL (khách có thể không nằm trong trang hiện tại). */
  private openById(id: string): void {
    const known = this.customers().find(c => c.id === id);
    this.selected.set(known ?? null);
    this.drawerOpen.set(true);
    this.loadDetail(id);
  }

  reloadDetail(): void {
    const id = this.selected()?.id ?? this.urlCustomerId;
    if (id) this.loadDetail(id);
  }

  private loadDetail(id: string): void {
    this.detailSub?.unsubscribe();
    this.detail.set(null);
    this.allOrdersTotal.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    this.detailSub = this.api.adminGetUser(id).subscribe({
      next: d => {
        this.detail.set(d);
        this.selected.update(s => s ?? d);
        this.detailLoading.set(false);
        // Tổng số đơn (mọi trạng thái) cho liên kết "Xem tất cả".
        this.api.adminListOrders(undefined, 1, 1, { customerId: d.id }).subscribe({ next: r => this.allOrdersTotal.set(r.total), error: () => undefined });
      },
      error: err => {
        this.detailLoading.set(false);
        this.detailError.set(err?.error?.message || 'Không thể tải địa chỉ và đơn hàng của khách.');
      },
    });
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.detailSub?.unsubscribe();
    if (this.route.snapshot.queryParamMap.get('customerId')) {
      this.urlCustomerId = '';
      this.patchUrl({ customerId: null });
    }
  }

  isSelf(u: UserSummary): boolean {
    return this.auth.currentUser()?.id === u.id;
  }

  askToggle(u: UserSummary): void {
    if (this.isSelf(u)) return;
    this.confirmTarget.set(u);
    this.confirmOpen.set(true);
  }

  confirmToggle(): void {
    const u = this.confirmTarget();
    if (!u || this.isSelf(u) || this.saving()) return;
    const next: 'ACTIVE' | 'SUSPENDED' = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    this.saving.set(true);
    this.api.adminUpdateUserStatus(u.id, next).subscribe({
      next: updated => {
        const patch = <T extends UserSummary>(x: T): T => (x.id === u.id ? { ...x, status: updated.status } : x);
        this.customers.update(list => list.map(patch));
        this.selected.update(s => (s ? patch(s) : s));
        this.saving.set(false);
        this.confirmOpen.set(false);
        this.toast.success(next === 'SUSPENDED' ? 'Đã tạm khóa tài khoản khách hàng.' : 'Đã mở khóa tài khoản khách hàng.');
        this.load(); // cập nhật ô số liệu và danh sách theo bộ lọc
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'Không thể cập nhật trạng thái.');
      },
    });
  }

  // --- Hiển thị ---
  statusLabel(status: string): string { return userStatusLabel(status); }

  initial(u: UserSummary): string {
    const name = (u.fullName || u.email || '?').trim();
    return name.charAt(0).toUpperCase();
  }

  fmtDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  monthsText(value?: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (now.getDate() < d.getDate()) months -= 1;
    return ` (${Math.max(0, months)} tháng)`;
  }

  money(value: number): string { return `${Math.round(value).toLocaleString('vi-VN')}đ`; }

  fmtDateTime(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  addressLine(a: { line1: string; ward: string; district: string; province: string }): string {
    return [a.line1, a.ward, a.district, a.province].filter(Boolean).join(', ') || '—';
  }

  mailto(u: UserSummary): string {
    return `mailto:${encodeURIComponent(u.email).replace(/%40/g, '@')}?subject=${encodeURIComponent('Hỗ trợ khách hàng MUSE')}`;
  }

  // --- Xuất CSV các khách của trang hiện tại (theo bộ lọc đang chọn) ---
  exportCsv(): void {
    const rows = this.customers();
    if (rows.length === 0) return;
    const header = ['Họ tên', 'Email', 'Điện thoại', 'Ngày tạo', 'Số đơn hàng', 'Tổng chi tiêu', 'Trạng thái'];
    const lines = [header.map(csvCell).join(',')];
    for (const u of rows) {
      lines.push([u.fullName ?? '', u.email, u.phone ?? '', this.fmtDate(u.createdAt), u.orderCount ?? 0, u.totalSpent ?? 0, userStatusLabel(u.status)].map(csvCell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `khach-hang-trang-${this.pagination.page()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
