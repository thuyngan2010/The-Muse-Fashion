import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { Refund, PaymentAttempt, PaymentReviewAction, PaymentReviewEvent } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { AdminOrderTabsComponent } from '../../components/admin-order-tabs.component';
import { AuthService } from '../../services/auth.service';
import { paymentEventResolutionLabel, paymentReviewDecisionLabel, refundStateLabel } from '../../shared/labels';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Lỗi đối soát từ API (tiếng Anh) đổi sang tiếng Việt kèm cách xử lý. */
const REVIEW_ERRORS: Record<string, string> = {
  'Merchant funds cannot be closed without a recorded resolution':
    'Không thể "Đề xuất đóng" vì tiền đã vào tài khoản cửa hàng. Hãy chọn "Đề xuất ghi nhận đã hoàn ngoài hệ thống" (kèm mã chứng từ hoàn tiền) hoặc "Tiếp tục đối soát".',
  'Resolution does not match a merchant bank transaction': 'Quyết định không khớp với giao dịch này (sai chiều tiền vào/ra hoặc không phải tài khoản cửa hàng).',
  'Exact bank amount and a bank reference are required': 'Cần đúng số tiền theo ngân hàng và mã chứng từ ngân hàng.',
  'Only authenticated bank events can be settled': 'Chỉ ghi nhận được giao dịch đã xác thực từ cổng thanh toán.',
  'A specific reconciliation note is required': 'Ghi chú kiểm toán cần tối thiểu 10 ký tự.',
  'Refund evidence is not a finalized private upload owned by the actor': 'Ảnh chứng từ chưa tải xong hoặc đã hết hạn. Hãy xóa ảnh và tải lại.',
  'Payment event has already been resolved': 'Sự kiện này đã được xử lý trước đó. Hãy tải lại danh sách.',
  'Another resolution proposal is already pending': 'Đã có một đề xuất khác đang chờ xác nhận.',
  'Reject the pending proposal before escalating': 'Hãy từ chối đề xuất đang chờ trước khi tiếp tục đối soát.',
  'Bank reference already belongs to another settlement': 'Mã chứng từ ngân hàng này đã được dùng cho giao dịch khác.',
};
export function reviewErrorText(message: string | undefined): string {
  return (message && REVIEW_ERRORS[message]) || message || '';
}

const REFUND_STEPS = ['Đề xuất', 'Tài khoản nhận', 'Duyệt', 'Hoàn tất'];
const COUNT_STATES = ['PENDING_APPROVAL', 'APPROVED', 'SUCCEEDED', 'FAILED'];

