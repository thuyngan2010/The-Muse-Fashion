import { Subscription, catchError, throwError } from 'rxjs';
import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import type { PaymentAttempt } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';

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
  imports: [RouterLink, CurrencyPipe],
  template: `
    <main class="payment-page-container">
      <header class="page-header">
        <span class="eyebrow">VIETQR INSTANT PAYMENT</span>
        <h1 class="page-title">Thanh toán chuyển khoản VietQR</h1>
        <p class="page-desc">Quét mã QR bằng ứng dụng ngân hàng bất kỳ để hoàn tất thanh toán tự động trong giây lát.</p>
      </header>

      @if (loading()) {
        <div class="state-card loading-card">
          <div class="spinner"></div>
          <p>Đang chuẩn bị mã thanh toán VietQR...</p>
        </div>
      } @else if (error()) {
        <div class="state-card error-card">
          <h3>Có lỗi xảy ra</h3>
          <p>{{ error() }}</p>
          <a routerLink="/orders" class="btn-primary">Quản lý đơn hàng</a>
        </div>
      } @else if (attempt(); as p) {
        @if (p.reviewOutcome === 'REFUNDED_EXTERNALLY') { <p role="status">Khoản chuyển cần đối soát đã được ghi nhận hoàn thủ công sau kiểm tra chứng từ.</p> }
        @if (p.state === 'SUCCEEDED' && p.hasOpenReview) { <p role="status">Đơn hàng đã thanh toán; một khoản chuyển khác đang cần đối soát. Vui lòng không chuyển thêm tiền.</p> }
        @if (p.state === 'SUCCEEDED') {
          <div class="state-card success-card">
            <div class="icon-circle">✓</div>
            <h2>Thanh toán thành công!</h2>
            <p>Hệ thống đã nhận được số tiền thanh toán <strong>{{ p.amount | currency:'VND':'symbol':'1.0-0' }}</strong> cho đơn hàng.</p>
            <p class="sub">Đơn hàng của bạn đã chuyển sang trạng thái CONFIRMED và đang được chuẩn bị đóng gói.</p>
            <div class="actions">
              <a [routerLink]="['/orders', orderId]" class="btn-primary">Xem chi tiết đơn hàng →</a>
            </div>
          </div>
        } @else if (p.hasOpenReview || p.state === 'REQUIRES_REVIEW') {
          <div class="state-card review-card">
            <div class="icon-circle review-icon">⏳</div>
            <h2>Đang đối soát giao dịch</h2>
            <p>Đã ghi nhận một khoản chuyển cần kiểm tra. Vui lòng không chuyển thêm tiền.</p>
            <p class="sub">Nhân sự sẽ đối soát chứng từ và xác minh phương án xử lý. Tiền đến muộn không tự khôi phục đơn đã hủy; hết hạn không có nghĩa đã hoàn tiền.</p>
            <div class="actions">
              <a [routerLink]="['/orders', orderId]" class="btn-primary">Xem chi tiết đơn hàng</a>
            </div>
          </div>
        } @else if (p.state === 'FAILED' || isExpired()) {
          <div class="state-card failed-card">
            <div class="icon-circle fail-icon">✕</div>
            <h2>Phiên thanh toán không còn hiệu lực</h2>
            @if (p.canRetry) { <button type="button" class="btn-primary" (click)="createFreshAttempt()">Tạo lại phiên thanh toán</button> }
            <p>Không tiếp tục chuyển khoản vào phiên này. Nếu đã chuyển, hãy giữ chứng từ và liên hệ hỗ trợ đối soát. Hết hạn không đồng nghĩa tiền đã được hoàn.</p>
            <div class="actions">
              <a [routerLink]="['/orders', orderId]" class="btn-primary">Quay lại đơn hàng</a>
            </div>
          </div>
        } @else {
          <!-- Active PENDING state: Show QR & Transfer Details -->
          <div class="payment-layout">
            <!-- QR Image Box -->
            <div class="qr-col">
              <div class="qr-card">
                <div class="qr-header">
                  <span class="vietqr-badge">VietQR PRO</span>
                  <div class="timer-box" [class.urgent]="timeRemainingSeconds() < 300">
                    ⏱️ Còn lại: <strong>{{ formattedCountdown() }}</strong>
                  </div>
                </div>

                <div class="qr-image-wrapper">
                  @if (p.qrImageUrl && !qrLoadError()) {
                    <img [src]="p.qrImageUrl" alt="Mã thanh toán VietQR" class="qr-image" (error)="qrLoadError.set(true)" />
                  } @else {
                    <div class="qr-placeholder">
                      <p role="alert">Không tải được mã QR. Không chuyển khoản dựa trên thông tin chưa xác thực.</p><button type="button" class="btn-outline" (click)="retryQr()">Thử tải lại mã QR</button>
                    </div>
                  }
                </div>

                <div class="qr-footer-hint">
                  <p>Mở ứng dụng Ngân hàng (Vietcombank, MB, Techcombank, VPBank...) chọn <strong>Quét mã QR</strong> để thanh toán.</p>
                </div>
              </div>
            </div>

            <!-- Manual Transfer Info Details -->
            <div class="details-col">
              <div class="details-card">
                <h3>Thông tin trên mã QR</h3>
                <p class="guide-text">Thanh toán bằng quét QR. Tài khoản dưới đây được che để đối chiếu, không dùng để nhập chuyển khoản thủ công. Nếu QR lỗi, hãy tải lại hoặc liên hệ hỗ trợ từ thông tin đơn hàng.</p>

                <div class="info-table">
                  <div class="info-row">
                    <span class="row-label">Ngân hàng:</span>
                    <strong class="row-value">{{ p.bank?.bin || 'Chưa có thông tin xác thực' }}</strong>
                  </div>

                  <div class="info-row">
                    <span class="row-label">Chủ tài khoản:</span>
                    <strong class="row-value">{{ p.bank?.accountName || 'Chưa có thông tin xác thực' }}</strong>
                  </div>

                  <div class="info-row">
                    <span class="row-label">Tài khoản đối chiếu:</span>
                    <strong class="row-value highlight-num">{{ p.bank?.accountNumberMasked || 'Không có thông tin đối chiếu' }}</strong>
                  </div>

                  <div class="info-row">
                    <span class="row-label">Số tiền:</span>
                    <div class="value-with-copy">
                      <strong class="row-value price-num">{{ p.amount | currency:'VND':'symbol':'1.0-0' }}</strong>
                      <button class="copy-btn" (click)="copyText(p.amount.toString())">Copy</button>
                    </div>
                  </div>

                  <div class="info-row alert-row">
                    <span class="row-label">Nội dung CK:</span>
                    <div class="value-with-copy">
                      <strong class="row-value code-num">{{ p.reconciliationCode }}</strong>
                      <button class="copy-btn copy-btn-primary" (click)="copyText(p.reconciliationCode)">Copy mã</button>
                    </div>
                  </div>
                </div>

                <div class="note-box">
                  <strong>⚠️ Lưu ý đặc biệt:</strong>
                  <p>
                    Kiểm tra tên người nhận và <strong>mã nội dung chuyển khoản</strong> trong ứng dụng ngân hàng trước khi xác nhận.
                  </p>
                </div>

                <div class="polling-status">
                  <span class="pulse-dot"></span>
                  <span>Hệ thống đang tự động lắng nghe giao dịch chuyển khoản...</span>
                </div>
              </div>
            </div>
          </div>
        }
      }
    </main>
  `,
  styles: [`
    .payment-page-container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 6vw 90px;
    }
    .page-header {
      text-align: center;
      max-width: 650px;
      margin: 0 auto 40px;
    }
    .eyebrow {
      font-size: 0.74rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: clamp(2rem, 3.5vw, 2.7rem);
      margin: 8px 0 12px;
      font-weight: 500;
    }
    .page-desc {
      color: var(--color-muted);
      line-height: 1.6;
      font-size: 0.95rem;
    }
    .payment-layout {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 36px;
      align-items: start;
    }
    .qr-card, .details-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 28px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
    }
    .qr-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .vietqr-badge {
      font-size: 0.78rem;
      background: #0052cc;
      color: white;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: var(--radius-control);
      letter-spacing: 0.05em;
    }
    .timer-box {
      font-size: 0.85rem;
      color: #555;
      background: var(--color-canvas);
      border: 1px solid var(--color-divider);
      padding: 4px 10px;
      border-radius: var(--radius-control);
    }
    .timer-box.urgent {
      color: #c62828;
      border-color: #ef9a9a;
      background: #ffebee;
      animation: pulse 1.5s infinite;
    }
    .qr-image-wrapper {
      background: var(--color-canvas);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 20px;
    }
    .qr-image {
      max-width: 100%;
      height: auto;
      aspect-ratio: 1;
      object-fit: contain;
    }
    .qr-placeholder {
      aspect-ratio: 1;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-muted);
    }
    .qr-footer-hint {
      text-align: center;
      font-size: 0.84rem;
      color: var(--color-muted);
      line-height: 1.5;
    }
    .details-card h3 {
      font-family: Georgia, serif;
      font-size: 1.35rem;
      font-weight: 500;
      margin: 0 0 8px;
    }
    .guide-text {
      color: var(--color-muted);
      font-size: 0.88rem;
      margin: 0 0 20px;
    }
    .info-table {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: var(--color-canvas);
      border-radius: 6px;
      border: 1px solid var(--color-divider);
    }
    .alert-row {
      background: #fff8e1;
      border-color: #ffe082;
    }
    .row-label {
      font-size: 0.85rem;
      color: var(--color-muted);
    }
    .row-value {
      font-size: 0.95rem;
      color: var(--color-text);
    }
    .highlight-num {
      font-family: monospace;
      font-size: 1.05rem;
    }
    .price-num {
      color: var(--color-accent);
      font-size: 1.15rem;
    }
    .code-num {
      color: #c62828;
      font-family: monospace;
      font-size: 1.15rem;
      letter-spacing: 0.05em;
    }
    .value-with-copy {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .copy-btn {
      background: var(--color-divider);
      border: 0;
      padding: 4px 10px;
      border-radius: var(--radius-control);
      font-size: 0.78rem;
      cursor: pointer;
      font-weight: 600;
      color: #444;
      transition: all 0.15s;
    }
    .copy-btn:hover {
      background: var(--color-border);
      color: var(--color-text);
    }
    .copy-btn-primary {
      background: var(--color-primary);
      color: var(--color-surface);
    }
    .copy-btn-primary:hover {
      background: #3e3b37;
      color: var(--color-surface);
    }
    .note-box {
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 14px 16px;
      border-radius: var(--radius-control);
      font-size: 0.84rem;
      color: #e65100;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .note-box strong {
      display: block;
      margin-bottom: 4px;
    }
    .note-box p {
      margin: 0;
    }
    .polling-status {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.82rem;
      color: var(--color-muted);
    }
    .pulse-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #2e7d32;
      animation: pulse 1.5s infinite;
    }
    .state-card {
      background: var(--color-surface);
      border-radius: var(--radius-card);
      padding: 60px 30px;
      text-align: center;
      max-width: 600px;
      margin: 40px auto;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.05);
    }
    .icon-circle {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 2rem;
    }
    .success-card .icon-circle { background: #e8f5e9; color: #2e7d32; }
    .review-card .icon-circle { background: #fff8e1; color: var(--color-warning); }
    .failed-card .icon-circle { background: #ffebee; color: #c62828; }
    .state-card h2 {
      font-family: Georgia, serif;
      font-size: 1.8rem;
      margin: 0 0 10px;
    }
    .state-card p {
      color: #444;
      line-height: 1.6;
      margin: 0 0 8px;
    }
    .state-card .sub {
      color: var(--color-muted);
      font-size: 0.9rem;
      margin-bottom: 25px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-text);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
    }
    @media (max-width: 860px) {
      .payment-layout {
        grid-template-columns: 1fr;
      }
    }

    .qr-col,.details-col { min-width:0; }
    .loading-card,.error-card { padding:48px 24px; text-align:center; background:var(--color-canvas); border:1px solid var(--color-divider); border-radius:var(--radius-card); }
    .loading-card { color:var(--color-muted); }
    .error-card { color:var(--color-danger); background:#fbeceb; border-color:#edc6c3; }
    .actions { display:flex; justify-content:center; flex-wrap:wrap; gap:12px; margin-top:24px; }
    .review-icon { color:var(--color-warning); background:#faf0da; }
    .fail-icon { color:var(--color-danger); background:#fbeceb; }
    .row-value { overflow-wrap:anywhere; min-width:0; }
    .value-with-copy { flex-wrap:wrap; }
    .timer-box { font-variant-numeric:tabular-nums; }


  `],
})
export class PaymentPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  orderId = '';
  readonly attempt = signal<PaymentAttempt | null>(null);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');

  readonly timeRemainingSeconds = signal<number>(1800); // 30 mins
  readonly isExpired = signal<boolean>(false);

  private countdownInterval: any;
  private pollTimeout: any;
  private pollBackoffMs = 3000; // 3s -> 5s -> 10s
  private isDestroyed = false;
  private readonly requests = new Subscription();
  private pollRequest?: Subscription;
  readonly qrLoadError = signal(false);
  retryQr(): void { this.qrLoadError.set(false); this.createOrFetchAttempt(); }
  private readonly onVisibilityChange = () => {
    if (document.hidden) this.stopPolling();
    else if (!this.isDestroyed && this.attempt()?.state !== 'SUCCEEDED') { this.pollBackoffMs = 3000; this.scheduleNextPoll(); }
  };

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('orderId') || '';
    if (!this.orderId) {
      this.error.set('Thiếu mã đơn hàng cần thanh toán.');
      this.loading.set(false);
      return;
    }

    this.createOrFetchAttempt();
    this.setupPageVisibilityListener();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.requests.unsubscribe();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopPolling();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  createOrFetchAttempt(): void {
    this.loading.set(true);
    const key = generateUUID();

    this.requests.add(this.api.latestPaymentForOrder(this.orderId).pipe(
      catchError(error => error.status === 404 ? this.api.createPaymentAttempt(this.orderId, key) : throwError(() => error)),
    ).subscribe({
      next: (att) => {
        this.attempt.set(att);
        this.loading.set(false);
        this.initCountdown(att.expiresAt);

        if (att.state !== 'SUCCEEDED') {
          this.scheduleNextPoll();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Không thể tạo yêu cầu thanh toán cho đơn hàng.');
      },
    }));
  }

  createFreshAttempt(): void {
    if (!this.attempt()?.canRetry || this.loading()) return;
    this.loading.set(true);
    this.requests.add(this.api.createPaymentAttempt(this.orderId, generateUUID()).subscribe({
      next: attempt => { this.attempt.set(attempt); this.loading.set(false); this.qrLoadError.set(false); this.initCountdown(attempt.expiresAt); if (attempt.state !== 'SUCCEEDED') this.scheduleNextPoll(); },
      error: error => { this.loading.set(false); this.error.set(error.error?.message || 'Không thể tạo lại phiên thanh toán.'); },
    }));
  }

  private initCountdown(expiresAtStr: string): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    const expiresAt = new Date(expiresAtStr).getTime();
    const update = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
      this.timeRemainingSeconds.set(diffSec);
      this.isExpired.set(diffSec <= 0);

      if (diffSec <= 0) {
        this.isExpired.set(true);
        this.pollBackoffMs = 30000;
        if (this.countdownInterval) clearInterval(this.countdownInterval);
      }
    };

    update();
    this.countdownInterval = setInterval(update, 1000);
  }

  readonly formattedCountdown = computed(() => {
    const totalSec = this.timeRemainingSeconds();
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  private scheduleNextPoll(): void {
    this.stopPolling();
    if (this.isDestroyed || (typeof document !== 'undefined' && document.hidden)) return;

    this.pollTimeout = setTimeout(() => {
      const att = this.attempt();
      if (!att) return;

      this.pollRequest = this.api.getPayment(att.id).subscribe({
        next: (updated) => {
          this.attempt.set(updated);

          if (updated.state === 'SUCCEEDED') {
            this.toast.success('Thanh toán thành công!');
            this.stopPolling();
          } else if (updated.hasOpenReview || updated.state === 'REQUIRES_REVIEW' || updated.state === 'FAILED') {
            this.pollBackoffMs = 30000;
            this.scheduleNextPoll();
          } else {
            // Increase backoff: 3s -> 5s -> 10s
            if (this.pollBackoffMs < 5000) this.pollBackoffMs = 5000;
            else if (this.pollBackoffMs < 10000) this.pollBackoffMs = 10000;
            this.scheduleNextPoll();
          }
        },
        error: () => {
          this.scheduleNextPoll();
        },
      });
    }, this.pollBackoffMs);
  }

  private stopPolling(): void {
    this.pollRequest?.unsubscribe();
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  private setupPageVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  copyText(text: string): void {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.toast.info(`Đã sao chép: ${text}`);
      });
    } else {
      this.toast.info(`Sao chép: ${text}`);
    }
  }
}
