import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, forkJoin, of } from 'rxjs';
import type {
  AdminSupportTicketDetail, AdminSupportTicketRow, AdminUserDetail, SupportMessage, SupportStats, SupportTicketCategory, SupportTicketStatus, UserSummary,
} from '@fashion/contracts';
import { AdminCustomerTabsComponent, SUPPORT_UNREAD_EVENT } from '../../components/admin-customer-tabs.component';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { ModalComponent } from '../../components/modal.component';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { SUPPORT_CATEGORY_LABELS, orderStatusLabel, supportCategoryLabel, supportStatusLabel } from '../../shared/labels';

export const ADMIN_MESSAGE_POLL_MS = 5_000;
export const ADMIN_LIST_POLL_MS = 15_000;
const LIST_LIMIT = 50;
const MAX_BODY = 2000;
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

type TabKey = 'need' | 'all' | 'closed';
type AssignedFilter = '' | 'me' | 'unassigned';
type ConfirmAction = 'RESOLVED' | 'CLOSED';
type MessageGroup = { key: string; label: string; items: SupportMessage[] };

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, AdminCustomerTabsComponent, AdminDrawerComponent, ModalComponent],
  template: `
    <div class="as">
      <fc-admin-customer-tabs active="support" />

      <header class="topbar">
        <h1 class="title">Trung tâm trợ giúp</h1>
        <div class="tabs" role="tablist" aria-label="Nhóm phiếu">
          <button type="button" role="tab" class="tab" [class.active]="tab() === 'need'" [attr.aria-selected]="tab() === 'need'" (click)="setTab('need')">Cần xử lý <span class="count">{{ needCount() }}</span></button>
          <button type="button" role="tab" class="tab" [class.active]="tab() === 'all'" [attr.aria-selected]="tab() === 'all'" (click)="setTab('all')">Tất cả <span class="count">{{ allCount() }}</span></button>
          <button type="button" role="tab" class="tab" [class.active]="tab() === 'closed'" [attr.aria-selected]="tab() === 'closed'" (click)="setTab('closed')">Đã đóng <span class="count">{{ stats()?.byStatus?.CLOSED ?? 0 }}</span></button>
        </div>
        <div class="top-right">
          <span class="avg">Phản hồi trung bình: <strong>{{ avgText() }}</strong></span>
          <div class="filter-wrap">
            <button type="button" class="btn-outline" [class.on]="filtersActive()" aria-haspopup="true" [attr.aria-expanded]="filterOpen()" (click)="filterOpen.set(!filterOpen())">Bộ lọc{{ filtersActive() ? ' •' : '' }}</button>
            @if (filterOpen()) {
              <div class="filter-panel" role="group" aria-label="Bộ lọc phiếu">
                <label for="f-assigned">Phụ trách</label>
                <select id="f-assigned" [ngModel]="assignedFilter()" (ngModelChange)="setAssigned($event)" name="assigned">
                  <option value="">Tất cả</option>
                  <option value="me">Của tôi</option>
                  <option value="unassigned">Chưa phân công</option>
                </select>
                <label for="f-category">Loại phiếu</label>
                <select id="f-category" [ngModel]="categoryFilter()" (ngModelChange)="categoryFilter.set($event)" name="category">
                  <option value="">Tất cả loại</option>
                  @for (c of categories; track c) { <option [value]="c">{{ categoryLabel(c) }}</option> }
                </select>
                <button type="button" class="link-btn" (click)="resetFilters()">Xóa bộ lọc</button>
              </div>
            }
          </div>
        </div>
      </header>

      <div class="board" [class.has-selection]="!!selectedId()">
        <section class="list-col" aria-label="Danh sách phiếu">
          <div class="search">
            <label class="sr-only" for="sp-search">Tìm phiếu hỗ trợ</label>
            <input id="sp-search" type="search" [ngModel]="search()" (ngModelChange)="onSearch($event)" name="search" placeholder="Tìm theo mã phiếu, tiêu đề, tên khách…" autocomplete="off" maxlength="100" />
          </div>
          @if (listLoading()) {
            <div class="state-box" role="status"><span class="spinner"></span><p>Đang tải danh sách phiếu…</p></div>
          } @else if (listError()) {
            <div class="state-box" role="alert"><p>{{ listError() }}</p><button type="button" class="btn-outline" (click)="loadList(true)">Thử lại</button></div>
          } @else if (visibleTickets().length === 0) {
            <div class="state-box"><p>{{ search().trim() || filtersActive() ? 'Không có phiếu nào khớp tìm kiếm hoặc bộ lọc.' : 'Chưa có phiếu hỗ trợ nào trong mục này.' }}</p></div>
          } @else {
            <ul class="tickets" role="list">
              @for (t of visibleTickets(); track t.id) {
                <li>
                  <button type="button" class="ticket" [class.active]="t.id === selectedId()" [attr.aria-current]="t.id === selectedId() ? 'true' : null" (click)="selectTicket(t.id)">
                    <span class="t-row">
                      <strong class="t-name">{{ t.customerName }}</strong>
                      <span class="t-time" [attr.title]="fullDate(t.lastMessageAt)">{{ relativeTime(t.lastMessageAt) }}</span>
                    </span>
                    <span class="t-cat">{{ categoryLabel(t.category) }}</span>
                    <span class="t-subject">#{{ t.code }}: {{ t.subject }}</span>
                    <span class="t-preview">{{ t.lastMessagePreview }}</span>
                    <span class="t-foot">
                      <span [class]="'badge ' + statusClass(t.status)">{{ statusLabel(t.status) }}</span>
                      <span class="t-staff">{{ t.assignedStaffName ? 'Phụ trách: ' + t.assignedStaffName : 'Chưa phân công' }}</span>
                    </span>
                    @if (t.unreadForStaff > 0 && t.id !== selectedId()) { <span class="dot" aria-hidden="true"></span><span class="sr-only">Có tin nhắn chưa đọc</span> }
                  </button>
                </li>
              }
            </ul>
            @if (listTotal() > tickets().length) { <p class="note">Đang hiển thị {{ tickets().length }} phiếu mới nhất. Dùng ô tìm kiếm để thu hẹp.</p> }
          }
        </section>

        <section class="conv-col" aria-label="Hội thoại">
          @if (!selectedId()) {
            <div class="placeholder"><h2>Chọn một phiếu để xem hội thoại</h2><p>Nội dung trao đổi với khách hàng sẽ hiển thị tại đây.</p></div>
          } @else if (convLoading()) {
            <div class="state-box" role="status"><span class="spinner"></span><p>Đang tải hội thoại…</p></div>
          } @else if (convError()) {
            <div class="state-box" role="alert">
              <p>{{ convError() }}</p>
              <div class="row"><button type="button" class="btn-outline" (click)="retryConversation()">Thử lại</button><button type="button" class="btn-outline back-only" (click)="backToList()">Về danh sách</button></div>
            </div>
          } @else if (detail(); as d) {
            <header class="conv-head">
              <button type="button" class="back-btn" (click)="backToList()"><span aria-hidden="true">←</span> DANH SÁCH PHIẾU</button>
              <div class="who">
                <span class="avatar" aria-hidden="true">{{ initial(d.customer.fullName) }}</span>
                <div class="who-text">
                  <strong>{{ d.customer.fullName }}</strong>
                  <span class="who-meta">
                    {{ categoryLabel(d.category) }}
                    @if (d.orderId && d.orderCode) {
                      · Đơn gốc <a [routerLink]="['/admin/orders']" [queryParams]="{ orderId: d.orderId }">{{ d.orderCode }}</a>
                    }
                  </span>
                </div>
              </div>
              <div class="head-actions">
                @if (phoneHref(d.customer.phone); as tel) { <a class="btn-outline" [href]="tel">Gọi nhanh</a> }
                <button type="button" class="btn-primary" (click)="openDrawer()">Thông tin khách &amp; Đơn hàng</button>
              </div>
            </header>
            <p class="conv-subject"><span class="t-code">#{{ d.code }}</span> {{ d.subject }} <span [class]="'badge ' + statusClass(d.status)">{{ statusLabel(d.status) }}</span></p>

            <div class="messages" #scroller role="log" aria-live="polite" aria-label="Tin nhắn của phiếu">
              @for (g of groups(); track g.key) {
                <div class="day"><span>{{ g.label }}</span></div>
                @for (m of g.items; track m.id) {
                  @if (m.senderRole === 'SYSTEM') {
                    <p class="sys">{{ m.body }} · {{ clock(m.createdAt) }}</p>
                  } @else {
                    <article class="msg" [class.staff]="m.senderRole !== 'CUSTOMER'">
                      <p class="bubble">{{ m.body }}</p>
                      <span class="msg-meta">{{ clock(m.createdAt) }} · {{ m.senderRole === 'CUSTOMER' ? d.customer.fullName : m.senderName }}</span>
                    </article>
                  }
                }
              }
            </div>

            @if (d.status === 'CLOSED') {
              <div class="closed-box" role="status">Phiếu đã đóng. Khách hàng cần tạo yêu cầu mới nếu muốn trao đổi thêm.</div>
            } @else {
              <form class="composer" (submit)="onSubmit($event)">
                <label class="sr-only" for="as-composer">Nội dung trả lời</label>
                <textarea id="as-composer" rows="3" [attr.maxlength]="maxBody" placeholder="Nhập nội dung trả lời… (Enter để gửi, Shift+Enter để xuống dòng)"
                  [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown)="onComposerKey($event)"></textarea>
                <div class="composer-foot">
                  <span class="counter" [class.warn]="draft().length > maxBody - 100">{{ draft().length }}/{{ maxBody }}</span>
                  <button type="submit" class="btn-primary" [disabled]="sending() || !draft().trim()">{{ sending() ? 'Đang gửi…' : 'Gửi' }}</button>
                </div>
                @if (sendError()) { <p class="alert" role="alert">{{ sendError() }}</p> }
              </form>
            }
          }
        </section>
      </div>
    </div>

    <fc-admin-drawer [isOpen]="drawerOpen()" eyebrow="Hỗ trợ" title="Thông tin khách hàng và Đơn hàng" width="460px" (close)="drawerOpen.set(false)">
      @if (detail(); as d) {
        <section class="d-sec" aria-labelledby="d-customer">
          <h3 id="d-customer">Hồ sơ khách hàng</h3>
          <dl class="kv">
            <dt>Họ tên</dt><dd>{{ d.customer.fullName }}</dd>
            <dt>Email</dt><dd class="wrap">{{ d.customer.email }}</dd>
            <dt>Điện thoại</dt><dd>{{ d.customer.phone || 'Chưa cập nhật' }}</dd>
            @if (auth.isAdmin()) {
              <dt>Địa chỉ mặc định</dt>
              <dd>
                @if (profileLoading()) { Đang tải… }
                @else if (profile()?.defaultAddress; as a) { {{ a.line1 }}, {{ a.ward }}, {{ a.district }}, {{ a.province }} }
                @else { Chưa có địa chỉ mặc định }
              </dd>
            }
          </dl>
        </section>

        <section class="d-sec" aria-labelledby="d-ticket">
          <h3 id="d-ticket">Chi tiết phiếu</h3>
          <dl class="kv">
            <dt>Mã phiếu</dt><dd>{{ d.code }}</dd>
            <dt>Loại</dt><dd>{{ categoryLabel(d.category) }}</dd>
            <dt>Ngày tạo</dt><dd>{{ fullDate(d.createdAt) }}</dd>
            <dt>Trạng thái</dt><dd><span [class]="'badge ' + statusClass(d.status)">{{ statusLabel(d.status) }}</span></dd>
            <dt>Phụ trách</dt><dd>{{ d.assignedStaffName || 'Chưa phân công' }}</dd>
          </dl>
        </section>

        <section class="d-sec" aria-labelledby="d-order">
          <h3 id="d-order">Đơn liên quan</h3>
          @if (d.order; as o) {
            <dl class="kv">
              <dt>Mã đơn</dt><dd>{{ o.code }}</dd>
              <dt>Tổng tiền</dt><dd>{{ money(o.payableTotal) }}</dd>
              <dt>Trạng thái</dt><dd>{{ orderState(o.state) }}</dd>
              @if (o.createdAt) { <dt>Ngày đặt</dt><dd>{{ fullDate(o.createdAt) }}</dd> }
            </dl>
            @if (auth.can('order.read')) { <a class="btn-outline block" [routerLink]="['/admin/orders']" [queryParams]="{ orderId: o.id }" (click)="drawerOpen.set(false)">Xem đơn hàng</a> }
          } @else {
            <p class="muted">Phiếu này không gắn đơn hàng.</p>
          }
        </section>

        @if (canAssign()) {
          <section class="d-sec" aria-labelledby="d-assign">
            <h3 id="d-assign">Phân công nhân viên</h3>
            <label class="sr-only" for="d-staff">Chọn nhân viên</label>
            <div class="row">
              <select id="d-staff" [ngModel]="assignTo()" (ngModelChange)="assignTo.set($event)" name="assignTo" [disabled]="staffLoading() || busy()">
                <option value="">{{ staffLoading() ? 'Đang tải nhân viên…' : 'Chưa phân công' }}</option>
                @for (s of staff(); track s.id) { <option [value]="s.id">{{ s.fullName }}</option> }
              </select>
              <button type="button" class="btn-outline" [disabled]="busy() || assignTo() === (d.assignedStaffId ?? '')" (click)="assign()">Phân công</button>
            </div>
          </section>
        }
      }
      <div drawer-footer class="d-foot">
        @if (detail(); as d) {
          @if (canClaim()) { <button type="button" class="btn-primary" [disabled]="busy()" (click)="claim()">Tiếp nhận</button> }
          @if (d.status !== 'CLOSED' && d.status !== 'RESOLVED') { <button type="button" class="btn-outline" [disabled]="busy()" (click)="confirm.set('RESOLVED')">Đánh dấu đã giải quyết</button> }
          @if (d.status !== 'CLOSED') { <button type="button" class="btn-outline danger" [disabled]="busy()" (click)="confirm.set('CLOSED')">Đóng phiếu</button> }
        }
        <button type="button" class="btn-outline" (click)="drawerOpen.set(false)">Đóng</button>
      </div>
    </fc-admin-drawer>

    <fc-modal [isOpen]="!!confirm()" [title]="confirm() === 'CLOSED' ? 'Đóng phiếu hỗ trợ' : 'Đánh dấu đã giải quyết'" maxWidth="460px" (close)="confirm.set(null)">
      <p class="confirm-text">
        @if (confirm() === 'CLOSED') { Sau khi đóng, khách hàng không thể nhắn thêm vào phiếu này. Bạn có chắc muốn đóng phiếu không? }
        @else { Phiếu sẽ chuyển sang "Đã giải quyết". Nếu khách nhắn tiếp, phiếu sẽ tự mở lại. }
      </p>
      <div class="row end">
        <button type="button" class="btn-outline" [disabled]="busy()" (click)="confirm.set(null)">Hủy</button>
        <button type="button" class="btn-primary" [disabled]="busy()" (click)="applyStatus()">{{ busy() ? 'Đang cập nhật…' : 'Xác nhận' }}</button>
      </div>
    </fc-modal>
  `,
  styles: [`
    :host { display: block; font-family: var(--font-sans); color: var(--ui-ink); } * { box-sizing: border-box; }
    .as { min-width: 0; }
    .topbar { display: flex; align-items: center; gap: 16px 24px; flex-wrap: wrap; padding-bottom: 16px; }
    .title { margin: 0; font: 400 28px/36px var(--font-serif); }
    .tabs { display: flex; gap: 4px; flex: 1; flex-wrap: wrap; }
    .tab { padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ui-ink-soft); font: 600 13px/20px var(--font-sans); cursor: pointer; display: inline-flex; gap: 8px; align-items: center; }
    .tab:hover { color: var(--ui-ink); background: var(--ui-bg-soft); } .tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
    .count { min-width: 22px; padding: 1px 6px; background: var(--ui-bg-soft); border: 1px solid var(--admin-line); font: 700 11px/16px var(--font-sans); text-align: center; }
    .top-right { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .avg { font-size: 12px; color: var(--ui-ink-soft); } .avg strong { color: var(--ui-ink); }
    .filter-wrap { position: relative; }
    .filter-panel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; width: 260px; padding: 16px; display: grid; gap: 8px; background: #fff; border: 1px solid var(--admin-line); box-shadow: 0 8px 24px #17171720; }
    .filter-panel label { font: 700 11px var(--font-sans); letter-spacing: .5px; color: var(--ui-ink-soft); text-transform: uppercase; }

    .btn-outline, .btn-primary { min-height: 40px; padding: 0 16px; border: 1px solid var(--ui-ink); border-radius: 2px; font: 600 12px var(--font-sans); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
    .btn-outline { background: #fff; color: var(--ui-ink); } .btn-primary { background: var(--ui-ink); color: #fff; }
    .btn-outline:hover:not(:disabled) { background: var(--ui-bg-soft); } .btn-primary:hover:not(:disabled) { background: #000; }
    .btn-outline.on { border-color: var(--ui-accent); color: var(--ui-accent); } .btn-outline.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
    .btn-outline.block { width: 100%; margin-top: 12px; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .btn-outline:focus-visible, .btn-primary:focus-visible, .tab:focus-visible, .ticket:focus-visible, .back-btn:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
    .link-btn { justify-self: start; padding: 4px 0; background: none; border: 0; color: var(--ui-accent); font: 700 12px var(--font-sans); text-decoration: underline; cursor: pointer; }

    .board { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); border: 1px solid var(--admin-line); background: #fff; height: calc(100dvh - 260px); min-height: 520px; }
    .list-col { min-width: 0; display: flex; flex-direction: column; border-right: 1px solid var(--admin-line); }
    .search { padding: 12px; border-bottom: 1px solid var(--admin-line-soft); }
    input[type="search"], select { width: 100%; min-height: 40px; padding: 0 12px; border: 1px solid var(--admin-line); border-radius: 2px; background: #fff; font: 400 13px var(--font-sans); color: var(--ui-ink); }
    textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--ui-ink); border-radius: 2px; resize: vertical; min-height: 72px; font: 400 13px/1.6 var(--font-sans); color: var(--ui-ink); background: #fff; }
    input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 1px; }
    .tickets { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
    .ticket { position: relative; width: 100%; padding: 12px 28px 12px 12px; border: 0; border-bottom: 1px solid var(--admin-line-soft); border-left: 3px solid transparent; background: #fff; text-align: left; display: grid; gap: 4px; cursor: pointer; font-family: var(--font-sans); color: var(--ui-ink); }
    .ticket:hover { background: var(--ui-bg-soft); } .ticket.active { background: var(--admin-nav-active-bg, #f4b8c1); border-left-color: var(--ui-ink); }
    .t-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; } .t-name { font: 700 13px/18px var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .t-time { color: var(--ui-subtle); font-size: 11px; white-space: nowrap; } .t-cat { font: 700 10px/12px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-accent); }
    .t-subject { font-size: 12px; line-height: 18px; font-weight: 600; overflow-wrap: anywhere; } .t-preview { color: var(--ui-ink-soft); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .t-foot { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .t-staff { color: var(--ui-subtle); font-size: 11px; }
    .dot { position: absolute; top: 14px; right: 10px; width: 9px; height: 9px; border-radius: 50%; background: var(--ui-danger, #b3261e); }
    .note { margin: 0; padding: 10px 12px; font-size: 11px; color: var(--ui-subtle); border-top: 1px solid var(--admin-line-soft); }
    .badge { display: inline-block; padding: 2px 8px; border: 1px solid currentColor; font: 600 10px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; }
    .badge--success { color: var(--ui-success); background: var(--ui-success-bg); } .badge--warning { color: var(--ui-warning); background: var(--ui-warning-bg); }
    .badge--info { color: var(--ui-info); background: var(--ui-info-bg); } .badge--muted { color: var(--ui-subtle); background: var(--ui-bg-soft); }

    .conv-col { min-width: 0; display: flex; flex-direction: column; min-height: 0; }
    .placeholder { margin: auto; padding: 32px; text-align: center; } .placeholder h2 { margin: 0 0 8px; font: 400 22px/30px var(--font-serif); } .placeholder p { margin: 0; color: var(--ui-ink-soft); font-size: 13px; }
    .state-box { text-align: center; padding: 48px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; margin: auto; }
    .spinner { width: 28px; height: 28px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
    .conv-head { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--admin-line-soft); background: var(--ui-bg-soft); }
    .back-btn { display: none; width: 100%; padding: 0; border: 0; background: none; font: 700 11px var(--font-sans); letter-spacing: .1em; cursor: pointer; text-align: left; }
    .who { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px; } .who-text { display: grid; min-width: 0; } .who-text strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who-meta { font-size: 12px; color: var(--ui-ink-soft); } .who-meta a { color: var(--ui-ink); font-weight: 600; }
    .avatar { width: 36px; height: 36px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #000; color: #fff; font: 700 14px var(--font-sans); }
    .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .conv-subject { margin: 0; padding: 10px 16px; border-bottom: 1px solid var(--admin-line-soft); font-size: 13px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .t-code { font: 700 11px var(--font-sans); letter-spacing: 1px; color: var(--ui-accent); }
    .messages { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .day { align-self: center; margin: 4px 0; } .day span { padding: 3px 12px; border: 1px solid var(--admin-line); font: 600 11px var(--font-sans); color: var(--ui-ink-soft); background: #fff; }
    .msg { max-width: 76%; align-self: flex-start; display: grid; gap: 4px; } .msg.staff { align-self: flex-end; justify-items: end; }
    .bubble { margin: 0; padding: 10px 14px; border: 1px solid var(--admin-line); background: #fff; color: var(--ui-ink); font-size: 14px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
    .msg.staff .bubble { background: #171717; border-color: #171717; color: #fff; }
    .msg-meta { font-size: 11px; color: var(--ui-subtle); } .sys { margin: 0; align-self: center; text-align: center; font-size: 12px; color: var(--ui-subtle); }
    .composer { padding: 12px 16px; border-top: 1px solid var(--admin-line-soft); background: var(--ui-bg-soft); } .composer-foot { margin-top: 8px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .counter { font-size: 12px; color: var(--ui-subtle); } .counter.warn { color: var(--ui-warning); }
    .alert { margin: 10px 0 0; padding: 10px 14px; border: 1px solid var(--ui-danger); background: var(--ui-danger-bg); color: var(--ui-danger); font-size: 13px; }
    .closed-box { padding: 16px; border-top: 1px solid var(--admin-line-soft); background: var(--ui-bg-soft); text-align: center; font-size: 13px; color: var(--ui-ink-soft); }

    .d-sec { padding: 0 0 20px; margin-bottom: 20px; border-bottom: 1px solid var(--admin-line-soft); } .d-sec h3 { margin: 0 0 12px; font: 700 11px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-accent); }
    .kv { margin: 0; display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px 12px; font-size: 13px; } .kv dt { color: var(--ui-ink-soft); } .kv dd { margin: 0; overflow-wrap: anywhere; } .wrap { word-break: break-all; }
    .muted { margin: 0; color: var(--ui-subtle); font-size: 13px; } .row { display: flex; gap: 8px; align-items: center; } .row.end { justify-content: flex-end; }
    .d-foot { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; padding: 16px 24px; border-top: 1px solid var(--admin-line); }
    .confirm-text { margin: 0 0 20px; font-size: 14px; line-height: 1.65; color: var(--ui-ink-soft); }
    .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

    @media (max-width: 1100px) {
      .board { grid-template-columns: 1fr; height: auto; min-height: 0; }
      .list-col { border-right: 0; max-height: 70dvh; } .conv-col { height: calc(100dvh - 200px); min-height: 480px; }
      .board.has-selection .list-col { display: none; } .board:not(.has-selection) .conv-col { display: none; }
      .back-btn { display: block; } .filter-panel { right: auto; left: 0; }
    }
    @media (max-width: 640px) { input[type="search"], select, textarea { font-size: 16px; } .msg { max-width: 92%; } .head-actions .btn-outline, .head-actions .btn-primary { flex: 1; } .title { font-size: 24px; } }
  `],
})
export class AdminSupportPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly maxBody = MAX_BODY;
  readonly categories = Object.keys(SUPPORT_CATEGORY_LABELS) as SupportTicketCategory[];
  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  readonly stats = signal<SupportStats | null>(null);
  readonly tab = signal<TabKey>('need');
  readonly search = signal('');
  readonly assignedFilter = signal<AssignedFilter>('');
  readonly categoryFilter = signal<SupportTicketCategory | ''>('');
  readonly filterOpen = signal(false);

  readonly tickets = signal<AdminSupportTicketRow[]>([]);
  readonly listTotal = signal(0);
  readonly listLoading = signal(true);
  readonly listError = signal('');

  readonly selectedId = signal<string | null>(null);
  readonly detail = signal<AdminSupportTicketDetail | null>(null);
  readonly messages = signal<SupportMessage[]>([]);
  readonly convLoading = signal(false);
  readonly convError = signal('');
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly sendError = signal('');

  readonly drawerOpen = signal(false);
  readonly profile = signal<AdminUserDetail | null>(null);
  readonly profileLoading = signal(false);
  readonly staff = signal<UserSummary[]>([]);
  readonly staffLoading = signal(false);
  readonly assignTo = signal('');
  readonly busy = signal(false);
  readonly confirm = signal<ConfirmAction | null>(null);

  readonly needCount = computed(() => (this.stats()?.byStatus.OPEN ?? 0) + (this.stats()?.byStatus.IN_PROGRESS ?? 0));
  readonly allCount = computed(() => Object.values(this.stats()?.byStatus ?? {}).reduce((sum, n) => sum + n, 0));
  readonly avgText = computed(() => {
    const value = this.stats()?.avgFirstResponseMinutes;
    return value === null || value === undefined ? 'chưa có dữ liệu' : `${value.toLocaleString('vi-VN')} phút`;
  });
  readonly filtersActive = computed(() => !!this.assignedFilter() || !!this.categoryFilter());
  readonly visibleTickets = computed(() => {
    const category = this.categoryFilter();
    return category ? this.tickets().filter((t) => t.category === category) : this.tickets();
  });
  readonly canClaim = computed(() => {
    const d = this.detail();
    return !!d && !d.assignedStaffId && d.status !== 'CLOSED' && this.auth.canGlobal('order.read');
  });
  readonly canAssign = computed(() => this.auth.isAdmin() && this.detail()?.status !== 'CLOSED');
  readonly groups = computed<MessageGroup[]>(() => {
    const result: MessageGroup[] = [];
    for (const message of this.messages()) {
      const date = new Date(message.createdAt);
      const key = Number.isNaN(date.getTime()) ? message.createdAt : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      let group = result.at(-1);
      if (!group || group.key !== key) {
        group = { key, label: this.dayLabel(date), items: [] };
        result.push(group);
      }
      group.items.push(message);
    }
    return result;
  });

  private token = 0;
  private listToken = 0;
  private polling = false;
  private messageTimer?: ReturnType<typeof setInterval>;
  private listTimer?: ReturnType<typeof setInterval>;
  private readonly subs = new Subscription();
  private readonly search$ = new Subject<string>();
  private readonly onVisible = (): void => {
    if (!this.visible()) return;
    this.pollMessages();
    this.loadList(false);
  };

  ngOnInit(): void {
    this.subs.add(this.search$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.loadList(true)));
    this.subs.add(this.route.queryParamMap.subscribe((params) => {
      const id = params.get('ticketId');
      if (id && id !== this.selectedId()) this.openConversation(id);
      else if (!id && this.selectedId()) this.clearSelection();
    }));
    this.loadList(true);
    this.loadStats();
    this.messageTimer = setInterval(() => this.pollMessages(), ADMIN_MESSAGE_POLL_MS);
    this.listTimer = setInterval(() => { this.loadList(false); this.loadStats(); }, ADMIN_LIST_POLL_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  ngOnDestroy(): void {
    clearInterval(this.messageTimer);
    clearInterval(this.listTimer);
    this.subs.unsubscribe();
    this.token++;
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  // ───────── Danh sách ─────────

  setTab(tab: TabKey): void { this.tab.set(tab); this.loadList(true); }
  setAssigned(value: AssignedFilter): void { this.assignedFilter.set(value); this.loadList(true); }
  resetFilters(): void { this.categoryFilter.set(''); if (this.assignedFilter()) this.setAssigned(''); }
  onSearch(value: string): void { this.search.set(value); this.search$.next(value.trim()); }

  private loadStats(): void {
    if (!this.visible()) return;
    this.api.adminSupportStats().subscribe({ next: (stats) => this.stats.set(stats), error: () => undefined });
  }

  /** `initial` hiện trạng thái tải; lần làm mới định kỳ chạy âm thầm và giữ danh sách cũ nếu lỗi. */
  loadList(initial: boolean): void {
    if (!initial && (!this.visible() || this.listLoading())) return;
    const token = ++this.listToken;
    if (initial) { this.listLoading.set(true); this.listError.set(''); }
    const base = { q: this.search(), assigned: this.assignedFilter() || undefined };
    const tab = this.tab();
    const requests = tab === 'need'
      ? [this.api.adminListSupportTickets(1, LIST_LIMIT, { ...base, status: 'OPEN' }), this.api.adminListSupportTickets(1, LIST_LIMIT, { ...base, status: 'IN_PROGRESS' })]
      : [this.api.adminListSupportTickets(1, LIST_LIMIT, { ...base, ...(tab === 'closed' ? { status: 'CLOSED' } : {}) })];
    forkJoin(requests).subscribe({
      next: (results) => {
        if (token !== this.listToken) return;
        const rows = results.flatMap((r) => r.items);
        rows.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
        this.tickets.set(rows.slice(0, LIST_LIMIT));
        this.listTotal.set(results.reduce((sum, r) => sum + r.total, 0));
        this.listLoading.set(false);
        this.listError.set('');
        this.mergeSelected(rows);
      },
      error: () => {
        if (token !== this.listToken) return;
        this.listLoading.set(false);
        if (initial || this.tickets().length === 0) this.listError.set('Không thể tải danh sách phiếu. Vui lòng thử lại.');
      },
    });
  }

  private mergeSelected(rows: AdminSupportTicketRow[]): void {
    const id = this.selectedId();
    const current = this.detail();
    const row = id ? rows.find((t) => t.id === id) : undefined;
    if (!row || !current) return;
    if (row.assignedStaffId !== current.assignedStaffId || row.status !== current.status) this.refreshDetail(row.id);
  }

  private patchRow(ticket: { id: string } & Partial<AdminSupportTicketRow>): void {
    this.tickets.update((list) => list.map((t) => (t.id === ticket.id ? { ...t, ...ticket } as AdminSupportTicketRow : t)));
  }

  // ───────── Hội thoại ─────────

  selectTicket(id: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { ticketId: id }, queryParamsHandling: 'merge' });
  }

  backToList(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { ticketId: null }, queryParamsHandling: 'merge' });
  }

  retryConversation(): void {
    const id = this.selectedId();
    if (id) this.openConversation(id);
  }

  private clearSelection(): void {
    this.token++;
    this.selectedId.set(null);
    this.detail.set(null);
    this.messages.set([]);
    this.convError.set('');
    this.convLoading.set(false);
    this.draft.set('');
    this.sendError.set('');
    this.drawerOpen.set(false);
  }

  private openConversation(id: string): void {
    const token = ++this.token;
    this.selectedId.set(id);
    this.detail.set(null);
    this.messages.set([]);
    this.convError.set('');
    this.convLoading.set(true);
    this.draft.set('');
    this.sendError.set('');
    this.drawerOpen.set(false);
    this.profile.set(null);
    forkJoin({ ticket: this.api.adminGetSupportTicket(id), list: this.api.adminListSupportMessages(id) }).subscribe({
      next: ({ ticket, list }) => {
        if (token !== this.token) return;
        this.detail.set(ticket);
        this.messages.set(list.items);
        this.convLoading.set(false);
        this.scrollToBottom();
        this.markRead(ticket.id, ticket.unreadForStaff);
      },
      error: (err: unknown) => {
        if (token !== this.token) return;
        this.convLoading.set(false);
        const status = (err as { status?: number })?.status;
        this.convError.set(status === 404 || status === 403 ? 'Không tìm thấy phiếu hoặc bạn không có quyền xem phiếu này.' : 'Không thể tải hội thoại. Vui lòng thử lại.');
      },
    });
  }

  private markRead(id: string, unread: number): void {
    if (unread <= 0) return;
    this.api.adminMarkSupportTicketRead(id).subscribe({
      next: () => {
        if (this.detail()?.id === id) this.detail.update((d) => (d ? { ...d, unreadForStaff: 0 } : d));
        this.patchRow({ id, unreadForStaff: 0 });
        this.loadStats();
        window.dispatchEvent(new Event(SUPPORT_UNREAD_EVENT));
      },
      error: () => undefined,
    });
  }

  private refreshDetail(id: string, markIfUnread = false): void {
    this.api.adminGetSupportTicket(id).subscribe({
      next: (ticket) => {
        if (this.selectedId() !== id) return;
        this.detail.set(ticket);
        this.patchRow(ticket);
        if (markIfUnread) this.markRead(id, ticket.unreadForStaff);
      },
      error: () => undefined,
    });
  }

  /** Polling 5 giây: chỉ khi tab hiển thị và đang mở một phiếu; `force` dùng ngay sau thao tác của nhân sự. */
  pollMessages(force = false): void {
    const id = this.selectedId();
    if ((!force && !this.visible()) || !id || this.convLoading() || this.convError() || this.polling) return;
    const after = this.messages().at(-1)?.createdAt;
    if (!after) return;
    const token = this.token;
    this.polling = true;
    this.api.adminListSupportMessages(id, after).subscribe({
      next: (res) => {
        this.polling = false;
        if (token !== this.token) return;
        const known = new Set(this.messages().map((m) => m.id));
        const fresh = res.items.filter((m) => !known.has(m.id));
        if (!fresh.length) return;
        const stick = this.nearBottom();
        this.messages.update((list) => [...list, ...fresh]);
        if (stick) this.scrollToBottom();
        if (fresh.some((m) => m.senderRole === 'CUSTOMER' || m.senderRole === 'SYSTEM')) this.refreshDetail(id, true);
      },
      error: () => { this.polling = false; },
    });
  }

  private visible(): boolean { return document.visibilityState === 'visible'; }

  private nearBottom(): boolean {
    const el = this.scroller?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  private scrollToBottom(): void {
    setTimeout(() => { const el = this.scroller?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }

  // ───────── Trả lời ─────────

  onComposerKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.send(); }
  }

  onSubmit(event: Event): void { event.preventDefault(); this.send(); }

  send(): void {
    const id = this.selectedId();
    const text = this.draft().trim();
    if (!id || !text || this.sending() || this.detail()?.status === 'CLOSED') return;
    if (text.length > MAX_BODY) { this.sendError.set(`Tin nhắn tối đa ${MAX_BODY} ký tự.`); return; }
    this.sending.set(true);
    this.sendError.set('');
    this.api.adminReplySupportTicket(id, text).subscribe({
      next: (message) => {
        this.sending.set(false);
        if (this.selectedId() !== id) return;
        this.messages.update((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
        this.draft.set('');
        this.scrollToBottom();
        this.refreshDetail(id); // gửi tin tự nhận phiếu và chuyển sang "Đang xử lý"
        this.loadList(false);
        this.loadStats();
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.sendError.set(this.errorText(err, 'Không gửi được tin nhắn. Nội dung vẫn được giữ lại, vui lòng thử lại.'));
        if ((err as { status?: number })?.status === 409) this.refreshDetail(id);
      },
    });
  }

  // ───────── Drawer và thao tác phiếu ─────────

  openDrawer(): void {
    const d = this.detail();
    if (!d) return;
    this.drawerOpen.set(true);
    this.assignTo.set(d.assignedStaffId ?? '');
    if (this.auth.isAdmin()) {
      if (this.profile()?.id !== d.customer.id) {
        this.profileLoading.set(true);
        this.api.adminGetUser(d.customer.id).subscribe({
          next: (user) => { this.profile.set(user); this.profileLoading.set(false); },
          error: () => { this.profile.set(null); this.profileLoading.set(false); },
        });
      }
      if (!this.staff().length) {
        this.staffLoading.set(true);
        this.api.adminListUsers(1, 100, 'STAFF', { status: 'ACTIVE' }).subscribe({
          next: (res) => { this.staff.set(res.items); this.staffLoading.set(false); },
          error: () => this.staffLoading.set(false),
        });
      }
    }
  }

  claim(): void {
    this.runAction(this.api.adminClaimSupportTicket(this.selectedId() ?? ''), 'Đã tiếp nhận phiếu.');
  }

  assign(): void {
    const staffId = this.assignTo() || null;
    this.runAction(this.api.adminAssignSupportTicket(this.selectedId() ?? '', staffId), staffId ? 'Đã phân công phiếu.' : 'Đã bỏ phân công phiếu.');
  }

  applyStatus(): void {
    const status = this.confirm();
    if (!status) return;
    this.runAction(this.api.adminSetSupportTicketStatus(this.selectedId() ?? '', status), status === 'CLOSED' ? 'Đã đóng phiếu.' : 'Đã đánh dấu đã giải quyết.', () => this.confirm.set(null));
  }

  private runAction(request: ReturnType<ApiService['adminClaimSupportTicket']>, success: string, done?: () => void): void {
    const id = this.selectedId();
    if (!id || this.busy()) return;
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        done?.();
        this.toast.success(success);
        this.refreshDetail(id);
        this.pollMessages(true);
        this.loadList(false);
        this.loadStats();
        window.dispatchEvent(new Event(SUPPORT_UNREAD_EVENT));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        done?.();
        this.toast.error(this.errorText(err, 'Không thể cập nhật phiếu. Vui lòng thử lại.'));
        this.refreshDetail(id);
      },
    });
  }

  // ───────── Hiển thị ─────────

  statusLabel(status: string): string { return supportStatusLabel(status); }
  categoryLabel(category: string): string { return supportCategoryLabel(category); }
  orderState(state: string): string { return orderStatusLabel(state); }
  money(value: number): string { return `${Math.round(value).toLocaleString('vi-VN')}đ`; }
  initial(name: string): string { return (name ?? '').trim().charAt(0).toLocaleUpperCase('vi-VN') || '?'; }

  statusClass(status: SupportTicketStatus): string {
    switch (status) {
      case 'OPEN': return 'badge--warning';
      case 'IN_PROGRESS': return 'badge--info';
      case 'RESOLVED': return 'badge--success';
      default: return 'badge--muted';
    }
  }

  /** Chỉ giữ chữ số và dấu + đầu số; không có số hợp lệ thì không hiện nút gọi. */
  phoneHref(phone: string | null | undefined): string | null {
    const digits = (phone ?? '').replace(/[^\d+]/g, '');
    return /^\+?\d{8,15}$/.test(digits) ? `tel:${digits}` : null;
  }

  fullDate(iso?: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString('vi-VN');
  }

  clock(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  private dayLabel(d: Date): string {
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
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
    return days < 30 ? `${days} ngày trước` : d.toLocaleDateString('vi-VN');
  }

  /** Chỉ hiện thông báo tiếng Việt do máy chủ trả về cho lỗi nghiệp vụ; còn lại dùng câu mặc định. */
  private errorText(err: unknown, fallback: string): string {
    const e = err as { status?: number; error?: { code?: string; message?: unknown } };
    const message = e?.error?.message;
    if (typeof message === 'string' && e.error?.code !== 'VALIDATION_FAILED'
      && [400, 403, 404, 409, 429].includes(e.status ?? 0) && /[À-ỹ]/.test(message)) return message;
    return fallback;
  }
}
