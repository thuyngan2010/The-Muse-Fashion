import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminPromoTabsComponent } from '../../components/admin-promo-tabs.component';
import { contentStatusLabel, moderationTypeLabel } from '../../shared/labels';

type TargetType = 'REVIEW' | 'POST' | 'COMMENT';
type ModAction = 'HIDE' | 'RESTORE';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'PUBLIC', label: 'Công khai' },
  { value: 'HIDDEN', label: 'Đã ẩn' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
];

@Component({
  standalone: true,
  imports: [PaginationComponent, FormsModule, ModalComponent, AdminPromoTabsComponent],
  template: `
    <div class="am">
      <fc-admin-promo-tabs [active]="section()" />

      <header class="head">
        <div>
          <h1 class="title">Khuyến mãi và Đánh giá</h1>
          <p class="sub">{{ section() === 'reviews' ? 'Phê duyệt hoặc tạm ẩn phản hồi của khách hàng về sản phẩm.' : 'Phê duyệt hoặc tạm ẩn bài viết và bình luận trong cộng đồng.' }}</p>
        </div>
        <span class="pending-pill" [class.zero]="pendingCount() === 0" role="status">
          {{ pendingCount() === null ? '—' : pendingCount() }} {{ pendingNoun() }} chờ duyệt
        </span>
      </header>

      <div class="filters">
        <div class="chips" role="group" aria-label="Lọc theo trạng thái">
          @for (opt of statusOptions; track opt.value) {
            <button type="button" class="chip" [class.active]="statusFilter() === opt.value" [attr.aria-pressed]="statusFilter() === opt.value" (click)="setStatus(opt.value)">{{ opt.label }}</button>
          }
        </div>
        @if (section() === 'community') {
          <div class="chips" role="group" aria-label="Loại nội dung cộng đồng">
            <button type="button" class="chip" [class.active]="communityType() === 'POST'" [attr.aria-pressed]="communityType() === 'POST'" (click)="setCommunityType('POST')">Bài viết</button>
            <button type="button" class="chip" [class.active]="communityType() === 'COMMENT'" [attr.aria-pressed]="communityType() === 'COMMENT'" (click)="setCommunityType('COMMENT')">Bình luận</button>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="state-box" role="status"><span class="spinner"></span><p>Đang tải nội dung cần kiểm duyệt…</p></div>
      } @else if (error()) {
        <div class="state-box" role="alert"><p>{{ error() }}</p><button type="button" class="btn-outline" (click)="loadModeration()">Thử lại</button></div>
      } @else if (items().length === 0) {
        <div class="state-box"><p>Không có nội dung nào ở bộ lọc này.</p></div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>{{ section() === 'reviews' ? 'Sản phẩm / đánh giá' : 'Nội dung' }}</th>
                @if (hasRating()) { <th>Xếp hạng</th> }
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th class="c-act">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr [class.dim]="item.status === 'HIDDEN'">
                  <td class="content-cell">
                    <span class="type-tag">{{ typeLabel(item.targetType) }}</span>
                    @if (item.productName) { <strong class="prod">{{ item.productName }}</strong> }
                    @if (item.reviewerName) {
                      <span class="sub-line">{{ item.reviewerName }}@if (item.purchasedSize) { · Đã mua size {{ item.purchasedSize }} }</span>
                    }
                    <p class="content">{{ item.content || item.caption || '(Không có văn bản)' }}</p>
                  </td>
                  @if (hasRating()) { <td class="nowrap">{{ item.rating ? item.rating + ' / 5 sao' : '—' }}</td> }
                  <td class="nowrap">{{ fmt(item.createdAt) }}</td>
                  <td><span class="badge" [class]="'cs-' + (item.status || '').toLowerCase()">{{ statusLabel(item.status) }}</span></td>
                  <td class="c-act">
                    @if (auth.can('content.moderate')) {
                      <div class="acts">
                        @if (item.status === 'PENDING_REVIEW') {
                          <button type="button" class="link-btn" (click)="ask(item, 'RESTORE')">Duyệt</button>
                        }
                        @if (item.status === 'HIDDEN') {
                          <button type="button" class="link-btn" (click)="ask(item, 'RESTORE')">Khôi phục</button>
                        } @else {
                          <button type="button" class="link-btn danger" (click)="ask(item, 'HIDE')">Ẩn</button>
                        }
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <fc-pagination label="nội dung kiểm duyệt" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />
      }
    </div>

    <fc-modal [isOpen]="!!target()" [title]="actionTitle()" maxWidth="480px" (close)="closeAction()">
      @if (target(); as t) {
        <form (ngSubmit)="submitAction()" class="modal-form">
          <p class="quote">{{ t.item.content || t.item.caption || '(Không có văn bản)' }}</p>
          <label>Lý do *
            <textarea [(ngModel)]="reason" name="reason" rows="3" minlength="3" maxlength="500" required></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="closeAction()">Hủy</button>
            <button type="submit" class="btn-primary" [disabled]="saving() || reason.trim().length < 3">{{ saving() ? 'Đang xử lý…' : actionTitle() }}</button>
          </div>
        </form>
      }
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .am { display: flex; flex-direction: column; gap: 16px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .pending-pill { padding: 6px 14px; border-radius: 999px; background: var(--ui-warning-bg); color: var(--ui-warning); font: 600 12px/16px var(--font-sans); }
    .pending-pill.zero { background: var(--ui-bg-soft); color: var(--ui-ink-soft); }
    .filters { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { padding: 7px 14px; border: 1px solid var(--ui-line); border-radius: 999px; background: var(--ui-bg); font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); cursor: pointer; }
    .chip:hover { background: var(--ui-bg-soft); }
    .chip.active { background: var(--ui-ink); border-color: var(--ui-ink); color: #fff; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 760px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: top; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .dim .content { text-decoration: line-through; color: var(--ui-subtle); }
    .c-act { text-align: right; } .nowrap { white-space: nowrap; }
    .content-cell { max-width: 520px; overflow-wrap: anywhere; }
    .type-tag { display: inline-block; margin-bottom: 4px; padding: 2px 8px; border: 1px solid var(--admin-line); font: 700 10px/14px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-accent); }
    .prod { display: block; }
    .sub-line { display: block; font-size: 12px; color: var(--ui-subtle); }
    .content { margin: 4px 0 0; line-height: 20px; color: var(--ui-ink-soft); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); white-space: nowrap; }
    .cs-public { background: var(--ui-success-bg); color: var(--ui-success); }
    .cs-hidden { background: var(--ui-bg-soft); color: var(--ui-ink-soft); }
    .cs-pending_review { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .acts { display: flex; gap: 4px; justify-content: flex-end; }
    .link-btn { background: none; border: 0; padding: 4px 6px; color: var(--ui-accent); font: 700 12px/16px var(--font-sans); cursor: pointer; text-decoration: underline; }
    .link-btn.danger { color: var(--ui-danger); }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .modal-form { display: flex; flex-direction: column; gap: 14px; }
    .modal-form label { display: flex; flex-direction: column; gap: 4px; font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); }
    .modal-form textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .quote { margin: 0; padding: 12px; background: var(--ui-bg-soft); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; max-height: 140px; overflow: auto; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
  `],
})
export class AdminModerationPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly statusOptions = STATUS_OPTIONS;
  readonly pagination = new PaginationState(20);

  readonly section = signal<'reviews' | 'community'>('reviews');
  readonly communityType = signal<'POST' | 'COMMENT'>('POST');
  readonly statusFilter = signal('');
  readonly items = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly pendingCount = signal<number | null>(null);
  readonly saving = signal(false);
  readonly target = signal<{ item: any; action: ModAction } | null>(null);
  reason = '';

  readonly targetType = computed<TargetType>(() => (this.section() === 'reviews' ? 'REVIEW' : this.communityType()));
  readonly hasRating = computed(() => this.items().some(i => i.rating != null));
  readonly pendingNoun = computed(() => (this.section() === 'reviews' ? 'đánh giá' : this.communityType() === 'POST' ? 'bài viết' : 'bình luận'));
  readonly actionTitle = computed(() => (this.target()?.action === 'HIDE' ? 'Ẩn nội dung' : this.target()?.item.status === 'PENDING_REVIEW' ? 'Duyệt nội dung' : 'Khôi phục nội dung'));

  ngOnInit(): void {
    // ?type=REVIEW → tab Đánh giá; ?type=POST|COMMENT → tab Kiểm duyệt cộng đồng
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const type = params.get('type');
      if (type === 'POST' || type === 'COMMENT') {
        this.section.set('community');
        this.communityType.set(type);
      } else {
        this.section.set('reviews');
      }
      this.statusFilter.set('');
      this.pagination.reset();
      this.refresh();
    });
  }

  refresh(): void {
    this.loadModeration();
    this.loadPending();
  }

  setStatus(value: string): void {
    this.statusFilter.set(value);
    this.pagination.reset();
    this.loadModeration();
  }

  setCommunityType(type: 'POST' | 'COMMENT'): void {
    this.communityType.set(type);
    this.pagination.reset();
    this.refresh();
  }

  paginationChanged(page: number): void {
    this.pagination.page.set(page);
    this.loadModeration();
  }

  loadModeration(): void {
    this.loading.set(true);
    this.error.set('');
    this.pagination.load(
      () => this.api.adminListModeration(this.pagination.page(), this.pagination.limit, this.statusFilter() || undefined, this.targetType()),
      {
        next: res => {
          this.items.set(res.items);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err?.error?.message || 'Không thể tải nội dung kiểm duyệt.');
          this.loading.set(false);
        },
      },
    );
  }

  private loadPending(): void {
    this.pendingCount.set(null);
    this.api.adminListModeration(1, 1, 'PENDING_REVIEW', this.targetType()).subscribe({
      next: res => this.pendingCount.set(res.total),
      error: () => this.pendingCount.set(null),
    });
  }

  // --- Ẩn / duyệt / khôi phục (PATCH /admin/moderation/:targetId) ---
  ask(item: any, action: ModAction): void {
    this.reason = action === 'HIDE' ? 'Nội dung không phù hợp' : 'Nội dung phù hợp';
    this.target.set({ item, action });
  }

  closeAction(): void {
    if (this.saving()) return;
    this.target.set(null);
  }

  submitAction(): void {
    const t = this.target();
    if (!t || this.saving() || this.reason.trim().length < 3) return;
    this.saving.set(true);
    this.api.adminModerate(t.item.id, { targetType: t.item.targetType, action: t.action, reason: this.reason.trim() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.target.set(null);
        this.toast.success(t.action === 'HIDE' ? 'Đã ẩn nội dung.' : 'Đã khôi phục nội dung công khai.');
        this.refresh();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể thực hiện kiểm duyệt.');
      },
    });
  }

  // --- Hiển thị ---
  statusLabel(status: string): string { return contentStatusLabel(status); }
  typeLabel(type: string): string { return moderationTypeLabel(type); }
  fmt(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
