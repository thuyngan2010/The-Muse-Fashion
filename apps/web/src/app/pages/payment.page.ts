import { Subscription, catchError, throwError } from 'rxjs';
import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import type { PaymentAttempt } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { STORE_CHECKOUT_CONTENT, STORE_PAYMENT_CONTENT } from '../shared/store-content';
import { ORDER_STATUS_LABELS } from '../shared/labels';

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
        <div>
          <h1 class="page-title">{{ content.title }}</h1>
          <p class="page-desc">Đơn hàng <strong>#{{ orderCode() }}</strong></p>
        </div>
        <ol class="steps" aria-label="Các bước thanh toán">
          <li><a routerLink="/cart">{{ checkout.steps[0] }}</a></li>
          <li>{{ checkout.steps[1] }}</li>
          <li class="current" aria-current="step">{{ checkout.steps[2] }}</li>
        </ol>
      </header>

      @if (loading()) {
        <div class="state-card" role="status">
          <div class="spinner" aria-hidden="true"></div>
          <p>Đang chuẩn bị mã thanh toán VietQR...</p>
        </div>
      } @else if (error()) {
        <div class="state-card error-card" role="alert">
          <h2>Có lỗi xảy ra</h2>
          <p>{{ error() }}</p>
          <div class="actions">
            <button type="button" class="btn-primary" (click)="createOrFetchAttempt()">THỬ LẠI</button>
            <a routerLink="/orders" class="btn-outline">{{ content.viewOrder }}</a>
          </div>
        </div>
      } @else if (attempt(); as p) {
        @if (p.reviewOutcome === 'REFUNDED_EXTERNALLY') { <p class="inline-note" role="status">Khoản chuyển cần đối soát đã được ghi nhận hoàn thủ công sau kiểm tra chứng từ.</p> }
        @if (p.state === 'SUCCEEDED' && p.hasOpenReview) { <p class="inline-note" role="status">Đơn hàng đã thanh toán; một khoản chuyển khác đang cần đối soát. Vui lòng không chuyển thêm tiền.</p> }
        @if (p.state === 'SUCCEEDED') {
          <div class="state-card success-card">
            <div class="icon-circle" aria-hidden="true">✓</div>
            <h2>Thanh toán thành công!</h2>
            <p>Hệ thống đã nhận được số tiền thanh toán <strong>{{ p.amount | currency:'VND':'symbol':'1.0-0' }}</strong> cho đơn hàng.</p>
            <p class="sub">Đơn hàng của bạn đã chuyển sang trạng thái {{ confirmedLabel }} và đang được chuẩn bị đóng gói.</p>
            <div class="actions">
              <a [routerLink]="['/orders', orderId]" class="btn-primary">XEM ĐƠN HÀNG</a>
            </div>
          </div>
        } @else if (p.hasOpenReview || p.state === 'REQUIRES_REVIEW') {
          <div class="state-card" role="status">
            <div class="spinner" aria-hidden="true"></div>
            <h2>Đang đối soát giao dịch</h2>
            <p>Đã ghi nhận một khoản chuyển cần kiểm tra. Vui lòng không chuyển thêm tiền.</p>
            <p class="sub">Nhân sự sẽ đối soát chứng từ và xác minh phương án xử lý. Tiền đến muộn không tự khôi phục đơn đã hủy; hết hạn không có nghĩa đã hoàn tiền. {{ content.watching }}</p>
            <div class="actions">
              <a [routerLink]="['/orders', orderId]" class="btn-primary">XEM ĐƠN HÀNG</a>
            </div>
          </div>
        } @else if (p.state === 'FAILED' || isExpired()) {
          <div class="state-card">
            <div class="icon-circle fail-icon" aria-hidden="true">✕</div>
            <h2>Phiên thanh toán không còn hiệu lực</h2>
            <p>Không tiếp tục chuyển khoản vào phiên này. Nếu đã chuyển, hãy giữ chứng từ và liên hệ hỗ trợ đối soát. Hết hạn không đồng nghĩa tiền đã được hoàn.</p>
            <div class="actions">
              @if (p.canRetry) { <button type="button" class="btn-primary" (click)="createFreshAttempt()">TẠO MÃ MỚI</button> }
              <a [routerLink]="['/orders', orderId]" [class]="p.canRetry ? 'btn-outline' : 'btn-primary'">{{ content.viewOrder }}</a>
            </div>
          </div>
        } @else {
          <div class="payment-layout">
            <div class="qr-col">
              <div class="qr-card">
                <div class="qr-header">
                  <span class="vietqr-badge">VietQR</span>
                  <div class="timer-box" [class.urgent]="timeRemainingSeconds() < 300">
                    Còn lại: <strong>{{ formattedCountdown() }}</strong>
                  </div>
                </div>

                <div class="qr-image-wrapper">
                  @if (p.qrImageUrl && !qrLoadError()) {
                    <img [src]="p.qrImageUrl" alt="Mã thanh toán VietQR" class="qr-image" (error)="qrLoadError.set(true)" />
                  } @else {
                    <div class="qr-placeholder">
                      <p role="alert">Không tải được mã QR. Không chuyển khoản dựa trên thông tin chưa xác thực.</p>
                      <button type="button" class="btn-outline" (click)="retryQr()">THỬ LẠI</button>
                    </div>
                  }
                </div>

                <p class="qr-footer-hint">{{ content.qrHint }}</p>
              </div>
            </div>

            <div class="details-col">
              <div class="details-card">
                <h2>{{ content.detailsTitle }}</h2>
                <p class="guide-text">{{ content.detailsNote }}</p>

                <div class="info-table">
                  <div class="info-row">
                    <span class="row-label">NGÂN HÀNG</span>
                    <strong class="row-value">{{ p.bank?.bin || 'Chưa có thông tin xác thực' }}</strong>
                  </div>
                  <div class="info-row">
                    <span class="row-label">TÀI KHOẢN ĐỐI CHIẾU</span>
                    <strong class="row-value">{{ p.bank?.accountNumberMasked || 'Không có thông tin đối chiếu' }}</strong>
                  </div>
                  <div class="info-row">
                    <span class="row-label">CHỦ TÀI KHOẢN</span>
                    <strong class="row-value">{{ p.bank?.accountName || 'Chưa có thông tin xác thực' }}</strong>
                  </div>
                  <div class="info-row">
                    <span class="row-label">SỐ TIỀN</span>
                    <div class="value-with-copy">
                      <strong class="row-value price-num">{{ p.amount | currency:'VND':'symbol':'1.0-0' }}</strong>
                      <button type="button" class="copy-btn" (click)="copyText(p.amount.toString())">SAO CHÉP</button>
                    </div>
                  </div>
                  <div class="info-row">
                    <span class="row-label">NỘI DUNG CHUYỂN KHOẢN</span>
                    <div class="value-with-copy">
                      <strong class="row-value code-num">{{ p.reconciliationCode }}</strong>
                      <button type="button" class="copy-btn" (click)="copyText(p.reconciliationCode)">SAO CHÉP</button>
                    </div>
                  </div>
                </div>

                <p class="match-warning" role="note">{{ content.matchWarning }}</p>

                <div class="polling-status" role="status">
                  <span class="pulse-dot" aria-hidden="true"></span>
                  <span>{{ content.watching }}</span>
                </div>
              </div>
            </div>
          </div>

          <section class="guide" aria-labelledby="guide-heading">
            <h2 id="guide-heading">{{ content.guideTitle }}</h2>
            <ol>
              @for (step of content.guideSteps; track step.title; let i = $index) {
                <li><span class="guide-no">{{ i + 1 }}</span><div><strong>{{ step.title }}</strong><p>{{ step.description }}</p></div></li>
              }
            </ol>
          </section>

          <nav class="secondary-links" aria-label="Liên kết phụ">
            <a [routerLink]="['/orders', orderId]">{{ content.viewOrder }}</a>
            <a routerLink="/orders">{{ content.payLater }}</a>
          </nav>
        }
      }
    </main>
  `,
  styles: [`
    :host { display: block; background: var(--ui-bg, #fff); color: var(--ui-ink, #171717); font-family: var(--font-sans, "Montserrat", Arial, sans-serif); }
    button { font-family: inherit; }
    .payment-page-container { width: min(100%, var(--ui-page-max, 1280px)); margin: 0 auto; padding: 64px var(--ui-page-pad, 48px); }
    .page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 34px; padding-bottom: 16px; border-bottom: 1px solid var(--ui-ink, #171717); }
    .page-title { margin: 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 40px; font-weight: 400; line-height: 48px; letter-spacing: -1px; }
    .page-desc { margin: 6px 0 0; color: var(--ui-ink-soft, #444748); font-size: 13px; }
    .steps { display: flex; flex-wrap: wrap; gap: 8px 0; margin: 0; padding: 0; list-style: none; color: var(--ui-subtle, #747878); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .steps li + li::before { content: '→'; margin: 0 12px; color: var(--ui-line, #c4c7c7); }
    .steps a { color: var(--ui-ink, #171717); text-decoration: underline; text-underline-offset: 5px; }
    .steps .current { color: var(--ui-accent, #8f485d); }
    .payment-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: start; }
    .qr-card, .details-card { padding: 32px; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; }
    .qr-card { border-color: var(--ui-ink, #171717); text-align: center; }
    .qr-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
    .vietqr-badge { padding: 4px 10px; background: var(--ui-ink, #171717); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 1px; }
    .timer-box { font-size: 12px; color: var(--ui-ink-soft, #444748); }
    .timer-box strong { font-variant-numeric: tabular-nums; }
    .timer-box.urgent, .timer-box.urgent strong { color: var(--ui-price, #c52929); }
    .qr-image-wrapper { display: flex; min-height: 280px; align-items: center; justify-content: center; padding: 16px; border: 1px solid var(--ui-line-soft, #e3e2e2); background: #fff; }
    .qr-image { display: block; width: 100%; max-width: 320px; height: auto; }
    .qr-placeholder { display: grid; justify-items: center; gap: 14px; color: var(--ui-danger, #9b2c2c); font-size: 13px; }
    .qr-placeholder p { margin: 0; }
    .qr-footer-hint { margin: 18px 0 0; color: var(--ui-ink-soft, #444748); font-size: 13px; }
    .details-card h2, .guide h2, .state-card h2 { margin: 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 22px; font-weight: 500; line-height: 30px; letter-spacing: -.3px; }
    .details-card h2 { padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,.2); }
    .guide-text { margin: 16px 0; color: var(--ui-ink-soft, #444748); font-size: 12px; line-height: 1.6; }
    .info-row { display: grid; gap: 6px; padding: 14px 0; border-bottom: 1px solid var(--ui-line-soft, #e3e2e2); }
    .row-label { color: var(--ui-subtle, #747878); font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .row-value { font-size: 14px; word-break: break-word; }
    .price-num { color: var(--ui-price, #c52929); font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 24px; font-weight: 600; }
    .code-num { font-size: 15px; letter-spacing: .5px; }
    .value-with-copy { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .copy-btn { min-height: 34px; padding: 0 14px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; background: #fff; color: var(--ui-ink, #171717); font-size: 11px; font-weight: 700; letter-spacing: .8px; cursor: pointer; white-space: nowrap; }
    .copy-btn:hover { background: var(--ui-pink, #f4b8c1); }
    .match-warning { margin: 18px 0 0; color: var(--ui-price, #c52929); font-size: 13px; font-weight: 600; line-height: 1.5; }
    .polling-status { display: flex; align-items: center; gap: 10px; margin-top: 18px; color: var(--ui-ink-soft, #444748); font-size: 12px; }
    .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ui-success, #276749); animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
    .guide { margin-top: 48px; padding: 28px 32px; border: 1px solid var(--ui-line, #c4c7c7); }
    .guide ol { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 20px 0 0; padding: 0; list-style: none; }
    .guide li { display: flex; gap: 14px; align-items: flex-start; }
    .guide-no { display: inline-flex; width: 28px; height: 28px; flex: none; align-items: center; justify-content: center; background: var(--ui-pink, #f4b8c1); font-size: 12px; font-weight: 700; }
    .guide strong { display: block; font-size: 13px; }
    .guide p { margin: 4px 0 0; color: var(--ui-ink-soft, #444748); font-size: 12px; line-height: 1.55; }
    .secondary-links { display: flex; justify-content: center; gap: 28px; margin-top: 28px; }
    .secondary-links a { color: var(--ui-ink, #171717); font-size: 12px; font-weight: 700; letter-spacing: .6px; text-decoration: underline; text-underline-offset: 5px; }
    .inline-note { margin: 0 0 20px; padding: 12px 16px; border: 1px solid var(--ui-info, #3f5f7e); background: var(--ui-info-bg, #eff5fa); color: var(--ui-info, #3f5f7e); font-size: 13px; }
    .state-card { display: grid; justify-items: center; gap: 14px; max-width: 620px; margin: 40px auto; padding: 56px 28px; border: 1px solid var(--ui-line, #c4c7c7); text-align: center; }
    .state-card p { margin: 0; color: var(--ui-ink-soft, #444748); font-size: 13px; line-height: 1.6; }
    .state-card .sub { font-size: 12px; }
    .icon-circle { display: flex; width: 72px; height: 72px; align-items: center; justify-content: center; border-radius: 50%; background: var(--ui-success-bg, #edf8f1); color: var(--ui-success, #276749); font-size: 36px; }
    .fail-icon { background: var(--ui-danger-bg, #fff1f1); color: var(--ui-danger, #9b2c2c); }
    .spinner { width: 28px; height: 28px; border: 2px solid var(--ui-line, #c4c7c7); border-top-color: var(--ui-ink, #171717); border-radius: 50%; animation: spin .9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 8px; }
    .btn-primary, .btn-outline { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 22px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; font-size: 12px; font-weight: 700; letter-spacing: .8px; text-decoration: none; cursor: pointer; }
    .btn-primary { background: var(--ui-ink, #171717); color: #fff; }
    .btn-primary:hover { background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); }
    .btn-outline { background: #fff; color: var(--ui-ink, #171717); }
    .btn-outline:hover { background: var(--ui-pink, #f4b8c1); }
    :is(button, a):focus-visible { outline: 2px solid var(--ui-accent, #8f485d); outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) { .spinner, .pulse-dot { animation: none; } }
    @media (max-width: 980px) {
      .payment-page-container { padding-inline: 28px; }
      .payment-layout { grid-template-columns: 1fr; gap: 28px; }
      .guide ol { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .payment-page-container { padding: 36px 18px 56px; }
      .page-header { align-items: flex-start; flex-direction: column; }
      .page-title { font-size: 32px; line-height: 40px; }
      .qr-card, .details-card, .guide { padding: 22px 18px; }
      .actions { width: 100%; flex-direction: column; }
      .btn-primary, .btn-outline { width: 100%; }
    }
  `],
})
export class PaymentPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly content = STORE_PAYMENT_CONTENT;
  readonly checkout = STORE_CHECKOUT_CONTENT;
  readonly confirmedLabel = ORDER_STATUS_LABELS.CONFIRMED;
  orderId = '';
  orderCode(): string { return this.orderId.slice(-8).toUpperCase(); }
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
