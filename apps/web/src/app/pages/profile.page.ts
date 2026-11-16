import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountSidebarComponent } from '../components/account-sidebar.component';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { STORE_PROFILE_CONTENT } from '../shared/store-content';

@Component({
  standalone: true,
  imports: [FormsModule, AccountSidebarComponent],
  template: `
    <main class="profile-shell">
      <fc-account-sidebar activeItem="profile" />

      <section class="profile-content">
        <header class="page-header">
          <span>TÀI KHOẢN CỦA TÔI</span>
          <h1>Hồ sơ cá nhân</h1>
          <p>Cập nhật thông tin cơ bản và bảo mật tài khoản MUSE.</p>
        </header>

        @if (profileSaved()) {
          <div class="success-banner" role="status">
            <span class="success-icon" aria-hidden="true">✓</span><strong>Thông tin cá nhân đã được cập nhật thành công.</strong>
            <button type="button" aria-label="Đóng thông báo" (click)="profileSaved.set(false)">×</button>
          </div>
        }

        <section class="profile-card">
          <div class="avatar-section">
            <h2>ẢNH ĐẠI DIỆN</h2>
            <div class="avatar-row">
              <span class="large-avatar" aria-hidden="true">{{ userInitial }}</span>
              <div class="avatar-copy">
                <strong>{{ auth.currentUser()?.fullName || 'Tài khoản MUSE' }}</strong>
                <p>Ảnh đại diện hiện dùng chữ cái đầu của tên tài khoản.</p>
                <div class="avatar-actions">
                  <button type="button" class="button button-pink" data-ui-only (click)="showAvatarNotice()">THAY ĐỔI ẢNH</button>
                  <button type="button" class="text-button" data-ui-only (click)="showAvatarNotice()">XÓA ẢNH</button>
                </div>
                @if (avatarNotice()) { <small class="inline-notice" role="status">{{ avatarNotice() }}</small> }
              </div>
            </div>
          </div>

          <div class="divider"></div>

          <form (ngSubmit)="saveProfile()" class="profile-form">
            <h2>THÔNG TIN CÁ NHÂN</h2>
            @if (profileError()) { <p class="form-error" role="alert">{{ profileError() }}</p> }

            <label class="form-field">
              <span>HỌ VÀ TÊN <b aria-hidden="true">*</b></span>
              <input type="text" [(ngModel)]="fullName" name="fullName" required autocomplete="name" />
              <small>Vui lòng nhập họ và tên.</small>
            </label>

            <label class="form-field">
              <span>SỐ ĐIỆN THOẠI</span>
              <input type="tel" [(ngModel)]="phone" name="phone" autocomplete="tel" placeholder="Nhập số điện thoại" />
            </label>

            <label class="form-field locked-field">
              <span>EMAIL</span>
              <span class="locked-input"><input type="email" [value]="auth.currentUser()?.email || ''" disabled /><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="10" width="12" height="10"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
              <small>Email đăng nhập không thể thay đổi.</small>
            </label>

            <div class="form-actions">
              <button type="submit" class="button button-black" [disabled]="savingProfile()">{{ savingProfile() ? 'ĐANG LƯU...' : 'LƯU THAY ĐỔI' }}</button>
              <button type="button" class="button button-outline" [disabled]="savingProfile()" (click)="cancelProfileEdits()">HỦY</button>
            </div>
          </form>
        </section>

        <section class="session-card">
          <header><div><span>BẢO MẬT TÀI KHOẢN</span><h2>Phiên đăng nhập</h2></div><button type="button" class="button button-outline" [disabled]="loadingAuthMe()" (click)="loadAuthMe()">{{ loadingAuthMe() ? 'ĐANG KIỂM TRA...' : 'KIỂM TRA PHIÊN' }}</button></header>
          @if (authMeError()) { <p class="form-error" role="alert">{{ authMeError() }}</p> }
          @if (authMe(); as me) {
            <div class="session-grid">
              <p><span>Email tài khoản</span><strong>{{ me.email }}</strong></p>
              <p><span>Mã định danh</span><code>{{ me.sub || me.id }}</code></p>
              @if (me.sid) { <p><span>Mã phiên làm việc</span><code>{{ me.sid }}</code></p> }
              <p><span>Vai trò xác thực</span><strong>{{ me.role }}</strong></p>
            </div>
          }
        </section>

        <section class="password-layout" id="change-password">
          <form (ngSubmit)="changePassword()" class="password-card">
            <header><span>BẢO MẬT</span><h2>Đổi mật khẩu</h2><p>Sử dụng mật khẩu mạnh và không dùng lại mật khẩu cũ.</p></header>
            @if (passwordError()) { <p class="form-error" role="alert">{{ passwordError() }}</p> }

            <label class="form-field"><span>MẬT KHẨU HIỆN TẠI <b aria-hidden="true">*</b></span><input type="password" [(ngModel)]="oldPassword" name="oldPassword" required autocomplete="current-password" /></label>
            <label class="form-field"><span>MẬT KHẨU MỚI <b aria-hidden="true">*</b></span><input type="password" [(ngModel)]="newPassword" name="newPassword" minlength="12" maxlength="128" required autocomplete="new-password" /></label>

            <div class="password-strength" aria-live="polite">
              <div class="strength-label"><span>ĐỘ MẠNH MẬT KHẨU</span><strong>{{ passwordStrengthLabel }}</strong></div>
              <div class="strength-bars" aria-hidden="true">@for (bar of [1,2,3,4]; track bar) { <span [class.active]="bar <= passwordStrength"></span> }</div>
              <ul>
                <li [class.met]="hasMinLength">Ít nhất 12 ký tự</li><li [class.met]="hasUppercase">Có chữ hoa</li>
                <li [class.met]="hasLowercase">Có chữ thường</li><li [class.met]="hasNumber">Có số</li>
              </ul>
            </div>

            <label class="form-field"><span>XÁC NHẬN MẬT KHẨU MỚI <b aria-hidden="true">*</b></span><input type="password" [(ngModel)]="confirmPassword" name="confirmPassword" required autocomplete="new-password" /></label>
            <div class="password-actions"><button type="submit" class="button button-black" [disabled]="savingPassword()">{{ savingPassword() ? 'ĐANG CẬP NHẬT...' : 'CẬP NHẬT MẬT KHẨU' }}</button></div>
          </form>

          <aside class="security-note">
            <span>LƯU Ý BẢO MẬT</span>
            <ul>@for (note of policy.securityNotes; track note) { <li>{{ note }}</li> }</ul>
          </aside>
        </section>

        <button type="button" class="logout-main" (click)="logout()">ĐĂNG XUẤT</button>
      </section>
    </main>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Outfit:wght@300;400;500&family=Playfair+Display:wght@400;500&display=swap');
    :host { display:block; background:#fff; color:#171414; } * { box-sizing:border-box; }
    .profile-shell { width:min(1184px,calc(100% - 48px)); margin:0 auto; padding:40px 0 96px; display:grid; grid-template-columns:280px minmax(0,1fr); gap:32px; align-items:start; font-family:'Montserrat',sans-serif; }
    .profile-content { min-width:0; }
    .page-header { padding-bottom:24px; border-bottom:1px solid #5f5353; } .page-header > span { color:#8f485d; font-size:10px; font-weight:600; letter-spacing:1.5px; }
    .page-header h1 { margin:6px 0 8px; font:400 40px/1.2 'Playfair Display',serif; letter-spacing:-.5px; } .page-header p { margin:0; color:#444748; font:300 16px/26px 'Outfit',sans-serif; }
    .success-banner { min-height:58px; margin:24px 0; padding:14px 20px; border-left:3px solid #000; background:#f8f6f6; display:flex; align-items:center; gap:14px; }
    .success-icon { width:22px; height:22px; border:1.5px solid #000; border-radius:50%; display:grid; place-items:center; font-size:13px; } .success-banner strong { flex:1; font-size:12px; } .success-banner button { border:0; background:none; font-size:25px; color:#444748; cursor:pointer; }
    .profile-card,.session-card,.password-card { margin-top:24px; border:1px solid #5f5353; background:#fff; }
    .avatar-section { padding:28px 40px; } h2 { margin:0; font-size:15px; line-height:1.4; letter-spacing:1px; }
    .avatar-row { margin-top:24px; display:flex; align-items:center; gap:26px; } .large-avatar { width:112px; height:112px; flex:0 0 auto; border:1px solid #e3e2e2; border-radius:50%; display:grid; place-items:center; background:#ffd9e1; font:500 36px 'Outfit',sans-serif; text-transform:uppercase; }
    .avatar-copy strong { font:500 18px 'Outfit',sans-serif; } .avatar-copy p { margin:8px 0 14px; color:#444748; font:300 13px/1.55 'Outfit',sans-serif; }
    .avatar-actions { display:flex; align-items:center; gap:18px; } .inline-notice { display:block; margin-top:10px; color:#786f6f; font-size:10px; }
    .divider { height:1px; margin:0 40px; background:#e3e2e2; }
    .profile-form { padding:32px 40px 40px; } .profile-form h2 { margin-bottom:26px; }
    .form-field { display:grid; gap:8px; margin-bottom:22px; } .form-field > span:first-child,.modal-label { font-size:10px; font-weight:600; letter-spacing:1px; } .form-field b { color:#de233f; }
    .form-field input { width:100%; height:50px; border:1px solid #5f5353; border-radius:0; background:#fff; padding:0 16px; color:#171414; outline:none; font:400 14px 'Montserrat',sans-serif; }
    .form-field input:focus { box-shadow:inset 0 0 0 1px #000; } .form-field small { color:#555; font:300 11px/1.5 'Outfit',sans-serif; }
    .locked-input { position:relative; } .locked-input input { background:#f5f3f3; border-color:#d2cece; color:#555; padding-right:48px; } .locked-input svg { position:absolute; right:16px; top:14px; width:20px; stroke:#aaa; stroke-width:1.5; }
    .form-actions,.password-actions { display:flex; justify-content:flex-end; gap:14px; margin-top:30px; }
    .button { min-height:44px; padding:12px 28px; border:1px solid #000; border-radius:0; display:inline-flex; align-items:center; justify-content:center; background:#fff; color:#000; font:600 10px 'Montserrat',sans-serif; letter-spacing:1.2px; cursor:pointer; }
    .button-black { min-width:178px; background:#000; color:#fff; } .button-pink { background:#ffd9e1; } .button-outline { background:#fff; } .button:disabled { opacity:.55; cursor:not-allowed; }
    .text-button { border:0; border-bottom:1px solid currentColor; background:none; padding:4px 0; color:#444748; font:600 10px 'Montserrat',sans-serif; letter-spacing:1px; cursor:pointer; }
    .form-error { margin:0 0 20px; padding:12px 14px; border-left:3px solid #de233f; background:#fff3f4; color:#9d2638; font-size:11px; line-height:1.5; }
    .session-card { padding:28px 32px; } .session-card header { display:flex; align-items:center; justify-content:space-between; gap:20px; padding-bottom:20px; border-bottom:1px solid #e3e2e2; }
    .session-card header span,.password-card header > span { color:#8f485d; font-size:9px; font-weight:600; letter-spacing:1.3px; } .session-card h2 { margin-top:5px; font:400 24px 'Playfair Display',serif; letter-spacing:0; }
    .session-grid { padding-top:20px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 24px; } .session-grid p { margin:0; padding:13px 14px; border:1px solid #e3e2e2; display:grid; gap:6px; min-width:0; }
    .session-grid span { color:#777; font-size:9px; letter-spacing:.6px; text-transform:uppercase; } .session-grid strong,.session-grid code { overflow-wrap:anywhere; font-size:11px; }
    .password-layout { display:grid; grid-template-columns:minmax(0,1fr) 250px; gap:24px; align-items:start; scroll-margin-top:24px; } .password-card { padding:32px 40px 40px; }
    .password-card header { margin-bottom:26px; padding-bottom:20px; border-bottom:1px solid #e3e2e2; } .password-card header h2 { margin:6px 0 7px; font:400 30px 'Playfair Display',serif; letter-spacing:0; } .password-card header p { margin:0; color:#555; font:300 13px 'Outfit',sans-serif; }
    .password-strength { margin:-6px 0 22px; padding:16px; background:#f8f6f6; border:1px solid #e3e2e2; } .strength-label { display:flex; justify-content:space-between; font-size:9px; letter-spacing:.8px; } .strength-label strong { font-weight:600; }
    .strength-bars { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:10px 0 13px; } .strength-bars span { height:3px; background:#d9d5d5; } .strength-bars span.active { background:#000; }
    .password-strength ul { margin:0; padding:0; display:grid; grid-template-columns:repeat(2,1fr); gap:7px 18px; list-style:none; } .password-strength li { color:#777; font-size:10px; } .password-strength li::before { content:'○'; margin-right:7px; } .password-strength li.met { color:#266246; } .password-strength li.met::before { content:'✓'; }
    .security-note { margin-top:24px; padding:24px; border:1px solid #e3e2e2; background:#f5f3f3; } .security-note > span { font-size:10px; font-weight:600; letter-spacing:1.2px; } .security-note ul { margin:16px 0 0; padding-left:18px; color:#555; font:300 12px/1.7 'Outfit',sans-serif; } .security-note li + li { margin-top:8px; }
    .logout-main { margin-top:24px; border:0; background:none; padding:10px 0; color:#de233f; font:600 10px 'Montserrat',sans-serif; letter-spacing:1px; text-decoration:underline; text-underline-offset:4px; cursor:pointer; }
    @media (max-width:980px) { .profile-shell { width:min(100% - 32px,760px); grid-template-columns:1fr; } .password-layout { grid-template-columns:1fr; } }
    @media (max-width:640px) { .profile-shell { width:100%; padding:20px 16px 64px; } .page-header h1 { font-size:34px; } .avatar-section,.profile-form,.password-card { padding:24px 20px; } .divider { margin:0 20px; } .avatar-row { align-items:flex-start; flex-direction:column; } .large-avatar { width:88px; height:88px; } .form-actions { flex-direction:column; } .form-actions .button { width:100%; } .session-card { padding:24px 20px; } .session-card header { align-items:flex-start; flex-direction:column; } .session-grid { grid-template-columns:1fr; } .password-strength ul { grid-template-columns:1fr; } }
  `],
})
export class ProfilePage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  fullName = '';
  phone = '';
  private loadedFullName = '';
  private loadedPhone = '';
  readonly savingProfile = signal(false);
  readonly profileSaved = signal(false);
  readonly profileError = signal('');
  readonly avatarNotice = signal('');

  readonly authMe = signal<any>(null);
  readonly loadingAuthMe = signal(false);
  readonly authMeError = signal('');

  oldPassword = '';
  newPassword = '';
  confirmPassword = '';
  readonly savingPassword = signal(false);
  readonly passwordError = signal('');
  readonly policy = STORE_PROFILE_CONTENT;

  get userInitial(): string { return this.auth.currentUser()?.fullName?.trim()?.[0] || 'M'; }
  get hasMinLength(): boolean { return this.newPassword.length >= 12 && this.newPassword.length <= 128; }
  get hasUppercase(): boolean { return /[A-Z]/.test(this.newPassword); }
  get hasLowercase(): boolean { return /[a-z]/.test(this.newPassword); }
  get hasNumber(): boolean { return /\d/.test(this.newPassword); }
  get passwordStrength(): number { return [this.hasMinLength,this.hasUppercase,this.hasLowercase,this.hasNumber].filter(Boolean).length; }
  get passwordStrengthLabel(): string { return ['Chưa nhập','Yếu','Trung bình','Khá','Mạnh'][this.passwordStrength]; }

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) { this.fullName = user.fullName; this.phone = user.phone || ''; this.loadedFullName = this.fullName; this.loadedPhone = this.phone; }
    this.loadAuthMe();
  }
  showAvatarNotice(): void { this.avatarNotice.set('Ảnh đại diện hiện chưa kết nối lưu trữ.'); }
  cancelProfileEdits(): void { this.fullName = this.loadedFullName; this.phone = this.loadedPhone; this.profileError.set(''); this.profileSaved.set(false); }
  loadAuthMe(): void {
    this.loadingAuthMe.set(true); this.authMeError.set('');
    this.api.getMe().subscribe({ next: me => { this.authMe.set(me); this.loadingAuthMe.set(false); }, error: () => { this.loadingAuthMe.set(false); this.authMeError.set('Không thể kiểm tra phiên đăng nhập.'); } });
  }
  saveProfile(): void {
    this.savingProfile.set(true); this.profileError.set(''); this.profileSaved.set(false);
    this.api.updateProfile({ fullName:this.fullName, phone:this.phone || undefined }).subscribe({
      next: updated => {
        this.savingProfile.set(false); this.loadedFullName = updated.fullName; this.loadedPhone = updated.phone || ''; this.fullName = this.loadedFullName; this.phone = this.loadedPhone;
        this.auth.setCurrentUser({ ...this.auth.currentUser()!, fullName:updated.fullName, phone:updated.phone }); this.profileSaved.set(true); this.toast.success('Đã cập nhật thông tin cá nhân.');
      },
      error: err => { this.savingProfile.set(false); const message = err.error?.message || 'Không thể cập nhật hồ sơ.'; this.profileError.set(message); this.toast.error(message); },
    });
  }
  changePassword(): void {
    this.passwordError.set('');
    if (!this.oldPassword || !this.newPassword) { this.passwordError.set('Vui lòng nhập đầy đủ mật khẩu cũ và mới.'); this.toast.warning('Vui lòng nhập đầy đủ mật khẩu cũ và mới.'); return; }
    if (this.newPassword !== this.confirmPassword) { this.passwordError.set('Mật khẩu xác nhận không khớp.'); this.toast.warning('Mật khẩu xác nhận không khớp.'); return; }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/.test(this.newPassword)) { this.passwordError.set('Mật khẩu cần 12–128 ký tự, có chữ hoa, chữ thường và số.'); this.toast.warning('Mật khẩu cần 12–128 ký tự, có chữ hoa, chữ thường và số.'); return; }
    this.savingPassword.set(true);
    this.api.changePassword(this.oldPassword,this.newPassword).subscribe({
      next: () => { this.savingPassword.set(false); this.oldPassword=''; this.newPassword=''; this.confirmPassword=''; this.auth.setToken(null); this.toast.success('Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.'); this.router.navigate(['/auth']); },
      error: err => { this.savingPassword.set(false); const message = err.error?.message || 'Không thể đổi mật khẩu.'; this.passwordError.set(message); this.toast.error(message); },
    });
  }
  logout(): void { this.auth.logout(); }
}
