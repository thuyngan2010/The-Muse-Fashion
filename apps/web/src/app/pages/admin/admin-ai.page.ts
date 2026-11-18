import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import type { AdminAiJob, AdminAiJobStats } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { aiJobStateLabel, aiJobTypeLabel } from '../../shared/labels';

type JobState = AdminAiJob['state'];
const STATES: JobState[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'];
const STATE_COLORS: Record<JobState, string> = {
  PENDING: '#c4c7c7', PROCESSING: '#f3b7c0', COMPLETED: '#805159', FAILED: '#ba1a1a', EXPIRED: '#8c8186',
};
const TABLE_COLUMNS = ['Mã tác vụ', 'Khách hàng', 'Loại tác vụ', 'Tham chiếu sản phẩm', 'Thời gian tạo', 'Thời gian xử lý', 'Trạng thái', 'Thao tác'];

@Component({
  standalone: true,
  imports: [FormsModule, AdminDrawerComponent, PaginationComponent],
  template: `
    <div class="ai">
      <header class="head">
        <div>
          <h1 class="title">AI Workflow</h1>
          <p class="sub">Theo dõi tác vụ Thử đồ, Mix &amp; Match và cấu hình hạn ngạch AI của hệ thống.</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn-outline" [disabled]="refreshing()" (click)="refresh()">{{ refreshing() ? 'Đang tải…' : 'Làm mới' }}</button>
        </div>
      </header>

      <section class="kpis" aria-label="Chỉ số tác vụ AI">
        @if (statsError()) {
          <div class="err-box" role="alert"><p>{{ statsError() }}</p><button type="button" class="btn-outline" (click)="loadStats()">Thử lại</button></div>
        }
        <div class="kpi"><span class="kpi-label">Tổng tác vụ AI</span><span class="kpi-value">{{ countText(null) }}</span><span class="kpi-note">Toàn thời gian</span></div>
        <div class="kpi"><span class="kpi-label">Đang chờ</span><span class="kpi-value">{{ countText('PENDING') }}</span><span class="kpi-note">Hàng đợi</span></div>
        <div class="kpi"><span class="kpi-label">Đang xử lý</span><span class="kpi-value">{{ countText('PROCESSING') }}</span><span class="kpi-note">Đang chạy</span></div>
        <div class="kpi"><span class="kpi-label">Hoàn thành</span><span class="kpi-value">{{ countText('COMPLETED') }}</span><span class="kpi-note">{{ pctText('COMPLETED') }} trên tổng tác vụ</span></div>
        <div class="kpi"><span class="kpi-label">Thất bại</span><span class="kpi-value">{{ countText('FAILED') }}</span><span class="kpi-note">{{ pctText('FAILED') }} trên tổng tác vụ</span></div>
        <div class="kpi"><span class="kpi-label">Thời gian xử lý trung bình</span><span class="kpi-value">{{ avgText() }}</span><span class="kpi-note">{{ avgNote() }}</span></div>
      </section>

      <section class="grid">
        <article class="card">
          <header class="card-head"><h2>Phân bổ trạng thái chuỗi tác vụ</h2><p class="muted">Tỉ lệ các tác vụ theo trạng thái</p></header>
          @if (stats(); as s) {
            @if (s.total > 0) {
              <div class="bar" role="img" aria-label="Phân bổ trạng thái tác vụ AI">
                @for (st of states; track st) {
                  @if (s.byState[st] > 0) { <span [style.flex]="s.byState[st]" [style.background]="colors[st]"></span> }
                }
              </div>
              <ul class="legend">
                @for (st of states; track st) {
                  <li><span class="dot" [style.background]="colors[st]"></span>{{ label(st) }}<strong>{{ s.byState[st].toLocaleString('vi-VN') }} · {{ pctText(st) }}</strong></li>
                }
              </ul>
            } @else { <p class="empty">Chưa có tác vụ AI nào.</p> }
          } @else if (statsError()) { <p class="empty">—</p> }
          @else { <p class="empty">Đang tải…</p> }
        </article>

        <article class="card">
          <header class="card-head"><h2>Cấu hình hạn ngạch AI</h2><p class="muted">Giới hạn lượt AI mỗi khách hàng mỗi ngày</p></header>
          @if (loadingQuota()) {
            <p class="muted pad">Đang tải hạn ngạch…</p>
          } @else if (quotaError()) {
            <div role="alert" class="err-box"><p>{{ quotaError() }}</p><button type="button" class="btn-outline" (click)="loadQuota()">Thử lại</button></div>
          } @else {
            <label class="field">
              <span class="label">Số lượt tối đa mỗi khách mỗi ngày *</span>
              <span class="input"><input type="number" [(ngModel)]="dailyJobs" min="1" max="100" name="dailyJobs" /><span class="unit">lượt/ngày</span></span>
              @if (validation()) { <span class="err" role="alert">{{ validation() }}</span> }
              @else { <span class="hint">Dùng chung cho Thử đồ và Mix &amp; Match.</span> }
            </label>
            <div class="foot">
              <span class="muted">{{ savedAt() ? 'Đã lưu lúc ' + savedAt() : '' }}</span>
              <button type="button" class="btn-primary" [disabled]="savingQuota() || !!validation()" (click)="saveQuota()">{{ savingQuota() ? 'Đang lưu…' : 'Lưu cấu hình hạn ngạch' }}</button>
            </div>
          }
          <div class="rules">
            <strong>Quy định vận hành</strong>
            <ul>
              <li>Hạn ngạch tính theo ngày UTC và tự đặt lại lúc 00:00 UTC (07:00 giờ Việt Nam).</li>
              <li>Tác vụ thất bại do lỗi hệ thống được hoàn lại lượt đã trừ.</li>
              <li>Ảnh tải lên được xóa tự động sau 24 giờ; ảnh kết quả được lưu 7 ngày.</li>
              <li>Hạn ngạch dùng chung cho Thử đồ và Mix &amp; Match.</li>
            </ul>
          </div>
        </article>
      </section>

      <section class="card">
        <header class="card-head row">
          <div><h2>Bảng quản lý tác vụ AI</h2><p class="muted">Tác vụ Thử đồ và Mix &amp; Match của khách hàng</p></div>
          <div class="filters">
            <select aria-label="Lọc theo loại tác vụ" [ngModel]="typeFilter()" (ngModelChange)="setType($event)">
              <option value="">Tất cả loại</option>
              <option value="TRY_ON">Thử đồ</option>
              <option value="MIX_MATCH">Mix &amp; Match</option>
            </select>
            <select aria-label="Lọc theo trạng thái" [ngModel]="stateFilter()" (ngModelChange)="setState($event)">
              <option value="">Tất cả trạng thái</option>
              @for (st of states; track st) { <option [value]="st">{{ label(st) }}</option> }
            </select>
          </div>
        </header>
        @if (error()) {
          <div class="err-box" role="alert"><p>{{ error() }}</p><button type="button" class="btn-outline" (click)="load()">Thử lại</button></div>
        } @else if (loading() && !jobs().length) {
          <p class="empty">Đang tải danh sách tác vụ…</p>
        } @else if (!jobs().length) {
          <p class="empty">Không có tác vụ nào phù hợp.</p>
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr>@for (c of columns; track c) { <th>{{ c }}</th> }</tr></thead>
              <tbody>
                @for (j of jobs(); track j.id) {
                  <tr>
                    <td class="mono">{{ shortId(j.id) }}</td>
                    <td><strong>{{ j.customerName || '—' }}</strong><br /><span class="muted">{{ j.customerEmail || '—' }}</span></td>
                    <td>{{ typeLabel(j.type) }}</td>
                    <td>{{ products(j) }}</td>
                    <td>{{ fmtDateTime(j.createdAt) }}</td>
                    <td>{{ duration(j) }}</td>
                    <td><span class="badge" [style.--c]="colors[j.state]">{{ label(j.state) }}</span></td>
                    <td><button type="button" class="link-btn" (click)="openDrawer(j.id)">Chi tiết</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <fc-pagination label="tác vụ AI" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="pageChanged($event)" />
        }
        <div class="privacy">
          <strong>Bảo vệ quyền riêng tư</strong>
          <p>Trang quản trị không hiển thị ảnh gốc của khách hàng. Ảnh tải lên được xóa tự động sau 24 giờ.</p>
        </div>
      </section>
    </div>

    <fc-admin-drawer [isOpen]="drawerOpen()" eyebrow="Chi tiết tác vụ AI" [title]="detail() ? shortId(detail()!.id) : 'Tác vụ AI'" [subtitle]="detail() ? typeLabel(detail()!.type) : ''" width="460px" (close)="closeDrawer()">
      @if (detailLoading()) {
        <p class="empty">Đang tải chi tiết…</p>
      } @else if (detailError()) {
        <div class="err-box" role="alert"><p>{{ detailError() }}</p></div>
      } @else if (detail(); as d) {
        <div class="dr">
          <div class="dr-row"><span class="label">Trạng thái</span><span class="badge" [style.--c]="colors[d.state]">{{ label(d.state) }}</span></div>
          <div class="dr-row"><span class="label">Khách hàng</span><span><strong>{{ d.customerName || '—' }}</strong><br /><span class="muted">{{ d.customerEmail || '—' }}</span></span></div>
          <div class="dr-row"><span class="label">Loại tác vụ</span><span>{{ typeLabel(d.type) }}</span></div>
          <div class="dr-row"><span class="label">Sản phẩm</span><span>@if (d.productNames.length) { @for (n of d.productNames; track $index) { {{ n }}<br /> } } @else { — }</span></div>
          <div class="dr-row"><span class="label">Thời gian xử lý</span><span>{{ duration(d) }}</span></div>

          <h3>Dòng thời gian</h3>
          <ol class="timeline">
            <li><strong>Khởi tạo</strong><span class="muted">{{ fmtDateTime(d.createdAt) }}</span></li>
            <li><strong>Bắt đầu xử lý</strong><span class="muted">{{ fmtDateTime(d.startedAt) }}</span></li>
            <li [class.bad]="d.state === 'FAILED'">
              <strong>{{ d.state === 'FAILED' ? 'Thất bại' : 'Hoàn thành' }}</strong>
              <span class="muted">{{ fmtDateTime(d.completedAt) }}@if (d.processingMs !== null) { · tổng {{ seconds(d.processingMs) }} }</span>
            </li>
          </ol>

          @if (d.state === 'FAILED' && d.errorMessage) {
            <div class="err-block" role="alert"><strong>Lỗi</strong><p>{{ d.errorMessage }}</p></div>
          }
          <div class="privacy">
            <strong>Bảo vệ quyền riêng tư</strong>
            <p>Không hiển thị ảnh gốc của khách hàng. Ảnh tải lên được xóa tự động sau 24 giờ khi tác vụ kết thúc; ảnh kết quả được lưu 7 ngày.</p>
          </div>
        </div>
      }
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="closeDrawer()">Đóng</button>
      </div>
    </fc-admin-drawer>
  `,
  styles: [`
    :host { display: block; }
    .ai { display: flex; flex-direction: column; gap: 16px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; }
    .kpis .err-box { grid-column: 1 / -1; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 26px/32px var(--font-serif); }
    .kpi-note { font-size: 11px; line-height: 16px; color: var(--ui-subtle); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .card { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .card-head h2 { margin: 0; font: 500 20px/28px var(--font-serif); }
    .card-head.row { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .filters select { border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); padding: 8px 10px; font: 400 13px/20px var(--font-sans); color: var(--ui-ink); }
    .muted { margin: 2px 0 0; font-size: 12px; color: var(--ui-subtle); } .pad { padding: 12px 0; }
    .empty { margin: 0; padding: 12px 0; text-align: center; font-size: 13px; line-height: 20px; color: var(--ui-subtle); }
    .bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--ui-bg-soft); }
    .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
    .legend li { display: flex; align-items: center; gap: 8px; }
    .legend strong { margin-left: auto; font-weight: 600; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .input { display: flex; align-items: stretch; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); }
    .input:focus-within { border-color: var(--ui-ink); }
    .input input { flex: 1; min-width: 0; border: 0; padding: 10px 12px; background: transparent; font: 400 14px/20px var(--font-sans); color: var(--ui-ink); outline: none; }
    .unit { display: inline-flex; align-items: center; padding: 0 12px; background: var(--ui-bg-soft); border-left: 1px solid var(--ui-line); font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); white-space: nowrap; }
    .hint { font-size: 12px; line-height: 16px; color: var(--ui-subtle); }
    .err { font-size: 12px; line-height: 16px; color: var(--ui-danger); }
    .err-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ui-danger); font-size: 13px; }
    .err-box p { margin: 0; }
    .foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .rules { padding: 12px; background: var(--ui-bg-soft); font-size: 12px; line-height: 18px; color: var(--ui-ink-soft); }
    .rules ul { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); }
    .tbl { width: 100%; border-collapse: collapse; min-width: 900px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-top: 1px solid var(--admin-line-soft); font-size: 13px; line-height: 20px; vertical-align: top; }
    .mono { font-family: ui-monospace, monospace; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font: 600 11px/18px var(--font-sans); color: #fff; background: var(--c, #8c8186); white-space: nowrap; }
    .link-btn { background: none; border: 0; padding: 0; color: var(--ui-ink); text-decoration: underline; cursor: pointer; font: 600 13px/20px var(--font-sans); }
    .privacy { padding: 12px; background: var(--ui-bg-soft); font-size: 12px; line-height: 18px; color: var(--ui-ink-soft); }
    .privacy p { margin: 4px 0 0; }
    .dr { display: flex; flex-direction: column; gap: 14px; }
    .dr-row { display: grid; grid-template-columns: 130px 1fr; gap: 12px; font-size: 13px; line-height: 20px; align-items: start; }
    .dr h3 { margin: 6px 0 0; font: 500 18px/24px var(--font-serif); }
    .timeline { list-style: none; margin: 0; padding: 0 0 0 16px; border-left: 2px solid var(--ui-line); display: flex; flex-direction: column; gap: 14px; }
    .timeline li { display: flex; flex-direction: column; font-size: 13px; }
    .timeline li.bad strong { color: var(--ui-danger); }
    .err-block { padding: 12px; background: var(--ui-danger-bg); color: var(--ui-danger); font-size: 13px; line-height: 20px; }
    .err-block p { margin: 4px 0 0; word-break: break-word; }
    @media (max-width: 1000px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class AdminAiPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly states = STATES;
  readonly colors = STATE_COLORS;
  readonly columns = TABLE_COLUMNS;
  protected readonly typeLabel = aiJobTypeLabel;
  protected readonly label = aiJobStateLabel;

  readonly pagination = new PaginationState(20);
  readonly stats = signal<AdminAiJobStats | null>(null);
  readonly statsError = signal('');
  readonly jobs = signal<AdminAiJob[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly typeFilter = signal('');
  readonly stateFilter = signal('');
  readonly drawerOpen = signal(false);
  readonly detail = signal<AdminAiJob | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly refreshing = computed(() => this.loading() || this.loadingQuota());

  readonly loadingQuota = signal(true);
  readonly savingQuota = signal(false);
  readonly quotaError = signal('');
  readonly savedAt = signal('');
  dailyJobs = 10;

  private readonly subs = new Subscription();
  private detailSub?: Subscription;
  private statsSub?: Subscription;
  private urlJobId = '';

  ngOnInit(): void {
    this.loadQuota();
    this.loadStats();
    this.load();
    this.subs.add(this.route.queryParamMap.subscribe(params => {
      const jobId = params.get('jobId') ?? '';
      if (jobId && jobId !== this.urlJobId) this.openDetail(jobId);
      if (!jobId && this.urlJobId) this.drawerOpen.set(false);
      this.urlJobId = jobId;
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.detailSub?.unsubscribe();
    this.statsSub?.unsubscribe();
    this.pagination.cancel();
  }

  refresh(): void { this.loadQuota(); this.loadStats(); this.load(); }

  // --- GET /admin/ai-jobs/stats ---
  loadStats(): void {
    this.statsError.set('');
    this.statsSub?.unsubscribe();
    this.statsSub = this.api.adminAiJobStats().subscribe({
      next: s => this.stats.set(s),
      error: err => this.statsError.set(err?.error?.message || 'Không thể tải số liệu tác vụ AI.'),
    });
  }

  // --- GET /admin/ai-jobs ---
  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.pagination.load(
      () => this.api.adminListAiJobs(this.pagination.page(), this.pagination.limit, { type: this.typeFilter() || undefined, state: this.stateFilter() || undefined }),
      {
        next: res => { this.jobs.set(res.items); this.loading.set(false); },
        error: err => { this.error.set(err?.error?.message || 'Không thể tải danh sách tác vụ AI.'); this.loading.set(false); },
      },
    );
  }

  setType(value: string): void { this.typeFilter.set(value); this.pagination.reset(); this.load(); }
  setState(value: string): void { this.stateFilter.set(value); this.pagination.reset(); this.load(); }
  pageChanged(page: number): void { this.pagination.page.set(page); this.load(); }

  openDrawer(id: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { jobId: id }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { jobId: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // --- GET /admin/ai-jobs/:id ---
  private openDetail(id: string): void {
    this.drawerOpen.set(true);
    this.detail.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    this.detailSub?.unsubscribe();
    this.detailSub = this.api.adminGetAiJob(id).subscribe({
      next: job => { this.detail.set(job); this.detailLoading.set(false); },
      error: err => { this.detailError.set(err?.error?.message || 'Không tìm thấy tác vụ AI.'); this.detailLoading.set(false); },
    });
  }

  // --- Hiển thị ---
  countText(state: JobState | null): string {
    const s = this.stats();
    if (!s) return '—';
    return (state ? s.byState[state] ?? 0 : s.total).toLocaleString('vi-VN');
  }

  pctText(state: JobState): string {
    const s = this.stats();
    if (!s || !s.total) return '—';
    return `${Math.round(((s.byState[state] ?? 0) / s.total) * 100)}%`;
  }

  avgText(): string {
    const s = this.stats();
    return s && s.avgProcessingMs !== null ? this.seconds(s.avgProcessingMs) : '—';
  }

  avgNote(): string {
    const s = this.stats();
    if (!s || s.avgProcessingMs === null) return 'Chưa có tác vụ hoàn thành trong 24 giờ qua';
    return `Trong ${s.windowHours} giờ qua · ${s.avgSampleSize.toLocaleString('vi-VN')} tác vụ hoàn thành`;
  }

  seconds(ms: number): string { return `${(ms / 1000).toFixed(1).replace('.', ',')} giây`; }

  duration(j: AdminAiJob): string {
    if (j.processingMs !== null) return this.seconds(j.processingMs);
    return j.state === 'PROCESSING' ? 'Đang xử lý…' : '—';
  }

  shortId(id: string): string { return '#' + id.slice(-6).toUpperCase(); }

  products(j: AdminAiJob): string {
    const n = j.productNames;
    if (!n.length) return '—';
    return n.length <= 2 ? n.join(', ') : `${n.slice(0, 2).join(', ')} và ${n.length - 2} sản phẩm`;
  }

  fmtDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // --- GET /admin/ai-quotas ---
  loadQuota(): void {
    this.loadingQuota.set(true);
    this.quotaError.set('');
    this.api.adminGetAiQuota().subscribe({
      next: quota => {
        if (quota && typeof quota.dailyJobs === 'number') this.dailyJobs = quota.dailyJobs;
        this.loadingQuota.set(false);
      },
      error: err => {
        this.quotaError.set(err?.error?.message || 'Không thể tải hạn ngạch AI.');
        this.loadingQuota.set(false);
      },
    });
  }

  validation(): string {
    const v: unknown = this.dailyJobs;
    if (typeof v !== 'number' || !Number.isInteger(v)) return 'Hạn ngạch phải là số nguyên.';
    if (v < 1) return 'Hạn ngạch tối thiểu là 1 lượt/ngày.';
    if (v > 100) return 'Hạn ngạch tối đa là 100 lượt/ngày.';
    return '';
  }

  // --- PATCH /admin/ai-quotas ---
  saveQuota(): void {
    const invalid = this.validation();
    if (invalid) { this.toast.error(invalid); return; }
    this.savingQuota.set(true);
    this.api.adminUpdateAiQuota({ dailyJobs: this.dailyJobs }).subscribe({
      next: res => {
        this.savingQuota.set(false);
        this.dailyJobs = res.dailyJobs;
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        this.savedAt.set(`${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`);
        this.toast.success(`Hạn ngạch AI cập nhật thành công (${res.dailyJobs} lượt/ngày).`);
      },
      error: err => {
        this.savingQuota.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật hạn ngạch AI.');
      },
    });
  }
}
