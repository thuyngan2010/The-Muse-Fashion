import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { Order, SupportMessage, SupportTicket, SupportTicketCategory, SupportTicketDetail, SupportTicketStatus } from '@fashion/contracts';
import { AccountSidebarComponent } from '../components/account-sidebar.component';
import { ModalComponent } from '../components/modal.component';
import { PageStateComponent } from '../components/page-state.component';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { SUPPORT_CATEGORY_LABELS, orderStatusLabel, supportCategoryLabel, supportStatusLabel } from '../shared/labels';

/** Chu kỳ polling tin nhắn của phiếu đang mở và làm mới danh sách phiếu. */
export const SUPPORT_MESSAGE_POLL_MS = 5_000;
export const SUPPORT_LIST_REFRESH_MS = 30_000;
const MAX_BODY = 2000;
const LIST_LIMIT = 50;

type TicketFilter = 'all' | 'open' | 'closed';

@Component({
  standalone: true,
  imports: [AccountSidebarComponent, ModalComponent, PageStateComponent, RouterLink],
  template: `
    <main class="account-shell">
      <fc-account-sidebar activeItem="support" />

      <section class="support-content">
        <header class="page-header">
          <h1>Hỗ trợ khách hàng</h1>
          <p>Gửi yêu cầu và trao đổi trực tiếp với đội ngũ MUSE về đơn hàng, size, thanh toán hoặc tài khoản.</p>
        </header>

        @if (listLoading()) {
          <fc-page-state kind="loading" title="Đang tải yêu cầu hỗ trợ" message="Danh sách yêu cầu của bạn đang được cập nhật." />
        } @else if (listError()) {
          <fc-page-state kind="error" title="Không thể tải yêu cầu hỗ trợ" [message]="listError()" actionLabel="THỬ LẠI" (action)="loadTickets(true)" />
        } @else if (tickets().length === 0) {
          <fc-page-state kind="empty" title="Bạn chưa có yêu cầu hỗ trợ nào" message="Khi cần giúp đỡ, hãy gửi yêu cầu để MUSE phản hồi cho bạn ngay trong trang này." actionLabel="TẠO YÊU CẦU HỖ TRỢ" (action)="openCreate()" />
        } @else {
          <div class="support-grid" [class.has-selection]="!!selectedId()">
            <section class="ticket-pane" aria-label="Yêu cầu của tôi">
              <button type="button" class="btn btn-pink new-btn" (click)="openCreate()">+ TẠO YÊU CẦU HỖ TRỢ</button>

              <div class="tabs" role="tablist" aria-label="Bộ lọc yêu cầu">
                <button type="button" role="tab" class="tab" [class.active]="filter() === 'all'" [attr.aria-selected]="filter() === 'all'" (click)="filter.set('all')">TẤT CẢ ({{ counts().all }})</button>
                <button type="button" role="tab" class="tab" [class.active]="filter() === 'open'" [attr.aria-selected]="filter() === 'open'" (click)="filter.set('open')">ĐANG MỞ ({{ counts().open }})</button>
                <button type="button" role="tab" class="tab" [class.active]="filter() === 'closed'" [attr.aria-selected]="filter() === 'closed'" (click)="filter.set('closed')">ĐÃ ĐÓNG ({{ counts().closed }})</button>
              </div>

              @if (visibleTickets().length === 0) {
                <p class="filter-empty">Không có yêu cầu nào trong mục này.</p>
              } @else {
                <ul class="ticket-list" role="list">
                  @for (t of visibleTickets(); track t.id) {
                    <li>
                      <button type="button" class="ticket-item" [class.active]="t.id === selectedId()" [attr.aria-current]="t.id === selectedId() ? 'true' : null" (click)="selectTicket(t.id)">
                        <span class="t-top">
                          <span class="t-code">{{ t.code }}</span>
                          <span class="t-time" [attr.title]="fullDate(t.lastMessageAt)">{{ relativeTime(t.lastMessageAt) }}</span>
                        </span>
                        <strong class="t-subject">{{ t.subject }}</strong>
                        <span class="t-meta">{{ categoryLabel(t.category) }} <span [class]="'badge ' + statusClass(t.status)">{{ statusLabel(t.status) }}</span></span>
                        <span class="t-preview">{{ t.lastMessagePreview }}</span>
                        @if (t.unreadForCustomer > 0 && t.id !== selectedId()) {
                          <span class="dot" aria-hidden="true"></span><span class="sr-only">Có tin nhắn chưa đọc</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
                @if (listTotal() > tickets().length) { <p class="list-note">Đang hiển thị {{ tickets().length }} yêu cầu gần nhất.</p> }
              }
            </section>

            <section class="conversation" aria-label="Hội thoại">
              @if (!selectedId()) {
                <div class="placeholder"><span class="mark" aria-hidden="true">MUSE</span><h2>Chọn một yêu cầu để xem hội thoại</h2><p>Nội dung trao đổi với MUSE sẽ hiển thị tại đây.</p></div>
              } @else if (convLoading()) {
                <fc-page-state kind="loading" title="Đang tải hội thoại" message="Vui lòng chờ trong giây lát." />
              } @else if (convError()) {
                <button type="button" class="back-btn" (click)="backToList()"><span aria-hidden="true">←</span> DANH SÁCH YÊU CẦU</button>
                <fc-page-state kind="error" title="Không thể mở hội thoại" [message]="convError()" actionLabel="THỬ LẠI" (action)="retryConversation()" />
              } @else if (detail(); as d) {
                <header class="conv-head">
                  <button type="button" class="back-btn" (click)="backToList()"><span aria-hidden="true">←</span> DANH SÁCH YÊU CẦU</button>
                  <div class="conv-top">
                    <div class="conv-code"><span class="t-code">{{ d.code }}</span><span [class]="'badge ' + statusClass(d.status)">{{ statusLabel(d.status) }}</span></div>
                    @if (d.status !== 'CLOSED') { <button type="button" class="link-danger" (click)="closeConfirmOpen.set(true)">ĐÓNG YÊU CẦU</button> }
                  </div>
                  <h2>{{ d.subject }}</h2>
                  <p class="conv-meta">
                    <span>{{ categoryLabel(d.category) }}</span>
                    @if (d.orderId && d.orderCode) { <span>Đơn hàng <a [routerLink]="['/orders', d.orderId]">{{ d.orderCode }}</a></span> }
                    @if (d.assignedStaffName) { <span>Phụ trách: {{ d.assignedStaffName }}</span> }
                  </p>
                </header>

                <div class="messages" #scroller role="log" aria-live="polite" aria-label="Tin nhắn của yêu cầu">
                  @for (m of messages(); track m.id) {
                    @if (m.senderRole === 'SYSTEM') {
                      <p class="sys"><span>{{ m.body }}</span> <time [attr.datetime]="m.createdAt" [attr.title]="fullDate(m.createdAt)">· {{ messageTime(m.createdAt) }}</time></p>
                    } @else {
                      <article class="msg" [class.mine]="m.senderRole === 'CUSTOMER'">
                        <div class="msg-meta">
                          @if (m.senderRole !== 'CUSTOMER') { <strong>{{ m.senderName }}</strong> }
                          <time [attr.datetime]="m.createdAt" [attr.title]="fullDate(m.createdAt)">{{ messageTime(m.createdAt) }}</time>
                        </div>
                        <p class="bubble">{{ m.body }}</p>
                      </article>
                    }
                  }
                </div>

                @if (d.status === 'CLOSED') {
                  <div class="closed-box" role="status">
                    <strong>Yêu cầu đã đóng</strong>
                    <p>Bạn không thể gửi thêm tin nhắn vào yêu cầu này.</p>
                    <button type="button" class="btn btn-pink" (click)="openCreate()">TẠO YÊU CẦU MỚI</button>
                  </div>
                } @else {
                  <form class="composer" (submit)="onSubmitMessage($event)">
                    <label class="sr-only" for="support-composer">Nội dung tin nhắn</label>
                    <textarea id="support-composer" rows="3" [attr.maxlength]="maxBody" placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter để xuống dòng)"
                      [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown)="onComposerKey($event)"></textarea>
                    <div class="composer-foot">
                      <span class="count" [class.warn]="draft().length > maxBody - 100">{{ draft().length }}/{{ maxBody }}</span>
                      <button type="submit" class="btn btn-pink" [disabled]="sending() || !draft().trim()">{{ sending() ? 'ĐANG GỬI…' : 'GỬI' }}</button>
                    </div>
                    @if (sendError()) { <p class="alert alert--error" role="alert">{{ sendError() }}</p> }
                  </form>
                }
              }
            </section>
          </div>
        }
      </section>
    </main>

    <fc-modal [isOpen]="createOpen()" title="Tạo yêu cầu hỗ trợ" maxWidth="640px" (close)="closeCreate()">
      @if (createOpen()) {
        <form class="create-form" (submit)="submitCreate($event)" novalidate>
          <div class="field">
            <label for="sp-category">LOẠI YÊU CẦU</label>
            <select id="sp-category" [attr.aria-invalid]="submitted() && !newCategory()" (change)="newCategory.set($any($event.target).value)">
              <option value="" disabled [selected]="!newCategory()">Chọn loại yêu cầu</option>
              @for (c of categories; track c) { <option [value]="c" [selected]="c === newCategory()">{{ categoryLabel(c) }}</option> }
            </select>
            @if (submitted() && !newCategory()) { <p class="error">Vui lòng chọn loại yêu cầu.</p> }
          </div>
          <div class="field">
            <label for="sp-subject">TIÊU ĐỀ</label>
            <input id="sp-subject" type="text" maxlength="150" autocomplete="off" placeholder="Ví dụ: Tư vấn size áo sơ mi" [value]="newSubject()"
              [attr.aria-invalid]="submitted() && !!subjectError()" (input)="newSubject.set($any($event.target).value)" />
            @if (submitted() && subjectError()) { <p class="error">{{ subjectError() }}</p> }
          </div>
          <div class="field">
            <label for="sp-order">ĐƠN HÀNG LIÊN QUAN (KHÔNG BẮT BUỘC)</label>
            <select id="sp-order" [disabled]="ordersLoading()" (change)="newOrderId.set($any($event.target).value)">
              <option value="" [selected]="!newOrderId()">{{ ordersLoading() ? 'Đang tải đơn hàng…' : 'Không gắn đơn hàng' }}</option>
              @for (o of orders(); track o.id) { <option [value]="o.id" [selected]="o.id === newOrderId()">{{ o.code }} · {{ orderState(o.state) }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="sp-message">NỘI DUNG</label>
            <textarea id="sp-message" rows="5" [attr.maxlength]="maxBody" placeholder="Mô tả vấn đề bạn cần MUSE hỗ trợ" [value]="newMessage()"
              [attr.aria-invalid]="submitted() && !!messageError()" (input)="newMessage.set($any($event.target).value)"></textarea>
            <div class="field-foot">
              @if (submitted() && messageError()) { <p class="error">{{ messageError() }}</p> } @else { <span></span> }
              <span class="count">{{ newMessage().length }}/{{ maxBody }}</span>
            </div>
          </div>
          @if (createError()) { <p class="alert alert--error" role="alert">{{ createError() }}</p> }
          <div class="modal-actions">
            <button type="button" class="btn btn-line" [disabled]="creating()" (click)="closeCreate()">HỦY</button>
            <button type="submit" class="btn btn-pink" [disabled]="creating()">{{ creating() ? 'ĐANG GỬI…' : 'GỬI YÊU CẦU' }}</button>
          </div>
        </form>
      }
    </fc-modal>

    <fc-modal [isOpen]="closeConfirmOpen()" title="Đóng yêu cầu hỗ trợ" maxWidth="480px" (close)="closeConfirmOpen.set(false)">
      <p class="confirm-text">Sau khi đóng, bạn không thể gửi thêm tin nhắn vào yêu cầu này. Bạn vẫn có thể tạo yêu cầu mới bất cứ lúc nào.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-line" [disabled]="closing()" (click)="closeConfirmOpen.set(false)">QUAY LẠI</button>
        <button type="button" class="btn btn-black" [disabled]="closing()" (click)="confirmClose()">{{ closing() ? 'ĐANG ĐÓNG…' : 'ĐÓNG YÊU CẦU' }}</button>
      </div>
    </fc-modal>
  `,
  styles: [`
    :host { display:block; background:var(--ui-bg); color:var(--ui-ink); } * { box-sizing:border-box; }
    .account-shell { width:min(1184px,calc(100% - 48px)); margin:0 auto; padding:40px 0 96px; display:grid; grid-template-columns:280px minmax(0,1fr); gap:32px; align-items:start; font-family:var(--font-sans); }
    .support-content { min-width:0; }
    .page-header { padding-bottom:24px; border-bottom:1px solid var(--ui-line-soft); }
    .page-header h1 { margin:0 0 8px; font:400 40px/48px var(--font-serif); letter-spacing:-1px; }
    .page-header p { margin:0; color:var(--ui-ink-soft); font-size:14px; line-height:22px; }

    .btn { min-height:44px; padding:0 24px; border:1px solid var(--ui-ink); border-radius:0; font:700 12px var(--font-sans); letter-spacing:.08em; text-transform:uppercase; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
    .btn-pink { background:var(--ui-pink); color:var(--ui-ink); } .btn-black { background:var(--ui-ink); color:#fff; } .btn-line { background:#fff; color:var(--ui-ink); }
    .btn:hover:not(:disabled) { background:var(--ui-ink); color:#fff; }
    .btn:disabled { border-color:var(--ui-line); background:var(--ui-bg-image); color:var(--ui-subtle); cursor:not-allowed; }
    .btn:focus-visible, .tab:focus-visible, .ticket-item:focus-visible, .back-btn:focus-visible, .link-danger:focus-visible { outline:2px solid var(--ui-accent); outline-offset:2px; }

    .support-grid { margin-top:32px; display:grid; grid-template-columns:minmax(260px,340px) minmax(0,1fr); gap:24px; align-items:start; }
    .ticket-pane { min-width:0; border:1px solid var(--ui-line); background:#fff; padding:16px; }
    .new-btn { width:100%; }
    .tabs { margin-top:16px; display:flex; gap:12px; flex-wrap:wrap; border-bottom:1px solid var(--ui-line-soft); }
    .tab { padding:0 0 10px; border:0; border-bottom:2px solid transparent; margin-bottom:-1px; background:none; color:var(--ui-ink-soft); font:700 10px/14px var(--font-sans); letter-spacing:.6px; cursor:pointer; }
    .tab:hover { color:var(--ui-ink); } .tab.active { color:var(--ui-ink); border-bottom-color:var(--ui-ink); }
    .ticket-list { list-style:none; margin:8px 0 0; padding:0; max-height:640px; overflow:auto; }
    .ticket-item { position:relative; width:100%; padding:14px 16px 14px 12px; border:0; border-bottom:1px solid var(--ui-line-soft); border-left:3px solid transparent; background:#fff; text-align:left; display:grid; gap:6px; cursor:pointer; font-family:var(--font-sans); color:var(--ui-ink); }
    .ticket-item:hover { background:var(--ui-bg-soft); } .ticket-item.active { background:var(--ui-pink-soft); border-left-color:var(--ui-ink); }
    .t-top { display:flex; justify-content:space-between; gap:8px; align-items:center; }
    .t-code { color:var(--ui-accent); font:700 11px/14px var(--font-sans); letter-spacing:1.1px; }
    .t-time { color:var(--ui-subtle); font-size:11px; white-space:nowrap; }
    .t-subject { font:600 14px/20px var(--font-sans); overflow-wrap:anywhere; }
    .t-meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; color:var(--ui-ink-soft); font-size:12px; }
    .t-preview { color:var(--ui-ink-soft); font-size:12px; line-height:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dot { position:absolute; top:16px; right:10px; width:8px; height:8px; border-radius:50%; background:var(--ui-ink); }
    .filter-empty, .list-note { margin:16px 0 0; color:var(--ui-subtle); font-size:12px; line-height:18px; }

    .badge { display:inline-flex; padding:3px 8px; border:1px solid currentColor; font:600 10px var(--font-sans); letter-spacing:1px; text-transform:uppercase; white-space:nowrap; }
    .badge--success { color:var(--ui-success); background:var(--ui-success-bg); } .badge--warning { color:var(--ui-warning); background:var(--ui-warning-bg); }
    .badge--info { color:var(--ui-info); background:var(--ui-info-bg); } .badge--muted { color:var(--ui-subtle); background:var(--ui-bg-soft); }

    .conversation { min-width:0; border:1px solid var(--ui-line); background:#fff; display:flex; flex-direction:column; min-height:520px; max-height:min(760px,calc(100dvh - 120px)); }
    .conversation fc-page-state { margin:auto; }
    .placeholder { margin:auto; padding:48px 24px; text-align:center; }
    .placeholder .mark { display:inline-flex; width:60px; height:60px; align-items:center; justify-content:center; margin-bottom:16px; border:1px solid var(--ui-ink); color:var(--ui-accent); font:400 13px var(--font-serif); letter-spacing:.15em; }
    .placeholder h2 { margin:0 0 8px; font:400 24px/32px var(--font-serif); } .placeholder p { margin:0; color:var(--ui-ink-soft); font-size:14px; }
    .conv-head { padding:16px 20px; border-bottom:1px solid var(--ui-line-soft); background:var(--ui-bg-soft); }
    .conv-top { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
    .conv-code { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .conv-head h2 { margin:8px 0 4px; font:500 22px/30px var(--font-serif); overflow-wrap:anywhere; }
    .conv-meta { margin:0; display:flex; flex-wrap:wrap; gap:4px 16px; color:var(--ui-ink-soft); font-size:12px; line-height:18px; }
    .conv-meta a { color:var(--ui-ink); font-weight:600; text-underline-offset:3px; } .conv-meta a:hover { color:var(--ui-accent); }
    .back-btn { display:none; margin:0 0 12px; padding:0; border:0; background:none; color:var(--ui-ink); font:700 11px var(--font-sans); letter-spacing:.1em; cursor:pointer; }
    .link-danger { padding:0; border:0; background:none; color:var(--ui-danger); font:700 11px var(--font-sans); letter-spacing:.1em; text-decoration:underline; text-underline-offset:5px; cursor:pointer; }

    .messages { flex:1; min-height:240px; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:14px; background:#fff; }
    .msg { max-width:78%; align-self:flex-start; } .msg.mine { align-self:flex-end; }
    .msg-meta { display:flex; gap:8px; align-items:baseline; margin-bottom:4px; color:var(--ui-subtle); font-size:11px; } .msg.mine .msg-meta { justify-content:flex-end; }
    .msg-meta strong { color:var(--ui-ink); font-size:12px; }
    .bubble { margin:0; padding:10px 14px; border:1px solid var(--ui-line); background:#fff; font-size:14px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
    .msg.mine .bubble { border-color:var(--ui-ink); background:var(--ui-pink-soft); }
    .sys { margin:0; align-self:center; text-align:center; color:var(--ui-subtle); font-size:12px; line-height:18px; overflow-wrap:anywhere; }

    .composer { padding:16px 20px; border-top:1px solid var(--ui-line-soft); background:var(--ui-bg-soft); }
    textarea, input[type="text"], select { width:100%; border:1px solid var(--ui-ink); border-radius:0; background:#fff; color:var(--ui-ink); font:400 13px/1.6 var(--font-sans); }
    textarea { padding:10px 14px; resize:vertical; min-height:76px; } input[type="text"], select { min-height:44px; padding:0 14px; }
    textarea:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid var(--ui-accent); outline-offset:2px; }
    [aria-invalid="true"] { border-color:var(--ui-danger); }
    .composer-foot { margin-top:10px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .count { color:var(--ui-subtle); font-size:12px; } .count.warn { color:var(--ui-warning); }
    .alert { margin:12px 0 0; padding:12px 16px; border:1px solid var(--ui-line); font-size:13px; line-height:1.6; }
    .alert--error { border-color:var(--ui-danger); background:var(--ui-danger-bg); color:var(--ui-danger); }
    .closed-box { padding:20px; border-top:1px solid var(--ui-line-soft); background:var(--ui-bg-soft); text-align:center; display:grid; gap:8px; justify-items:center; }
    .closed-box strong { font:500 18px var(--font-serif); } .closed-box p { margin:0 0 8px; color:var(--ui-ink-soft); font-size:13px; }

    .create-form { display:grid; gap:18px; } .field label { display:block; margin-bottom:8px; font:700 11px var(--font-sans); letter-spacing:.55px; color:var(--ui-ink-soft); }
    .field .error { margin:6px 0 0; font-size:12px; color:var(--ui-danger); } .field-foot { margin-top:6px; display:flex; justify-content:space-between; gap:12px; }
    .modal-actions { display:flex; justify-content:flex-end; gap:12px; flex-wrap:wrap; } .confirm-text { margin:0 0 24px; color:var(--ui-ink-soft); font-size:14px; line-height:1.65; }
    .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

    @media (max-width:980px) {
      .account-shell { width:min(100% - 32px,760px); grid-template-columns:1fr; }
      .support-grid { grid-template-columns:1fr; }
      .support-grid.has-selection .ticket-pane { display:none; } .support-grid:not(.has-selection) .conversation { display:none; }
      .back-btn { display:inline-block; } .conversation { min-height:0; height:calc(100dvh - 140px); max-height:none; }
    }
    @media (max-width:640px) {
      textarea, input[type="text"], select { font-size:16px; }
      .account-shell { width:100%; padding:20px 16px 64px; } .page-header h1 { font-size:34px; line-height:40px; }
      .msg { max-width:92%; } .messages, .composer, .conv-head { padding-left:14px; padding-right:14px; }
      .btn { width:100%; } .composer-foot .btn { width:auto; } .modal-actions .btn { flex:1 1 100%; }
    }
  `],
})
export class SupportPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly maxBody = MAX_BODY;
  readonly categories = Object.keys(SUPPORT_CATEGORY_LABELS) as SupportTicketCategory[];
  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  // Danh sách phiếu
  readonly tickets = signal<SupportTicket[]>([]);
  readonly listTotal = signal(0);
  readonly listLoading = signal(true);
  readonly listError = signal('');
  readonly filter = signal<TicketFilter>('all');
  readonly counts = computed(() => {
    const all = this.tickets();
    return { all: all.length, open: all.filter((t) => t.status !== 'CLOSED').length, closed: all.filter((t) => t.status === 'CLOSED').length };
  });
  readonly visibleTickets = computed(() => {
    const mode = this.filter();
    return this.tickets().filter((t) => mode === 'all' || (mode === 'closed' ? t.status === 'CLOSED' : t.status !== 'CLOSED'));
  });

  // Hội thoại đang mở
  readonly selectedId = signal<string | null>(null);
  readonly detail = signal<SupportTicketDetail | null>(null);
  readonly messages = signal<SupportMessage[]>([]);
  readonly convLoading = signal(false);
  readonly convError = signal('');
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly sendError = signal('');
  readonly closeConfirmOpen = signal(false);
  readonly closing = signal(false);

  // Hộp tạo yêu cầu
  readonly createOpen = signal(false);
  readonly newCategory = signal<SupportTicketCategory | ''>('');
  readonly newSubject = signal('');
  readonly newOrderId = signal('');
  readonly newMessage = signal('');
  readonly orders = signal<Order[]>([]);
  readonly ordersLoading = signal(false);
  readonly creating = signal(false);
  readonly createError = signal('');
  readonly submitted = signal(false);
  readonly subjectError = computed(() => {
    const length = this.newSubject().trim().length;
    return length < 5 || length > 150 ? 'Tiêu đề cần từ 5 đến 150 ký tự.' : '';
  });
  readonly messageError = computed(() => {
    const length = this.newMessage().trim().length;
    return length < 1 || length > MAX_BODY ? `Nội dung cần từ 1 đến ${MAX_BODY} ký tự.` : '';
  });

  private conversationToken = 0;
  private polling = false;
  private messageTimer?: ReturnType<typeof setInterval>;
  private listTimer?: ReturnType<typeof setInterval>;
  private querySub?: { unsubscribe(): void };
  private readonly onVisibility = (): void => {
    if (!this.canPoll()) return;
    this.pollMessages();
    this.refreshTickets();
  };

  ngOnInit(): void {
    this.querySub = this.route.queryParamMap.subscribe((params) => this.onQuery(params.get('ticketId'), params.get('orderId')));
    this.loadTickets(true);
    this.messageTimer = setInterval(() => this.pollMessages(), SUPPORT_MESSAGE_POLL_MS);
    this.listTimer = setInterval(() => this.refreshTickets(), SUPPORT_LIST_REFRESH_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    clearInterval(this.messageTimer);
    clearInterval(this.listTimer);
    this.querySub?.unsubscribe();
    this.conversationToken++;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  // ───────── Điều hướng theo query (?ticketId=, ?orderId=) ─────────

  private onQuery(ticketId: string | null, orderId: string | null): void {
    if (orderId) {
      this.openCreate(orderId);
      void this.router.navigate([], { relativeTo: this.route, queryParams: { orderId: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    if (ticketId && ticketId !== this.selectedId()) this.openConversation(ticketId);
    else if (!ticketId && this.selectedId()) this.clearSelection();
  }

  selectTicket(id: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { ticketId: id }, queryParamsHandling: 'merge' });
  }

  backToList(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { ticketId: null }, queryParamsHandling: 'merge' });
  }

  private clearSelection(): void {
    this.conversationToken++;
    this.selectedId.set(null);
    this.detail.set(null);
    this.messages.set([]);
    this.convError.set('');
    this.convLoading.set(false);
    this.draft.set('');
    this.sendError.set('');
  }

  // ───────── Danh sách phiếu ─────────

  loadTickets(initial: boolean): void {
    if (initial) { this.listLoading.set(true); this.listError.set(''); }
    this.api.listSupportTickets(1, LIST_LIMIT).subscribe({
      next: (res) => { this.applyList(res.items, res.total); this.listLoading.set(false); },
      error: () => {
        this.listLoading.set(false);
        if (initial || this.tickets().length === 0) this.listError.set('Không thể tải danh sách yêu cầu. Vui lòng thử lại.');
      },
    });
  }

  /** Làm mới định kỳ: chỉ khi tab đang hiển thị; lỗi mạng tạm thời không làm mất danh sách đang xem. */
  refreshTickets(): void {
    if (!this.canPoll() || this.listLoading()) return;
    this.api.listSupportTickets(1, LIST_LIMIT).subscribe({
      next: (res) => {
        this.applyList(res.items, res.total);
        const id = this.selectedId();
        const row = id ? res.items.find((t) => t.id === id) : undefined;
        const current = this.detail();
        if (row && current) {
          if (row.assignedStaffId !== current.assignedStaffId) this.refreshDetail(row.id, false);
          else this.detail.set({ ...current, ...row });
        }
      },
      error: () => undefined,
    });
  }

  private applyList(items: SupportTicket[], total: number): void {
    this.tickets.set(items);
    this.listTotal.set(total);
    this.listError.set('');
  }

  private patchListRow(row: SupportTicket): void {
    this.tickets.update((list) => (list.some((t) => t.id === row.id) ? list.map((t) => (t.id === row.id ? row : t)) : [row, ...list]));
  }

  // ───────── Hội thoại ─────────

  retryConversation(): void {
    const id = this.selectedId();
    if (id) this.openConversation(id);
  }

  private openConversation(id: string): void {
    const token = ++this.conversationToken;
    this.selectedId.set(id);
    this.detail.set(null);
    this.messages.set([]);
    this.convError.set('');
    this.convLoading.set(true);
    this.draft.set('');
    this.sendError.set('');
    forkJoin({ ticket: this.api.getSupportTicket(id), list: this.api.listSupportMessages(id) }).subscribe({
      next: ({ ticket, list }) => {
        if (token !== this.conversationToken) return;
        this.detail.set(ticket);
        this.messages.set(list.items);
        this.convLoading.set(false);
        this.scrollToBottom();
        this.markRead(ticket);
      },
      error: (err: unknown) => {
        if (token !== this.conversationToken) return;
        this.convLoading.set(false);
        this.convError.set((err as { status?: number })?.status === 404
          ? 'Không tìm thấy yêu cầu hỗ trợ này.'
          : 'Không thể tải hội thoại. Vui lòng thử lại.');
      },
    });
  }

  private markRead(ticket: SupportTicketDetail): void {
    if (ticket.unreadForCustomer <= 0) return;
    this.api.markSupportTicketRead(ticket.id).subscribe({
      next: () => {
        if (this.detail()?.id === ticket.id) this.detail.update((d) => (d ? { ...d, unreadForCustomer: 0 } : d));
        this.tickets.update((list) => list.map((t) => (t.id === ticket.id ? { ...t, unreadForCustomer: 0 } : t)));
      },
      error: () => undefined,
    });
  }

  private refreshDetail(id: string, markIfUnread: boolean): void {
    this.api.getSupportTicket(id).subscribe({
      next: (ticket) => {
        if (this.selectedId() !== id) return;
        this.detail.set(ticket);
        this.patchListRow(ticket);
        if (markIfUnread) this.markRead(ticket);
      },
      error: () => undefined,
    });
  }

  /** Polling 5 giây: chỉ khi tab hiển thị và đang mở một hội thoại; `force` dùng ngay sau thao tác của khách. */
  pollMessages(force = false): void {
    const id = this.selectedId();
    if ((!force && !this.canPoll()) || !id || this.convLoading() || this.convError() || this.polling) return;
    const after = this.messages().at(-1)?.createdAt;
    if (!after) return;
    const token = this.conversationToken;
    this.polling = true;
    this.api.listSupportMessages(id, after).subscribe({
      next: (res) => {
        this.polling = false;
        if (token !== this.conversationToken) return;
        const fresh = this.freshMessages(res.items);
        if (!fresh.length) return;
        const stick = this.nearBottom();
        this.messages.update((list) => [...list, ...fresh]);
        if (stick) this.scrollToBottom();
        // Tin của MUSE hoặc hệ thống có thể đổi trạng thái/người phụ trách: tải lại phiếu và đánh dấu đã đọc.
        if (fresh.some((m) => m.senderRole !== 'CUSTOMER')) this.refreshDetail(id, true);
      },
      error: () => { this.polling = false; },
    });
  }

  private freshMessages(items: SupportMessage[]): SupportMessage[] {
    const known = new Set(this.messages().map((m) => m.id));
    return items.filter((m) => !known.has(m.id));
  }

  private canPoll(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'visible';
  }

  private nearBottom(): boolean {
    const el = this.scroller?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  private scrollToBottom(): void {
    if (typeof setTimeout === 'undefined') return;
    setTimeout(() => {
      const el = this.scroller?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // ───────── Gửi tin nhắn ─────────

  onComposerKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  onSubmitMessage(event: Event): void {
    event.preventDefault();
    this.send();
  }

  send(): void {
    const id = this.selectedId();
    const text = this.draft().trim();
    if (!id || !text || this.sending() || this.detail()?.status === 'CLOSED') return;
    if (text.length > MAX_BODY) { this.sendError.set(`Tin nhắn tối đa ${MAX_BODY} ký tự.`); return; }
    this.sending.set(true);
    this.sendError.set('');
    this.api.sendSupportMessage(id, text).subscribe({
      next: (message) => {
        this.sending.set(false);
        if (this.selectedId() !== id) return;
        this.messages.update((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
        this.draft.set('');
        this.scrollToBottom();
        this.refreshDetail(id, false); // phiếu RESOLVED được mở lại khi khách nhắn
      },
      error: (err: unknown) => {
        this.sending.set(false);
        // Giữ nguyên nội dung đang soạn để khách gửi lại.
        this.sendError.set(this.errorText(err, 'Không gửi được tin nhắn. Nội dung của bạn vẫn được giữ lại, vui lòng thử lại.'));
        if ((err as { status?: number })?.status === 409) this.refreshDetail(id, false);
      },
    });
  }

  // ───────── Đóng phiếu ─────────

  confirmClose(): void {
    const id = this.selectedId();
    if (!id || this.closing()) return;
    this.closing.set(true);
    this.api.closeSupportTicket(id).subscribe({
      next: (ticket) => {
        this.closing.set(false);
        this.closeConfirmOpen.set(false);
        this.patchListRow(ticket);
        if (this.selectedId() === id) {
          this.detail.update((d) => (d ? { ...d, ...ticket } : d));
          this.pollMessages(true); // lấy ngay tin hệ thống "đã đóng phiếu"
        }
        this.toast.success('Đã đóng yêu cầu hỗ trợ.');
      },
      error: (err: unknown) => {
        this.closing.set(false);
        this.toast.error(this.errorText(err, 'Không thể đóng yêu cầu. Vui lòng thử lại.'));
      },
    });
  }

  // ───────── Tạo yêu cầu ─────────

  openCreate(orderId?: string): void {
    this.newCategory.set(orderId ? 'ORDER' : '');
    this.newSubject.set('');
    this.newMessage.set('');
    this.newOrderId.set(orderId ?? '');
    this.createError.set('');
    this.submitted.set(false);
    this.createOpen.set(true);
    this.loadOrders(orderId);
  }

  closeCreate(): void {
    if (this.creating()) return;
    this.createOpen.set(false);
  }

  private loadOrders(preselect?: string): void {
    this.ordersLoading.set(true);
    this.api.listOrders(1, 50).subscribe({
      next: (res) => {
        this.orders.set(res.items);
        this.ordersLoading.set(false);
        if (preselect && !res.items.some((o) => o.id === preselect)) this.addPreselectedOrder(preselect);
      },
      error: () => {
        this.ordersLoading.set(false);
        if (preselect) this.addPreselectedOrder(preselect);
      },
    });
  }

  /** Đơn được chọn từ trang chi tiết có thể nằm ngoài 50 đơn gần nhất: tải riêng để vẫn chọn sẵn được. */
  private addPreselectedOrder(id: string): void {
    this.api.getOrder(id).subscribe({
      next: (order) => this.orders.update((list) => (list.some((o) => o.id === order.id) ? list : [order, ...list])),
      error: () => {
        if (this.newOrderId() === id) this.newOrderId.set('');
        this.toast.warning('Không tìm thấy đơn hàng đã chọn. Bạn vẫn có thể gửi yêu cầu không gắn đơn.');
      },
    });
  }

  submitCreate(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    const category = this.newCategory();
    if (!category || this.subjectError() || this.messageError() || this.creating()) return;
    this.creating.set(true);
    this.createError.set('');
    const orderId = this.newOrderId();
    this.api.createSupportTicket({
      subject: this.newSubject().trim(), category, message: this.newMessage().trim(), ...(orderId ? { orderId } : {}),
    }).subscribe({
      next: (ticket) => {
        this.creating.set(false);
        this.createOpen.set(false);
        this.tickets.update((list) => [ticket, ...list.filter((t) => t.id !== ticket.id)]);
        this.listTotal.update((n) => n + 1);
        this.listError.set('');
        this.filter.set('all');
        this.toast.success('Đã gửi yêu cầu hỗ trợ. MUSE sẽ phản hồi cho bạn sớm.');
        this.selectTicket(ticket.id);
      },
      error: (err: unknown) => {
        this.creating.set(false);
        this.createError.set(this.errorText(err, 'Không thể gửi yêu cầu lúc này. Vui lòng kiểm tra thông tin và thử lại.'));
      },
    });
  }

  // ───────── Hiển thị ─────────

  statusLabel(status: string): string { return supportStatusLabel(status); }
  categoryLabel(category: string): string { return supportCategoryLabel(category); }
  orderState(state: string): string { return orderStatusLabel(state); }

  statusClass(status: SupportTicketStatus): string {
    switch (status) {
      case 'OPEN': return 'badge--warning';
      case 'IN_PROGRESS': return 'badge--info';
      case 'RESOLVED': return 'badge--success';
      default: return 'badge--muted';
    }
  }

  fullDate(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString('vi-VN');
  }

  /** Giờ phút trong ngày; tin của ngày khác kèm ngày/tháng. */
  messageTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? time : `${time} ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
  }

  relativeTime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Hôm qua';
    if (days < 30) return `${days} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  }

  /** Chỉ hiện thông báo tiếng Việt do máy chủ trả về cho lỗi nghiệp vụ; còn lại dùng câu mặc định. */
  private errorText(err: unknown, fallback: string): string {
    const e = err as { status?: number; error?: { code?: string; message?: unknown } };
    const message = e?.error?.message;
    if (typeof message === 'string' && e.error?.code !== 'VALIDATION_FAILED'
      && [400, 404, 409, 429].includes(e.status ?? 0) && /[À-ỹ]/.test(message)) return message;
    return fallback;
  }
}
