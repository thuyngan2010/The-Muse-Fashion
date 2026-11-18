import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { STORE_ADMIN_LOGIN_CONTENT } from '../../shared/store-content';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="login-page">
      <div class="login-card">
        <section class="brand-side" aria-label="Giới thiệu MUSE Admin Portal">
          <span class="glow glow--top" aria-hidden="true"></span>
          <span class="glow glow--bottom" aria-hidden="true"></span>
          <div class="brand-top">
            <img class="brand-logo" src="/assets/brand/muse-logo-black.png" alt="MUSE" />
            <span class="brand-tag">Admin Portal</span>
          </div>
          <figure class="visual">
            <div class="visual-photo">
              <img src="/assets/auth/muse-auth-model.png" [alt]="content.photoAlt" />
              <span class="visual-pill">{{ content.photoTag }}</span>
            </div>
            <figcaption>“{{ content.quote }}”</figcaption>
          </figure>
        </section>

        <section class="form-side" aria-labelledby="admin-login-title">
          <div class="utility">
            <a routerLink="/" class="back-store">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
              Về website cửa hàng
            </a>
          </div>

          <div class="form-center">
            <h1 id="admin-login-title">Chào mừng trở lại</h1>
            <p class="lead">Đăng nhập để truy cập hệ thống quản trị MUSE.</p>

            @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }

            <form class="form" (ngSubmit)="submit()">
              <label class="field">
                <span class="field-label">Địa chỉ email</span>
                <span class="control">
                  <svg class="lead-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                  <input type="email" name="email" [(ngModel)]="email" autocomplete="username" placeholder="nhap@email.com" required />
                </span>
              </label>

              <div class="field">
                <span class="field-row">
                  <label class="field-label" for="admin-password">Mật khẩu</label>
                  <a routerLink="/forgot-password" class="forgot">Quên mật khẩu?</a>
                </span>
                <span class="control">
                  <svg class="lead-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                  <input id="admin-password" [type]="showPassword() ? 'text' : 'password'" name="password" [(ngModel)]="password" autocomplete="current-password" placeholder="••••••••" required />
                  <button type="button" class="eye" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" [attr.aria-pressed]="showPassword()">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>@if (showPassword()) {<path d="M3 3l18 18"/>}</svg>
                  </button>
                </span>
              </div>

              <label class="remember">
                <input type="checkbox" name="remember" [(ngModel)]="remember" />
                <span>Ghi nhớ đăng nhập trên thiết bị này</span>
              </label>

              <button type="submit" class="submit" [disabled]="submitting()">
                <span>{{ submitting() ? 'Đang đăng nhập...' : 'Đăng nhập vào hệ thống' }}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l4 4-4 4M14 12H4"/></svg>
              </button>
            </form>
          </div>

          <footer class="identity">© MUSE Fashion. All rights reserved.</footer>
        </section>
      </div>
    </main>
  `,
  styles: [`
    :host { display: block; font-family: var(--font-sans); color: var(--ui-ink, #171717); }
    .login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 48px 16px; background: #fbf9f9; }
    .login-card { width: 100%; max-width: 1080px; min-height: 720px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 20px 25px -5px #0000001a, 0 8px 10px -6px #0000001a; }
    .brand-side { position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; padding: 24px; overflow: hidden; background: #f5f3f3; }
    .glow { position: absolute; border-radius: 50%; pointer-events: none; }
    .glow--top { left: -96px; top: -96px; width: 288px; height: 288px; background: #ffc2cb66; filter: blur(64px); }
    .glow--bottom { right: 16px; bottom: 40px; width: 224px; height: 224px; background: #ffd9de80; filter: blur(40px); }
    .brand-top, .visual { position: relative; }
    .brand-logo { display: block; width: 163px; height: 48px; object-fit: contain; object-position: left center; }
    .brand-tag { display: block; margin-top: 4px; padding-left: 4px; font: 400 11px/14px var(--font-serif); letter-spacing: 1.1px; text-transform: uppercase; color: var(--ui-ink-soft, #444748); }
    .visual { margin: 0 auto; width: 100%; max-width: 384px; overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a; }
    .visual-photo { position: relative; height: 288px; background: #efeded; }
    .visual-photo img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
    .visual-pill { position: absolute; left: 12px; bottom: 12px; padding: 4px 8px; border-radius: 12px; background: #ffffff40; backdrop-filter: blur(12px); color: #fff; font: 700 10px/12px var(--font-sans); letter-spacing: .5px; text-shadow: 0 1px 2px #0006; }
    .visual figcaption { padding: 12px; font: 600 11px/1.9 var(--font-sans); color: var(--ui-ink-soft, #444748); }
    .form-side { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; padding: 24px; background: #fff; }
    .utility { display: flex; align-items: center; justify-content: space-between; }
    .back-store { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; font: 400 12px/18px var(--font-sans); color: var(--ui-ink-soft, #444748); }
    .back-store:hover { color: var(--ui-ink, #171717); text-decoration: underline; text-underline-offset: 4px; }
    .form-center { width: 100%; max-width: 448px; margin: 0 auto; padding: 48px 0; }
    h1 { margin: 0 0 4px; font: 700 28px/36px var(--font-serif); letter-spacing: -.7px; color: #000; }
    .lead { margin: 0 0 20px; font-size: 13px; line-height: 18px; color: var(--ui-ink-soft, #444748); }
    .alert { margin: 0 0 16px; padding: 12px; border: 1px solid var(--ui-danger, #9b2c2c); border-radius: 4px; background: var(--ui-danger-bg, #fff1f1); color: var(--ui-danger, #9b2c2c); font-size: 13px; line-height: 1.5; }
    .form { display: flex; flex-direction: column; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { font: 500 13px/18px var(--font-sans); color: #1b1c1c; }
    .field-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .forgot { font: 400 10px/12px var(--font-sans); letter-spacing: .5px; text-decoration: underline; color: #1b1c1c; }
    .forgot:hover { color: var(--ui-accent, #8f485d); }
    .control { position: relative; display: block; }
    .lead-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--ui-subtle, #747878); pointer-events: none; }
    .control input { width: 100%; height: 48px; padding: 0 44px; border: 1px solid var(--ui-line, #c4c7c7); border-radius: 4px; background: #fff; box-shadow: 0 1px 2px #0000000d; font: 400 14px var(--font-sans); color: var(--ui-ink, #171717); }
    .control input::placeholder { color: var(--ui-subtle, #747878); font-size: 12px; opacity: 1; }
    .control input:focus-visible { outline: 2px solid var(--ui-ink, #171717); outline-offset: 1px; border-color: var(--ui-ink, #171717); }
    .eye { position: absolute; top: 0; right: 4px; width: 44px; height: 48px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: none; color: var(--ui-ink-soft, #444748); }
    .eye:hover { color: var(--ui-ink, #171717); }
    .eye:focus-visible { outline: 2px solid var(--ui-ink, #171717); outline-offset: -4px; }
    .remember { display: flex; align-items: center; gap: 8px; padding: 4px 0 8px; font: 400 12px/16px var(--font-sans); color: var(--ui-ink-soft, #444748); cursor: pointer; }
    .remember input { width: 16px; height: 16px; margin: 0; accent-color: #000; }
    .submit { width: 100%; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 4px; background: #000; color: #fff; box-shadow: 0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a; font: 700 14px/18px var(--font-sans); transition: background-color .15s; }
    .submit:hover:not(:disabled) { background: #333; }
    .submit:disabled { opacity: .6; cursor: not-allowed; }
    .submit:focus-visible { outline: 2px solid var(--ui-accent, #8f485d); outline-offset: 3px; }
    .identity { padding-top: 12px; font: 700 10px/12px var(--font-sans); letter-spacing: .5px; color: var(--ui-ink-soft, #444748); }
    @media (max-width: 860px) {
      .login-page { padding: 0; align-items: stretch; background: #fff; }
      .login-card { min-height: 100vh; grid-template-columns: minmax(0, 1fr); border-radius: 0; box-shadow: none; }
      .brand-side { display: none; }
      .form-side { padding: 20px 20px 24px; }
      .form-center { padding: 32px 0; }
    }
  `],
})
export class AdminLoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  readonly content = STORE_ADMIN_LOGIN_CONTENT;
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly error = signal('');
  email = '';
  password = '';
  remember = true;

  ngOnInit(): void {
    if (this.auth.isStaff()) this.router.navigateByUrl('/admin');
  }

  /** Chỉ nhận returnUrl nội bộ trong /admin (không phải chính trang đăng nhập). */
  private returnUrl(): string {
    const requested = this.route.snapshot.queryParamMap.get('returnUrl');
    return requested && /^\/admin(\/|\?|#|$)/.test(requested) && !requested.startsWith('/admin/login') ? requested : '/admin';
  }

  submit(): void {
    const email = this.email.trim();
    if (!email || !this.password) {
      this.error.set('Vui lòng nhập email và mật khẩu.');
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    this.auth.login(email, this.password, this.remember).subscribe({
      next: () => {
        const finish = () => {
          this.submitting.set(false);
          if (this.auth.isStaff()) {
            this.router.navigateByUrl(this.returnUrl());
          } else {
            this.password = '';
            this.auth.logout();
            this.toast.error(this.content.forbidden);
          }
        };
        if (this.auth.currentUser()) finish();
        else this.auth.initAuth().subscribe(finish);
      },
      error: err => {
        this.submitting.set(false);
        this.error.set(err.error?.message || this.content.loginFailed);
      },
    });
  }
}
