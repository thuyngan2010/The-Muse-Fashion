import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Order, OrderStatus } from '@fashion/contracts';
import { AccountSidebarComponent } from '../components/account-sidebar.component';
import { ModalComponent } from '../components/modal.component';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { ORDER_STATUS_LABELS, orderStatusLabel } from '../shared/labels';
import { STORE_ORDER_DETAIL_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Component({
  standalone: true,
  imports: [PageStateComponent, AccountSidebarComponent, RouterLink, CurrencyPipe, DatePipe, FormsModule, ModalComponent],
  template: `
    <main class="account-shell">
      <fc-account-sidebar />

      <section class="detail-content">
        <a routerLink="/orders" class="back-link"><span aria-hidden="true">←</span> QUAY LẠI ĐƠN HÀNG</a>

        @if (loading()) {
          <fc-page-state kind="loading" title="Đang tải đơn hàng" message="Thông tin chi tiết đang được cập nhật." />
        } @else if (error()) {
          <fc-page-state kind="error" title="Không thể tải đơn hàng" [message]="error()" actionLabel="THỬ LẠI" (action)="reloadOrder()" />
        } @else if (order(); as o) {
          <header class="detail-header">
            <div>
              <span class="eyebrow">CHI TIẾT ĐƠN HÀNG</span>
              <h1>Đơn hàng của bạn</h1>
              <p><strong>#{{ o.code || o.id.slice(0, 8).toUpperCase() }}</strong><span aria-hidden="true">|</span> Ngày đặt: {{ o.createdAt | date:'dd/MM/yyyy' }}</p>
            </div>
            <span class="status-badge" [class]="'status-badge status-' + o.state.toLowerCase()">{{ formatStatus(o.state) }}</span>
          </header>

          @if (o.state === 'CANCELLED' || o.state === 'CANCEL_PENDING_REFUND') {
            <div class="status-notice" [class.refund]="o.state === 'CANCEL_PENDING_REFUND'">
              <strong>{{ o.state === 'CANCELLED' ? 'ĐƠN HÀNG ĐÃ HỦY' : 'ĐƠN HÀNG ĐANG CHỜ HOÀN TIỀN' }}</strong>
              <p>{{ o.state === 'CANCELLED' ? 'Đơn hàng này đã được hủy.' : 'Yêu cầu hủy đã được ghi nhận và đang chờ xử lý hoàn tiền.' }}</p>
            </div>
          } @else {
            <section class="progress-card" aria-label="Tiến trình đơn hàng">
              @for (step of progressSteps; track step.state; let last = $last; let index = $index) {
                <div class="progress-step" [class.completed]="isStepCompleted(step.state, o.state)" [class.current]="o.state === step.state">
                  <span class="step-square">{{ index + 1 }}</span><span>{{ step.label }}</span>
                </div>
                @if (!last) { <span class="progress-line" [class.completed]="isStepCompleted(progressSteps[index + 1].state, o.state)" aria-hidden="true"></span> }
              }
              @if (estimatedDelivery(o); as eta) { <p class="estimated">Dự kiến giao: <strong>{{ eta | date:'dd/MM/yyyy' }}</strong></p> }
            </section>
          }

          <div class="detail-grid">
            <div class="main-column">
              <section class="box products-box" id="order-products">
                <div class="box-heading"><span>SẢN PHẨM</span><strong>{{ o.items.length }} sản phẩm</strong></div>
                @for (item of o.items; track item.variantId) {
                  <article class="product-row">
                    <div class="product-image">
                      @if (itemImage(item); as src) { <img [src]="src" [alt]="item.productName" /> } @else { <span aria-hidden="true">MUSE</span> }
                    </div>
                    <div class="product-copy">
                      <span class="product-kicker">MUSE</span><h2>{{ item.productName }}</h2>
                      <p>@if (item.sku) { <span>SKU: {{ item.sku }}</span> }<span>Số lượng: {{ item.quantity }}</span></p>
                      @if (o.state === 'DELIVERED' && auth.isCustomer()) {
                        @if (itemReviews()[item.lineId]; as review) {
                          <button type="button" class="review-link reviewed" [disabled]="loadingReviews() || reviewsLoadFailed()" (click)="openReviewModal(item)">ĐÃ ĐÁNH GIÁ {{ review.stars }}/5 · SỬA ĐÁNH GIÁ</button>
                        } @else {
                          <button type="button" class="review-link" [disabled]="loadingReviews() || reviewsLoadFailed()" (click)="openReviewModal(item)">ĐÁNH GIÁ SẢN PHẨM</button>
                        }
                      }
                    </div>
                    <div class="product-price"><span>ĐƠN GIÁ</span><strong>{{ item.unitPrice | currency:'VND':'symbol':'1.0-0' }}</strong><small>{{ item.quantity }} × sản phẩm</small></div>
                  </article>
                }
              </section>

              <section class="box">
                <div class="box-heading"><span>ĐỊA CHỈ NHẬN HÀNG</span></div>
                @if (o.shippingSnapshot; as address) {
                  <div class="address-content">
                    <strong>{{ address.receiver }}</strong><p>{{ address.phone }}</p>
                    <p>{{ address.line1 }}, {{ address.ward }}, {{ address.district }}, {{ address.province }}</p>
                    @if (address.note) { <p>Ghi chú: {{ address.note }}</p> }
                    <small>{{ policy.addressSnapshotNote }}</small>
                  </div>
                }
              </section>

              <section class="box">
                <div class="box-heading"><span>VẬN CHUYỂN</span></div>
                @if (o.shipment; as ship) {
                  <div class="shipping-meta">
                    @if (ship.carrier) { <p><span>Đơn vị vận chuyển</span><strong>{{ ship.carrier }}</strong></p> }
                    @if (ship.trackingCode) {
                      <p><span>Mã vận đơn</span><strong class="tracking-code">{{ ship.trackingCode }}</strong><button type="button" class="copy-button" (click)="copyTrackingCode(ship.trackingCode)">SAO CHÉP</button></p>
                    }
                  </div>
                  @if (ship.events && ship.events.length) {
                    <div class="shipment-events">
                      @for (event of ship.events; track event.occurredAt; let first = $first) {
                        <div class="shipment-event" [class.current]="first"><span class="event-dot" aria-hidden="true"></span><time>{{ event.occurredAt | date:'HH:mm · dd/MM/yyyy' }}</time><p>{{ event.description }}</p></div>
                      }
                    </div>
                  }
                } @else { <p class="muted-copy">Thông tin vận chuyển sẽ hiển thị khi đơn hàng được bàn giao.</p> }
              </section>
            </div>

            <aside class="side-column">
              <section class="box payment-box">
                <div class="box-heading"><span>THANH TOÁN</span></div>
                <div class="payment-lines">
                  <p><span>Tạm tính</span><strong>{{ o.money.subtotal | currency:'VND':'symbol':'1.0-0' }}</strong></p>
                  <p><span>Phí vận chuyển</span><strong>{{ o.money.shippingFee | currency:'VND':'symbol':'1.0-0' }}</strong></p>
                  @if (o.money.voucherDiscount > 0) { <p class="discount"><span>Voucher @if (voucherCode(o); as code) { ({{ code }}) }</span><strong>-{{ o.money.voucherDiscount | currency:'VND':'symbol':'1.0-0' }}</strong></p> }
                </div>
                <div class="payment-total"><span>TỔNG THANH TOÁN</span><strong>{{ o.money.payableTotal | currency:'VND':'symbol':'1.0-0' }}</strong><small>{{ policy.vatNote }}</small></div>
                @if (o.state === 'PENDING_PAYMENT') { <a [routerLink]="['/payment', o.id]" class="button button-pink full-button">THANH TOÁN NGAY <span aria-hidden="true">→</span></a> }
              </section>

              @if (o.statusHistory && o.statusHistory.length) {
                <section class="box history-box"><div class="box-heading"><span>NHẬT KÝ TRẠNG THÁI</span></div>
                  @for (history of o.statusHistory; track history.createdAt) { <div class="history-row"><time>{{ history.createdAt | date:'HH:mm · dd/MM' }}</time><strong>{{ formatHistoryStatus(history.to) }}</strong>@if (history.reason) { <p>{{ history.reason }}</p> }</div> }
                </section>
              }

              <section class="support-box"><span>CẦN HỖ TRỢ ĐƠN HÀNG?</span><p>{{ policy.supportDescription }}</p><a [href]="policy.supportHref">{{ policy.supportLabel }} <span aria-hidden="true">→</span></a><a class="support-request" [routerLink]="['/support']" [queryParams]="{ orderId: o.id }">GỬI YÊU CẦU HỖ TRỢ <span aria-hidden="true">→</span></a></section>

              @if (o.state === 'PENDING_PAYMENT') { <button type="button" class="cancel-order-button" (click)="cancelModalOpen.set(true)">HỦY ĐƠN HÀNG</button> }
            </aside>
          </div>
        }
      </section>
    </main>

    <fc-modal [isOpen]="cancelModalOpen()" title="Hủy đơn hàng" (close)="cancelModalOpen.set(false)">
      <div class="cancel-modal-content">
        <p class="modal-intro">Kiểm tra thông tin đơn hàng trước khi xác nhận hủy.</p>
        <div class="cancel-warning">Bạn chỉ có thể hủy đơn khi đơn hàng đang ở trạng thái Chờ thanh toán.</div>
        @if (order(); as currentOrder) {
          <section class="cancel-summary">
            <header><div><strong>#{{ currentOrder.code || currentOrder.id.slice(0, 8).toUpperCase() }}</strong><span>Ngày đặt: {{ currentOrder.createdAt | date:'dd/MM/yyyy' }}</span></div><span>CHỜ THANH TOÁN</span></header>
            @for (item of currentOrder.items; track item.variantId) {
              <div class="cancel-product"><div class="mini-image">MUSE</div><div><small>MUSE</small><strong>{{ item.productName }}</strong><span>Số lượng: {{ item.quantity }}</span></div><p><span>Đơn giá:</span><strong>{{ item.unitPrice | currency:'VND':'symbol':'1.0-0' }}</strong></p></div>
            }
            <div class="cancel-prices"><p><span>Tạm tính</span><strong>{{ currentOrder.money.subtotal | currency:'VND':'symbol':'1.0-0' }}</strong></p><p><span>Phí vận chuyển</span><strong>{{ currentOrder.money.shippingFee | currency:'VND':'symbol':'1.0-0' }}</strong></p><p class="cancel-total"><span>TỔNG THANH TOÁN</span><strong>{{ currentOrder.money.payableTotal | currency:'VND':'symbol':'1.0-0' }}</strong></p></div>
          </section>
        }
        <label class="modal-label" for="cancel-reason">LÝ DO HỦY ĐƠN (TÙY CHỌN)</label>
        <textarea id="cancel-reason" [(ngModel)]="cancelReason" rows="4" placeholder="Chia sẻ lý do bạn muốn hủy đơn (không bắt buộc)..."></textarea>
        <div class="modal-actions"><button type="button" class="button button-outline" (click)="cancelModalOpen.set(false)">QUAY LẠI</button><button type="button" class="button button-pink" [disabled]="cancelling()" (click)="confirmCancel()">{{ cancelling() ? 'ĐANG XỬ LÝ...' : 'HỦY ĐƠN HÀNG' }} <span aria-hidden="true">→</span></button></div>
      </div>
    </fc-modal>

    <fc-modal [isOpen]="reviewModalOpen()" [title]="editingReviewId() ? 'Chỉnh sửa đánh giá' : 'Đánh giá sản phẩm'" (close)="reviewModalOpen.set(false)">
      <div class="review-modal-content">
        @if (selectedItemForReview(); as item) {
          <span class="modal-kicker">SẢN PHẨM</span><h3>{{ item.productName }}</h3>
          <div class="stars-select" aria-label="Số sao đánh giá">@for (star of [1, 2, 3, 4, 5]; track star) { <button type="button" class="star-button" [class.active]="star <= reviewStars" [attr.aria-label]="star + ' sao'" (click)="reviewStars = star">★</button> }</div>
          <label class="modal-label" for="review-content">NỘI DUNG ĐÁNH GIÁ</label><textarea id="review-content" [(ngModel)]="reviewContent" rows="5" placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..."></textarea>
          <div class="modal-actions review-actions">
            @if (editingReviewId()) { <button type="button" class="delete-review" [disabled]="submittingReview()" (click)="deleteReview()">XÓA ĐÁNH GIÁ</button> }
            <span></span><button type="button" class="button button-outline" (click)="reviewModalOpen.set(false)">QUAY LẠI</button><button type="button" class="button button-pink" [disabled]="submittingReview() || !reviewContent.trim()" (click)="submitReview()">{{ submittingReview() ? 'ĐANG GỬI...' : editingReviewId() ? 'LƯU THAY ĐỔI' : 'GỬI ĐÁNH GIÁ' }}</button>
          </div>
        }
      </div>
    </fc-modal>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Outfit:wght@300;400;500&family=Playfair+Display:wght@400;500&display=swap');
    :host { display:block; color:#171414; background:#fff; } * { box-sizing:border-box; }
    .account-shell { width:min(1184px, calc(100% - 48px)); margin:0 auto; padding:40px 0 88px; display:grid; grid-template-columns:280px minmax(0,1fr); gap:32px; align-items:start; font-family:'Montserrat',sans-serif; }
    .detail-content { min-width:0; } .back-link { display:inline-flex; gap:10px; margin-bottom:24px; color:#171414; text-decoration:none; font-size:10px; font-weight:600; letter-spacing:1px; }
    .detail-header { padding-bottom:24px; border-bottom:1px solid #5f5353; display:flex; align-items:flex-end; justify-content:space-between; gap:24px; }
    .eyebrow { color:#8f485d; font-size:10px; font-weight:600; letter-spacing:1.5px; } .detail-header h1 { margin:7px 0 10px; font:400 40px/1.2 'Playfair Display',serif; letter-spacing:-.5px; }
    .detail-header p { margin:0; display:flex; flex-wrap:wrap; gap:12px; color:#444748; font-size:12px; } .detail-header p strong { color:#000; letter-spacing:.8px; }
    .status-badge { padding:6px 12px; border:1px solid currentColor; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; white-space:nowrap; }
    .status-pending_payment { background:#fff8e8; color:#8c641a; } .status-confirmed,.status-delivered { background:#edf8f1; color:#296348; } .status-preparing { background:#eff5fa; color:#3f5f7e; } .status-shipping { background:#f0f1fa; color:#495687; } .status-cancelled { background:#fff1f1; color:#a33d3d; } .status-cancel_pending_refund { background:#fff5e9; color:#87572a; }
    .status-notice { margin-top:24px; padding:18px 20px; border:1px solid #b33d3d; background:#fff4f4; } .status-notice.refund { border-color:#8c641a; background:#fff9ed; } .status-notice strong { font-size:11px; letter-spacing:1.1px; } .status-notice p { margin:7px 0 0; color:#5f5757; font:300 14px 'Outfit',sans-serif; }
    .progress-card { margin:24px 0; padding:24px; border:1px solid #5f5353; display:flex; align-items:flex-start; position:relative; }
    .progress-step { width:100px; display:grid; justify-items:center; gap:9px; color:#8a8282; text-align:center; font-size:9px; font-weight:600; letter-spacing:.7px; text-transform:uppercase; }
    .step-square { width:30px; height:30px; border:1px solid #bdb8b8; display:grid; place-items:center; background:#fff; color:#777; } .progress-step.completed .step-square { background:#000; border-color:#000; color:#fff; } .progress-step.completed { color:#000; }
    .progress-step.current .step-square { box-shadow:0 0 0 4px #ffd9e1; } .progress-line { flex:1; height:1px; margin:15px -8px 0; background:#d7d3d3; } .progress-line.completed { background:#000; }
    .estimated { position:absolute; right:24px; bottom:8px; margin:0; color:#5f5757; font-size:10px; }
    .detail-grid { display:grid; grid-template-columns:minmax(0,1fr) 292px; gap:24px; align-items:start; } .main-column,.side-column { min-width:0; }
    .box { margin-bottom:24px; border:1px solid #5f5353; background:#fff; } .box-heading { min-height:52px; padding:0 20px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #e3e2e2; background:rgba(245,243,243,.4); }
    .box-heading span { font-size:11px; font-weight:600; letter-spacing:1.2px; } .box-heading strong { color:#686060; font-size:10px; font-weight:500; }
    .product-row { min-height:144px; padding:20px; display:grid; grid-template-columns:92px minmax(0,1fr) 120px; gap:18px; align-items:center; } .product-row + .product-row { border-top:1px solid #e3e2e2; }
    .product-image { width:92px; height:120px; border:1px solid #e3e2e2; background:#efeded; display:grid; place-items:center; overflow:hidden; } .product-image img { width:100%; height:100%; object-fit:cover; } .product-image > span { color:#8e8585; font:500 13px 'Playfair Display',serif; letter-spacing:2px; }
    .product-kicker { color:#8f485d; font-size:9px; font-weight:600; letter-spacing:1.2px; } .product-copy h2 { margin:8px 0; font:500 15px/1.4 'Montserrat',sans-serif; }
    .product-copy p { margin:0 0 12px; display:flex; flex-wrap:wrap; gap:5px 14px; color:#625b5b; font-size:10px; }
    .product-price { text-align:right; align-self:start; padding-top:10px; display:grid; gap:6px; } .product-price > span { color:#777; font-size:9px; letter-spacing:1px; } .product-price strong { font-size:13px; } .product-price small { color:#777; font-size:9px; }
    .review-link { border:0; background:none; padding:0 0 3px; color:#8f485d; border-bottom:1px solid currentColor; font:600 9px 'Montserrat',sans-serif; letter-spacing:.8px; cursor:pointer; } .review-link.reviewed { color:#296348; } .review-link:disabled { opacity:.5; cursor:not-allowed; }
    .address-content { padding:20px; } .address-content strong { font-size:14px; } .address-content p { margin:7px 0; color:#444748; font-size:12px; line-height:1.6; } .address-content small { display:block; margin-top:14px; padding-top:12px; border-top:1px solid #e3e2e2; color:#777; font-size:10px; line-height:1.5; }
    .shipping-meta { padding:18px 20px; border-bottom:1px solid #e3e2e2; } .shipping-meta p { margin:0; display:flex; align-items:center; gap:10px; font-size:11px; } .shipping-meta p + p { margin-top:10px; } .shipping-meta p > span { min-width:125px; color:#777; } .tracking-code { font-family:monospace; letter-spacing:.7px; }
    .copy-button { border:0; background:none; color:#8f485d; padding:0; font:600 9px 'Montserrat',sans-serif; letter-spacing:.8px; cursor:pointer; }
    .shipment-events { padding:20px; } .shipment-event { position:relative; min-height:56px; padding:0 0 20px 24px; border-left:1px solid #d9d5d5; } .shipment-event:last-child { min-height:0; padding-bottom:0; }
    .event-dot { position:absolute; left:-5px; top:2px; width:9px; height:9px; border:1px solid #777; background:#fff; } .shipment-event.current .event-dot { background:#000; border-color:#000; }
    .shipment-event time { color:#777; font-size:9px; } .shipment-event p { margin:5px 0 0; font-size:11px; line-height:1.5; } .muted-copy { margin:0; padding:20px; color:#777; font-size:11px; }
    .payment-lines { padding:18px 20px; } .payment-lines p { margin:0 0 12px; display:flex; justify-content:space-between; gap:12px; color:#555; font-size:11px; } .payment-lines p:last-child { margin-bottom:0; } .payment-lines strong { color:#171414; font-weight:500; } .payment-lines .discount { color:#296348; }
    .payment-total { padding:18px 20px; border-top:1px solid #e3e2e2; background:rgba(245,243,243,.4); display:grid; gap:8px; } .payment-total span { font-size:10px; font-weight:600; letter-spacing:1px; } .payment-total strong { color:#de233f; font-size:22px; } .payment-total small { color:#777; font-size:9px; }
    .button { min-height:44px; padding:12px 24px; border:1px solid #000; display:inline-flex; align-items:center; justify-content:center; gap:12px; color:#000; text-decoration:none; font:600 10px 'Montserrat',sans-serif; letter-spacing:1px; cursor:pointer; } .button-pink { background:#ffd9e1; } .button-outline { background:#fff; } .button:disabled { opacity:.55; cursor:not-allowed; } .full-button { margin:0 20px 20px; width:calc(100% - 40px); }
    .history-row { padding:14px 20px; } .history-row + .history-row { border-top:1px solid #e3e2e2; } .history-row time { display:block; color:#777; font-size:9px; } .history-row strong { display:block; margin-top:5px; font-size:10px; letter-spacing:.5px; } .history-row p { margin:5px 0 0; color:#666; font-size:10px; line-height:1.5; }
    .support-box { padding:22px; background:#f5f3f3; border:1px solid #e3e2e2; } .support-box > span { font-size:10px; font-weight:600; letter-spacing:1.2px; } .support-box p { color:#615959; font:300 13px/1.55 'Outfit',sans-serif; } .support-box a.support-request { display:flex; margin-top:12px; min-height:44px; align-items:center; justify-content:center; gap:12px; border:1px solid #000; background:#f4b8c1; letter-spacing:1px; } .support-box a.support-request:hover { background:#000; color:#fff; } .support-box a { color:#000; font-size:10px; font-weight:600; letter-spacing:.8px; text-decoration:none; }
    .cancel-order-button { width:100%; margin-top:16px; border:0; background:none; color:#a33d3d; padding:12px; font:600 10px 'Montserrat',sans-serif; letter-spacing:1px; text-decoration:underline; text-underline-offset:4px; cursor:pointer; }
    .cancel-modal-content,.review-modal-content { width:min(100%,780px); font-family:'Montserrat',sans-serif; } .modal-intro { margin:-4px 0 18px; color:#444748; font-size:12px; } .cancel-warning { padding:16px; margin-bottom:18px; border:1px solid #e3e2e2; background:#f5f3f3; font-size:11px; line-height:1.6; }
    .cancel-summary { border:1px solid #5f5353; } .cancel-summary header { padding:16px 24px; display:flex; justify-content:space-between; align-items:center; background:#f5f3f3; border-bottom:1px solid #5f5353; }
    .cancel-summary header div { display:flex; gap:14px; align-items:center; } .cancel-summary header strong { font-size:12px; letter-spacing:.8px; } .cancel-summary header div span { color:#555; font-size:10px; } .cancel-summary header > span { padding:5px 10px; border:1px solid #000; font-size:9px; font-weight:600; letter-spacing:.8px; }
    .cancel-product { min-height:112px; padding:20px 24px; display:grid; grid-template-columns:80px 1fr auto; gap:20px; align-items:center; border-bottom:1px solid #e3e2e2; } .mini-image { width:80px; height:72px; display:grid; place-items:center; background:#efeded; color:#8b8282; font:500 12px 'Playfair Display',serif; }
    .cancel-product > div:nth-child(2) { display:grid; gap:6px; } .cancel-product small { color:#8f485d; font-size:8px; font-weight:600; letter-spacing:1px; } .cancel-product div > strong { font-size:12px; } .cancel-product div > span { color:#666; font-size:9px; } .cancel-product > p { display:grid; gap:4px; text-align:right; } .cancel-product p span { color:#777; font-size:9px; } .cancel-product p strong { font-size:12px; }
    .cancel-prices { padding:18px 24px; background:rgba(245,243,243,.4); } .cancel-prices p { margin:0 0 10px; display:flex; justify-content:space-between; font-size:11px; } .cancel-prices .cancel-total { margin:14px 0 0; padding-top:14px; border-top:1px solid #e3e2e2; align-items:center; font-weight:600; letter-spacing:.8px; } .cancel-total strong { color:#de233f; font-size:21px; letter-spacing:0; }
    .modal-label { display:block; margin:20px 0 8px; font-size:10px; font-weight:600; letter-spacing:1px; } .cancel-modal-content textarea,.review-modal-content textarea { width:100%; border:1px solid #bdb8b8; border-radius:0; padding:14px 16px; resize:vertical; font:400 12px/1.6 'Montserrat',sans-serif; }
    .modal-actions { margin-top:16px; padding-top:16px; border-top:1px solid #e3e2e2; display:flex; gap:12px; justify-content:space-between; } .review-actions > span { flex:1; } .modal-kicker { color:#8f485d; font-size:9px; font-weight:600; letter-spacing:1px; } .review-modal-content h3 { margin:6px 0 14px; font:500 18px 'Playfair Display',serif; }
    .stars-select { display:flex; gap:5px; } .star-button { border:0; background:none; color:#d5d0d0; padding:0; font-size:30px; cursor:pointer; } .star-button.active { color:#d89a36; } .delete-review { border:0; background:none; color:#a33d3d; font:600 9px 'Montserrat',sans-serif; letter-spacing:.8px; text-decoration:underline; cursor:pointer; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media (max-width:960px) { .account-shell { grid-template-columns:1fr; width:min(100% - 32px,760px); } .detail-grid { grid-template-columns:1fr; } }
    @media (max-width:640px) { .account-shell { width:100%; padding:20px 16px 64px; } .detail-header { align-items:flex-start; flex-direction:column; } .detail-header h1 { font-size:34px; } .progress-card { overflow-x:auto; padding:20px 12px; } .progress-step { min-width:86px; } .progress-line { min-width:30px; } .estimated { display:none; } .product-row { grid-template-columns:72px minmax(0,1fr); padding:16px; } .product-image { width:72px; height:96px; } .product-price { grid-column:2; text-align:left; padding:0; } .shipping-meta p { align-items:flex-start; flex-wrap:wrap; } .shipping-meta p > span { min-width:100%; } .cancel-summary header,.cancel-summary header div { align-items:flex-start; flex-direction:column; } .cancel-product { grid-template-columns:64px 1fr; padding:16px; } .mini-image { width:64px; height:72px; } .cancel-product > p { grid-column:2; text-align:left; } .modal-actions { flex-wrap:wrap; } .modal-actions .button { flex:1; } }
    
  `],
})
export class OrderDetailPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly order = signal<Order | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly cancelModalOpen = signal(false);
  readonly cancelling = signal(false);
  readonly reviewModalOpen = signal(false);
  readonly selectedItemForReview = signal<any>(null);
  readonly editingReviewId = signal('');
  readonly itemReviews = signal<Record<string, { id: string; stars: number; content: string }>>({});
  readonly loadingReviews = signal(false);
  readonly reviewsLoadFailed = signal(false);
  readonly submittingReview = signal(false);
  readonly policy = STORE_ORDER_DETAIL_CONTENT;
  readonly progressSteps: ReadonlyArray<{ state: OrderStatus; label: string }> = [
    ...(['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'SHIPPING', 'DELIVERED'] as const).map(state => ({ state, label: ORDER_STATUS_LABELS[state] })),
  ];
  cancelReason = '';
  reviewStars = 5;
  reviewContent = '';

  ngOnInit(): void { const id = this.route.snapshot.paramMap.get('id'); if (id) this.fetchOrder(id); else { this.error.set('Thiếu mã đơn hàng.'); this.loading.set(false); } }
  reloadOrder(): void { const id = this.route.snapshot.paramMap.get('id'); if (id) this.fetchOrder(id); }
  fetchOrder(id: string): void {
    this.loading.set(true); this.error.set('');
    this.api.getOrder(id).subscribe({
      next: (o) => {
        this.order.set(o);
        if (this.auth.isCustomer()) {
          this.loadingReviews.set(true); this.reviewsLoadFailed.set(false);
          this.api.myOrderReviews(o.id).subscribe({
            next: result => { this.itemReviews.set(Object.fromEntries(result.items.map(review => [review.orderItemId, { id: review.id, stars: review.stars, content: review.content }]))); this.loadingReviews.set(false); this.handleReviewAction(o); },
            error: () => { this.loadingReviews.set(false); this.reviewsLoadFailed.set(true); this.toast.error('Không thể tải đánh giá đã gửi. Vui lòng tải lại đơn hàng trước khi đánh giá.'); },
          });
        }
        this.loading.set(false);
        this.handleAction(o);
      },
      error: () => { this.error.set('Không thể tìm thấy thông tin đơn hàng này.'); this.loading.set(false); },
    });
  }
  private actionHandled = false;
  /** Đọc ?action= sau khi tải đơn; không mở được thì bỏ qua, không báo lỗi. */
  private handleAction(o: Order): void {
    const action = this.route.snapshot.queryParamMap.get('action');
    if (this.actionHandled || !action) return;
    if (action === 'cancel' && o.state === 'PENDING_PAYMENT') { this.actionHandled = true; this.cancelModalOpen.set(true); }
    if (action === 'review' && o.state === 'DELIVERED' && !this.auth.isCustomer()) this.actionHandled = true;
  }
  private handleReviewAction(o: Order): void {
    if (this.actionHandled || this.route.snapshot.queryParamMap.get('action') !== 'review' || o.state !== 'DELIVERED') return;
    this.actionHandled = true;
    setTimeout(() => {
      document.getElementById('order-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const pending = o.items.filter((item) => !this.itemReviews()[item.lineId]);
      if (pending.length === 1) this.openReviewModal(pending[0]);
    }, 0);
  }
  isStepCompleted(step: OrderStatus, current: OrderStatus): boolean { const steps: OrderStatus[] = ['PENDING_PAYMENT','CONFIRMED','PREPARING','SHIPPING','DELIVERED']; return steps.indexOf(current) >= steps.indexOf(step); }
  itemImage(item: Order['items'][number]): string { const data = item as unknown as { imageUrl?:string; productImage?:string; image?:{url?:string} }; return data.imageUrl || data.productImage || data.image?.url || ''; }
  estimatedDelivery(order: Order): string | Date | null { const data = order as unknown as { estimatedDeliveryAt?:string; shipment?:{estimatedDeliveryAt?:string} }; return data.estimatedDeliveryAt || data.shipment?.estimatedDeliveryAt || null; }
  voucherCode(order: Order): string { return (order as unknown as { voucherCode?:string; voucher?:{code?:string} }).voucherCode || (order as unknown as { voucher?:{code?:string} }).voucher?.code || ''; }
  formatHistoryStatus(state: string): string { return this.formatStatus(state as OrderStatus); }
  async copyTrackingCode(code: string): Promise<void> { try { await navigator.clipboard.writeText(code); this.toast.success('Đã sao chép mã vận đơn.'); } catch { this.toast.error('Không thể sao chép mã vận đơn.'); } }
  formatStatus(state: OrderStatus): string { return orderStatusLabel(state); }
  confirmCancel(): void {
    const o = this.order(); if (!o) return; this.cancelling.set(true);
    this.api.cancelOrder(o.id, this.cancelReason || 'Khách hàng yêu cầu hủy đơn', generateUUID()).subscribe({
      next: () => { this.fetchOrder(o.id); this.cancelling.set(false); this.cancelModalOpen.set(false); this.toast.success('Đơn hàng đã được hủy thành công.'); },
      error: (err) => { this.cancelling.set(false); this.toast.error(err.error?.message || 'Không thể hủy đơn hàng.'); },
    });
  }
  openReviewModal(item: any): void {
    if (this.loadingReviews() || this.reviewsLoadFailed()) return; this.selectedItemForReview.set(item); const existing = this.itemReviews()[item.lineId];
    if (existing) { this.editingReviewId.set(existing.id); this.reviewStars = existing.stars; this.reviewContent = existing.content; } else { this.editingReviewId.set(''); this.reviewStars = 5; this.reviewContent = ''; }
    this.reviewModalOpen.set(true);
  }
  submitReview(): void {
    const item = this.selectedItemForReview(); if (!item || !this.reviewContent.trim()) return; this.submittingReview.set(true); const reviewId = this.editingReviewId();
    if (reviewId) {
      this.api.updateReview(reviewId, { orderItemId:item.lineId, stars:this.reviewStars, content:this.reviewContent.trim() }).subscribe({
        next: () => { this.submittingReview.set(false); this.itemReviews.update(map => ({ ...map, [item.lineId]:{ id:reviewId, stars:this.reviewStars, content:this.reviewContent.trim() } })); this.reviewModalOpen.set(false); this.toast.success('Đã cập nhật đánh giá sản phẩm!'); },
        error: (err) => { this.submittingReview.set(false); this.toast.error(err.error?.message || 'Không thể cập nhật đánh giá.'); },
      });
    } else {
      this.api.createReview({ orderItemId:item.lineId, stars:this.reviewStars, content:this.reviewContent.trim() }).subscribe({
        next: (res) => { this.submittingReview.set(false); this.itemReviews.update(map => ({ ...map, [item.lineId]:{ id:res.id, stars:this.reviewStars, content:this.reviewContent.trim() } })); this.reviewModalOpen.set(false); this.toast.success('Cảm ơn bạn đã gửi đánh giá sản phẩm!'); },
        error: (err) => { this.submittingReview.set(false); this.toast.error(err.error?.message || 'Không thể gửi đánh giá.'); },
      });
    }
  }
  deleteReview(): void {
    const item = this.selectedItemForReview(); const reviewId = this.editingReviewId(); if (!item || !reviewId || !confirm('Bạn có chắc chắn muốn xóa đánh giá này không?')) return; this.submittingReview.set(true);
    this.api.deleteReview(reviewId).subscribe({
      next: () => { this.submittingReview.set(false); this.itemReviews.update(map => { const next = {...map}; delete next[item.lineId]; return next; }); this.reviewModalOpen.set(false); this.toast.success('Đã xóa đánh giá sản phẩm.'); },
      error: (err) => { this.submittingReview.set(false); this.toast.error(err.error?.message || 'Không thể xóa đánh giá.'); },
    });
  }
}
