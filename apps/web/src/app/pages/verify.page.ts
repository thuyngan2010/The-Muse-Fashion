import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';

@Component({
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <main class="verify-page-container">
      <div class="verify-card">
        <span class="eyebrow">XÁC MINH TÀI KHOẢN</span>
        <h1 class="verify-title">Xác thực địa chỉ Email</h1>

        @if (busy()) {
          <div class="state-box">
            <div class="spinner"></div>
            <p>Đang tiến hành xác minh liên kết của bạn...</p>
          </div>
        } @else if (success()) {
          <div class="state-box success">
            <div class="icon-circle">✓</div>
            <p class="message-text">{{ message() }}</p>
            <a routerLink="/auth" class="btn-primary">Đăng nhập ngay →</a>
          </div>
        } @else {
          <div class="state-box error">
            <div class="icon-circle fail">✕</div>
            <p class="message-text">{{ message() }}</p>

            <div class="resend-section">
              <p class="resend-prompt">Chưa nhận được email hoặc liên kết đã hết hạn?</p>
              <form (ngSubmit)="handleResend()" class="resend-form">
                <input
                  type="email"
                  [(ngModel)]="resendEmail"
                  name="email"
                  placeholder="Nhập email của bạn"
                  required
                />
                <button type="submit" class="btn-resend" [disabled]="resending() || !resendEmail">
                  {{ resending() ? 'Đang gửi...' : 'Gửi lại email xác thực' }}
                </button>
              </form>
              @if (resendFeedback()) {
                <p class="feedback-text" [class.success]="resendFeedbackSuccess()">{{ resendFeedback() }}</p>
              }
            </div>

            <a routerLink="/auth" class="btn-outline">Quay lại đăng nhập</a>
          </div>
        }
      </div>
    </main>
  `,
  styles: [`
    .verify-page-container {
      min-height: calc(100vh - 200px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px 5vw;
      background: var(--color-canvas);
    }
    .verify-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.05);
    }
    .eyebrow {
      font-size: 0.72rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .verify-title {
      font-family: Georgia, serif;
      font-size: 1.8rem;
      margin: 8px 0 24px;
      font-weight: 500;
    }
    .state-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .icon-circle {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      background: #e8f5e9;
      color: #2e7d32;
    }
    .icon-circle.fail {
      background: #ffebee;
      color: #c62828;
    }
    .message-text {
      color: #444;
      line-height: 1.5;
      font-size: 0.95rem;
      margin: 0;
    }
    .resend-section {
      width: 100%;
      margin: 16px 0;
      padding: 16px;
      background: var(--color-canvas);
      border-radius: 6px;
      border: 1px solid var(--color-divider);
    }
    .resend-prompt {
      font-size: 0.85rem;
      color: var(--color-muted);
      margin: 0 0 10px;
    }
    .resend-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .resend-form input {
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      font-size: 0.9rem;
      outline: none;
    }
    .resend-form input:focus {
      border-color: var(--color-text);
    }
    .btn-resend {
      padding: 10px;
      background: var(--color-primary);
      color: #fff;
      border: 0;
      border-radius: var(--radius-control);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-resend:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .feedback-text {
      font-size: 0.8rem;
      margin: 8px 0 0;
      color: #c62828;
    }
    .feedback-text.success {
      color: #2e7d32;
    }


    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-text);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class VerifyPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  readonly busy = signal<boolean>(true);
  readonly success = signal<boolean>(false);
  readonly message = signal<string>('Đang xác minh liên kết...');

  resendEmail = '';
  readonly resending = signal<boolean>(false);
  readonly resendFeedback = signal<string>('');
  readonly resendFeedbackSuccess = signal<boolean>(false);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.busy.set(false);
      this.success.set(false);
      this.message.set('Liên kết xác minh không hợp lệ hoặc thiếu mã token.');
      return;
    }

    this.api.verifyEmail(token).subscribe({
      next: () => {
        this.busy.set(false);
        this.success.set(true);
        this.message.set('Địa chỉ email của bạn đã được xác minh thành công. Bạn đã có thể đăng nhập vào tài khoản.');
      },
      error: () => {
        this.busy.set(false);
        this.success.set(false);
        this.message.set('Liên kết xác minh đã hết hạn hoặc không còn hiệu lực.');
      },
    });
  }

  handleResend(): void {
    if (!this.resendEmail.trim()) return;
    this.resending.set(true);
    this.resendFeedback.set('');
    this.api.resendVerification(this.resendEmail.trim()).subscribe({
      next: (res) => {
        this.resending.set(false);
        this.resendFeedbackSuccess.set(true);
        this.resendFeedback.set(res.message || 'Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.');
      },
      error: (err) => {
        this.resending.set(false);
        this.resendFeedbackSuccess.set(false);
        this.resendFeedback.set(err.error?.message || 'Không thể gửi lại email xác minh.');
      },
    });
  }
}
