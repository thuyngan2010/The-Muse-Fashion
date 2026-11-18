import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { ApiService } from '../services/api.service';
import { GoogleIdentityService } from '../services/google-identity.service';
import { STORE_AUTH_CONTENT, STORE_EMAIL_VERIFICATION_CONTENT } from '../shared/store-content';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-page-container">
      <section class="auth-visual" aria-label="Bộ sưu tập MUSE">
        <div class="visual-img">
          <img src="/assets/auth/muse-auth-model.png" alt="Người mẫu MUSE trong trang phục trắng">
        </div>
        @if (mode() === 'auth' && isRegisterMode()) {
          <aside class="privileges" aria-label="Đặc quyền thành viên">
            <h2>{{ content.privileges.title }}</h2>
            <p>{{ content.privileges.intro }}</p>
            <ul>
              @for (item of content.privileges.items; track item.title) {
                <li><span aria-hidden="true">✓</span><span><strong>{{ item.title }}:</strong> {{ item.text }}</span></li>
              }
            </ul>
          </aside>
        }
      </section>

      <div class="auth-card">
        <header class="auth-header">
          <img class="auth-logo" src="/assets/brand/muse-logo-black.png" alt="MUSE">
          <h1 class="auth-title">{{ mode() === 'pending' ? pendingTitle() : mode() === 'forgot' ? 'Quên mật khẩu' : mode() === 'reset' ? 'Đặt lại mật khẩu' : mode() === 'resend' ? 'Kích hoạt tài khoản' : isRegisterMode() ? 'Tạo tài khoản thành viên' : 'Đăng nhập tài khoản' }}</h1>
          @if (mode() !== 'pending') {
          <p class="auth-desc">
            {{ mode() === 'forgot' ? 'Nhập email đã liên kết với MUSE. Chúng tôi sẽ gửi bạn liên kết để đặt lại mật khẩu.' : mode() === 'reset' ? 'Tạo mật khẩu mới cho tài khoản MUSE của bạn.' : mode() === 'resend' ? 'Nhập email để nhận lại thư xác thực tài khoản MUSE.' : isRegisterMode() ? 'Khởi tạo hồ sơ khách hàng để đồng bộ trải nghiệm mua sắm thời trang của MUSE.' : 'Chào mừng quý cô quay trở lại với không gian thời trang MUSE.' }}
          </p>
          }
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
              <span class="pw-field"><input
                [type]="isShown('login') ? 'text' : 'password'"
                [(ngModel)]="loginPassword"
                id="login-password"
                name="password"
                placeholder="••••••••"
                required
              />
                <button type="button" class="pw-eye" (click)="toggleShow('login')" [attr.aria-label]="isShown('login') ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" [attr.aria-pressed]="isShown('login')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle>@if (isShown('login')) {<line x1="3" y1="3" x2="21" y2="21"></line>}</svg>
                </button></span>
            </label>

            <button type="submit" class="btn-submit" [disabled]="submitting()">
              <span>{{ submitting() ? 'Đang xác thực...' : 'Đăng nhập' }}</span><span aria-hidden="true">→</span>
            </button>
          </form>
          @if (googleAvailable()) {
            <div class="or-divider" role="separator"><span>{{ content.google.divider }}</span></div>
            <div #googleHost class="google-btn"></div>
          }
          @if (unverified()) {
            <div class="notice-warn" role="alert">
              <p>{{ unverifiedMessage() }}</p>
              <p class="notice-hint">{{ unverifiedContent.hint }}</p>
              <button type="button" class="btn-outline" [disabled]="resendBusy()" (click)="resendFromLogin()">{{ resendBusy() ? pendingContent.resending : unverifiedContent.resend }}</button>
            </div>
          }
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
              <span class="pw-field"><input
                [type]="isShown('reg') ? 'text' : 'password'"
                [(ngModel)]="regPassword"
                name="password"
                placeholder="Tối thiểu 12 ký tự"
                minlength="12"
                required
              />
                <button type="button" class="pw-eye" (click)="toggleShow('reg')" [attr.aria-label]="isShown('reg') ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" [attr.aria-pressed]="isShown('reg')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle>@if (isShown('reg')) {<line x1="3" y1="3" x2="21" y2="21"></line>}</svg>
                </button></span>
            </label>
            <div class="strength" aria-live="polite">
              <div class="strength-head"><span>Độ mạnh: {{ strengthText(regPassword) }}</span></div>
              <div class="strength-bars"><span [class.on]="strength(regPassword).level >= 1"></span><span [class.on]="strength(regPassword).level >= 2"></span><span [class.on]="strength(regPassword).level >= 3"></span></div>
            </div>
            <p class="password-rule">{{ content.passwordRule }}</p>

            <label class="form-group">
              <span>Xác nhận mật khẩu *</span>
              <span class="pw-field"><input
                [type]="isShown('regConfirm') ? 'text' : 'password'"
                [(ngModel)]="regConfirm"
                name="confirmPassword"
                placeholder="Nhập lại mật khẩu"
                required
              />
                <button type="button" class="pw-eye" (click)="toggleShow('regConfirm')" [attr.aria-label]="isShown('regConfirm') ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" [attr.aria-pressed]="isShown('regConfirm')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle>@if (isShown('regConfirm')) {<line x1="3" y1="3" x2="21" y2="21"></line>}</svg>
                </button></span>
            </label>

            <label class="terms-row">
              <input type="checkbox" [(ngModel)]="regTerms" name="terms" />
              <span>{{ content.terms }}</span>
            </label>

            <button type="submit" class="btn-submit" [disabled]="submitting() || !regTerms">
              <span>{{ submitting() ? 'Đang tạo tài khoản...' : 'Tạo tài khoản' }}</span><span aria-hidden="true">→</span>
            </button>
          </form>
          @if (googleAvailable()) {
            <div class="or-divider" role="separator"><span>{{ content.google.divider }}</span></div>
            <div #googleHost class="google-btn"></div>
          }
          <div class="mode-switch">
            <span>Đã có tài khoản?</span>
            <button type="button" class="link-btn" [class.active]="!isRegisterMode()" (click)="isRegisterMode.set(false)">Đăng nhập ngay</button>
          </div>
        }
        } @else if (mode() === 'pending') {
          <section class="pending" aria-live="polite">
            @if (pendingStatus() === 'VERIFIED') {
              <div class="pending-icon ok" aria-hidden="true">✓</div>
              <p class="pending-text">{{ verifiedContent.prefix }} <strong>{{ pendingEmail() }}</strong> {{ verifiedContent.suffix }}</p>
              <button type="button" class="btn-submit" (click)="goToLogin()"><span>{{ verifiedContent.cta }}</span><span aria-hidden="true">→</span></button>
            } @else if (pendingStatus() === 'EXPIRED') {
              <div class="pending-icon fail" aria-hidden="true">!</div>
              <p class="pending-text">{{ expiredContent.text }}</p>
              <button type="button" class="btn-submit" [disabled]="resendCooldown() > 0 || resendBusy()" (click)="resendVerification()">
                <span>{{ resendLabel() }}</span><span aria-hidden="true">→</span>
              </button>
              @if (resendNotice()) { <p class="pending-feedback" [class.error]="resendFailed()" role="status">{{ resendNotice() }}</p> }
              <button type="button" class="btn-outline" (click)="goToLogin(false)">{{ expiredContent.backToLogin }}</button>
            } @else {
              <div class="pending-icon" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="0"></rect><path d="M3 7l9 6 9-6"></path></svg>
              </div>
              <p class="pending-text">{{ pendingContent.sentPrefix }} <strong>{{ pendingEmail() }}</strong>. {{ pendingContent.sentSuffix }}</p>
              @if (pendingToken()) {
                <p class="pending-status" role="status"><span class="spinner-sm" aria-hidden="true"></span>{{ pendingContent.waiting }}</p>
              } @else {
                <p class="pending-hint">{{ pendingContent.noTokenHint }}</p>
              }
              <button type="button" class="btn-submit" [disabled]="resendCooldown() > 0 || resendBusy()" (click)="resendVerification()">
                <span>{{ resendLabel() }}</span><span aria-hidden="true">→</span>
              </button>
              @if (resendNotice()) { <p class="pending-feedback" [class.error]="resendFailed()" role="status">{{ resendNotice() }}</p> }
              <p class="pending-hint">{{ pendingContent.spamNote }}</p>
              <p class="pending-wrong">{{ pendingContent.wrongEmail }} <button type="button" class="link-btn" (click)="registerAgain()">{{ pendingContent.registerAgain }}</button></p>
            }
          </section>
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
            <label class="form-group"><span>Mật khẩu mới *</span><span class="pw-field"><input [type]="isShown('reset') ? 'text' : 'password'" name="resetPassword" [(ngModel)]="resetPassword" placeholder="Tối thiểu 12 ký tự" minlength="12" required />
              <button type="button" class="pw-eye" (click)="toggleShow('reset')" [attr.aria-label]="isShown('reset') ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" [attr.aria-pressed]="isShown('reset')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle>@if (isShown('reset')) {<line x1="3" y1="3" x2="21" y2="21"></line>}</svg>
                </button></span></label>
            <div class="strength" aria-live="polite">
              <div class="strength-head"><span>Độ mạnh: {{ strengthText(resetPassword) }}</span></div>
              <div class="strength-bars"><span [class.on]="strength(resetPassword).level >= 1"></span><span [class.on]="strength(resetPassword).level >= 2"></span><span [class.on]="strength(resetPassword).level >= 3"></span></div>
            </div>
            <p class="password-rule">{{ content.passwordRule }}</p>
            <label class="form-group"><span>Xác nhận mật khẩu *</span><span class="pw-field"><input [type]="isShown('resetConfirm') ? 'text' : 'password'" name="resetConfirm" [(ngModel)]="resetConfirm" placeholder="Nhập lại mật khẩu mới" minlength="12" required />
              <button type="button" class="pw-eye" (click)="toggleShow('resetConfirm')" [attr.aria-label]="isShown('resetConfirm') ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" [attr.aria-pressed]="isShown('resetConfirm')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle>@if (isShown('resetConfirm')) {<line x1="3" y1="3" x2="21" y2="21"></line>}</svg>
                </button></span></label>
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
    .auth-visual { display: flex; flex-direction: column; }
    .visual-img { position: relative; flex: 1 1 auto; min-height: 814px; overflow: hidden; }
    .visual-img img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
    .privileges { padding: 24px 32px 32px; border-top: 1px solid #e4e4e4; background: #f9f9f9; color: #171717; }
    .privileges h2 { margin: 0 0 8px; font: 400 20px/28px Georgia, "Times New Roman", serif; }
    .privileges p { margin: 0 0 14px; color: #5d5d5d; font-size: 13px; line-height: 1.55; }
    .privileges ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; font-size: 12px; line-height: 1.5; }
    .privileges li { display: flex; gap: 10px; }
    .privileges li > span:first-child { color: #8b455b; font-weight: 700; }
    .pw-field { position: relative; display: block; }
    .pw-field input { padding-right: 48px; }
    .pw-eye { position: absolute; top: 0; right: 0; width: 48px; height: 48px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: none; color: #444; cursor: pointer; }
    .pw-eye:hover { color: #000; }
    .pw-eye:focus-visible { outline: 2px solid #000; outline-offset: -2px; }
    .strength { margin-top: -14px; }
    .strength-head { display: flex; justify-content: flex-end; margin-bottom: 6px; color: #8b455b; font-size: 11px; font-weight: 600; letter-spacing: .6px; }
    .strength-bars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .strength-bars span { height: 3px; background: #f6d2d8; }
    .strength-bars span.on { background: #8b455b; }
    .strength + .password-rule { margin-top: 6px; }
    .terms-row { display: flex; align-items: flex-start; gap: 10px; color: #444; font-size: 12px; line-height: 1.5; cursor: pointer; }
    .terms-row input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: #000; flex: none; }
    @media (max-width: 900px) { .visual-img, .privileges { display: none; } }
    .or-divider { display: flex; align-items: center; gap: 14px; margin: 22px 0 18px; color: #5d5d5d; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
    .or-divider::before, .or-divider::after { content: ''; flex: 1; height: 1px; background: #dedede; }
    .google-btn { display: flex; justify-content: center; width: 100%; min-height: 44px; }
    .pending { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; }
    .pending-icon { display: inline-flex; width: 64px; height: 64px; align-items: center; justify-content: center; border: 1px solid #171717; background: #f9eef0; color: #171717; font-size: 26px; }
    .pending-icon.ok { border-color: #276749; background: #edf8f1; color: #276749; }
    .pending-icon.fail { border-color: #9b2c2c; background: #fff1f1; color: #9b2c2c; font-weight: 700; }
    .pending-text { margin: 0; color: #444748; font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }
    .pending-text strong { color: #171717; }
    .pending-status { display: inline-flex; align-items: center; gap: 10px; margin: 0; color: #5d5d5d; font-size: 13px; }
    .spinner-sm { width: 16px; height: 16px; border: 2px solid #e3e2e2; border-top-color: #171717; border-radius: 50%; animation: pending-spin .8s linear infinite; }
    @keyframes pending-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner-sm { animation: none; } }
    .pending-hint { margin: 0; color: #5d5d5d; font-size: 12px; line-height: 1.55; }
    .pending-feedback { margin: 0; color: #276749; font-size: 12px; }
    .pending-feedback.error { color: #9b2c2c; }
    .pending-wrong { margin: 0; color: #444748; font-size: 13px; }
    .pending .btn-submit { margin-top: 4px; }
    .btn-outline { min-height: 44px; padding: 0 22px; border: 1px solid #171717; border-radius: 0; background: #fff; color: #171717; font: inherit; font-size: 12px; font-weight: 800; letter-spacing: .8px; cursor: pointer; }
    .btn-outline:hover:not(:disabled) { background: #171717; color: #fff; }
    .btn-outline:disabled { border-color: #c4c7c7; color: #747878; cursor: not-allowed; }
    .notice-warn { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 18px; padding: 16px; border: 1px solid #b7791f; border-left-width: 3px; background: #fffaf0; color: #5f370e; font-size: 13px; line-height: 1.55; }
    .notice-warn p { margin: 0; }
    .notice-hint { color: #744210; font-size: 12px; }
  `],
})
export class AuthPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly google = inject(GoogleIdentityService);

  readonly content = STORE_AUTH_CONTENT;
  readonly pendingContent = STORE_EMAIL_VERIFICATION_CONTENT.pending;
  readonly verifiedContent = STORE_EMAIL_VERIFICATION_CONTENT.verified;
  readonly expiredContent = STORE_EMAIL_VERIFICATION_CONTENT.expired;
  readonly unverifiedContent = STORE_EMAIL_VERIFICATION_CONTENT.unverified;
  private readonly shown = signal<Record<string, boolean>>({});
  isShown(key: string): boolean { return !!this.shown()[key]; }
  toggleShow(key: string): void { this.shown.update(v => ({ ...v, [key]: !v[key] })); }

  /** Độ mạnh 3 nấc theo 4 quy tắc thật: 12 ký tự, chữ hoa, chữ thường, số. */
  strength(pw: string): { score: number; level: number } {
    const score = [pw.length >= 12, /[A-Z]/.test(pw), /[a-z]/.test(pw), /\d/.test(pw)].filter(Boolean).length;
    return { score, level: score === 0 ? 0 : score <= 2 ? 1 : score === 3 ? 2 : 3 };
  }
  strengthText(pw: string): string { return this.content.strengthLabels[this.strength(pw).level] || '—'; }

  readonly isRegisterMode = signal<boolean>(false);
  readonly registered = signal(false);
  readonly submitting = signal<boolean>(false);
  readonly mode = signal<'auth' | 'forgot' | 'reset' | 'resend' | 'pending'>('auth');

  // --- Màn hình chờ xác thực email ---
  private static readonly PENDING_KEY = 'muse-auth-pending';
  private static readonly RESEND_COOLDOWN_SECONDS = 60;
  private static readonly POLL_INTERVAL_MS = 5000;
  readonly pendingEmail = signal('');
  readonly pendingToken = signal('');
  readonly pendingStatus = signal<'PENDING' | 'VERIFIED' | 'EXPIRED'>('PENDING');
  readonly resendCooldown = signal(0);
  readonly resendBusy = signal(false);
  readonly resendNotice = signal('');
  readonly resendFailed = signal(false);
  readonly unverified = signal(false);
  readonly unverifiedMessage = signal('');
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;
  private channel: BroadcastChannel | null = null;
  private checking = false;

  pendingTitle(): string {
    return this.pendingStatus() === 'VERIFIED' ? this.verifiedContent.title
      : this.pendingStatus() === 'EXPIRED' ? this.expiredContent.title : this.pendingContent.title;
  }
  resendLabel(): string {
    if (this.resendBusy()) return this.pendingContent.resending;
    return this.resendCooldown() > 0 ? `${this.pendingContent.resendIn} ${this.resendCooldown()}s` : this.pendingContent.resend;
  }
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
  regConfirm = '';
  regTerms = false;

  private returnUrl = '/';

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path;
    this.mode.set(path === 'forgot-password' ? 'forgot' : path === 'reset-password' ? 'reset' : 'auth');
    this.resetToken = this.route.snapshot.queryParamMap.get('token') || '';
    const requested = this.route.snapshot.queryParams['returnUrl'];
    this.returnUrl = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
    if (this.mode() === 'auth' && this.auth.isAuthenticated()) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
    if (this.mode() === 'auth') this.restorePending();
    this.openChannel();
    if (this.mode() === 'forgot') {
      const state = history.state as { email?: unknown } | null;
      if (typeof state?.email === 'string') this.forgotEmail = state.email;
    }
    if (this.mode() === 'auth' && this.google.configured) {
      this.googleSub = this.google.credential$.subscribe((credential) => this.handleGoogleCredential(credential));
      void this.google.load().then((ok) => this.googleAvailable.set(ok));
    }
  }

  // --- Đăng nhập bằng Google ---
  readonly googleAvailable = signal(false);
  private googleSub: Subscription | null = null;

  /** Nút Google nằm trong form đăng nhập hoặc đăng ký; mỗi lần phần tử xuất hiện thì vẽ lại nút. */
  @ViewChild('googleHost') set googleHost(ref: ElementRef<HTMLElement> | undefined) {
    if (!ref) return;
    const text = this.isRegisterMode() ? 'signup_with' : 'signin_with';
    void this.google.renderButton(ref.nativeElement, text).then((ok) => { if (!ok) this.googleAvailable.set(false); });
  }

  private handleGoogleCredential(credential: string): void {
    if (this.submitting() || this.mode() !== 'auth') return;
    this.submitting.set(true);
    this.auth.loginWithGoogle(credential).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.returnUrl === '/' && this.auth.isStaff() ? '/admin' : this.returnUrl);
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(typeof err.error?.message === 'string' && err.error.message ? err.error.message : this.content.google.error);
      },
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.googleSub?.unsubscribe();
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.channel?.close();
    this.channel = null;
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'visible') this.checkStatus();
  }

  private restorePending(): void {
    try {
      const raw = sessionStorage.getItem(AuthPage.PENDING_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { email?: unknown; token?: unknown };
      if (typeof data.email !== 'string' || !data.email) return;
      this.enterPending(data.email, typeof data.token === 'string' ? data.token : '', false);
    } catch { /* trình duyệt chặn sessionStorage hoặc dữ liệu hỏng: bỏ qua */ }
  }

  private persistPending(email: string, token: string): void {
    try { sessionStorage.setItem(AuthPage.PENDING_KEY, JSON.stringify({ email, token })); } catch { /* bỏ qua */ }
  }

  private clearPending(): void {
    try { sessionStorage.removeItem(AuthPage.PENDING_KEY); } catch { /* bỏ qua */ }
  }

  private enterPending(email: string, token: string, persist: boolean): void {
    this.pendingEmail.set(email);
    this.pendingToken.set(token);
    this.pendingStatus.set('PENDING');
    this.resendNotice.set('');
    this.resendFailed.set(false);
    this.unverified.set(false);
    this.mode.set('pending');
    if (persist) this.persistPending(email, token);
    this.startPolling();
    this.checkStatus();
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.pendingToken()) return;
    this.pollTimer = setInterval(() => { if (document.visibilityState === 'visible') this.checkStatus(); }, AuthPage.POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private openChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.channel = new BroadcastChannel(STORE_EMAIL_VERIFICATION_CONTENT.broadcastChannel);
      this.channel.onmessage = (event: MessageEvent) => {
        // Chỉ xác nhận qua API, tránh nhầm khi người dùng xác thực một tài khoản khác trên cùng trình duyệt.
        if (event.data?.type === 'email-verified') this.checkStatus();
      };
    } catch { this.channel = null; }
  }

  private checkStatus(): void {
    const token = this.pendingToken();
    if (this.mode() !== 'pending' || !token || this.pendingStatus() !== 'PENDING' || this.checking) return;
    this.checking = true;
    this.api.registrationStatus(token).subscribe({
      next: ({ status }) => {
        this.checking = false;
        if (status === 'VERIFIED') { this.pendingStatus.set('VERIFIED'); this.stopPolling(); this.clearPending(); }
        else if (status === 'EXPIRED') { this.pendingStatus.set('EXPIRED'); this.stopPolling(); }
      },
      error: () => { this.checking = false; },
    });
  }

  private startCooldown(): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.resendCooldown.set(AuthPage.RESEND_COOLDOWN_SECONDS);
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(Math.max(0, next));
      if (next <= 0 && this.cooldownTimer) { clearInterval(this.cooldownTimer); this.cooldownTimer = null; }
    }, 1000);
  }

  resendVerification(): void {
    if (this.resendCooldown() > 0 || this.resendBusy() || !this.pendingEmail()) return;
    this.sendVerification(this.pendingEmail(), () => { /* ở lại màn hình chờ */ });
  }

  resendFromLogin(): void {
    const email = this.loginEmail.trim();
    if (!email || this.resendBusy()) return;
    this.sendVerification(email, () => {
      this.enterPending(email, '', true);
      this.resendNotice.set(this.pendingContent.resendSent);
      this.resendFailed.set(false);
      this.startCooldown();
    });
  }

  private sendVerification(email: string, onSent: () => void): void {
    this.resendBusy.set(true);
    this.resendNotice.set('');
    this.api.resendVerification(email).subscribe({
      next: () => {
        this.resendBusy.set(false);
        this.resendNotice.set(this.pendingContent.resendSent);
        this.resendFailed.set(false);
        this.startCooldown();
        onSent();
      },
      error: (err) => {
        this.resendBusy.set(false);
        this.resendFailed.set(true);
        this.resendNotice.set(err?.status === 429 ? 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.' : this.pendingContent.resendFailed);
        if (err?.status === 429) this.startCooldown();
        if (this.mode() !== 'pending') this.toast.error(this.resendNotice());
      },
    });
  }

  registerAgain(): void {
    this.stopPolling();
    this.clearPending();
    this.pendingToken.set('');
    this.pendingStatus.set('PENDING');
    this.regPassword = '';
    this.regConfirm = '';
    this.regTerms = false;
    this.isRegisterMode.set(true);
    this.mode.set('auth');
  }

  goToLogin(fillEmail = true): void {
    this.stopPolling();
    this.clearPending();
    if (fillEmail || this.pendingEmail()) this.loginEmail = this.pendingEmail();
    this.loginPassword = '';
    this.pendingToken.set('');
    this.pendingStatus.set('PENDING');
    this.unverified.set(false);
    this.isRegisterMode.set(false);
    this.mode.set('auth');
    setTimeout(() => document.getElementById('login-password')?.focus());
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

    this.unverified.set(false);
    this.submitting.set(true);
    this.auth.login(this.loginEmail, this.loginPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.returnUrl === '/' && this.auth.isStaff() ? '/admin' : this.returnUrl);
      },
      error: (err) => {
        this.submitting.set(false);
        const message = typeof err.error?.message === 'string' ? err.error.message : '';
        if (err.error?.code === 'EMAIL_NOT_VERIFIED' || /must be active and verified/i.test(message)) {
          this.unverifiedMessage.set(err.error?.code === 'EMAIL_NOT_VERIFIED' && message ? message
            : 'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác thực.');
          this.unverified.set(true);
          return;
        }
        this.toast.error(message || 'Email hoặc mật khẩu không chính xác.');
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
    if (this.regPassword !== this.regConfirm) { this.toast.warning('Mật khẩu xác nhận không khớp.'); return; }
    if (!this.regTerms) { this.toast.warning(this.content.termsRequired); return; }

    this.submitting.set(true);
    this.auth.register({
      fullName: this.regFullName,
      email: this.regEmail,
      password: this.regPassword,
    }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.registered.set(true);
        this.regPassword = '';
        this.regConfirm = '';
        this.regTerms = false;
        this.enterPending(this.regEmail.trim(), res.registrationToken ?? '', true);
        this.startCooldown();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo tài khoản. Vui lòng thử lại.');
      },
    });
  }
}
