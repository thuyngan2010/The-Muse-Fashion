import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Refund, PaymentAttempt, PaymentReviewAction, PaymentReviewEvent } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AuthService } from '../../services/auth.service';

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

@Component({
  standalone: true,
  imports: [PaginationComponent, CurrencyPipe, DatePipe, FormsModule, ModalComponent],
  template: `
    <div class="admin-refunds-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Hoàn tiền & Sự kiện Thanh toán</h1>
          <p class="page-desc">Xử lý đề xuất hoàn tiền, duyệt hoàn trả, đánh dấu thất bại và đối soát sự kiện webhook thanh toán.</p>
        </div>
        <div class="header-actions">
          @if (activeTab() === 'refunds') {
            <button type="button" class="btn-primary" [disabled]="!auth.can('payment.read')" (click)="openProposeModal()">+ Đề xuất hoàn tiền mới</button>
          } @else {
            <button type="button" class="btn-primary" (click)="loadPaymentEvents()">↻ Làm mới sự kiện</button>
          }
        </div>
      </header>

      <!-- Navigation Tabs -->
      <div class="tab-nav">
        @if (auth.can('refund.propose')) {
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'refunds'"
          (click)="activeTab.set('refunds')"
        >
          💰 Yêu cầu hoàn tiền ({{ refunds().length }})
        </button>
        }
        @if (auth.canGlobal('payment.read')) {
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'events'"
          (click)="switchToEventsTab()"
        >
          ⚡ Đối soát sự kiện thanh toán ({{ paymentEvents().length }})
        </button>
        }
      </div>

      <!-- TAB 1: REFUNDS -->
      @if (activeTab() === 'refunds') {
        @if (loading()) {
          <div class="loading-box">
            <div class="spinner"></div>
            <p>Đang tải danh sách hoàn tiền...</p>
          </div>
        } @else if (refunds().length === 0) {
          <div class="empty-state">
            <p>Chưa có yêu cầu hoàn tiền nào trong hệ thống.</p>
          </div>
        } @else {
          <div class="table-card">
            <div class="table-header">
              <span>Mã hoàn tiền</span>
              <span>Mã đơn hàng</span>
              <span>Số tiền hoàn</span>
              <span>Lý do</span>
              <span>Tài khoản nhận</span>
              <span>Trạng thái</span>
              <span>Thao tác</span>
            </div>

            @for (rf of refunds(); track rf.id) {
              <div class="table-row">
                <span class="id-cell" (click)="viewRefundDetail(rf.id)">{{ rf.id.slice(0, 8) }}</span>
                <span class="order-cell">{{ rf.orderId.slice(0, 8) }}</span>
                <strong class="amount-cell">{{ rf.amount | currency:'VND':'symbol':'1.0-0' }}</strong>
                <span class="reason-cell">{{ rf.reason }}</span>
                <div class="beneficiary-cell">
                  @if (rf.beneficiary) {
                    <strong>{{ rf.beneficiary.accountName }}</strong>
                    <span>{{ rf.beneficiary.accountNumberMasked }} ({{ rf.beneficiary.bankBin }})</span>
                  } @else if (rf.state === 'PENDING_APPROVAL') {
                    <button type="button" class="btn-link" (click)="openBeneficiaryModal(rf)">+ Nhập STK nhận</button>
                  }
                </div>
                <div>
                  <span class="state-badge" [class]="'state-' + rf.state.toLowerCase()">{{ rf.state }}</span>
                </div>
                <div class="actions-cell">
                  <button type="button" class="btn-action btn-detail" (click)="viewRefundDetail(rf.id)">Chi tiết</button>
                  @if (rf.state === 'PENDING_APPROVAL' && auth.isAdmin()) {
                    <button type="button" class="btn-action approve" (click)="approveRefund(rf)">Phê duyệt</button>
                    <button type="button" class="btn-action fail" (click)="openFailModal(rf)">Từ chối</button>
                  } @else if (rf.state === 'APPROVED' && auth.isAdmin()) {
                    <button type="button" class="btn-action complete" (click)="openCompleteModal(rf)">Xác nhận chuyển</button>
                    <button type="button" class="btn-action fail" (click)="openFailModal(rf)">Thất bại</button>
                  }
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- TAB 2: PAYMENT EVENTS (GET /admin/payment-events & PATCH /admin/payment-events/:id/review) -->
      @if (activeTab() === 'events') {
        <label>Danh sách đối soát<select [(ngModel)]="eventView" (ngModelChange)="eventPagination.reset(); loadPaymentEvents()"><option value="OPEN">Cần xử lý</option><option value="RESOLVED">Đã xử lý</option><option value="ALL">Tất cả</option></select></label>
        @if (loadingEvents()) {
          <div class="loading-box">
            <div class="spinner"></div>
            <p>Đang tải danh sách sự kiện thanh toán...</p>
          </div>
        } @else if (paymentEvents().length === 0) {
          <div class="empty-state">
            <p>Không có sự kiện thanh toán nào cần đối soát.</p>
          </div>
        } @else {
          <div class="table-card">
            <div class="table-header event-grid">
              <span>Cổng / Mã Event</span>
              <span>Loại / Số tiền</span>
              <span>Thời gian</span>
              <span>Nội dung giao dịch</span>
              <span>Kết quả khớp</span>
              <span>Đánh giá kiểm toán</span>
              <span>Thao tác</span>
            </div>

            @for (ev of paymentEvents(); track ev.id) {
              <div class="table-row event-grid">
                <div class="event-id-cell">
                  <strong class="provider-tag">{{ ev.provider }}</strong>
                  <code class="event-code">{{ ev.eventId || ev.id.slice(0, 8) }}</code>
                </div>
                <div class="amount-cell-box">
                  <span class="type-badge" [class.type-in]="ev.transferType === 'IN'">{{ ev.transferType }}</span>
                  <strong>{{ ev.transferAmount | currency:'VND':'symbol':'1.0-0' }}</strong>
                </div>
                <span class="time-cell">{{ ev.transactionDate || '—' }}</span>
                <span class="content-cell">{{ ev.content || '—' }}</span>
                <div>
                  <span class="resolution-badge" [class.res-matched]="ev.resolution === 'MATCHED'">
                    {{ ev.resolution }}
                  </span>
                </div>
                <div>
                  @if (ev.reviewDecision) {
                    <span class="review-badge" [class.dec-escalated]="ev.reviewDecision === 'ESCALATED'">
                      {{ ev.reviewDecision }}
                    </span>
                  } @else {
                    <span class="review-badge pending">CHƯA DUYỆT</span>
                  }
                </div>
                <div class="actions-cell">
                  @if (auth.isAdmin()) { <button type="button" class="btn-action btn-review" (click)="openReviewEventModal(ev)">Đánh giá</button> }
                </div>
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- Refund Detail Modal (GET /admin/refunds/:refundId) -->
    <fc-modal
      [isOpen]="detailModalOpen()"
      title="Chi tiết khoản hoàn tiền"
      maxWidth="600px"
      (close)="detailModalOpen.set(false)"
    >
      @if (loadingDetail()) {
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Đang tải chi tiết hoàn tiền...</p>
        </div>
      } @else if (detailedRefund(); as d) {
        <div class="detail-modal-body">
          <div class="info-grid">
            <div class="info-row">
              <span class="lbl">Mã hoàn tiền (ID):</span>
              <code>{{ d.id }}</code>
            </div>
            <div class="info-row">
              <span class="lbl">Mã đơn hàng liên quan:</span>
              <code>{{ d.orderId }}</code>
            </div>
            <div class="info-row">
              <span class="lbl">Mã giao dịch gốc (Attempt):</span>
              <code>{{ d.paymentAttemptId }}</code>
            </div>
            <div class="info-row">
              <span class="lbl">Số tiền hoàn trả:</span>
              <strong class="highlight-amt">{{ d.amount | currency:'VND':'symbol':'1.0-0' }}</strong>
            </div>
            <div class="info-row">
              <span class="lbl">Trạng thái hiện tại:</span>
              <span class="state-badge" [class]="'state-' + d.state.toLowerCase()">{{ d.state }}</span>
            </div>
            <div class="info-row">
              <span class="lbl">Lý do hoàn tiền:</span>
              <span>{{ d.reason }}</span>
            </div>
            @if (d.beneficiary; as b) {
              <div class="info-row">
                <span class="lbl">Tài khoản thụ hưởng:</span>
                <div>
                  <strong>{{ b.accountName }}</strong> ({{ b.accountNumberMasked }}) - BIN: {{ b.bankBin }}
                </div>
              </div>
            }
            @if (d.qrImageUrl && d.state === 'APPROVED' && auth.isAdmin()) {
              <div class="info-row"><span class="lbl">Chuyển khoản hoàn tiền:</span>
                <img [src]="d.qrImageUrl" alt="Mã QR hoàn tiền cho tài khoản thụ hưởng" width="280" />
              </div>
              <p>Nội dung chuyển khoản: <strong>{{ d.transferContent }}</strong></p>
            }
            @if (d.failureReason) { <p>Lý do từ chối / thất bại: {{ d.failureReason }}</p> }
            @if (d.bankReference) {
              <div class="info-row">
                <span class="lbl">Mã đối soát ngân hàng:</span>
                <code>{{ d.bankReference }}</code>
              </div>
            }
            <div class="info-row">
              <span class="lbl">Thời gian tạo:</span>
              <span>{{ d.createdAt | date:'HH:mm:ss dd/MM/yyyy' }}</span>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="detailModalOpen.set(false)">Đóng</button>
          </div>
        </div>
      }
    </fc-modal>

    <!-- Fail Refund Modal (PATCH /admin/refunds/:refundId/fail) -->
    <fc-modal
      [isOpen]="failModalOpen()"
      title="Đánh dấu hoàn tiền thất bại"
      maxWidth="480px"
      (close)="failModalOpen.set(false)"
    >
      <form (ngSubmit)="submitFailRefund()" class="modal-form">
        @if (selectedRefund()?.state === 'APPROVED') {
          <label>Chứng từ giao dịch thất bại *
            <input type="file" accept="image/jpeg,image/png,image/webp" (change)="uploadEvidence($event)" [disabled]="uploadingEvidence()" />
          </label>
          @if (evidenceObjectKey()) { <span>Đã tải chứng từ.</span> }
        }
        <p class="modal-hint">
          Bạn đang đánh dấu thất bại cho khoản hoàn tiền của đơn <strong>{{ selectedRefund()?.orderId?.slice(0, 8) }}</strong>.
        </p>

        <label>
          Lý do từ chối / thất bại *
          <textarea
            [(ngModel)]="failReason"
            name="failReason"
            rows="3"
            placeholder="Thông tin tài khoản không hợp lệ, ngân hàng từ chối, v.v..."
            required
          ></textarea>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="failModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary text-danger-btn" [disabled]="saving() || uploadingEvidence() || failReason.trim().length < 3 || (selectedRefund()?.state === 'APPROVED' && !evidenceObjectKey())">
            {{ saving() ? 'Đang cập nhật...' : 'Xác nhận thất bại' }}
          </button>
        </div>
      </form>
    </fc-modal>

    <!-- Review Payment Event Modal (PATCH /admin/payment-events/:eventId/review) -->
    <fc-modal
      [isOpen]="reviewEventModalOpen()"
      title="Đánh giá sự kiện thanh toán"
      maxWidth="520px"
      (close)="reviewEventModalOpen.set(false)"
    >
      @if (selectedEvent(); as ev) {
        <form (ngSubmit)="submitReviewEvent()" class="modal-form">
          @if (ev.proposal; as proposal) {
            <section aria-label="Đề xuất chờ kiểm tra">
              <p>Đề xuất: {{ proposal.decision }} · {{ proposal.amount | currency:'VND':'symbol':'1.0-0' }}</p>
              <p>{{ ev.proposalDetail?.note }}</p>
              @if (ev.proposalDetail?.bankReference) { <p>Mã chứng từ: {{ ev.proposalDetail.bankReference }}</p> }
              @if (ev.proposalDetail?.evidenceUrl) { <a [href]="ev.proposalDetail.evidenceUrl" target="_blank" rel="noopener noreferrer">Xem chứng từ đề xuất</a> }
              @else if (ev.resolution === 'PENDING_APPROVAL') { <p role="alert">Chưa tải được chứng từ để kiểm tra. Vui lòng mở lại đề xuất khi kết nối lưu trữ sẵn sàng.</p> }
              @if (proposal.proposedBy === auth.currentUser()?.id) { <p role="status">Cần một Admin khác kiểm tra và xác nhận đề xuất này.</p> }
            </section>
          }
          <div class="ev-summary-box">
            <p><strong>Cổng thanh toán:</strong> {{ ev.provider }} | <strong>Loại:</strong> {{ ev.transferType }}</p>
            <p><strong>Số tiền:</strong> {{ ev.transferAmount | currency:'VND':'symbol':'1.0-0' }}</p>
            <p><strong>Nội dung:</strong> {{ ev.content || '—' }}</p>
            <p><strong>Trạng thái khớp:</strong> {{ ev.resolution }}</p>
          </div>

          <label>
            Quyết định đánh giá kiểm toán *
            <select [(ngModel)]="eventReviewDecision" name="decision" required>
              @if (ev.resolution === 'PENDING_APPROVAL') {
                @if (ev.proposal?.proposedBy !== auth.currentUser()?.id) {
                  <option value="APPROVE">Xác nhận sau khi kiểm tra chứng từ</option>
                  <option value="REJECT_PROPOSAL">Từ chối đề xuất, tiếp tục đối soát</option>
                }
              } @else {
                <option value="ESCALATED">Tiếp tục đối soát</option>
                @if (ev.transferType === 'in') {
                  <option value="REFUNDED_EXTERNALLY">Đề xuất ghi nhận đã hoàn ngoài hệ thống</option>
                  <option value="CLOSED_NO_ACTION">Đề xuất đóng: tiền không vào tài khoản merchant</option>
                } @else { <option value="OUTGOING_RECONCILED">Đề xuất ghi nhận đã đối chiếu khoản chi ngoài hệ thống</option> }
              }
            </select>
          </label>

          @if (eventReviewDecision === 'REFUNDED_EXTERNALLY' || eventReviewDecision === 'OUTGOING_RECONCILED') {
            <label>Số tiền theo ngân hàng<input type="number" [value]="ev.transferAmount" readonly /></label>
            <label>Mã chứng từ ngân hàng *<input type="text" name="bankReference" [(ngModel)]="eventReviewBankReference" minlength="3" maxlength="100" required /></label>
            <p>Chỉ ghi nhận giao dịch đã thực hiện và có chứng từ. Ứng dụng không chuyển tiền.</p>
          }
          <label>
            Ghi chú kiểm toán *
            <textarea
              [(ngModel)]="eventReviewNote"
              name="note"
              rows="3"
              placeholder="Nhập ghi chú giải thích quyết định kiểm toán..."
              required
            ></textarea>
          </label>

          <label>
            Chứng từ kiểm toán *
            <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploadingEvidence() || savingEventReview()" (change)="uploadEvidence($event)" />
            @if (uploadingEvidence()) { <span>Đang tải chứng từ...</span> }
            @if (evidenceObjectKey()) { <span>Đã tải chứng từ.</span> }
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-outline" (click)="reviewEventModalOpen.set(false)">Hủy</button>
            <button type="submit" class="btn-primary" [disabled]="savingEventReview() || uploadingEvidence() || !evidenceObjectKey() || eventReviewNote.trim().length < 10 || (eventReviewDecision === 'APPROVE' && !ev.proposalDetail?.evidenceUrl) || (ev.resolution === 'PENDING_APPROVAL' && ev.proposal?.proposedBy === auth.currentUser()?.id)">
              {{ savingEventReview() ? 'Đang gửi đánh giá...' : 'Lưu đánh giá sự kiện' }}
            </button>
          </div>
        </form>
      }
    </fc-modal>

    <!-- Propose Refund Modal -->
    <fc-modal
      [isOpen]="proposeModalOpen()"
      title="Đề xuất khoản hoàn tiền"
      (close)="proposeModalOpen.set(false)"
    >
      <form (ngSubmit)="saveProposal()" class="modal-form">
        <label>
          Giao dịch thanh toán thành công *
          <input [(ngModel)]="propPaymentAttemptId" name="paymentAttemptId" list="succeeded-payments" placeholder="Chọn giao dịch gần đây hoặc nhập mã giao dịch" required />
          <datalist id="succeeded-payments">
            @for (payment of succeededPayments(); track payment.id) {
              <option [value]="payment.id">{{ payment.orderId.slice(0, 8) }} · {{ payment.amount | currency:'VND':'symbol':'1.0-0' }} · {{ payment.id.slice(0, 8) }}</option>
            }
          </datalist>
        </label>

        <label>
          Số tiền hoàn (VND) *
          <input type="number" [(ngModel)]="propAmount" name="amount" required min="1000" />
        </label>

        <label>
          Lý do hoàn tiền *
          <textarea [(ngModel)]="propReason" name="reason" rows="3" placeholder="Khách trả hàng, lỗi đơn, hết hàng..." required></textarea>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="proposeModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || !propPaymentAttemptId || !propAmount || !propReason">
            {{ saving() ? 'Đang tạo...' : 'Tạo đề xuất' }}
          </button>
        </div>
      </form>
    </fc-modal>

    <!-- Set Beneficiary Modal -->
    <fc-modal
      [isOpen]="beneficiaryModalOpen()"
      title="Thông tin tài khoản nhận tiền hoàn"
      (close)="beneficiaryModalOpen.set(false)"
    >
      <form (ngSubmit)="saveBeneficiary()" class="modal-form">
        <label>
          Mã ngân hàng (BIN) *
          <input type="text" [(ngModel)]="benBin" name="bin" placeholder="VD: 970436 (Vietcombank), 970422 (MB)..." required />
        </label>

        <label>
          Số tài khoản *
          <input type="text" [(ngModel)]="benAccountNum" name="accountNum" placeholder="Số tài khoản ngân hàng..." required />
        </label>

        <label>
          Tên chủ tài khoản (In hoa không dấu) *
          <input type="text" [(ngModel)]="benAccountName" name="accountName" placeholder="NGUYEN VAN A" required />
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="beneficiaryModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || !benBin || !benAccountNum || !benAccountName">
            {{ saving() ? 'Đang lưu...' : 'Lưu tài khoản' }}
          </button>
        </div>
      </form>
    </fc-modal>

    <!-- Complete Refund Modal -->
    <fc-modal
      [isOpen]="completeModalOpen()"
      title="Xác nhận đã chuyển khoản hoàn tiền"
      (close)="completeModalOpen.set(false)"
    >
      <form (ngSubmit)="saveComplete()" class="modal-form">
        <label>
          Mã tham chiếu ngân hàng (FT / Ref Code) *
          <input type="text" [(ngModel)]="compBankRef" name="bankRef" placeholder="Mã giao dịch ngân hàng chuyển khoản..." required />
        </label>
        <label>
          Ảnh chứng từ chuyển khoản *
          <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploadingEvidence()" (change)="uploadEvidence($event)" />
          @if (uploadingEvidence()) { <span>Đang tải chứng từ...</span> }
          @if (evidenceObjectKey()) { <span>Đã tải chứng từ.</span> }
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="completeModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving() || uploadingEvidence() || !evidenceObjectKey() || !compBankRef">
            {{ saving() ? 'Đang xác nhận...' : 'Xác nhận hoàn tất' }}
          </button>
        </div>
      </form>
    </fc-modal>

    @if (activeTab() === 'refunds') {<fc-pagination label="Phân trang" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />}

    @if (activeTab() === 'events') {<fc-pagination label="Sự kiện thanh toán" [page]="eventPagination.page()" [total]="eventPagination.total()" [limit]="eventPagination.limit" [loading]="loadingEvents()" (pageChange)="eventPaginationChanged($event)" />}
`,
  styles: [`
    .admin-refunds-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: 1.8rem;
      margin: 0 0 6px;
      font-weight: 500;
    }
    .page-desc {
      color: var(--color-muted);
      font-size: 0.9rem;
      margin: 0;
    }
    .tab-nav {
      display: flex;
      gap: 12px;
      border-bottom: 1px solid var(--color-divider);
      padding-bottom: 8px;
    }
    .tab-btn {
      background: none;
      border: 0;
      padding: 8px 16px;
      font-size: 0.92rem;
      font-weight: 500;
      color: var(--color-muted);
      border-radius: var(--radius-control);
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab-btn.active {
      background: var(--color-text);
      color: var(--color-surface);
      font-weight: 600;
    }
    .table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .table-header {
      display: grid;
      grid-template-columns: 1fr 1fr 1.3fr 1.8fr 1.8fr 1.2fr 1.8fr;
      padding: 12px 16px;
      background: var(--color-canvas);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-muted);
      border-bottom: 1px solid var(--color-divider);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .event-grid {
      grid-template-columns: 1.8fr 1.6fr 1.4fr 2fr 1.2fr 1.4fr 1fr !important;
    }
    .table-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1.3fr 1.8fr 1.8fr 1.2fr 1.8fr;
      padding: 14px 16px;
      border-bottom: 1px solid #f6f5f2;
      align-items: center;
      font-size: 0.88rem;
    }
    .id-cell, .order-cell {
      font-family: monospace;
      color: var(--color-muted);
      cursor: pointer;
    }
    .id-cell:hover {
      text-decoration: underline;
      color: var(--color-text);
    }
    .amount-cell {
      color: #c62828;
    }
    .reason-cell {
      font-size: 0.84rem;
      color: #444;
    }
    .beneficiary-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.82rem;
    }
    .beneficiary-cell span {
      color: var(--color-muted);
    }
    .btn-link {
      background: none;
      border: 0;
      color: var(--color-accent);
      font-size: 0.82rem;
      cursor: pointer;
      text-align: left;
      padding: 0;
    }
    .state-badge {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: 600;
    }
    .state-proposed { background: #fff8e1; color: var(--color-warning); }
    .state-approved { background: #e3f2fd; color: #1565c0; }
    .state-processing { background: #ede7f6; color: #512da8; }
    .state-succeeded { background: #e8f5e9; color: #2e7d32; }
    .state-failed { background: #ffebee; color: #c62828; }

    .actions-cell {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .btn-action {
      border: 0;
      padding: 5px 10px;
      border-radius: var(--radius-control);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-action.approve { background: #e3f2fd; color: #1565c0; }
    .btn-action.complete { background: #e8f5e9; color: #2e7d32; }
    .btn-action.fail { background: #ffebee; color: #c62828; }
    .btn-action.btn-detail { background: var(--color-canvas); color: #555; border: 1px solid var(--color-border); }
    .btn-action.btn-review { background: #f4efe9; color: #745136; border: 1px solid #dfd4c5; }

    /* Event Tab Styles */
    .event-id-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .provider-tag {
      font-size: 0.75rem;
      color: var(--color-accent);
      text-transform: uppercase;
    }
    .event-code {
      font-family: monospace;
      font-size: 0.8rem;
      color: #555;
    }
    .amount-cell-box {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .type-badge {
      font-size: 0.7rem;
      padding: 2px 6px;
      background: #eee;
      border-radius: var(--radius-control);
      font-weight: 600;
    }
    .type-in {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .time-cell, .content-cell {
      font-size: 0.82rem;
      color: #555;
    }
    .resolution-badge {
      font-size: 0.74rem;
      padding: 2px 8px;
      border-radius: var(--radius-card);
      background: #f5f5f5;
      color: var(--color-muted);
      font-weight: 600;
    }
    .res-matched {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .review-badge {
      font-size: 0.74rem;
      padding: 2px 8px;
      border-radius: var(--radius-card);
      background: #f5f5f5;
      color: var(--color-muted);
      font-weight: 600;
    }
    .review-badge.pending {
      background: #fff8e1;
      color: var(--color-warning);
    }
    .dec-escalated {
      background: #ffebee;
      color: #c62828;
    }
    .ev-summary-box {
      background: var(--color-canvas);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      padding: 12px;
      font-size: 0.85rem;
      line-height: 1.6;
    }
    .ev-summary-box p {
      margin: 0;
    }
    .detail-modal-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .info-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--color-canvas);
      border-radius: 6px;
      padding: 16px;
      border: 1px solid var(--color-divider);
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.88rem;
    }
    .info-row .lbl {
      color: var(--color-muted);
    }
    .highlight-amt {
      color: #c62828;
      font-size: 1rem;
    }
    .text-danger-btn {
      background: #c62828 !important;
      color: white !important;
    }
    .modal-hint {
      font-size: 0.88rem;
      color: #555;
      margin: 0;
    }
    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .modal-form label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: #444;
    }
    .modal-form input, .modal-form textarea, .modal-form select {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 10px;
      font-size: 0.9rem;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 10px;
    }
    .loading-box, .empty-state {
      text-align: center;
      padding: 60px 0;
      color: var(--color-muted);
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-text);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 14px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .header-actions { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }

  `],
})
export class AdminRefundsPage implements OnInit {
  readonly eventPagination = new PaginationState(20);
  eventPaginationChanged(page: number): void { this.eventPagination.page.set(page); this.loadPaymentEvents(); }

  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadRefunds(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly activeTab = signal<'refunds' | 'events'>('refunds');

  readonly refunds = signal<Refund[]>([]);
  readonly succeededPayments = signal<PaymentAttempt[]>([]);
  readonly loading = signal<boolean>(true);

  // Detail Modal (GET /admin/refunds/:refundId)
  readonly detailModalOpen = signal<boolean>(false);
  readonly detailedRefund = signal<Refund | null>(null);
  readonly loadingDetail = signal<boolean>(false);

  // Fail Refund Modal (PATCH /admin/refunds/:refundId/fail)
  readonly failModalOpen = signal<boolean>(false);
  failReason = '';

  // Payment Events (GET /admin/payment-events & PATCH /admin/payment-events/:id/review)
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
  readonly beneficiaryModalOpen = signal<boolean>(false);
  readonly completeModalOpen = signal<boolean>(false);
  readonly selectedRefund = signal<Refund | null>(null);
  readonly saving = signal<boolean>(false);

  // Proposal form
  propPaymentAttemptId = '';
  propAmount = 100000;
  propReason = '';

  // Beneficiary form
  benBin = '';
  benAccountNum = '';
  benAccountName = '';

  // Complete form
  compBankRef = '';
  readonly evidenceObjectKey = signal('');
  readonly uploadingEvidence = signal(false);

  ngOnInit(): void {
    if (this.auth.can('refund.propose')) this.loadRefunds();
    else if (this.auth.canGlobal('payment.read')) this.switchToEventsTab();
    if (this.auth.can('payment.read')) {
      this.api.listPayments(1, 50).subscribe({
        next: (res) => this.succeededPayments.set(res.items.filter((p) => p.state === 'SUCCEEDED')),
        error: () => this.toast.error('Không thể tải danh sách thanh toán.'),
      });
    }
  }

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
    this.evidenceObjectKey.set('');
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
        this.toast.success('Đã cập nhật trạng thái khoản hoàn tiền: THẤT BẠI.');
        this.loadRefunds();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể đánh dấu thất bại.');
      },
    });
  }

  // --- GET /admin/payment-events & PATCH /admin/payment-events/:eventId/review ---
  switchToEventsTab(): void {
    this.activeTab.set('events');
    if (this.paymentEvents().length === 0) {
      this.loadPaymentEvents();
    }
  }

  loadPaymentEvents(): void {
    this.loadingEvents.set(true);
    // GET /admin/payment-events
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
    this.evidenceObjectKey.set('');
    this.api.adminGetPaymentEvent(ev.id).subscribe({
      next: detail => { if (this.selectedEvent()?.id !== ev.id) return; this.selectedEvent.set(detail); this.reviewEventModalOpen.set(true); },
      error: () => this.toast.error('Không thể tải chứng từ và đề xuất đối soát.'),
    });
  }

  submitReviewEvent(): void {
    const ev = this.selectedEvent();
    if (!ev || this.eventReviewNote.trim().length < 10 || this.uploadingEvidence() || !this.evidenceObjectKey() || this.savingEventReview()) return;
    if (ev.resolution === 'PENDING_APPROVAL' && ev.proposal?.proposedBy === this.auth.currentUser()?.id) return;
    if (['REFUNDED_EXTERNALLY', 'OUTGOING_RECONCILED'].includes(this.eventReviewDecision) && this.eventReviewBankReference.trim().length < 3) return;

    this.savingEventReview.set(true);
    // PATCH /admin/payment-events/:eventId/review
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
        this.paymentEvents.update((list) =>
          list.map((item) => (item.id === ev.id ? { ...item, ...updated, reviewDecision: this.eventReviewDecision } : item))
        );
      },
      error: (err) => {
        this.savingEventReview.set(false);
        this.toast.error(err.error?.message || 'Không thể đánh giá sự kiện.');
      },
    });
  }

  openProposeModal(): void {
    this.propPaymentAttemptId = '';
    this.propAmount = 100000;
    this.propReason = '';
    this.proposeModalOpen.set(true);
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
        this.toast.success('Đã tạo đề xuất hoàn tiền thành công.');
        this.loadRefunds();
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
        this.toast.success('Đã cập nhật thông tin tài khoản nhận hoàn tiền.');
        this.loadRefunds();
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
        this.toast.success('Đã phê duyệt hoàn tiền thành công.');
        this.loadRefunds();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể phê duyệt hoàn tiền.');
      },
    });
  }

  openCompleteModal(rf: Refund): void {
    this.selectedRefund.set(rf);
    this.compBankRef = '';
    this.evidenceObjectKey.set('');
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
        this.loadRefunds();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể xác nhận hoàn tất.');
      },
    });
  }

  uploadEvidence(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.evidenceObjectKey.set('');
    this.uploadingEvidence.set(true);
    this.api.uploadImage(file, 'refund_evidence').subscribe({
      next: (media) => {
        this.evidenceObjectKey.set(media.objectKey);
        this.uploadingEvidence.set(false);
      },
      error: (err) => {
        this.uploadingEvidence.set(false);
        this.toast.error(err.error?.message || err.message || 'Không thể tải chứng từ.');
      },
    });
  }
}
