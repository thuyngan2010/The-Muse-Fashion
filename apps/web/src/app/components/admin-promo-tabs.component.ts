import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';

export type PromoTab = 'vouchers' | 'reviews' | 'community';

/**
 * Hàng tab dùng chung cho Khuyến mãi & Đánh giá.
 * Tab Mã giảm giá chỉ dành cho quản trị viên; hai tab kiểm duyệt cần quyền content.moderate.
 * Chỉ còn một tab thì ẩn cả hàng.
 */
@Component({
  selector: 'fc-admin-promo-tabs',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (tabs().length > 1) {
      <nav class="pt" aria-label="Phân hệ khuyến mãi và đánh giá">
        @for (tab of tabs(); track tab.key) {
          <a class="pt-tab" [class.active]="tab.key === active()" [routerLink]="tab.link" [queryParams]="tab.query" [attr.aria-current]="tab.key === active() ? 'page' : null">
            {{ tab.label }}
            @if (counts()[tab.key] !== undefined) {
              <span class="pt-cnt" [class.warn]="tab.key !== 'vouchers' && counts()[tab.key]! > 0" [attr.title]="tab.key === 'vouchers' ? 'Tổng số mã' : 'Số mục chờ duyệt'">{{ counts()[tab.key] }}</span>
            }
          </a>
        }
      </nav>
    }
  `,
  styles: [`
    :host { display: block; }
    .pt { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--admin-line); margin-bottom: 24px; }
    .pt-tab { display: inline-flex; align-items: center; gap: 8px; padding: 12px 16px; margin-bottom: -1px; font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); text-decoration: none; border-bottom: 2px solid transparent; }
    .pt-tab:hover { color: var(--ui-ink); background: var(--ui-bg-soft); }
    .pt-tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
    .pt-cnt { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--ui-bg-soft); font: 600 11px/18px var(--font-sans); text-align: center; }
    .pt-cnt.warn { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .pt-tab.active .pt-cnt:not(.warn) { background: var(--ui-pink-soft); color: var(--ui-accent); }
  `],
})
export class AdminPromoTabsComponent implements OnInit {
  readonly active = input.required<PromoTab>();
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);

  readonly counts = signal<Partial<Record<PromoTab, number>>>({});

  readonly tabs = computed(() => {
    const list: Array<{ key: PromoTab; label: string; link: string; query?: Record<string, string> }> = [];
    if (this.auth.isAdmin()) list.push({ key: 'vouchers', label: 'Mã giảm giá', link: '/admin/vouchers' });
    if (this.auth.can('content.moderate')) {
      list.push({ key: 'reviews', label: 'Đánh giá sản phẩm', link: '/admin/moderation', query: { type: 'REVIEW' } });
      list.push({ key: 'community', label: 'Kiểm duyệt cộng đồng', link: '/admin/moderation', query: { type: 'POST' } });
    }
    return list;
  });

  ngOnInit(): void {
    if (this.auth.isAdmin()) {
      this.api.adminListVouchers().subscribe({
        next: res => this.setCount('vouchers', res.items.length),
        error: () => undefined,
      });
    }
    if (this.auth.can('content.moderate')) {
      this.api.adminListModeration(1, 1, 'PENDING_REVIEW', 'REVIEW').subscribe({
        next: res => this.setCount('reviews', res.total),
        error: () => undefined,
      });
      let posts = 0;
      let comments = 0;
      let done = 0;
      const finish = () => { if (++done === 2) this.setCount('community', posts + comments); };
      this.api.adminListModeration(1, 1, 'PENDING_REVIEW', 'POST').subscribe({ next: r => { posts = r.total; finish(); }, error: () => undefined });
      this.api.adminListModeration(1, 1, 'PENDING_REVIEW', 'COMMENT').subscribe({ next: r => { comments = r.total; finish(); }, error: () => undefined });
    }
  }

  private setCount(key: PromoTab, value: number): void {
    this.counts.update(c => ({ ...c, [key]: value }));
  }
}
