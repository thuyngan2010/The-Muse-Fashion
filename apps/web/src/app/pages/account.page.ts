import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
@Component({standalone:true,imports:[FormsModule],template:`
<section class="form-card"><span class="eyebrow">TÀI KHOẢN</span><h1>{{registerMode()?'Tạo tài khoản':'Đăng nhập'}}</h1>
<form (ngSubmit)="submit()">@if(registerMode()){<label>Họ và tên<input name="name" [(ngModel)]="fullName" required minlength="2"></label>}<label>Email<input name="email" [(ngModel)]="email" type="email" required></label><label>Mật khẩu<input name="password" [(ngModel)]="password" type="password" required></label><button type="submit" [disabled]="busy()">{{busy()?'Đang xử lý...':(registerMode()?'Đăng ký':'Đăng nhập')}}</button></form>
@if(message()){<p class="notice">{{message()}}</p>}
<button class="link-button" (click)="registerMode.set(!registerMode())">{{registerMode()?'Đã có tài khoản? Đăng nhập':'Chưa có tài khoản? Đăng ký'}}</button>
<p class="small">Đăng ký cần SendGrid hoạt động để gửi liên kết xác minh. Sau khi xác minh, có thể đăng nhập.</p></section>`})
export class AccountPage {
  private readonly api = inject(ApiService);
  readonly registerMode = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  email = '';
  fullName = '';
  password = '';

  submit(): void {
    this.busy.set(true);
    this.message.set('');
    if (this.registerMode()) {
      this.api.register(this.fullName, this.email, this.password).subscribe({
        next: () => {
          this.busy.set(false);
          this.message.set('Đã đăng ký. Hãy kiểm tra email xác minh.');
        },
        error: (error: HttpErrorResponse) => this.handleError(error),
      });
      return;
    }

    this.api.login(this.email, this.password).subscribe({
      next: (value) => {
        this.busy.set(false);
        sessionStorage.setItem('fashion_access_token', value.accessToken);
        this.message.set('Đăng nhập thành công (phiên lưu trong tab).');
      },
      error: (error: HttpErrorResponse) => this.handleError(error),
    });
  }

  private handleError(error: HttpErrorResponse): void {
    this.busy.set(false);
    const message = typeof error.error?.message === 'string' ? error.error.message : undefined;
    this.message.set(message || 'Thao tác thất bại. Kiểm tra dữ liệu và dịch vụ email.');
  }
}