@Component({
  standalone: true,
  imports: [RouterLink, PaginationComponent, FormsModule, ModalComponent, AdminDrawerComponent, AdminOrderTabsComponent],
  template: `
    <div class="ar">
      <fc-admin-order-tabs active="refunds" />

      <header class="head">
        <div>
          <h1 class="title">Hoàn tiền và đối soát</h1>
          <p class="sub">Xử lý đề xuất hoàn tiền, duyệt chuyển khoản hoàn và đối soát sự kiện thanh toán.</p>
        </div>
        <div class="head-actions">
          @if (activeTab() === 'refunds') {
            @if (auth.can('payment.read')) { <button type="button" class="btn-primary" (click)="openProposeModal()">+ Đề xuất hoàn tiền</button> }
          } @else {
            <button type="button" class="btn-outline" (click)="loadPaymentEvents()">Làm mới sự kiện</button>
          }
        </div>
      </header>

      <!-- Ô số liệu -->
      <section class="kpis" aria-label="Số liệu hoàn tiền và đối soát">
        @if (auth.can('refund.propose')) {
          @for (s of countStates; track s) {
            <article class="kpi"><span class="kpi-label">{{ refundStateLabel(s) }}</span><strong class="kpi-value">{{ counts()[s] ?? '—' }}</strong><span class="kpi-note">Số yêu cầu</span></article>
          }
          <article class="kpi">
            <span class="kpi-label">Tiền đang chờ hoàn</span>
            <strong class="kpi-value">{{ money(pendingAmount()) }}</strong>
            <span class="kpi-note">Chờ duyệt và chờ chuyển, trong {{ refunds().length }} yêu cầu của trang đang xem</span>
          </article>
        }
        @if (auth.canGlobal('payment.read')) {
          <article class="kpi"><span class="kpi-label">Sự kiện chờ xử lý</span><strong class="kpi-value">{{ openEvents() ?? '—' }}</strong><span class="kpi-note">Sự kiện thanh toán cần đối soát</span></article>
        }
      </section>

      <!-- Phân hệ -->
      <nav class="sub-tabs" aria-label="Hoàn tiền hoặc sự kiện thanh toán">
        @if (auth.can('refund.propose')) {
          <button type="button" class="sub-tab" [class.active]="activeTab() === 'refunds'" (click)="activeTab.set('refunds')">Hoàn tiền <span class="cnt">{{ pagination.total() }}</span></button>
        }
        @if (auth.canGlobal('payment.read')) {
          <button type="button" class="sub-tab" [class.active]="activeTab() === 'events'" (click)="switchToEventsTab()">Sự kiện thanh toán <span class="cnt">{{ eventPagination.total() }}</span></button>
        }
      </nav>

      @if (activeTab() === 'refunds') {
        <ol class="steps-note" aria-label="Các bước hoàn tiền">
          @for (step of steps; track step; let i = $index) { <li><span class="step-no">{{ i + 1 }}</span>{{ step }}</li> }
        </ol>

        @if (loading()) {
          <div class="state-box"><div class="spinner"></div><p>Đang tải danh sách hoàn tiền…</p></div>
        } @else if (refunds().length === 0) {
          <div class="state-box"><p>Chưa có yêu cầu hoàn tiền nào.</p></div>
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Mã hoàn tiền</th><th>Đơn hàng</th><th class="c-num">Số tiền hoàn</th><th>Người đề xuất</th><th>Lý do</th><th>Tài khoản nhận</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
              <tbody>
                @for (rf of refunds(); track rf.id) {
                  <tr class="row" (click)="viewRefundDetail(rf.id)">
                    <td class="mono strong">{{ rf.id.slice(0, 8) }}</td>
                    <td class="mono">
                      @if (auth.can('order.read')) {
                        <a class="link-btn" routerLink="/admin/orders" [queryParams]="{ orderId: rf.orderId }" (click)="$event.stopPropagation()" [attr.aria-label]="'Mở đơn hàng ' + orderLabel(rf)">{{ orderLabel(rf) }}</a>
                      } @else { {{ orderLabel(rf) }} }
                    </td>
                    <td class="c-num strong amount">{{ money(rf.amount) }}</td>
                    <td>{{ rf.proposedByName || '—' }}</td>
                    <td class="reason">{{ rf.reason }}</td>
                    <td>
                      @if (rf.beneficiary) {
                        <strong class="strong">{{ rf.beneficiary.accountName }}</strong>
                        <span class="sub-line">{{ rf.beneficiary.accountNumberMasked }} ({{ rf.beneficiary.bankBin }})</span>
                      } @else if (rf.state === 'PENDING_APPROVAL') {
                        <button type="button" class="link-btn" (click)="$event.stopPropagation(); openBeneficiaryModal(rf)">+ Nhập tài khoản nhận</button>
                      } @else { <span class="muted">—</span> }
                    </td>
                    <td><span class="badge" [class]="'badge rs-' + rf.state.toLowerCase()">{{ refundStateLabel(rf.state) }}</span></td>
                    <td class="nowrap">{{ fmt(rf.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <fc-pagination label="yêu cầu hoàn tiền" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />
        }
      } @else {
        <section class="filters">
          <label class="f-sel">Danh sách đối soát
            <select name="eventView" [(ngModel)]="eventView" (ngModelChange)="eventPagination.reset(); loadPaymentEvents()">
              <option value="OPEN">Cần xử lý</option><option value="RESOLVED">Đã xử lý</option><option value="ALL">Tất cả</option>
            </select>
          </label>
        </section>
        @if (loadingEvents()) {
          <div class="state-box"><div class="spinner"></div><p>Đang tải sự kiện thanh toán…</p></div>
        } @else if (paymentEvents().length === 0) {
          <div class="state-box"><p>Không có sự kiện thanh toán nào trong danh sách này.</p></div>
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Cổng / Mã sự kiện</th><th>Loại / Số tiền</th><th>Thời gian</th><th>Nội dung giao dịch</th><th>Kết quả khớp</th><th>Đánh giá kiểm toán</th><th class="c-act"><span class="sr-only">Chi tiết</span></th></tr></thead>
              <tbody>
                @for (ev of paymentEvents(); track ev.id) {
                  <tr class="row" (click)="openReviewEventModal(ev)">
                    <td><strong class="strong">{{ ev.provider }}</strong><span class="sub-line mono">{{ ev.eventId || ev.id.slice(0, 8) }}</span></td>
                    <td><span class="badge" [class]="isIncoming(ev) ? 'badge rs-succeeded' : 'badge rs-processing'">{{ isIncoming(ev) ? 'Tiền vào' : 'Tiền ra' }}</span><span class="sub-line strong">{{ money(ev.transferAmount) }}</span></td>
                    <td class="nowrap">{{ fmt(ev.transactionDate || ev.createdAt) }}</td>
                    <td class="reason">{{ ev.content || '—' }}</td>
                    <td><span class="badge" [class]="ev.resolution === 'MATCHED' ? 'badge rs-succeeded' : 'badge rs-pending_approval'">{{ paymentEventResolutionLabel(ev.resolution) }}</span></td>
                    <td>
                      @if (ev.reviewDecision) { <span class="badge rs-approved">{{ paymentReviewDecisionLabel(ev.reviewDecision) }}</span> }
                      @else { <span class="muted">Chưa duyệt</span> }
                    </td>
                    <td class="c-act"><button type="button" class="link-btn" [attr.aria-label]="'Xem sự kiện ' + (ev.eventId || ev.id.slice(0, 8))">{{ auth.isAdmin() ? 'Đánh giá' : 'Chi tiết' }}</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <fc-pagination label="sự kiện thanh toán" [page]="eventPagination.page()" [total]="eventPagination.total()" [limit]="eventPagination.limit" [loading]="loadingEvents()" (pageChange)="eventPaginationChanged($event)" />
        }
      }
    </div>

    <!-- Drawer chi tiết hoàn tiền (GET /admin/refunds/:refundId) -->
    <fc-admin-drawer [isOpen]="detailModalOpen()" eyebrow="Chi tiết hoàn tiền" [title]="detailedRefund() ? 'Hoàn tiền ' + detailedRefund()!.id.slice(0, 8) : 'Chi tiết hoàn tiền'" width="480px" (close)="detailModalOpen.set(false)">
      @if (loadingDetail()) {
        <p class="muted pad">Đang tải chi tiết hoàn tiền…</p>
      } @else if (detailedRefund(); as d) {
        <ol class="progress" aria-label="Tiến trình hoàn tiền">
          @for (step of steps; track step; let i = $index) {
            <li [class.done]="i < stepIndex(d)" [class.current]="i === stepIndex(d)">{{ step }}</li>
          }
        </ol>
        <div class="d-top"><span class="badge" [class]="'badge rs-' + d.state.toLowerCase()">{{ refundStateLabel(d.state) }}</span><strong class="amount big">{{ money(d.amount) }}</strong></div>
        <dl class="info">
          <div><dt>Mã hoàn tiền</dt><dd class="mono">{{ d.id }}</dd></div>
          <div><dt>Mã đơn hàng</dt><dd class="mono">{{ d.orderId }}</dd></div>
          @if (d.paymentAttemptId) { <div><dt>Giao dịch thanh toán gốc</dt><dd class="mono">{{ d.paymentAttemptId }}</dd></div> }
          <div><dt>Lý do hoàn tiền</dt><dd>{{ d.reason }}</dd></div>
          @if (d.beneficiary; as b) { <div><dt>Tài khoản thụ hưởng</dt><dd><strong>{{ b.accountName }}</strong> · {{ b.accountNumberMasked }} · BIN {{ b.bankBin }}</dd></div> }
          @if (d.failureReason) { <div><dt>Lý do từ chối / thất bại</dt><dd>{{ d.failureReason }}</dd></div> }
          @if (d.bankReference) { <div><dt>Mã đối soát ngân hàng</dt><dd class="mono">{{ d.bankReference }}</dd></div> }
          <div><dt>Thời gian tạo</dt><dd>{{ fmt(d.createdAt) }}</dd></div>
        </dl>
        @if (d.qrImageUrl && d.state === 'APPROVED' && auth.isAdmin()) {
          <section class="qr">
            <img [src]="d.qrImageUrl" alt="Mã QR hoàn tiền cho tài khoản thụ hưởng" width="260" />
            <p>Nội dung chuyển khoản: <strong>{{ d.transferContent }}</strong></p>
          </section>
        }
      }
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="detailModalOpen.set(false)">Đóng</button>
        @if (detailedRefund(); as d) {
          @if (d.state === 'PENDING_APPROVAL') {
            @if (!d.beneficiary) { <button type="button" class="btn-outline" (click)="openBeneficiaryModal(d)">Nhập tài khoản nhận</button> }
            @if (auth.isAdmin()) {
              <button type="button" class="btn-outline danger" (click)="openFailModal(d)">Từ chối</button>
              <button type="button" class="btn-primary" (click)="approveRefund(d)">Phê duyệt</button>
            }
          } @else if (d.state === 'APPROVED' && auth.isAdmin()) {
            <button type="button" class="btn-outline danger" (click)="openFailModal(d)">Đánh dấu thất bại</button>
            <button type="button" class="btn-primary" (click)="openCompleteModal(d)">Xác nhận đã chuyển</button>
          }
        }
      </div>
    </fc-admin-drawer>

    <!-- Drawer duyệt sự kiện thanh toán (PATCH /admin/payment-events/:eventId/review) -->
    <fc-admin-drawer [isOpen]="reviewEventModalOpen()" eyebrow="Sự kiện thanh toán" [title]="selectedEvent() ? (selectedEvent()!.eventId || selectedEvent()!.id.slice(0, 8)) : 'Sự kiện thanh toán'" width="520px" (close)="reviewEventModalOpen.set(false)">
      @if (selectedEvent(); as ev) {
        <form class="dform" (ngSubmit)="submitReviewEvent()" autocomplete="off">
          @if (ev.proposal; as proposal) {
            <section class="proposal" aria-label="Đề xuất chờ kiểm tra">
              <p><strong>Đề xuất:</strong> {{ paymentReviewDecisionLabel(proposal.decision) }} · {{ money(proposal.amount ?? 0) }}</p>
              <p>{{ ev.proposalDetail?.note }}</p>
              @if (ev.proposalDetail?.bankReference) { <p>Mã chứng từ: {{ ev.proposalDetail.bankReference }}</p> }
              @if (ev.proposalDetail?.evidenceUrl) { <a [href]="ev.proposalDetail.evidenceUrl" target="_blank" rel="noopener noreferrer">Xem chứng từ đề xuất</a> }
              @else if (ev.resolution === 'PENDING_APPROVAL') { <p role="alert">Chưa tải được chứng từ để kiểm tra. Vui lòng mở lại đề xuất khi kết nối lưu trữ sẵn sàng.</p> }
              @if (proposal.proposedBy === auth.currentUser()?.id) { <p role="status">Cần một Admin khác kiểm tra và xác nhận đề xuất này.</p> }
            </section>
          }
          <dl class="info">
            <div><dt>Cổng thanh toán</dt><dd>{{ ev.provider }} · {{ isIncoming(ev) ? 'Tiền vào' : 'Tiền ra' }}</dd></div>
            <div><dt>Số tiền</dt><dd class="strong">{{ money(ev.transferAmount) }}</dd></div>
            <div><dt>Nội dung</dt><dd>{{ ev.content || '—' }}</dd></div>
            <div><dt>Kết quả khớp</dt><dd>{{ paymentEventResolutionLabel(ev.resolution) }}</dd></div>
            <div><dt>Thời gian</dt><dd>{{ fmt(ev.transactionDate || ev.createdAt) }}</dd></div>
          </dl>

          @if (auth.isAdmin()) {
            <label>Quyết định đánh giá kiểm toán *
              <select [(ngModel)]="eventReviewDecision" name="decision" required>
                @if (ev.resolution === 'PENDING_APPROVAL') {
                  @if (ev.proposal?.proposedBy !== auth.currentUser()?.id) {
                    <option value="APPROVE">Xác nhận sau khi kiểm tra chứng từ</option>
                    <option value="REJECT_PROPOSAL">Từ chối đề xuất, tiếp tục đối soát</option>
                  }
                } @else {
                  <option value="ESCALATED">Tiếp tục đối soát</option>
                  @if (isIncoming(ev)) {
                    <option value="REFUNDED_EXTERNALLY">Đề xuất ghi nhận đã hoàn ngoài hệ thống</option>
                    <option value="CLOSED_NO_ACTION">Đề xuất đóng: tiền không vào tài khoản merchant</option>
                  } @else { <option value="OUTGOING_RECONCILED">Đề xuất ghi nhận đã đối chiếu khoản chi ngoài hệ thống</option> }
                }
              </select>
            </label>
            @if (eventReviewDecision === 'REFUNDED_EXTERNALLY' || eventReviewDecision === 'OUTGOING_RECONCILED') {
              <label>Số tiền theo ngân hàng<input type="number" [value]="ev.transferAmount" readonly /></label>
              <label>Mã chứng từ ngân hàng *<input type="text" name="bankReference" [(ngModel)]="eventReviewBankReference" minlength="3" maxlength="100" required /></label>
              <p class="hint">Chỉ ghi nhận giao dịch đã thực hiện và có chứng từ. Ứng dụng không chuyển tiền.</p>
            }
            <label>Ghi chú kiểm toán *
              <textarea [(ngModel)]="eventReviewNote" name="note" rows="3" placeholder="Nhập ghi chú giải thích quyết định kiểm toán (tối thiểu 10 ký tự)…" required></textarea>
            </label>
            <label>Chứng từ kiểm toán *
              @for (v of [evidenceInputVersion()]; track v) { <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploadingEvidence() || savingEventReview()" (change)="uploadEvidence($event)" /> }
              @if (uploadingEvidence()) { <span class="hint">Đang tải chứng từ…</span> }
              @if (evidenceObjectKey()) { <span class="hint evidence-done">Đã tải chứng từ{{ evidenceFileName() ? ': ' + evidenceFileName() : '' }}. <button type="button" class="evidence-clear" (click)="clearEvidence()">Xóa ảnh</button></span> }
            </label>
            @if (reviewMissing().length > 0) {
              <p class="hint review-missing" role="status">Cần bổ sung trước khi lưu: {{ reviewMissing().join('; ') }}.</p>
            }
          } @else {
            <p class="hint">Chỉ Admin được đánh giá sự kiện thanh toán.</p>
          }
        </form>
      }
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="reviewEventModalOpen.set(false)">{{ auth.isAdmin() ? 'Hủy' : 'Đóng' }}</button>
        @if (selectedEvent(); as ev) {
          @if (auth.isAdmin()) {
            <button type="button" class="btn-primary" (click)="submitReviewEvent()"
              [disabled]="savingEventReview() || uploadingEvidence() || reviewMissing().length > 0 || (eventReviewDecision === 'APPROVE' && !ev.proposalDetail?.evidenceUrl) || (ev.resolution === 'PENDING_APPROVAL' && ev.proposal?.proposedBy === auth.currentUser()?.id)">
              {{ savingEventReview() ? 'Đang gửi đánh giá…' : 'Lưu đánh giá sự kiện' }}
            </button>
          }
        }
      </div>
    </fc-admin-drawer>

    <!-- Từ chối / thất bại (PATCH /admin/refunds/:refundId/fail) -->
    <fc-modal [isOpen]="failModalOpen()" title="Đánh dấu hoàn tiền thất bại" maxWidth="480px" (close)="failModalOpen.set(false)">
      <form (ngSubmit)="submitFailRefund()" class="modal-form">
        @if (selectedRefund()?.state === 'APPROVED') {
          <label>Chứng từ giao dịch thất bại *
            @for (v of [evidenceInputVersion()]; track v) { <input type="file" accept="image/jpeg,image/png,image/webp" (change)="uploadEvidence($event)" [disabled]="uploadingEvidence()" /> }
          </label>
          @if (evidenceObjectKey()) { <span class="hint evidence-done">Đã tải chứng từ{{ evidenceFileName() ? ': ' + evidenceFileName() : '' }}. <button type="button" class="evidence-clear" (click)="clearEvidence()">Xóa ảnh</button></span> }
        }
        <p class="hint">Bạn đang đánh dấu thất bại cho khoản hoàn tiền của đơn <strong>{{ selectedRefund()?.orderId?.slice(0, 8) }}</strong>.</p>
        <label>Lý do từ chối / thất bại *
          <textarea [(ngModel)]="failReason" name="failReason" rows="3" placeholder="Thông tin tài khoản không hợp lệ, ngân hàng từ chối…" required></textarea>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="failModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || uploadingEvidence() || failReason.trim().length < 3 || (selectedRefund()?.state === 'APPROVED' && !evidenceObjectKey())">{{ saving() ? 'Đang cập nhật…' : 'Xác nhận thất bại' }}</button>
        </div>
      </form>
    </fc-modal>

    <!-- Đề xuất hoàn tiền -->
    <fc-modal [isOpen]="proposeModalOpen()" title="Đề xuất khoản hoàn tiền" (close)="proposeModalOpen.set(false)">
      <form (ngSubmit)="saveProposal()" class="modal-form">
        @if (proposeNotice()) { <p class="hint" role="status">{{ proposeNotice() }}</p> }
        <label>Giao dịch thanh toán thành công *
          <input [(ngModel)]="propPaymentAttemptId" name="paymentAttemptId" list="succeeded-payments" placeholder="Chọn giao dịch gần đây hoặc nhập mã giao dịch" required />
          <datalist id="succeeded-payments">
            @for (payment of succeededPayments(); track payment.id) {
              <option [value]="payment.id">{{ payment.orderId.slice(0, 8) }} · {{ money(payment.amount) }} · {{ payment.id.slice(0, 8) }}</option>
            }
          </datalist>
        </label>
        @if (succeededPayments().length === 0) {
          <p class="hint review-missing" role="status">Chưa có giao dịch thanh toán thành công nào để hoàn tiền. Chỉ đơn đã thanh toán thành công mới tạo được đề xuất hoàn tiền.</p>
        }
        <label>Số tiền hoàn (đ) *
          <input type="number" [(ngModel)]="propAmount" name="amount" required min="1000" />
        </label>
        <label>Lý do hoàn tiền *
          <textarea [(ngModel)]="propReason" name="reason" rows="3" placeholder="Khách trả hàng, lỗi đơn, hết hàng…" required></textarea>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="proposeModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || !propPaymentAttemptId || !propAmount || !propReason">{{ saving() ? 'Đang tạo…' : 'Tạo đề xuất' }}</button>
        </div>
      </form>
    </fc-modal>

    <!-- Tài khoản nhận -->
    <fc-modal [isOpen]="beneficiaryModalOpen()" title="Thông tin tài khoản nhận tiền hoàn" (close)="beneficiaryModalOpen.set(false)">
      <form (ngSubmit)="saveBeneficiary()" class="modal-form">
        <label>Mã ngân hàng (BIN) *
          <input type="text" [(ngModel)]="benBin" name="bin" placeholder="VD: 970436 (Vietcombank), 970422 (MB)" required />
        </label>
        <label>Số tài khoản *
          <input type="text" [(ngModel)]="benAccountNum" name="accountNum" placeholder="Số tài khoản ngân hàng" required />
        </label>
        <label>Tên chủ tài khoản (in hoa không dấu) *
          <input type="text" [(ngModel)]="benAccountName" name="accountName" placeholder="NGUYEN VAN A" required />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="beneficiaryModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || !benBin || !benAccountNum || !benAccountName">{{ saving() ? 'Đang lưu…' : 'Lưu tài khoản' }}</button>
        </div>
      </form>
    </fc-modal>

    <!-- Hoàn tất -->
    <fc-modal [isOpen]="completeModalOpen()" title="Xác nhận đã chuyển khoản hoàn tiền" (close)="completeModalOpen.set(false)">
      <form (ngSubmit)="saveComplete()" class="modal-form">
        <label>Mã tham chiếu ngân hàng *
          <input type="text" [(ngModel)]="compBankRef" name="bankRef" placeholder="Mã giao dịch ngân hàng chuyển khoản" required />
        </label>
        <label>Ảnh chứng từ chuyển khoản *
          @for (v of [evidenceInputVersion()]; track v) { <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploadingEvidence()" (change)="uploadEvidence($event)" /> }
          @if (uploadingEvidence()) { <span class="hint">Đang tải chứng từ…</span> }
          @if (evidenceObjectKey()) { <span class="hint evidence-done">Đã tải chứng từ{{ evidenceFileName() ? ': ' + evidenceFileName() : '' }}. <button type="button" class="evidence-clear" (click)="clearEvidence()">Xóa ảnh</button></span> }
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="completeModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || uploadingEvidence() || !evidenceObjectKey() || !compBankRef">{{ saving() ? 'Đang xác nhận…' : 'Xác nhận hoàn tất' }}</button>
        </div>
      </form>
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .ar { display: flex; flex-direction: column; gap: 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .muted { color: var(--ui-subtle); font-size: 12px; } .pad { padding: 16px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
    .title { margin: 0; font: 500 32px/40px var(--font-serif); }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .head-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 26px/32px var(--font-serif); overflow-wrap: anywhere; }
    .kpi-note { font-size: 11px; line-height: 16px; color: var(--ui-subtle); }
    .note, .hint { margin: 0; font-size: 12px; color: var(--ui-subtle); }
    .review-missing { color: #8f485d; }
    .evidence-clear { margin-left: 6px; padding: 0; border: 0; background: none; color: #b3261e; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .sub-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--admin-line); }
    .sub-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none; font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); cursor: pointer; }
    .sub-tab:hover { background: var(--ui-bg-soft); color: var(--ui-ink); }
    .sub-tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
    .cnt { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--ui-bg-soft); font: 600 11px/18px var(--font-sans); text-align: center; }
    .sub-tab.active .cnt { background: var(--ui-pink-soft); color: var(--ui-accent); }
    .steps-note { display: flex; flex-wrap: wrap; gap: 8px 20px; list-style: none; margin: 0; padding: 10px 14px; background: var(--ui-bg-soft); font-size: 12px; color: var(--ui-ink-soft); }
    .steps-note li { display: inline-flex; align-items: center; gap: 8px; }
    .steps-note li + li::before { content: '→'; margin-right: 12px; color: var(--ui-subtle); }
    .step-no { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: var(--ui-ink); color: #fff; font: 700 10px var(--font-sans); }
    .filters { display: flex; gap: 12px; }
    .f-sel { display: flex; flex-direction: column; gap: 4px; font: 600 11px/14px var(--font-sans); color: var(--ui-ink-soft); min-width: 200px; }
    .f-sel select, .dform input, .dform select, .dform textarea, .modal-form input, .modal-form textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 980px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .row { cursor: pointer; } .row:hover { background: var(--admin-canvas); }
    .c-num { text-align: right; } .c-act { text-align: right; } .nowrap { white-space: nowrap; }
    .strong { font-weight: 600; color: var(--ui-ink); }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .sub-line { display: block; margin-top: 2px; font-size: 12px; color: var(--ui-subtle); }
    .reason { max-width: 260px; overflow-wrap: anywhere; color: var(--ui-ink-soft); }
    .amount { color: var(--ui-price); } .big { font-size: 20px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); }
    .rs-pending_approval { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .rs-approved { background: var(--ui-info-bg); color: var(--ui-info); }
    .rs-processing { background: var(--ui-pink-soft); color: #653a42; }
    .rs-succeeded { background: var(--ui-success-bg); color: var(--ui-success); }
    .rs-failed, .rs-requires_review { background: var(--ui-danger-bg); color: var(--ui-danger); }
    .link-btn { background: none; border: 0; padding: 4px 6px; color: var(--ui-accent); font: 700 12px/16px var(--font-sans); cursor: pointer; text-decoration: underline; text-align: left; }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-outline.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
    .progress { list-style: none; margin: 0 0 16px; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; font-size: 11px; text-align: center; }
    .progress li { padding: 8px 4px; background: var(--ui-bg-soft); color: var(--ui-subtle); font-weight: 600; }
    .progress li.done { background: var(--ui-ink); color: #fff; }
    .progress li.current { background: var(--ui-pink-soft); color: var(--ui-accent); outline: 1px solid var(--ui-pink); }
    .d-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .info { margin: 0 0 16px; display: flex; flex-direction: column; gap: 12px; }
    .info div { display: flex; flex-direction: column; gap: 2px; }
    .info dt { font: 700 10px/12px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-subtle); }
    .info dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
    .qr { text-align: center; padding: 16px; background: var(--ui-bg-soft); } .qr img { max-width: 100%; height: auto; } .qr p { font-size: 12px; margin: 8px 0 0; }
    .dform { display: flex; flex-direction: column; gap: 16px; }
    .dform label, .modal-form label { display: flex; flex-direction: column; gap: 6px; font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); }
    .proposal { padding: 12px; background: var(--ui-warning-bg); font-size: 13px; } .proposal p { margin: 0 0 4px; }
    .modal-form { display: flex; flex-direction: column; gap: 14px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
    @media (max-width: 560px) { .progress { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class AdminRefundsPage implements OnInit {
  readonly eventPagination = new PaginationState(20);
  eventPaginationChanged(page: number): void { this.eventPagination.page.set(page); this.loadPaymentEvents(); }

  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadRefunds(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  protected readonly refundStateLabel = refundStateLabel;
  protected readonly paymentEventResolutionLabel = paymentEventResolutionLabel;
  protected readonly paymentReviewDecisionLabel = paymentReviewDecisionLabel;
  readonly steps = REFUND_STEPS;
  readonly countStates = COUNT_STATES;

  readonly activeTab = signal<'refunds' | 'events'>('refunds');

  readonly refunds = signal<Refund[]>([]);
  readonly succeededPayments = signal<PaymentAttempt[]>([]);
  readonly loading = signal<boolean>(true);
  readonly counts = signal<Record<string, number | null>>({});
  readonly openEvents = signal<number | null>(null);
  readonly pendingAmount = computed(() => this.refunds()
    .filter(r => r.state === 'PENDING_APPROVAL' || r.state === 'APPROVED')
    .reduce((sum, r) => sum + r.amount, 0));

  // Chi tiết hoàn tiền (GET /admin/refunds/:refundId)
  readonly detailModalOpen = signal<boolean>(false);
  readonly detailedRefund = signal<Refund | null>(null);

  /** Mã đơn hàng từ API; thiếu thì dùng mã rút gọn. */
  orderLabel(rf: Refund): string {
    const code = rf.orderCode;
    return code || rf.orderId.slice(0, 8).toUpperCase();
  }
  readonly loadingDetail = signal<boolean>(false);

  // Từ chối / thất bại (PATCH /admin/refunds/:refundId/fail)
  readonly failModalOpen = signal<boolean>(false);
  failReason = '';

  // Sự kiện thanh toán (GET /admin/payment-events & PATCH /admin/payment-events/:id/review)
  readonly paymentEvents = signal<PaymentReviewEvent[]>([]);
  readonly loadingEvents = signal<boolean>(false);
  readonly reviewEventModalOpen = signal<boolean>(false);
  readonly selectedEvent = signal<PaymentReviewEvent | null>(null);
  eventReviewDecision: PaymentReviewAction = 'ESCALATED';
  eventReviewBankReference = '';
  eventView = 'OPEN';
  eventReviewNote = '';
  readonly savingEventReview = signal<boolean>(false);

  readonly proposeModalOpen = signal<boolean>(false);
  readonly proposeNotice = signal('');
  readonly beneficiaryModalOpen = signal<boolean>(false);
  readonly completeModalOpen = signal<boolean>(false);
  readonly selectedRefund = signal<Refund | null>(null);
  readonly saving = signal<boolean>(false);

  // Form đề xuất
  propPaymentAttemptId = '';
  propAmount = 100000;
  propReason = '';

  // Form tài khoản nhận
  benBin = '';
  benAccountNum = '';
  benAccountName = '';

  // Form hoàn tất
  compBankRef = '';
  readonly evidenceObjectKey = signal('');
  readonly evidenceFileName = signal('');
  /** Tăng để tạo lại ô chọn file, xóa tên file cũ còn hiển thị. */
  readonly evidenceInputVersion = signal(0);
  readonly uploadingEvidence = signal(false);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const wantEvents = params.get('tab') === 'events';
    const orderId = params.get('orderId');

    const canRefunds = this.auth.can('refund.propose');
    const canEvents = this.auth.canGlobal('payment.read');
    if (canRefunds) this.loadRefunds();
    if (canRefunds) this.loadCounts();
    if (canEvents) this.api.adminListPaymentEvents(1, 1, 'OPEN').subscribe({ next: res => this.openEvents.set(res.total), error: () => this.openEvents.set(null) });
    // Tải sẵn danh sách sự kiện để số đếm ở tab "Sự kiện thanh toán" đúng ngay khi mở trang.
    if (canEvents) this.loadPaymentEvents();
    if ((wantEvents && canEvents) || (!canRefunds && canEvents)) this.activeTab.set('events');

    if (this.auth.can('payment.read')) {
      this.api.listPayments(1, 50).subscribe({
        next: (res) => {
          this.succeededPayments.set(res.items.filter((p) => p.state === 'SUCCEEDED'));
          if (orderId && canRefunds) this.openProposeForOrder(orderId);
        },
        error: () => {
          this.toast.error('Không thể tải danh sách thanh toán.');
          if (orderId && canRefunds) this.openProposeForOrder(orderId);
        },
      });
    }
  }

  // --- Dữ liệu ---
  loadRefunds(): void {
    this.loading.set(true);
    this.pagination.load(() => this.api.adminListRefunds(undefined, this.pagination.page(), this.pagination.limit), {
      next: (res) => {
        this.refunds.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Số yêu cầu theo từng trạng thái lấy từ `total` của API. */
  private loadCounts(): void {
    for (const state of COUNT_STATES) {
      this.api.adminListRefunds(state, 1, 1).subscribe({
        next: res => this.counts.update(c => ({ ...c, [state]: res.total })),
        error: () => this.counts.update(c => ({ ...c, [state]: null })),
      });
    }
  }

  private afterRefundChange(refundId: string): void {
    this.loadRefunds();
    this.loadCounts();
    if (this.detailModalOpen()) {
      this.api.adminGetRefund(refundId).subscribe({ next: rf => this.detailedRefund.set(rf), error: () => undefined });
    }
  }

  // --- Hiển thị ---
  money(value: number): string { return `${Math.round(value).toLocaleString('vi-VN')}đ`; }

  fmt(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  isIncoming(ev: PaymentReviewEvent): boolean { return ev.transferType.toLowerCase() === 'in'; }

  /** Vị trí hiện tại trên thanh 4 bước: Đề xuất → Tài khoản nhận → Duyệt → Hoàn tất. */
  stepIndex(rf: Refund): number {
    if (rf.state === 'SUCCEEDED') return 4;
    if (rf.state === 'APPROVED' || rf.state === 'PROCESSING') return 3;
    if (rf.state === 'PENDING_APPROVAL') return rf.beneficiary ? 2 : 1;
    return 0;
  }

  // --- GET /admin/refunds/:refundId ---
  viewRefundDetail(refundId: string): void {
    this.loadingDetail.set(true);
    this.detailedRefund.set(null);
    this.detailModalOpen.set(true);
    this.api.adminGetRefund(refundId).subscribe({
      next: (rf) => {
        this.detailedRefund.set(rf);
        this.loadingDetail.set(false);
      },
      error: (err) => {
        this.loadingDetail.set(false);
        this.toast.error(err.error?.message || 'Không thể tải chi tiết hoàn tiền.');
      },
    });
  }

  // --- PATCH /admin/refunds/:refundId/fail ---
  openFailModal(rf: Refund): void {
    this.selectedRefund.set(rf);
    this.failReason = '';
    this.clearEvidence();
    this.failModalOpen.set(true);
  }

  submitFailRefund(): void {
    const rf = this.selectedRefund();
    if (!rf || this.failReason.trim().length < 3 || this.uploadingEvidence() || this.saving()) return;
    if (rf.state === 'APPROVED' && !this.evidenceObjectKey()) return;

    this.saving.set(true);
    const key = generateUUID();
    const request = rf.state === 'PENDING_APPROVAL'
      ? this.api.adminRejectRefund(rf.id, { reason: this.failReason.trim() }, key)
      : this.api.adminFailRefund(rf.id, { reason: this.failReason.trim(), evidenceObjectKey: this.evidenceObjectKey() }, key);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.failModalOpen.set(false);
        this.toast.success('Đã cập nhật trạng thái khoản hoàn tiền: thất bại.');
        this.afterRefundChange(rf.id);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể đánh dấu thất bại.');
      },
    });
  }

  // --- Sự kiện thanh toán ---
  switchToEventsTab(): void {
    this.activeTab.set('events');
    if (this.paymentEvents().length === 0) {
      this.loadPaymentEvents();
    }
  }

  loadPaymentEvents(): void {
    this.loadingEvents.set(true);
    this.eventPagination.load(() => this.api.adminListPaymentEvents(this.eventPagination.page(), this.eventPagination.limit, this.eventView), {
      next: (res) => {
        this.paymentEvents.set(res.items);
        this.loadingEvents.set(false);
      },
      error: (err) => {
        this.loadingEvents.set(false);
        this.toast.error(err.error?.message || 'Không thể tải sự kiện thanh toán.');
      },
    });
  }

  openReviewEventModal(ev: PaymentReviewEvent): void {
    this.selectedEvent.set(ev);
    this.eventReviewDecision = ev.resolution === 'PENDING_APPROVAL' ? 'APPROVE' : 'ESCALATED';
    this.eventReviewBankReference = '';
    this.eventReviewNote = '';
    this.clearEvidence();
    this.api.adminGetPaymentEvent(ev.id).subscribe({
      next: detail => { if (this.selectedEvent()?.id !== ev.id) return; this.selectedEvent.set(detail); this.reviewEventModalOpen.set(true); },
      error: () => this.toast.error('Không thể tải chứng từ và đề xuất đối soát.'),
    });
  }

  /** Các trường còn thiếu của form đánh giá sự kiện (nút Lưu khóa khi danh sách khác rỗng). */
  reviewMissing(): string[] {
    const missing: string[] = [];
    if (['REFUNDED_EXTERNALLY', 'OUTGOING_RECONCILED'].includes(this.eventReviewDecision) && this.eventReviewBankReference.trim().length < 3) {
      missing.push('mã chứng từ ngân hàng (tối thiểu 3 ký tự)');
    }
    const noteLength = this.eventReviewNote.trim().length;
    if (noteLength < 10) missing.push(`ghi chú kiểm toán tối thiểu 10 ký tự (hiện có ${noteLength})`);
    if (!this.evidenceObjectKey() && !this.uploadingEvidence()) missing.push('ảnh chứng từ kiểm toán');
    return missing;
  }

  submitReviewEvent(): void {
    const ev = this.selectedEvent();
    if (!ev || this.eventReviewNote.trim().length < 10 || this.uploadingEvidence() || !this.evidenceObjectKey() || this.savingEventReview()) return;
    if (ev.resolution === 'PENDING_APPROVAL' && ev.proposal?.proposedBy === this.auth.currentUser()?.id) return;
    if (['REFUNDED_EXTERNALLY', 'OUTGOING_RECONCILED'].includes(this.eventReviewDecision) && this.eventReviewBankReference.trim().length < 3) return;

    this.savingEventReview.set(true);
    this.api.adminReviewPaymentEvent(ev.id, {
      decision: this.eventReviewDecision,
      ...(['REFUNDED_EXTERNALLY', 'OUTGOING_RECONCILED'].includes(this.eventReviewDecision)
        ? { amount: ev.transferAmount, bankReference: this.eventReviewBankReference.trim() } : {}),
      note: this.eventReviewNote.trim(),
      evidenceObjectKey: this.evidenceObjectKey(),
    }).subscribe({
      next: (updated) => {
        this.savingEventReview.set(false);
        this.reviewEventModalOpen.set(false);
        this.toast.success(updated.resolution === 'PENDING_APPROVAL' ? 'Đề xuất đã gửi, cần Admin khác xác nhận.' : 'Đã lưu kết quả đối soát.');
        this.loadPaymentEvents();
        this.api.adminListPaymentEvents(1, 1, 'OPEN').subscribe({ next: res => this.openEvents.set(res.total), error: () => undefined });
        this.paymentEvents.update((list) =>
          list.map((item) => (item.id === ev.id ? { ...item, ...updated, reviewDecision: this.eventReviewDecision } : item))
        );
      },
      error: (err) => {
        this.savingEventReview.set(false);
        this.toast.error(reviewErrorText(err.error?.message) || 'Không thể đánh giá sự kiện.');
      },
    });
  }

  // --- Đề xuất hoàn tiền ---
  openProposeModal(): void {
    this.propPaymentAttemptId = '';
    this.propAmount = 100000;
    this.propReason = '';
    this.proposeNotice.set('');
    this.proposeModalOpen.set(true);
  }

  /** Từ liên kết ?orderId=…: mở sẵn hộp đề xuất và điền giao dịch thanh toán thành công của đơn đó. */
  private openProposeForOrder(orderId: string): void {
    this.openProposeModal();
    const known = this.succeededPayments().find(p => p.orderId === orderId);
    const apply = (payment: PaymentAttempt) => {
      this.propPaymentAttemptId = payment.id;
      this.propAmount = payment.amount;
      this.proposeNotice.set(`Đề xuất hoàn tiền cho đơn ${orderId.slice(0, 8)}.`);
    };
    if (known) { apply(known); return; }
    this.api.latestPaymentForOrder(orderId).subscribe({
      next: payment => {
        if (payment.state === 'SUCCEEDED') apply(payment);
        else this.proposeNotice.set(`Đơn ${orderId.slice(0, 8)} chưa có giao dịch thanh toán thành công để hoàn tiền.`);
      },
      error: () => this.proposeNotice.set(`Không tìm thấy giao dịch thanh toán của đơn ${orderId.slice(0, 8)}. Hãy chọn hoặc nhập mã giao dịch.`),
    });
  }

  saveProposal(): void {
    if (!this.propPaymentAttemptId || !this.propAmount || !this.propReason) return;

    this.saving.set(true);
    const key = generateUUID();

    this.api.adminProposeRefund({
      paymentAttemptId: this.propPaymentAttemptId,
      amount: this.propAmount,
      reason: this.propReason,
    }, key).subscribe({
      next: () => {
        this.saving.set(false);
        this.proposeModalOpen.set(false);
        this.toast.success('Đã tạo đề xuất hoàn tiền.');
        this.loadRefunds();
        this.loadCounts();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo đề xuất hoàn tiền.');
      },
    });
  }

  openBeneficiaryModal(rf: Refund): void {
    this.selectedRefund.set(rf);
    this.benBin = rf.beneficiary?.bankBin || '970436';
    this.benAccountNum = '';
    this.benAccountName = rf.beneficiary?.accountName || '';
    this.beneficiaryModalOpen.set(true);
  }

  saveBeneficiary(): void {
    const rf = this.selectedRefund();
    if (!rf || !this.benBin || !this.benAccountNum || !this.benAccountName) return;

    this.saving.set(true);
    const key = generateUUID();

    this.api.adminSetRefundBeneficiary(rf.id, {
      bankBin: this.benBin,
      accountNumber: this.benAccountNum,
      accountName: this.benAccountName,
    }, key).subscribe({
      next: () => {
        this.saving.set(false);
        this.beneficiaryModalOpen.set(false);
        this.toast.success('Đã cập nhật tài khoản nhận hoàn tiền.');
        this.afterRefundChange(rf.id);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật tài khoản.');
      },
    });
  }

  approveRefund(rf: Refund): void {
    if (!confirm('Bạn có chắc muốn phê duyệt khoản hoàn tiền này?')) return;

    const key = generateUUID();
    this.api.adminApproveRefund(rf.id, key).subscribe({
      next: updated => {
        this.detailedRefund.set(updated);
        this.detailModalOpen.set(true);
        this.toast.success('Đã phê duyệt hoàn tiền.');
        this.loadRefunds();
        this.loadCounts();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể phê duyệt hoàn tiền.');
      },
    });
  }

  openCompleteModal(rf: Refund): void {
    this.selectedRefund.set(rf);
    this.compBankRef = '';
    this.clearEvidence();
    this.completeModalOpen.set(true);
  }

  saveComplete(): void {
    const rf = this.selectedRefund();
    if (!rf || !this.compBankRef || !this.evidenceObjectKey()) return;

    this.saving.set(true);
    const key = generateUUID();

    this.api.adminCompleteRefund(rf.id, {
      bankReference: this.compBankRef,
      evidenceObjectKey: this.evidenceObjectKey(),
    }, key).subscribe({
      next: () => {
        this.saving.set(false);
        this.completeModalOpen.set(false);
        this.toast.success('Đã xác nhận hoàn tất hoàn tiền.');
        this.afterRefundChange(rf.id);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể xác nhận hoàn tất.');
      },
    });
  }

  /** Bỏ chứng từ đang chọn: chỉ lưu vào hồ sơ khi bấm Lưu/Xác nhận, nên bỏ ở đây là không gửi kèm. */
  clearEvidence(): void {
    this.evidenceObjectKey.set('');
    this.evidenceFileName.set('');
    this.evidenceInputVersion.update((v) => v + 1);
  }

  uploadEvidence(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.evidenceObjectKey.set('');
    this.evidenceFileName.set('');
    this.uploadingEvidence.set(true);
    this.api.uploadImage(file, 'refund_evidence').subscribe({
      next: (media) => {
        this.evidenceObjectKey.set(media.objectKey);
        this.evidenceFileName.set(file.name);
        this.uploadingEvidence.set(false);
      },
      error: (err) => {
        this.uploadingEvidence.set(false);
        this.evidenceInputVersion.update((v) => v + 1);
        this.toast.error(err.error?.message || err.message || 'Không thể tải chứng từ.');
      },
    });
  }
}
