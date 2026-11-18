import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { STORE_EMAIL_VERIFICATION_CONTENT } from '../shared/store-content';

@Component({
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <main class="auth-page-container">
      <section class="auth-visual" aria-label="Bộ sưu tập MUSE">
        <img src="/assets/auth/muse-auth-model.png" alt="Người mẫu MUSE trong trang phục trắng">
      </section>

      <div class="auth-card">
        <header class="auth-header">
          <img class="auth-logo" src="/assets/brand/muse-logo-black.png" alt="MUSE">
          <span class="eyebrow">{{ content.eyebrow }}</span>
          <h1 class="auth-title">{{ success() ? content.successTitle : content.title }}</h1>
        </header>

        @if (busy()) {
          <div class="state-box" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <p class="message-text">{{ content.busy }}</p>
          </div>
        } @else if (success()) {
          <div class="state-box" role="status">
            <div class="icon-circle" aria-hidden="true">✓</div>
            <p class="message-text">{{ message() }}</p>
            <a routerLink="/auth" class="btn-primary">{{ verified.cta }}</a>
            <p class="close-hint">{{ content.closeTabHint }}</p>
          </div>
        } @else {
          <div class="state-box">
            <div class="icon-circle fail" aria-hidden="true">✕</div>
            <p class="message-text" role="alert">{{ message() }}</p>

            @if (resendFeedbackSuccess()) {
              <div class="resend-section sent" role="status">
                <strong>{{ content.resendDoneTitle }}</strong>
                <p class="feedback-text success">{{ resendFeedback() }}</p>
              </div>
            } @else {
              <div class="resend-section">
                <p class="resend-prompt">{{ content.resendPrompt }}</p>
                <form (ngSubmit)="handleResend()" class="resend-form">
                  <input type="email" [(ngModel)]="resendEmail" name="email" [placeholder]="content.resendPlaceholder" aria-label="Email nhận liên kết xác thực" required />
                  <button type="submit" class="btn-resend" [disabled]="resending() || !resendEmail">
                    {{ resending() ? content.resendBusy : content.resendButton }}
                  </button>
                </form>
                @if (resendFeedback()) {
                  <p class="feedback-text" role="alert">{{ resendFeedback() }}</p>
                }
              </div>
            }
          </div>
        }

        <a routerLink="/auth" class="back-link">{{ content.backToLogin }}</a>
      </div>
    </main>
  `,
  styles: [`
    :host { display: block; background: var(--ui-bg, #fff); color: var(--ui-ink, #171717); font-family: var(--font-sans, "Montserrat", Arial, sans-serif); }
    button, input { font-family: inherit; }
    .auth-page-container { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: calc(100dvh - 80px); background: #fff; }
    .auth-visual { position: relative; min-height: 640px; overflow: hidden; background: #d7d3c9; }
    .auth-visual img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
    .auth-card { display: flex; min-width: 0; flex-direction: column; justify-content: center; padding: 56px clamp(48px, 7vw, 90px); background: #fff; }
    .auth-header { margin-bottom: 26px; padding-bottom: 28px; border-bottom: 1px solid var(--ui-line-soft, #e3e2e2); text-align: center; }
    .auth-logo { display: block; width: min(235px, 58%); height: auto; margin: 0 auto 28px; }
    .eyebrow { color: var(--ui-accent, #8f485d); font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .auth-title { margin: 8px 0 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: clamp(1.9rem, 2.6vw, 2.5rem); font-weight: 400; line-height: 1.15; letter-spacing: -.5px; }
    .state-box { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
    .spinner { width: 34px; height: 34px; border: 2px solid var(--ui-line-soft, #e3e2e2); border-top-color: var(--ui-ink, #171717); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
    .icon-circle { display: inline-flex; width: 60px; height: 60px; align-items: center; justify-content: center; border: 1px solid var(--ui-success, #276749); background: var(--ui-success-bg, #edf8f1); color: var(--ui-success, #276749); font-size: 24px; }
    .icon-circle.fail { border-color: var(--ui-danger, #9b2c2c); background: var(--ui-danger-bg, #fff1f1); color: var(--ui-danger, #9b2c2c); }
    .message-text { margin: 0; color: var(--ui-ink-soft, #444748); font-size: 13px; line-height: 1.65; }
    .resend-section { width: 100%; padding: 18px; border: 1px solid var(--ui-line-soft, #e3e2e2); background: var(--ui-bg-soft, #f5f3f3); text-align: left; }
    .resend-section.sent { border-color: var(--ui-success, #276749); background: var(--ui-success-bg, #edf8f1); }
    .resend-prompt { margin: 0 0 10px; color: var(--ui-ink-soft, #444748); font-size: 12px; }
    .resend-form { display: flex; flex-direction: column; gap: 10px; }
    .resend-form input { height: 44px; padding: 0 12px; border: 1px solid var(--ui-line, #c4c7c7); border-radius: 0; background: #fff; font-size: 13px; outline: 0; }
    .resend-form input:focus-visible { border-color: var(--ui-ink, #171717); box-shadow: 0 0 0 1px var(--ui-ink, #171717); }
    .btn-resend { min-height: 44px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); font-size: 12px; font-weight: 800; letter-spacing: .8px; cursor: pointer; }
    .btn-resend:hover:not(:disabled) { background: var(--ui-ink, #171717); color: #fff; }
    .btn-resend:disabled { border-color: var(--ui-line, #c4c7c7); background: var(--ui-bg-image, #efeded); color: var(--ui-subtle, #747878); cursor: not-allowed; }
    .feedback-text { margin: 10px 0 0; color: var(--ui-danger, #9b2c2c); font-size: 12px; }
    .feedback-text.success { margin: 6px 0 0; color: var(--ui-success, #276749); }
    .btn-primary { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 28px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; background: var(--ui-ink, #171717); color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .8px; text-decoration: none; }
    .btn-primary:hover { background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); }
    .close-hint { margin: 0; color: var(--ui-subtle, #747878); font-size: 12px; }
    .back-link { align-self: center; margin-top: 28px; color: var(--ui-ink, #171717); font-size: 12px; font-weight: 700; letter-spacing: .6px; text-decoration: underline; text-underline-offset: 5px; }
    :is(button, a, input):focus-visible { outline: 2px solid var(--ui-accent, #8f485d); outline-offset: 3px; }
    @media (max-width: 980px) {
      .auth-page-container { grid-template-columns: 1fr; min-height: calc(100dvh - 72px); }
      .auth-visual { display: none; }
      .auth-card { width: 100%; max-width: 640px; margin: 0 auto; padding: 48px 40px; }
    }
    @media (max-width: 640px) {
      .auth-card { padding: 36px 20px; }
      .auth-logo { width: 170px; margin-bottom: 24px; }
      .btn-primary { width: 100%; }
    }
  `],
})
export class VerifyPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  readonly content = STORE_EMAIL_VERIFICATION_CONTENT.verifyPage;
  readonly verified = STORE_EMAIL_VERIFICATION_CONTENT.verified;
  readonly busy = signal<boolean>(true);
  readonly success = signal<boolean>(false);
  readonly message = signal<string>(STORE_EMAIL_VERIFICATION_CONTENT.verifyPage.busy);

  resendEmail = '';
  readonly resending = signal<boolean>(false);
  readonly resendFeedback = signal<string>('');
  readonly resendFeedbackSuccess = signal<boolean>(false);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.busy.set(false);
      this.success.set(false);
      this.message.set(this.content.missingToken);
      return;
    }

    this.api.verifyEmail(token).subscribe({
      next: () => {
        this.busy.set(false);
        this.success.set(true);
        this.message.set(this.content.success);
        this.notifyOtherTabs();
      },
      error: () => {
        this.busy.set(false);
        this.success.set(false);
        this.message.set(this.content.failed);
      },
    });
  }

  /** Báo cho tab đăng ký (cùng trình duyệt) biết để cập nhật ngay. Trình duyệt không hỗ trợ thì bỏ qua. */
  private notifyOtherTabs(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel(STORE_EMAIL_VERIFICATION_CONTENT.broadcastChannel);
      channel.postMessage({ type: 'email-verified' });
      channel.close();
    } catch { /* bỏ qua */ }
  }

  handleResend(): void {
    if (!this.resendEmail.trim()) return;
    this.resending.set(true);
    this.resendFeedback.set('');
    this.api.resendVerification(this.resendEmail.trim()).subscribe({
      next: () => {
        this.resending.set(false);
        this.resendFeedbackSuccess.set(true);
        this.resendFeedback.set(this.content.resendDone);
      },
      error: (err) => {
        this.resending.set(false);
        this.resendFeedbackSuccess.set(false);
        this.resendFeedback.set(this.content.resendFailed);
      },
    });
  }
}
