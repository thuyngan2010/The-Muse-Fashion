import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { NotificationItem } from '@fashion/contracts';
import { AccountSidebarComponent } from '../components/account-sidebar.component';
import { PaginationState } from '../components/pagination.component';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { STORE_NOTIFICATIONS_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

type NotificationKind = 'order' | 'payment' | 'refund' | 'ai' | 'community' | 'lookbook' | 'support' | 'general';

const KIND_LABEL: Record<NotificationKind, string> = {
  order: 'ĐƠN HÀNG',
  payment: 'THANH TOÁN',
  refund: 'HOÀN TIỀN',
  ai: 'AI STUDIO',
  community: 'CỘNG ĐỒNG',
  lookbook: 'LOOKBOOK',
  support: 'HỖ TRỢ',
  general: 'THÔNG BÁO',
};

@Component({
  standalone: true,
  imports: [PageStateComponent, AccountSidebarComponent],
  template: `
    <main class="account-shell">
      <fc-account-sidebar activeItem="notifications" />

      <section class="notif-content">
        <header class="page-header">
          <h1>Trung tâm thông báo</h1>
          <p>{{ content.subtitle }}</p>
        </header>

        <div class="controls">
          <div class="tabs" role="tablist" aria-label="Bộ lọc thông báo">
            <button type="button" role="tab" class="tab" [class.active]="tab() === 'all'" [attr.aria-selected]="tab() === 'all'" (click)="tab.set('all')">
              TẤT CẢ <span class="tab-count">({{ pagination.total() }})</span>
            </button>
            <button type="button" role="tab" class="tab" [class.active]="tab() === 'unread'" [attr.aria-selected]="tab() === 'unread'" (click)="tab.set('unread')">
              CHƯA ĐỌC @if (unreadCount() > 0) { <span class="tab-badge">{{ unreadCount() }}</span> }
            </button>
          </div>
          @if (notifications().length > 0 && unreadCount() > 0) {
            <button type="button" class="mark-all" (click)="markAllRead()">
              <svg viewBox="0 0 16 9" fill="none" aria-hidden="true"><path d="M1 4.5 4 7.5 9.5 1.5M7 7.5l.8.8L14.5 1.5"/></svg>
              <span>ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC ({{ unreadCount() }})</span>
            </button>
          }
        </div>

        @if (loading()) {
          <fc-page-state kind="loading" title="Đang tải thông báo" message="Danh sách thông báo đang được cập nhật." />
        } @else if (error()) {
          <fc-page-state kind="error" title="Không thể tải thông báo" [message]="error()" actionLabel="THỬ LẠI" (action)="loadNotifications()" />
        } @else if (visibleNotifications().length === 0 && tab() === 'unread' && notifications().length > 0) {
          <fc-page-state kind="empty" title="Bạn đã đọc hết thông báo" message="Không còn thông báo chưa đọc trong trang đang xem." actionLabel="XEM TẤT CẢ THÔNG BÁO" (action)="tab.set('all')" />
        } @else if (notifications().length === 0) {
          <fc-page-state kind="empty" title="Không có thông báo mới" [message]="content.emptyDescription" actionLabel="TIẾP TỤC MUA SẮM" actionLink="/products" />
        } @else {
          <div class="feed" role="list">
            @for (n of visibleNotifications(); track n.id) {
              <article class="item" role="listitem" tabindex="0" [class.unread]="!n.readAt" (click)="open(n)" (keydown.enter)="open(n)">
                <span class="icon-box" aria-hidden="true">
                  @switch (kindOf(n.type)) {
                    @case ('order') { <svg viewBox="0 0 24 24" fill="none"><path d="M3 8h18v12H3zM3 8l2-4h14l2 4M12 8v12M9 13h6"/></svg> }
                    @case ('payment') { <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14"/><path d="M3 10h18M7 15h3"/></svg> }
                    @case ('refund') { <svg viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4M12 8v8M14 9.5c-.6-.8-3.4-1-3.9.6-.5 1.800 4.500.8 3.900 2.700-.5 1.500-3.200 1.300-4-.1"/></svg> }
                    @case ('ai') { <svg viewBox="0 0 24 24" fill="none"><path d="m12 3 1.600 5.400L19 10l-5.400 1.600L12 17l-1.600-5.400L5 10l5.400-1.600L12 3ZM19 16l.7 2.300L22 19l-2.300.7L19 22l-.7-2.300L16 19l2.300-.7L19 16Z"/></svg> }
                    @case ('community') { <svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H9l-5 4V5Z"/></svg> }
                    @case ('lookbook') { <svg viewBox="0 0 24 24" fill="none"><path d="M3 5h8v14H3zM11 5h6l3 1-2 13-7-1"/></svg> }
                    @case ('support') { <svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8.500 9.500h7M8.500 12.500h4"/></svg> }
                    @default { <svg viewBox="0 0 24 24" fill="none"><path d="M6 17h12l-1.500-2.500V9a4.500 4.500 0 0 0-9 0v5.500L6 17Z"/><path d="M10 20h4"/></svg> }
                  }
                </span>
                <div class="item-body">
                  <div class="item-top">
                    <span class="kind">{{ kindLabel(n.type) }}</span>
                    <span class="time-wrap">
                      <time [attr.datetime]="n.createdAt" [attr.title]="fullDate(n.createdAt)">{{ relativeTime(n.createdAt) }}</time>
                      @if (!n.readAt) { <span class="dot" aria-hidden="true"></span><span class="sr-only">Chưa đọc</span> }
                    </span>
                  </div>
                  <h3>{{ n.title }}</h3>
                  <p>{{ n.body }}</p>
                </div>
              </article>
            }
          </div>

          @if (pageCount() > 1) {
            <nav class="paging" aria-label="Phân trang">
              <button type="button" class="pg" aria-label="Trang trước" [disabled]="loading() || pagination.page() <= 1" (click)="paginationChanged(pagination.page() - 1)">
                <svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M9 5H1M4.500 1.500 1 5l3.500 3.500"/></svg>
              </button>
              @for (p of pageItems(); track $index) {
                @if (p === 0) {
                  <span class="gap" aria-hidden="true">…</span>
                } @else {
                  <button type="button" class="pg" [class.current]="p === pagination.page()" [attr.aria-current]="p === pagination.page() ? 'page' : null" [attr.aria-label]="'Trang ' + p" [disabled]="loading()" (click)="paginationChanged(p)">{{ p }}</button>
                }
              }
              <button type="button" class="pg" aria-label="Trang sau" [disabled]="loading() || pagination.page() >= pageCount()" (click)="paginationChanged(pagination.page() + 1)">
                <svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M1 5h8M5.500 1.500 9 5 5.500 8.500"/></svg>
              </button>
            </nav>
          }
        }
      </section>
    </main>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Outfit:wght@300;400;500&family=Playfair+Display:wght@400;500&display=swap');
    :host { display:block; background:#fff; color:#171414; } * { box-sizing:border-box; }
    .account-shell { width:min(1184px,calc(100% - 48px)); margin:0 auto; padding:40px 0 96px; display:grid; grid-template-columns:280px minmax(0,1fr); gap:32px; align-items:start; font-family:'Montserrat',sans-serif; }
    .notif-content { min-width:0; }
    .page-header { min-height:101px; padding-bottom:24px; border-bottom:1px solid #e3e2e2; }
    .page-header h1 { margin:0 0 8px; font:400 40px/48px 'Playfair Display',serif; letter-spacing:-1px; color:#000; }
    .page-header p { margin:0; color:#444748; font:400 14px/22px 'Montserrat',sans-serif; letter-spacing:.14px; }
    .controls { margin-top:32px; border-bottom:1px solid #e3e2e2; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
    .tabs { display:flex; gap:32px; }
    .tab { padding:0 0 16px; border:0; border-bottom:2px solid transparent; background:none; color:#444748; font:600 13px/16px 'Montserrat',sans-serif; letter-spacing:.65px; display:inline-flex; align-items:flex-start; gap:6px; cursor:pointer; margin-bottom:-1px; }
    .tab:hover { color:#000; } .tab.active { color:#000; border-bottom-color:#000; }
    .tab-count { font-weight:400; color:#444748; }
    .tab-badge { min-width:19px; height:18px; padding:0 5px; background:#ffd9e1; color:#3b051b; font:600 11px/18px 'Montserrat',sans-serif; text-align:center; margin-top:-1px; }
    .mark-all { padding:0 0 2px; border:0; border-bottom:1px solid transparent; background:none; color:#dd3d40; font:600 11px/14px 'Montserrat',sans-serif; letter-spacing:1.1px; display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
    .mark-all:hover { border-bottom-color:#dd3d40; } .mark-all svg { width:14px; height:8px; stroke:currentColor; stroke-width:1.2; stroke-linecap:round; stroke-linejoin:round; }
    .feed { margin-top:32px; background:#fff; border:1px solid #5f5353; }
    .item { padding:24px; display:flex; gap:16px; align-items:flex-start; background:#fff; border-top:1px solid #e3e2e2; cursor:pointer; }
    .item:first-child { border-top:0; } .item.unread { background:#fbf9f8; } .item:hover { background:#f7f5f5; }
    .icon-box { width:40px; height:40px; flex:0 0 auto; border:1px solid #e3e2e2; background:#fff; display:grid; place-items:center; color:#171414; }
    .icon-box svg { width:18px; height:18px; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
    .item-body { flex:1; min-width:0; }
    .item-top { display:flex; justify-content:space-between; align-items:center; gap:16px; min-height:18px; }
    .kind { color:#444748; font:600 11px/14px 'Montserrat',sans-serif; letter-spacing:1.1px; }
    .time-wrap { display:inline-flex; align-items:center; gap:8px; color:#444748; font:400 12px/18px 'Montserrat',sans-serif; letter-spacing:.24px; white-space:nowrap; }
    .dot { width:8px; height:8px; border-radius:50%; background:#000; }
    .item h3 { margin:4px 0 4px; color:#000; font:600 16px/24px 'Montserrat',sans-serif; letter-spacing:.96px; overflow-wrap:anywhere; }
    .item p { margin:0; color:#444748; font:400 14px/22.75px 'Montserrat',sans-serif; letter-spacing:.14px; overflow-wrap:anywhere; }
    .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    .item:focus-visible, .tab:focus-visible, .mark-all:focus-visible, .pg:focus-visible { outline:2px solid #000; outline-offset:-2px; }
    .paging { margin-top:56px; display:flex; justify-content:center; align-items:center; gap:12px; flex-wrap:wrap; }
    .pg { width:36px; height:36px; border:1px solid #e3e2e2; background:#fff; color:#444748; font:600 11px/14px 'Montserrat',sans-serif; letter-spacing:1.76px; display:grid; place-items:center; padding:0; }
    .pg svg { width:10px; height:10px; stroke:currentColor; stroke-width:1.2; stroke-linecap:round; stroke-linejoin:round; }
    .pg:hover:not(:disabled) { border-color:#000; color:#000; } .pg.current { background:#000; border-color:#000; color:#fff; } .pg:disabled { opacity:.5; cursor:default; }
    .gap { color:#444748; font:400 14px/22px 'Outfit',sans-serif; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media (max-width:980px) { .account-shell { width:min(100% - 32px,760px); grid-template-columns:1fr; } }
    @media (max-width:640px) { .account-shell { width:100%; padding:20px 16px 64px; } .page-header h1 { font-size:34px; line-height:40px; } .tabs { gap:20px; } .item { padding:16px; } .item-top { align-items:flex-start; flex-direction:column; gap:2px; } }
    
  `],
})
export class NotificationsPage implements OnInit {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadNotifications(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly content = STORE_NOTIFICATIONS_CONTENT;

  readonly notifications = signal<NotificationItem[]>([]);
  readonly unreadCount = signal<number>(0);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');
  readonly tab = signal<'all' | 'unread'>('all');
  /** Tab "Chưa đọc" lọc trong trang đang xem: chỉ giữ thông báo chưa có readAt. */
  readonly visibleNotifications = computed(() =>
    this.tab() === 'unread' ? this.notifications().filter((n) => !n.readAt) : this.notifications(),
  );

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.pagination.total() / this.pagination.limit)));
  /** Danh sách số trang; 0 là dấu "…". */
  readonly pageItems = computed<number[]>(() => {
    const last = this.pageCount();
    const cur = this.pagination.page();
    if (last <= 5) return Array.from({ length: last }, (_, i) => i + 1);
    const set = new Set<number>([1, 2, 3, last, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= last));
    const sorted = [...set].sort((a, b) => a - b);
    const out: number[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) out.push(0);
      out.push(p);
    });
    return out;
  });

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.loading.set(true);
    this.error.set('');
    this.pagination.load(() => this.api.listNotifications(this.pagination.page(), this.pagination.limit), {
      next: (res) => {
        this.notifications.set(res.items);
        this.unreadCount.set(res.unreadCount || 0);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không thể tải thông báo. Vui lòng thử lại.');
        this.loading.set(false);
      },
    });
  }

  /** Đánh dấu đã đọc; thông báo hỗ trợ còn mở thẳng phiếu liên quan. */
  open(n: NotificationItem): void {
    this.markRead(n);
    const ticketId = n.reference?.['ticketId'];
    if (this.kindOf(n.type) === 'support' && typeof ticketId === 'string' && ticketId) {
      void this.router.navigate(['/support'], { queryParams: { ticketId } });
    }
  }

  markRead(n: NotificationItem): void {
    if (n.readAt) return;
    this.api.markNotificationRead(n.id).subscribe({
      next: (updated) => {
        this.notifications.update((list) =>
          list.map((item) => (item.id === n.id ? updated : item))
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
    });
  }

  markAllRead(): void {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((item) => ({ ...item, readAt: new Date().toISOString() }))
        );
        this.unreadCount.set(0);
        this.toast.success('Đã đánh dấu đã đọc tất cả thông báo.');
      },
      error: () => {
        this.toast.error('Không thể cập nhật trạng thái.');
      },
    });
  }

  kindOf(type: string | undefined): NotificationKind {
    const t = (type ?? '').toLowerCase();
    if (t.startsWith('order')) return 'order';
    if (t.startsWith('payment')) return 'payment';
    if (t.startsWith('refund')) return 'refund';
    if (t.startsWith('ai')) return 'ai';
    if (t.startsWith('post') || t.startsWith('comment') || t.startsWith('community')) return 'community';
    if (t.startsWith('lookbook')) return 'lookbook';
    if (t.startsWith('support')) return 'support';
    return 'general';
  }

  kindLabel(type: string | undefined): string {
    return KIND_LABEL[this.kindOf(type)];
  }

  fullDate(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString('vi-VN');
  }

  relativeTime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Hôm qua';
    if (days < 30) return `${days} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  }
}
