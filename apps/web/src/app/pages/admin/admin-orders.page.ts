import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of } from 'rxjs';
import type { AdminOrderSummary, Order, OrderStatus, UserSummary } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { AdminOrderTabsComponent } from '../../components/admin-order-tabs.component';
import { AuthService } from '../../services/auth.service';
import { orderStatusLabel, shipmentStatusLabel, SHIPMENT_STATUS_LABELS } from '../../shared/labels';

type ShipmentStatus = 'READY' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
type StatusAction = { to: OrderStatus; label: string };

const STATE_TABS: Array<{ id: string; label: string }> = [
  { id: '', label: 'Tất cả' },
  { id: 'PENDING_PAYMENT', label: 'Chờ thanh toán' },
  { id: 'CONFIRMED', label: 'Đã xác nhận' },
  { id: 'PREPARING', label: 'Đang chuẩn bị' },
  { id: 'SHIPPING', label: 'Đang giao' },
  { id: 'DELIVERED', label: 'Đã giao' },
  { id: 'CANCELLED', label: 'Đã hủy' },
  { id: 'CANCEL_PENDING_REFUND', label: 'Chờ hoàn tiền' },
];

function csvCell(value: string | number): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

@Component({
  standalone: true,
  imports: [PaginationComponent, DatePipe, RouterLink, FormsModule, ModalComponent, AdminDrawerComponent, AdminOrderTabsComponent],
  template: `
    <div class="ao">
      <fc-admin-order-tabs active="orders" />

      <header class="head">
        <div>
          <h1 class="title">Quản lý đơn hàng</h1>
          <p class="sub">Theo dõi và xử lý đơn hàng từ xác nhận đến giao vận.</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn-outline" [disabled]="visibleOrders().length === 0" (click)="exportCsv()">Xuất dữ liệu</button>
        </div>
      </header>

      <!-- Ô số liệu -->
      <section class="kpis" aria-label="Số lượng đơn theo trạng thái">
        @for (k of kpis; track k.id) {
          <article class="kpi">
            <span class="kpi-label">{{ k.label }}</span>
            <strong class="kpi-value">{{ countOf(k.id) ?? '—' }}</strong>
          </article>
        }
      </section>
      @if (!auth.isAdmin()) { <p class="note">Số liệu tính trên các đơn bạn được phép xem.</p> }

      <!-- Tab trạng thái -->
      <nav class="state-tabs" aria-label="Lọc theo trạng thái">
        @for (s of stateTabs; track s.id) {
          <button type="button" class="state-tab" [class.active]="selectedState() === s.id" (click)="changeFilter(s.id)">
            {{ s.label }} <span class="cnt">{{ countOf(s.id) ?? '—' }}</span>
          </button>
        }
      </nav>

      <section class="filters">
        <label class="f-search"><span class="sr-only">Tìm theo mã đơn, tên người nhận, số điện thoại</span>
          <input type="search" name="q" [ngModel]="query()" (ngModelChange)="onSearch($event)" placeholder="Tìm theo mã đơn, tên người nhận, số điện thoại" />
        </label>
        @if (customerFilter()) {
          <span class="chip">Khách: {{ customerLabel() }}
            <button type="button" class="chip-x" aria-label="Bỏ lọc theo khách" (click)="clearCustomerFilter()">×</button>
          </span>
        }
      </section>

      @if (loading()) {
        <div class="state-box"><div class="spinner"></div><p>Đang tải danh sách đơn hàng…</p></div>
      } @else if (loadError()) {
        <div class="state-box"><p>{{ loadError() }}</p><button type="button" class="btn-outline" (click)="loadOrders()">Thử lại</button></div>
      } @else if (visibleOrders().length === 0) {
        <div class="state-box"><p>Không có đơn hàng nào khớp với tìm kiếm hoặc bộ lọc hiện tại.</p></div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Mã đơn</th><th>Khách hàng</th><th>Thời gian</th><th class="c-num">Tổng thanh toán</th><th>Thanh toán</th>
                <th>Trạng thái</th><th>Vận chuyển</th><th>Phụ trách</th><th class="c-act"><span class="sr-only">Chi tiết</span></th>
              </tr>
            </thead>
            <tbody>
              @for (order of visibleOrders(); track order.id) {
                <tr class="row" (click)="openDrawer(order)">
                  <td class="mono strong">#{{ codeOf(order) }}</td>
                  <td>
                    <strong class="strong">{{ order.shippingSnapshot?.receiver || 'Khách vãng lai' }}</strong>
                    <span class="sub-line">{{ order.shippingSnapshot?.phone || '—' }}</span>
                  </td>
                  <td class="nowrap">{{ order.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td class="c-num">
                    <strong class="strong">{{ money(order.money.payableTotal) }}</strong>
                    @if (order.money.voucherDiscount > 0) { <span class="sub-line voucher">Voucher −{{ money(order.money.voucherDiscount) }}</span> }
                  </td>
                  <td>
                    <span class="pay" [class]="'pay pay-' + paymentTone(order.state)">{{ paymentLabel(order.state) }}</span>
                    <span class="sub-line">Chuyển khoản VietQR</span>
                  </td>
                  <td><span class="badge" [class]="'badge st-' + order.state.toLowerCase()">{{ orderStatusLabel(order.state) }}</span></td>
                  <td>
                    @if (shipmentOf(order.id); as sh) {
                      <strong class="strong">{{ sh.carrier || '—' }}</strong>
                      <span class="sub-line mono">{{ sh.trackingCode || 'Chưa có mã vận đơn' }}</span>
                    } @else { <span class="muted">{{ detailsLoading() ? 'Đang tải…' : '—' }}</span> }
                  </td>
                  <td>
                    @if (order.assignedStaffId) {
                      <span class="staff"><span class="avatar" aria-hidden="true">{{ initials(staffName(order.assignedStaffId)) }}</span>{{ staffName(order.assignedStaffId) }}</span>
                    } @else { <span class="muted">Chưa phân công</span> }
                  </td>
                  <td class="c-act"><button type="button" class="link-btn" [attr.aria-label]="'Xem chi tiết đơn ' + codeOf(order)">Chi tiết</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <fc-pagination label="đơn hàng" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />
      }
    </div>

    <!-- Drawer chi tiết đơn -->
    <fc-admin-drawer [isOpen]="drawerOpen()" eyebrow="Chi tiết đơn hàng" [title]="drawerOrder() ? '#' + codeOf(drawerOrder()!) : ''" width="480px" (close)="closeDrawer()">
      @if (drawerOrder(); as o) {
        <div class="d-top">
          <span class="badge" [class]="'badge st-' + o.state.toLowerCase()">{{ orderStatusLabel(o.state) }}</span>
          <span class="muted">{{ o.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
        </div>
        <div class="d-assign">
          <span>Phụ trách: <strong>{{ o.assignedStaffId ? staffName(o.assignedStaffId) : 'Chưa phân công' }}</strong></span>
          @if (auth.isAdmin()) { <button type="button" class="link-btn" (click)="openAssignModal(o)">Phân công</button> }
        </div>

        @if (detailLoading()) {
          <p class="muted pad">Đang tải chi tiết đơn…</p>
        } @else if (detailError()) {
          <p class="pad">{{ detailError() }} <button type="button" class="link-btn" (click)="reloadDetail()">Thử lại</button></p>
        } @else if (detail(); as d) {
          <section class="d-sec">
            <h3 class="d-h">Tiến trình đơn hàng</h3>
            <ol class="timeline">
              @for (step of timeline(); track $index; let last = $last) {
                <li [class.current]="last">
                  <div class="t-row"><strong>{{ step.label }}{{ last ? ' (hiện tại)' : '' }}</strong><time>{{ step.at | date:'dd/MM/yyyy HH:mm' }}</time></div>
                  @if (step.reason) { <span class="t-reason">{{ step.reason }}</span> }
                </li>
              }
            </ol>
          </section>

          <section class="d-sec card">
            <h3 class="d-h">Người nhận và địa chỉ</h3>
            <div class="rec"><strong>{{ d.shippingSnapshot?.receiver || '—' }}</strong><span>{{ d.shippingSnapshot?.phone || '' }}</span></div>
            <p class="addr">{{ addressOf(d) }}</p>
            @if (d.shippingSnapshot?.note) { <p class="note-box">“{{ d.shippingSnapshot.note }}”</p> }
          </section>

          <section class="d-sec">
            <h3 class="d-h">Sản phẩm đã mua ({{ itemCount(d) }} món)</h3>
            @for (line of d.items; track line.lineId) {
              <div class="line">
                <div class="line-main">
                  <strong>{{ line.productName }}</strong>
                  <span class="mono small">SKU: {{ line.sku }}</span>
                </div>
                <span class="qty">SL: x{{ line.quantity }}</span>
                <div class="line-price">
                  <strong>{{ money(line.lineTotal) }}</strong>
                  <span class="small">{{ money(line.unitPrice) }} / món</span>
                </div>
              </div>
            }
          </section>

          <section class="d-sec card">
            <div class="sum"><span>Tạm tính ({{ itemCount(d) }} món)</span><span>{{ money(d.money.subtotal) }}</span></div>
            @if (d.money.voucherDiscount > 0) {
              <div class="sum voucher"><span>Voucher{{ d.money.voucherCode ? ' (' + d.money.voucherCode + ')' : '' }}</span><span>−{{ money(d.money.voucherDiscount) }}</span></div>
            }
            <div class="sum"><span>Phí vận chuyển</span><span>{{ money(d.money.shippingFee) }}</span></div>
            <div class="sum total"><span>Tổng thanh toán</span><span>{{ money(d.money.payableTotal) }}</span></div>
            <span class="small right">{{ paymentLabel(d.state) }}</span>
          </section>

          <!-- Vận đơn -->
          @if (canEditShipment(o)) {
            <section class="d-sec card white">
              <h3 class="d-h">Cập nhật vận đơn</h3>
              <div class="two">
                <label>Đơn vị vận chuyển<input type="text" name="carrier" [(ngModel)]="carrier" placeholder="GHTK, Viettel Post, GHN…" /></label>
                <label>Mã vận đơn<input type="text" name="tracking" [(ngModel)]="trackingCode" placeholder="Mã vận đơn của hãng" /></label>
              </div>
              <label>Trạng thái vận chuyển
                <select name="shipStatus" [(ngModel)]="shipmentStatus">
                  @for (s of shipmentStatuses; track s) { <option [value]="s">{{ shipmentStatusLabel(s) }}</option> }
                </select>
              </label>
              <div class="right"><button type="button" class="btn-outline" [disabled]="saving()" (click)="saveShipment()">{{ saving() ? 'Đang lưu…' : 'Lưu thông tin vận chuyển' }}</button></div>
            </section>
          } @else if (d.shipment) {
            <section class="d-sec card white">
              <h3 class="d-h">Vận chuyển</h3>
              <div class="sum"><span>Đơn vị</span><span>{{ d.shipment.carrier || '—' }}</span></div>
              <div class="sum"><span>Mã vận đơn</span><span class="mono">{{ d.shipment.trackingCode || '—' }}</span></div>
              <div class="sum"><span>Trạng thái</span><span>{{ shipmentStatusLabel(d.shipment.status) }}</span></div>
            </section>
          }

          @if (canProposeRefund() && d.state !== 'PENDING_PAYMENT') {
            <section class="d-sec card refund">
              <span>Cần hoàn tiền cho đơn này?</span>
              <a class="link-btn" routerLink="/admin/refunds" [queryParams]="{ orderId: d.id }">Đề xuất hoàn tiền</a>
            </section>
          }
        }
      }
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="closeDrawer()">Đóng</button>
        @if (detail()) { <button type="button" class="btn-outline" (click)="printSlip()">In phiếu đóng gói</button> }
        @if (drawerOrder(); as o) {
          @if (canManage(o) && nextStatuses(o.state).includes('CANCELLED')) {
            <button type="button" class="btn-outline danger" (click)="openStatusModal(o, 'CANCELLED')">Hủy đơn</button>
          }
          @if (canManage(o) && primaryAction(o.state); as act) {
            <button type="button" class="btn-primary" (click)="openStatusModal(o, act.to)">{{ act.label }}</button>
          }
        }
      </div>
    </fc-admin-drawer>

    <!-- Phân công (PATCH /admin/orders/:orderId/assign) -->
    <fc-modal [isOpen]="assignModalOpen()" title="Phân công nhân sự xử lý đơn hàng" maxWidth="500px" (close)="assignModalOpen.set(false)">
      <div class="modal-form-content">
        @if (selectedOrder(); as o) {
          <div class="order-summary-box">
            <p><strong>Mã đơn:</strong> #{{ codeOf(o) }}</p>
            <p><strong>Người nhận:</strong> {{ o.shippingSnapshot?.receiver || 'Khách vãng lai' }} ({{ o.shippingSnapshot?.phone }})</p>
            <p><strong>Giá trị:</strong> {{ money(o.money.payableTotal) }}</p>
          </div>
          <label>Chọn nhân viên phụ trách:
            <select [(ngModel)]="selectedStaffId" name="staffSel">
              <option value="">— Chọn nhân viên —</option>
              @for (st of staffList(); track st.id) { <option [value]="st.id">{{ st.fullName }} ({{ st.email }})</option> }
            </select>
            @if (staffList().length < staffTotal()) {
              <button type="button" class="btn-outline" (click)="loadStaff()" [disabled]="loadingStaff()">Tải thêm nhân viên</button>
            }
          </label>
          <label>Hoặc nhập trực tiếp mã nhân sự:
            <input type="text" name="staffCustom" [(ngModel)]="customStaffId" placeholder="24 ký tự hex ID của nhân viên" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="assignModalOpen.set(false)">Hủy</button>
            <button type="button" class="btn-primary" [disabled]="saving() || (!selectedStaffId && !customStaffId.trim())" (click)="saveAssign()">{{ saving() ? 'Đang phân công…' : 'Xác nhận phân công' }}</button>
          </div>
        }
      </div>
    </fc-modal>

    <!-- Đổi trạng thái -->
    <fc-modal [isOpen]="statusModalOpen()" title="Cập nhật trạng thái đơn hàng" (close)="statusModalOpen.set(false)">
      <div class="modal-form-content">
        @if (selectedOrder(); as o) {
          <p>Đơn hàng: <strong>#{{ codeOf(o) }}</strong></p>
          <label>Trạng thái mới:
            <select [(ngModel)]="newStatus" name="newStatus">
              @for (next of nextStatuses(o.state); track next) { <option [value]="next">{{ statusOptionLabel(next) }}</option> }
            </select>
          </label>
          <label>Lý do cập nhật:
            <textarea [(ngModel)]="statusReason" name="statusReason" rows="3" placeholder="Ghi chú lý do chuyển trạng thái…"></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="statusModalOpen.set(false)">Hủy</button>
            <button type="button" class="btn-primary" [disabled]="saving()" (click)="saveStatus()">{{ saving() ? 'Đang lưu…' : 'Xác nhận đổi trạng thái' }}</button>
          </div>
        }
      </div>
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .ao { display: flex; flex-direction: column; gap: 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .muted { color: var(--ui-subtle); font-size: 12px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .head-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 28px/34px var(--font-serif); }
    .note { margin: 0; font-size: 12px; color: var(--ui-subtle); }
    .state-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--admin-line); }
    .state-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none; font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); cursor: pointer; }
    .state-tab:hover { background: var(--ui-bg-soft); color: var(--ui-ink); }
    .state-tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
    .cnt { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--ui-bg-soft); font: 600 11px/18px var(--font-sans); text-align: center; }
    .state-tab.active .cnt { background: var(--ui-pink-soft); color: var(--ui-accent); }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 6px 6px 12px; background: var(--ui-bg-soft); border: 1px solid var(--ui-line); border-radius: 999px; font-size: 12px; color: var(--ui-ink); }
    .chip-x { width: 20px; height: 20px; border: 0; border-radius: 50%; background: transparent; cursor: pointer; font-size: 14px; line-height: 1; color: var(--ui-ink-soft); }
    .chip-x:hover { background: var(--ui-line); }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .f-search { flex: 1 1 320px; }
    .f-search input, .modal-form-content input, .modal-form-content select, .modal-form-content textarea, .d-sec input, .d-sec select {
      width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink);
    }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 1100px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .row { cursor: pointer; } .row:hover { background: var(--admin-canvas); }
    .c-num { text-align: right; } .c-act { text-align: right; } .nowrap { white-space: nowrap; }
    .strong { font-weight: 600; color: var(--ui-ink); }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; }
    .sub-line { display: block; margin-top: 2px; font-size: 12px; color: var(--ui-subtle); }
    .voucher { color: var(--ui-accent); }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); white-space: nowrap; }
    .st-pending_payment { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .st-confirmed { background: var(--ui-success-bg); color: var(--ui-success); }
    .st-preparing { background: var(--ui-info-bg); color: var(--ui-info); }
    .st-shipping { background: var(--ui-pink-soft); color: #653a42; }
    .st-delivered { background: var(--ui-success-bg); color: var(--ui-success); }
    .st-cancelled { background: var(--ui-bg-soft); color: var(--ui-ink-soft); }
    .st-cancel_pending_refund { background: var(--ui-danger-bg); color: var(--ui-danger); }
    .pay { font: 600 12px/16px var(--font-sans); } .pay-ok { color: var(--ui-success); } .pay-wait { color: var(--ui-warning); } .pay-refund { color: var(--ui-danger); } .pay-none { color: var(--ui-subtle); }
    .staff { display: inline-flex; align-items: center; gap: 8px; }
    .avatar { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--ui-pink); color: #653a42; font: 700 10px var(--font-sans); }
    .link-btn { background: none; border: 0; padding: 4px 6px; color: var(--ui-accent); font: 700 12px/16px var(--font-sans); cursor: pointer; text-decoration: underline; }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-outline { text-decoration: none; }
    .btn-outline.danger { color: var(--ui-danger); border-color: var(--ui-danger); }

    .d-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .d-assign { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--ui-ink-soft); margin-bottom: 20px; }
    .pad { padding: 16px 0; }
    .d-sec { margin-bottom: 24px; display: flex; flex-direction: column; gap: 8px; }
    .d-sec.card { background: var(--ui-bg-soft); padding: 12px; border-radius: 2px; }
    .d-sec.white { background: var(--ui-bg); border: 1px solid var(--admin-line-soft); }
    .d-h { margin: 0; font: 700 11px/14px var(--font-serif); letter-spacing: .55px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .timeline { list-style: none; margin: 0; padding: 12px 0 0 24px; position: relative; display: flex; flex-direction: column; gap: 12px; }
    .timeline::before { content: ''; position: absolute; left: 8px; top: 12px; bottom: 8px; width: 2px; background: var(--ui-line-soft); }
    .timeline li { position: relative; display: flex; flex-direction: column; gap: 2px; }
    .timeline li::before { content: ''; position: absolute; left: -24px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--ui-ink); box-sizing: border-box; }
    .timeline li.current { background: #ffd9de4d; padding: 8px 8px 8px 16px; border-radius: 2px; margin-left: -8px; }
    .timeline li.current::before { left: -16px; top: 10px; box-shadow: 0 0 0 4px #f3b7c066; }
    .t-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; }
    .t-row time { font-size: 10px; color: var(--ui-subtle); white-space: nowrap; }
    .t-reason { font-size: 12px; color: var(--ui-ink-soft); }
    .rec { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; flex-wrap: wrap; }
    .addr { margin: 0; font-size: 12px; line-height: 19px; color: var(--ui-ink-soft); }
    .note-box { margin: 0; padding-top: 6px; border-top: 1px solid var(--admin-line-soft); font-size: 12px; font-style: italic; color: var(--ui-subtle); }
    .line { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 10px; background: var(--ui-bg-soft); border-radius: 2px; font-size: 13px; }
    .line-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .line-price { display: flex; flex-direction: column; align-items: flex-end; }
    .small { font-size: 11px; color: var(--ui-subtle); } .right { text-align: right; align-self: flex-end; }
    .qty { font-size: 12px; }
    .sum { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
    .sum.total { padding-top: 8px; border-top: 1px solid var(--admin-line-soft); font-weight: 700; font-size: 16px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .d-sec label, .modal-form-content label { display: flex; flex-direction: column; gap: 6px; font: 600 11px/14px var(--font-sans); color: var(--ui-ink-soft); }
    .refund { flex-direction: row; justify-content: space-between; align-items: center; font-size: 12px; }
    .order-summary-box { background: var(--ui-bg-soft); padding: 12px; font-size: 13px; line-height: 1.6; }
    .order-summary-box p { margin: 0; }
    .modal-form-content { display: flex; flex-direction: column; gap: 14px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
    @media (max-width: 980px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 520px) { .kpis { grid-template-columns: 1fr; } .two { grid-template-columns: 1fr; } }
  `],
})
export class AdminOrdersPage implements OnInit, OnDestroy {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadOrders(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly orderStatusLabel = orderStatusLabel;
  protected readonly shipmentStatusLabel = shipmentStatusLabel;
  readonly stateTabs = STATE_TABS;
  readonly kpis = [
    { id: '', label: 'Tổng đơn' },
    { id: 'PENDING_PAYMENT', label: 'Chờ thanh toán' },
    { id: 'PREPARING', label: 'Đang chuẩn bị' },
    { id: 'SHIPPING', label: 'Đang giao' },
    { id: 'DELIVERED', label: 'Đã giao' },
  ];
  readonly shipmentStatuses = Object.keys(SHIPMENT_STATUS_LABELS) as ShipmentStatus[];

  readonly selectedState = signal<string>('');
  readonly orders = signal<AdminOrderSummary[]>([]);
  readonly loading = signal<boolean>(true);
  readonly loadError = signal('');
  readonly query = signal('');
  readonly counts = signal<Record<string, number | null>>({});
  readonly shipments = signal<Record<string, NonNullable<Order['shipment']> | null>>({});
  readonly detailsLoading = signal(false);

  /** Đơn của trang đang xem; tìm kiếm và lọc theo khách do API xử lý. */
  readonly visibleOrders = computed(() => this.orders());

  readonly customerFilter = signal('');
  readonly customerLabel = signal('');
  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();
  private urlOrderId = '';
  private firstParams = true;

  // Drawer
  readonly drawerOpen = signal(false);
  readonly drawerOrder = signal<AdminOrderSummary | null>(null);
  readonly detail = signal<Order | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly timeline = computed(() => {
    const d = this.detail();
    if (!d) return [] as Array<{ label: string; at?: string; reason?: string }>;
    const steps: Array<{ label: string; at?: string; reason?: string }> = [];
    const history = d.statusHistory ?? [];
    if (!history.some(h => h.to === 'PENDING_PAYMENT')) steps.push({ label: 'Đã đặt hàng', at: d.createdAt });
    for (const h of history) steps.push({ label: orderStatusLabel(h.to), at: h.createdAt, reason: h.reason });
    if (steps.length === 0) steps.push({ label: orderStatusLabel(d.state), at: d.createdAt });
    return steps;
  });

  readonly statusModalOpen = signal<boolean>(false);
  readonly assignModalOpen = signal<boolean>(false);
  readonly selectedOrder = signal<AdminOrderSummary | null>(null);
  readonly saving = signal<boolean>(false);

  // Phân công (PATCH /admin/orders/:orderId/assign)
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
  shipmentStatus: ShipmentStatus = 'READY';

  ngOnInit(): void {
    // Ô tìm: chờ 300ms sau khi ngừng gõ, ghi ?q= lên URL; thay đổi URL là nguồn kích hoạt tải lại (về trang 1).
    this.subs.add(this.search$.pipe(map(v => v.trim()), debounceTime(300), distinctUntilChanged()).subscribe(value => {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { q: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
    }));
    this.subs.add(this.route.queryParamMap.subscribe(params => this.applyParams(params)));
    this.loadCounts();
    if (this.auth.isAdmin()) this.loadStaff();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.pagination.cancel();
  }

  onSearch(value: string): void {
    this.query.set(value);
    this.search$.next(value);
  }

  /** Đọc ?q=, ?customerId=, ?orderId=. q và customerId đổi thì tải lại từ trang 1; orderId mở drawer đơn đó. */
  private applyParams(params: ParamMap): void {
    const q = params.get('q')?.trim() ?? '';
    const customerId = params.get('customerId') ?? '';
    const changed = this.firstParams || q !== this.query().trim() || customerId !== this.customerFilter();
    if (q !== this.query().trim()) this.query.set(q);
    const customerChanged = customerId !== this.customerFilter();
    if (customerChanged) {
      this.customerFilter.set(customerId);
      this.resolveCustomerLabel(customerId);
    }
    if (customerChanged && !this.firstParams) this.loadCounts();
    this.firstParams = false;
    if (changed) { this.pagination.reset(); this.loadOrders(); }
    const orderId = params.get('orderId') ?? '';
    if (orderId && orderId !== this.urlOrderId) this.openOrderById(orderId);
    this.urlOrderId = orderId;
  }

  private resolveCustomerLabel(customerId: string): void {
    this.customerLabel.set(customerId.slice(0, 8).toUpperCase());
    if (!customerId || !this.auth.isAdmin()) return;
    this.api.adminGetUser(customerId).subscribe({
      next: u => { if (this.customerFilter() === customerId) this.customerLabel.set(u.fullName || u.email); },
      error: () => undefined,
    });
  }

  clearCustomerFilter(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { customerId: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Mở drawer cho đơn có thể không nằm trong trang hiện tại: lấy chi tiết trước, rồi tìm dòng tóm tắt theo mã đơn. */
  private openOrderById(orderId: string): void {
    const known = this.orders().find(o => o.id === orderId);
    if (known) { this.openDrawer(known); return; }
    this.api.getOrder(orderId).subscribe({
      next: d => {
        this.api.adminListOrders(undefined, 1, 5, { q: d.code }).pipe(catchError(() => of(null))).subscribe(res => {
          const summary: AdminOrderSummary = res?.items.find(o => o.id === orderId) ?? {
            id: d.id, code: d.code, state: d.state, money: d.money, createdAt: d.createdAt, customerId: '',
            itemCount: d.items.length, shippingSnapshot: d.shippingSnapshot
              ? { receiver: d.shippingSnapshot.receiver, phone: d.shippingSnapshot.phone } : undefined,
          };
          this.openDrawer(summary);
        });
      },
      error: err => this.toast.error(err.error?.message || 'Không thể mở đơn hàng này.'),
    });
  }

  // --- Tải dữ liệu ---
  loadOrders(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.pagination.load(() => this.api.adminListOrders(this.selectedState() || undefined, this.pagination.page(), this.pagination.limit, {
      q: this.query().trim() || undefined, customerId: this.customerFilter() || undefined,
    }), {
      next: (res) => {
        this.orders.set(res.items);
        this.loading.set(false);
        this.loadShipments(res.items);
      },
      error: (err) => { this.loading.set(false); this.loadError.set(err.error?.message || 'Không thể tải danh sách đơn hàng.'); },
    });
  }

  /** Số đếm mỗi tab lấy từ `total` của từng trạng thái (theo khách nếu đang lọc khách); lỗi một tab chỉ làm mất con số đó. */
  private loadCounts(): void {
    for (const tab of STATE_TABS) {
      this.api.adminListOrders(tab.id || undefined, 1, 1, { customerId: this.customerFilter() || undefined }).subscribe({
        next: res => this.counts.update(c => ({ ...c, [tab.id]: res.total })),
        error: () => this.counts.update(c => ({ ...c, [tab.id]: null })),
      });
    }
  }

  /** Danh sách đơn không kèm vận đơn, nên lấy chi tiết từng dòng của trang đang xem. */
  private loadShipments(items: AdminOrderSummary[]): void {
    this.shipments.set({});
    if (items.length === 0) return;
    this.detailsLoading.set(true);
    forkJoin(items.map(o => this.api.getOrder(o.id).pipe(catchError(() => of(null))))).subscribe(results => {
      const map: Record<string, NonNullable<Order['shipment']> | null> = {};
      results.forEach((d, i) => { if (d) map[items[i].id] = d.shipment ?? null; });
      this.shipments.set(map);
      this.detailsLoading.set(false);
    });
  }

  countOf(id: string): number | null {
    return this.counts()[id] ?? null;
  }

  shipmentOf(orderId: string): NonNullable<Order['shipment']> | null {
    return this.shipments()[orderId] ?? null;
  }

  changeFilter(stateId: string): void {
    this.selectedState.set(stateId);
    this.pagination.reset();
    this.loadOrders();
  }

  // --- Hiển thị ---
  codeOf(order: { code?: string; id: string }): string { return order.code || order.id.slice(0, 8).toUpperCase(); }
  money(value: number): string { return `${Math.round(value).toLocaleString('vi-VN')}đ`; }
  itemCount(order: Order): number { return order.items.reduce((s, l) => s + l.quantity, 0); }

  addressOf(order: Order): string {
    const s = order.shippingSnapshot;
    if (!s) return '—';
    return [s.line1, s.ward, s.district, s.province].filter(Boolean).join(', ') || '—';
  }

  paymentLabel(state: OrderStatus): string {
    switch (state) {
      case 'PENDING_PAYMENT': return 'Chờ đối soát';
      case 'CANCEL_PENDING_REFUND': return 'Chờ hoàn tiền';
      case 'CANCELLED': return '—';
      default: return 'Đã thanh toán';
    }
  }
  paymentTone(state: OrderStatus): string {
    if (state === 'PENDING_PAYMENT') return 'wait';
    if (state === 'CANCEL_PENDING_REFUND') return 'refund';
    if (state === 'CANCELLED') return 'none';
    return 'ok';
  }

  staffName(id: string): string {
    const found = this.staffList().find(s => s.id === id);
    if (found) return found.fullName || found.email;
    if (this.auth.currentUser()?.id === id) return 'Bạn';
    return id.slice(0, 8);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts.length > 1 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2))).toUpperCase();
  }

  // --- Quyền (đúng như code cũ) ---
  canManage(order: AdminOrderSummary): boolean { return this.auth.can('order.manage', order.assignedStaffId ?? null); }
  canEditShipment(order: AdminOrderSummary): boolean {
    return this.auth.can('shipment.manage', order.assignedStaffId ?? null) && this.canUpdateShipment(order.state);
  }
  canProposeRefund(): boolean { return this.auth.can('refund.propose') || this.auth.canGlobal('payment.read'); }

  nextStatuses(state: OrderStatus): string[] {
    switch (state) {
      case 'PENDING_PAYMENT': return ['CONFIRMED', 'CANCELLED'];
      case 'CONFIRMED': return ['PREPARING', 'CANCELLED'];
      case 'PREPARING': return ['SHIPPING', 'CANCELLED'];
      case 'SHIPPING': return ['DELIVERED'];
      default: return [];
    }
  }
  canUpdateShipment(state: OrderStatus): boolean { return ['CONFIRMED', 'PREPARING', 'SHIPPING'].includes(state); }

  primaryAction(state: OrderStatus): StatusAction | null {
    switch (state) {
      case 'PENDING_PAYMENT': return { to: 'CONFIRMED', label: 'Xác nhận đã thanh toán' };
      case 'CONFIRMED': return { to: 'PREPARING', label: 'Bắt đầu chuẩn bị' };
      case 'PREPARING': return { to: 'SHIPPING', label: 'Xác nhận xuất kho' };
      case 'SHIPPING': return { to: 'DELIVERED', label: 'Xác nhận đã giao' };
      default: return null;
    }
  }

  statusOptionLabel(next: string): string {
    switch (next) {
      case 'CANCELLED': return 'Hủy đơn hàng';
      case 'CONFIRMED': return 'Đã thanh toán';
      case 'PREPARING': return 'Đang đóng gói';
      case 'SHIPPING': return 'Đang giao';
      default: return 'Đã giao';
    }
  }

  // --- Drawer ---
  openDrawer(order: AdminOrderSummary): void {
    this.drawerOrder.set(order);
    this.detail.set(null);
    this.drawerOpen.set(true);
    this.reloadDetail();
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    if (this.route.snapshot.queryParamMap.get('orderId')) {
      this.urlOrderId = '';
      void this.router.navigate([], { relativeTo: this.route, queryParams: { orderId: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  reloadDetail(): void {
    const summary = this.drawerOrder();
    if (!summary) return;
    this.detailLoading.set(true);
    this.detailError.set('');
    this.api.getOrder(summary.id).subscribe({
      next: d => {
        this.detail.set(d);
        this.detailLoading.set(false);
        const fresh = this.orders().find(o => o.id === d.id);
        this.drawerOrder.set(fresh ?? { ...summary, state: d.state, money: d.money });
        this.carrier = d.shipment?.carrier || '';
        this.trackingCode = d.shipment?.trackingCode || '';
        this.shipmentStatus = (d.shipment?.status as ShipmentStatus) || 'READY';
      },
      error: err => { this.detailLoading.set(false); this.detailError.set(err.error?.message || 'Không thể tải chi tiết đơn hàng.'); },
    });
  }

  private refreshAll(): void {
    this.loadOrders();
    this.loadCounts();
    if (this.drawerOpen()) this.reloadDetail();
  }

  // --- Phân công ---
  openAssignModal(order: AdminOrderSummary): void {
    this.selectedOrder.set(order);
    this.selectedStaffId = order.assignedStaffId || '';
    this.customStaffId = '';
    this.assignModalOpen.set(true);
    if (this.staffList().length === 0) this.loadStaff();
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
    this.api.adminAssignStaff(o.id, staffId).subscribe({
      next: () => {
        this.saving.set(false);
        this.assignModalOpen.set(false);
        this.toast.success('Đã phân công nhân viên phụ trách đơn hàng.');
        this.refreshAll();
      },
      error: (err) => { this.saving.set(false); this.toast.error(err.error?.message || 'Không thể phân công nhân viên.'); },
    });
  }

  // --- Đổi trạng thái ---
  openStatusModal(order: AdminOrderSummary, preselect?: string): void {
    this.selectedOrder.set(order);
    const options = this.nextStatuses(order.state);
    this.newStatus = preselect && options.includes(preselect) ? preselect : options[0] || '';
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
        this.refreshAll();
      },
      error: (err) => { this.saving.set(false); this.toast.error(err.error?.message || 'Không thể cập nhật trạng thái.'); },
    });
  }

  // --- Vận đơn ---
  saveShipment(): void {
    const o = this.drawerOrder();
    if (!o) return;
    this.saving.set(true);
    this.api.adminUpdateShipment(o.id, { carrier: this.carrier, trackingCode: this.trackingCode, status: this.shipmentStatus }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Đã cập nhật thông tin vận chuyển.');
        this.refreshAll();
      },
      error: (err) => { this.saving.set(false); this.toast.error(err.error?.message || 'Không thể lưu thông tin vận chuyển.'); },
    });
  }

  // --- Xuất CSV các đơn đang hiển thị ---
  exportCsv(): void {
    const rows = this.visibleOrders();
    if (rows.length === 0) return;
    const header = ['Mã đơn', 'Khách hàng', 'Điện thoại', 'Thời gian', 'Tổng thanh toán (đ)', 'Giảm voucher (đ)', 'Thanh toán', 'Trạng thái', 'Đơn vị vận chuyển', 'Mã vận đơn', 'Phụ trách'];
    const lines = [header.map(csvCell).join(',')];
    for (const o of rows) {
      const sh = this.shipmentOf(o.id);
      const created = o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '';
      lines.push([
        this.codeOf(o), o.shippingSnapshot?.receiver ?? '', o.shippingSnapshot?.phone ?? '', created,
        o.money.payableTotal, o.money.voucherDiscount || 0, this.paymentLabel(o.state), orderStatusLabel(o.state),
        sh?.carrier ?? '', sh?.trackingCode ?? '', o.assignedStaffId ? this.staffName(o.assignedStaffId) : '',
      ].map(csvCell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- In phiếu đóng gói của đơn đang mở ---
  printSlip(): void {
    const d = this.detail();
    if (!d) return;
    const items = d.items.map(l => `<tr><td>${escapeHtml(l.sku)}</td><td>${escapeHtml(l.productName)}</td><td class="n">${l.quantity}</td></tr>`).join('');
    const s = d.shippingSnapshot;
    const created = d.createdAt ? new Date(d.createdAt).toLocaleString('vi-VN') : '';
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu đóng gói #${escapeHtml(this.codeOf(d))}</title>
<style>
  @page { size: A5; margin: 12mm; }
  body { font: 13px/1.5 Arial, sans-serif; color: #171717; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; } .muted { color: #555; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; } th { font-size: 11px; text-transform: uppercase; }
  .n { text-align: right; } .box { border: 1px solid #999; padding: 8px 10px; margin-top: 10px; }
</style></head><body>
  <h1>Phiếu đóng gói #${escapeHtml(this.codeOf(d))}</h1>
  <div class="muted">Ngày đặt: ${escapeHtml(created)}</div>
  <div class="box"><strong>Người nhận:</strong> ${escapeHtml(s?.receiver)} · ${escapeHtml(s?.phone)}<br>${escapeHtml(this.addressOf(d))}${s?.note ? `<br><em>Ghi chú: ${escapeHtml(s.note)}</em>` : ''}</div>
  <table><thead><tr><th>SKU</th><th>Sản phẩm</th><th class="n">SL</th></tr></thead><tbody>${items}</tbody></table>
  <div class="box">Đơn vị vận chuyển: ${escapeHtml(d.shipment?.carrier || '—')}<br>Mã vận đơn: ${escapeHtml(d.shipment?.trackingCode || '—')}</div>
</body></html>`;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); this.toast.error('Không thể mở khung in.'); return; }
    doc.open(); doc.write(html); doc.close();
    const cleanup = () => setTimeout(() => frame.remove(), 500);
    win.addEventListener('afterprint', cleanup);
    setTimeout(() => { win.focus(); win.print(); }, 100);
    setTimeout(cleanup, 60000);
  }
}
