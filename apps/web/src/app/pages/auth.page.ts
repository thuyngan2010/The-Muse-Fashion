import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { ApiService } from '../services/api.service';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-page-container">
      <section class="auth-visual" aria-label="Bộ sưu tập MUSE">
        <img src="/assets/auth/muse-auth-model.png" alt="Người mẫu MUSE trong trang phục trắng">
      </section>

      <div class="auth-card">
        <header class="auth-header">
          <img class="auth-logo" src="/assets/brand/muse-logo-black.png" alt="MUSE">
          <h1 class="auth-title">{{ mode() === 'forgot' ? 'Quên mật khẩu' : mode() === 'reset' ? 'Đặt lại mật khẩu' : mode() === 'resend' ? 'Kích hoạt tài khoản' : isRegisterMode() ? 'Tạo tài khoản thành viên' : 'Đăng nhập tài khoản' }}</h1>
          <p class="auth-desc">
            {{ mode() === 'forgot' ? 'Nhập email đã liên kết với MUSE. Chúng tôi sẽ gửi bạn liên kết để đặt lại mật khẩu.' : mode() === 'reset' ? 'Tạo mật khẩu mới cho tài khoản MUSE của bạn.' : mode() === 'resend' ? 'Nhập email để nhận lại thư xác thực tài khoản MUSE.' : isRegisterMode() ? 'Khởi tạo hồ sơ khách hàng để đồng bộ trải nghiệm mua sắm thời trang của MUSE.' : 'Chào mừng quý cô quay trở lại với không gian thời trang MUSE.' }}
          </p>
        </header>

        @if (mode() === 'auth') {
        @if (!isRegisterMode()) {
          <form (ngSubmit)="handleLogin()" class="auth-form">
            <label class="form-group">
              <span>Địa chỉ email *</span>
              <input
                type="email"
                [(ngModel)]="loginEmail"
                name="email"
                placeholder="nhap@email.com"
                required
              />
            </label>

            <label class="form-group">
              <span>Mật khẩu *</span>
              <input
                type="password"
                [(ngModel)]="loginPassword"
                name="password"
                placeholder="••••••••"
                required
              />
            </label>

            <button type="submit" class="btn-submit" [disabled]="submitting()">
              <span>{{ submitting() ? 'Đang xác thực...' : 'Đăng nhập' }}</span><span aria-hidden="true">→</span>
            </button>
          </form>
          <div class="auth-aux-links">
            <a routerLink="/forgot-password">QUÊN MẬT KHẨU?</a>
            <button type="button" class="link-btn" (click)="mode.set('resend')">Gửi lại thư kích hoạt tài khoản</button>
          </div>
          <div class="mode-switch">
            <span>Chưa có tài khoản?</span>
            <button type="button" class="link-btn" [class.active]="isRegisterMode()" (click)="isRegisterMode.set(true)">Tạo tài khoản mới</button>
          </div>
        } @else {
          <form (ngSubmit)="handleRegister()" class="auth-form">
            <label class="form-group">
              <span>Họ và tên *</span>
              <input
                type="text"
                [(ngModel)]="regFullName"
                name="fullName"
                placeholder="VD: Lê Phương Thảo"
                required
              />
            </label>

            <label class="form-group">
              <span>Địa chỉ email *</span>
              <input
                type="email"
                [(ngModel)]="regEmail"
                name="email"
                placeholder="name@example.com"
                required
              />
            </label>

            <label class="form-group">
              <span>Mật khẩu *</span>
              <input
                type="password"
                [(ngModel)]="regPassword"
                name="password"
                placeholder="Tối thiểu 12 ký tự"
                minlength="12"
                required
              />
            </label>
            <p class="password-rule">Ít nhất 12 ký tự, có chữ hoa, chữ thường và số.</p>

            <button type="submit" class="btn-submit" [disabled]="submitting()">
              <span>{{ submitting() ? 'Đang tạo tài khoản...' : 'Tạo tài khoản' }}</span><span aria-hidden="true">→</span>
            </button>
          </form>
          <div class="mode-switch">
            <span>Đã có tài khoản?</span>
            <button type="button" class="link-btn" [class.active]="!isRegisterMode()" (click)="isRegisterMode.set(false)">Đăng nhập ngay</button>
          </div>
        }
        } @else if (mode() === 'forgot') {
          <form (ngSubmit)="handleForgotPassword()" class="auth-form">
            <label class="form-group"><span>Địa chỉ email *</span><input type="email" name="forgotEmail" [(ngModel)]="forgotEmail" placeholder="nhap@email.com" required /></label>
            <button type="submit" class="btn-submit" [disabled]="submitting()"><span>{{ submitting() ? 'Đang gửi...' : 'Gửi liên kết đặt lại' }}</span><span aria-hidden="true">→</span></button>
          </form>
          <p class="back-row"><a class="back-link" routerLink="/auth">← Quay lại đăng nhập</a></p>
        } @else if (mode() === 'resend') {
          <form (ngSubmit)="handleResendVerification()" class="auth-form">
            <label class="form-group"><span>Email tài khoản *</span><input type="email" name="resendEmail" [(ngModel)]="resendEmail" placeholder="nhap@email.com" required /></label>
            <button type="submit" class="btn-submit" [disabled]="submitting()"><span>{{ submitting() ? 'Đang gửi...' : 'Gửi lại email xác thực' }}</span><span aria-hidden="true">→</span></button>
          </form>
          <p class="back-row"><button type="button" class="link-btn back-link" (click)="mode.set('auth')">← Quay lại đăng nhập</button></p>
        } @else {
          <form (ngSubmit)="handleResetPassword()" class="auth-form">
            <label class="form-group"><span>Mật khẩu mới *</span><input type="password" name="resetPassword" [(ngModel)]="resetPassword" placeholder="Tối thiểu 12 ký tự" minlength="12" required /></label>
            <p class="password-rule">Ít nhất 12 ký tự, có chữ hoa, chữ thường và số.</p>
            <label class="form-group"><span>Xác nhận mật khẩu *</span><input type="password" name="resetConfirm" [(ngModel)]="resetConfirm" placeholder="Nhập lại mật khẩu mới" minlength="12" required /></label>
            <button type="submit" class="btn-submit" [disabled]="submitting()"><span>{{ submitting() ? 'Đang cập nhật...' : 'Đặt lại mật khẩu' }}</span><span aria-hidden="true">→</span></button>
          </form>
          <p class="back-row"><a class="back-link" routerLink="/auth">← Quay lại đăng nhập</a></p>
        }
      </div>
    </main>
  `,
  styles: [`
    :host {
      display: block;
      background: #fff;
    }
    .auth-page-container {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      min-height: calc(100dvh - 80px);
      background: #fff;
    }
    .auth-visual {
      position: relative;
      min-height: 814px;
      overflow: hidden;
      background: #d7d3c9;
    }
    .auth-visual img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center center;
    }
    .auth-card {
      width: 100%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 56px clamp(48px, 7vw, 90px);
      background: #fff;
    }
    .auth-header {
      text-align: center;
      margin-bottom: 26px;
      padding-bottom: 32px;
      border-bottom: 1px solid #dedede;
    }
    .auth-logo {
      display: block;
      width: min(235px, 58%);
      height: auto;
      margin: 0 auto 30px;
    }
    .auth-title {
      margin: 0 0 12px;
      color: #000;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2.25rem, 3.25vw, 3rem);
      font-weight: 400;
      line-height: 1.08;
      letter-spacing: -0.045em;
    }
    .auth-desc {
      max-width: 520px;
      margin: 0 auto;
      color: #5d5d5d;
      font-size: 15px;
      font-weight: 400;
      line-height: 1.55;
      letter-spacing: 0.02em;
    }
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 22px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: #000;
    }
    .form-group > span {
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: 1.1px;
      text-transform: uppercase;
    }
    .form-group input {
      width: 100%;
      height: 48px;
      padding: 0 16px;
      border: 1px solid #c8c8c8;
      border-radius: 0;
      background: #fff;
      color: #171717;
      font: inherit;
      font-size: 15px;
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .form-group input::placeholder { color: #777; opacity: 1; }
    .form-group input:focus-visible {
      border-color: #000;
      box-shadow: 0 0 0 1px #000;
    }
    .password-rule {
      margin: -14px 0 0;
      color: #7a7a7a;
      font-size: 12px;
      line-height: 1.5;
      letter-spacing: 0.02em;
    }
    .btn-submit {
      width: 100%;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-top: 4px;
      padding: 12px 22px;
      border: 2px solid #000;
      border-radius: 0;
      background: #f6d2d8;
      color: #000;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 1.25px;
      text-transform: uppercase;
      cursor: pointer;
      transition: background-color 150ms ease, color 150ms ease;
    }
    .btn-submit:hover:not(:disabled) {
      background: #000;
      color: #fff;
    }
    .btn-submit:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .btn-submit:focus-visible,
    .link-btn:focus-visible,
    .auth-aux-links a:focus-visible,
    .back-link:focus-visible {
      outline: 2px solid #000;
      outline-offset: 4px;
    }
    .auth-aux-links {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin-top: 16px;
      font-size: 12px;
      line-height: 1.5;
    }
    .auth-aux-links a {
      order: 2;
      color: #000;
      font-weight: 700;
      letter-spacing: 0.65px;
      text-decoration: underline;
      text-underline-offset: 4px;
    }
    .link-btn {
      padding: 0;
      border: 0;
      background: none;
      color: #000;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.5;
      text-decoration: underline;
      text-underline-offset: 4px;
      cursor: pointer;
    }
    .auth-aux-links > .link-btn { order: 1; color: #8b455b; }
    .mode-switch {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 40px;
      padding-top: 26px;
      border-top: 1px solid #dedede;
      color: #5d5d5d;
      font-size: 14px;
    }
    .mode-switch .link-btn {
      color: #000;
      font-size: 14px;
      font-weight: 700;
    }
    .back-row {
      margin: 22px 0 0;
      text-align: center;
    }
    .back-link {
      color: #e52d32;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-decoration: none;
      text-transform: uppercase;
    }
    button.back-link { font-family: inherit; }
    @media (max-width: 900px) {
      .auth-page-container { grid-template-columns: 1fr; min-height: calc(100dvh - 72px); }
      .auth-visual { display: none; }
      .auth-card { max-width: 640px; min-height: calc(100dvh - 72px); margin: 0 auto; padding: 48px 40px; }
    }
    @media (max-width: 560px) {
      .auth-card { padding: 36px 20px; }
      .auth-logo { width: 170px; margin-bottom: 28px; }
      .auth-header { margin-bottom: 24px; padding-bottom: 26px; }
      .auth-title { font-size: 2.15rem; }
      .auth-desc { font-size: 14px; }
      .form-group input { height: 50px; }
      .auth-aux-links { align-items: flex-start; flex-direction: column; }
      .mode-switch { margin-top: 32px; }
    }
  `],
})
export class AuthPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);

  readonly isRegisterMode = signal<boolean>(false);
  readonly registered = signal(false);
  readonly submitting = signal<boolean>(false);
  readonly mode = signal<'auth' | 'forgot' | 'reset' | 'resend'>('auth');
  forgotEmail = '';
  resendEmail = '';
  resetPassword = '';
  resetConfirm = '';
  private resetToken = '';

  loginEmail = '';
  loginPassword = '';

  regFullName = '';
  regEmail = '';
  regPassword = '';

  private returnUrl = '/';

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path;
    this.mode.set(path === 'forgot-password' ? 'forgot' : path === 'reset-password' ? 'reset' : 'auth');
    this.resetToken = this.route.snapshot.queryParamMap.get('token') || '';
    const requested = this.route.snapshot.queryParams['returnUrl'];
    this.returnUrl = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
    if (this.mode() === 'auth' && this.auth.isAuthenticated()) {
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  handleForgotPassword(): void {
    if (!this.forgotEmail) return;
    this.submitting.set(true);
    this.api.forgotPassword(this.forgotEmail).subscribe({
      next: () => { this.submitting.set(false); this.toast.success('Nếu email tồn tại, liên kết đặt lại đã được gửi.'); },
      error: err => { this.submitting.set(false); this.toast.error(err.error?.message || 'Không thể gửi liên kết.'); },
    });
  }

  handleResendVerification(): void {
    if (!this.resendEmail) return;
    this.submitting.set(true);
    this.api.resendVerification(this.resendEmail.trim()).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(res.message || 'Nếu tài khoản chưa xác thực, email kích hoạt đã được gửi.');
        this.mode.set('auth');
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'Không thể gửi lại email xác thực.');
      },
    });
  }

  handleResetPassword(): void {
    if (!this.resetToken) { this.toast.error('Liên kết đặt lại không hợp lệ.'); return; }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/.test(this.resetPassword)) {
      this.toast.warning('Mật khẩu cần 12–128 ký tự, có chữ hoa, chữ thường và số.'); return;
    }
    if (this.resetPassword !== this.resetConfirm) { this.toast.warning('Mật khẩu xác nhận không khớp.'); return; }
    this.submitting.set(true);
    this.api.resetPassword(this.resetToken, this.resetPassword).subscribe({
      next: () => { this.submitting.set(false); this.toast.success('Đã đặt lại mật khẩu. Vui lòng đăng nhập.'); this.router.navigate(['/auth']); },
      error: err => { this.submitting.set(false); this.toast.error(err.error?.message || 'Không thể đặt lại mật khẩu.'); },
    });
  }

  handleLogin(): void {
    if (!this.loginEmail || !this.loginPassword) {
      this.toast.warning('Vui lòng nhập email và mật khẩu.');
      return;
    }

    this.submitting.set(true);
    this.auth.login(this.loginEmail, this.loginPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.returnUrl === '/' && this.auth.isStaff() ? '/admin' : this.returnUrl);
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'Email hoặc mật khẩu không chính xác.');
      },
    });
  }

  handleRegister(): void {
    if (!this.regFullName || !this.regEmail || !this.regPassword) {
      this.toast.warning('Vui lòng điền đầy đủ các thông tin bắt buộc.');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/.test(this.regPassword)) {
      this.toast.warning('Mật khẩu cần 12–128 ký tự, có chữ hoa, chữ thường và số.');
      return;
    }

    this.submitting.set(true);
    this.auth.register({
      fullName: this.regFullName,
      email: this.regEmail,
      password: this.regPassword,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.registered.set(true);
        this.isRegisterMode.set(false);
        this.loginEmail = this.regEmail;
        this.regPassword = '';
        this.toast.success('Kiểm tra email để xác minh tài khoản trước khi đăng nhập.');
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo tài khoản. Vui lòng thử lại.');
      },
    });
  }
}
