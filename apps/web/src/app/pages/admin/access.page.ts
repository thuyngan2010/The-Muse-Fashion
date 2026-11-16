import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import type { StaffPermissionName } from '@fashion/contracts';

@Component({ standalone: true, imports: [RouterLink], template: `
  <section class="access-card" aria-labelledby="access-title">
    <span class="access-code">403 · QUYỀN TRUY CẬP</span>
    <h1 id="access-title">Không có quyền truy cập</h1>
    <p>Tài khoản chưa được cấp quyền cho chức năng này. Vui lòng liên hệ quản trị viên để kiểm tra phân công.</p>
    <div class="access-actions"><a class="btn-primary" routerLink="/admin">Về trang quản trị</a><a class="btn-outline" routerLink="/">Về cửa hàng</a></div>
  </section>`, styles: [`
  :host { display:block; }
  .access-card { max-width:640px; margin:clamp(24px,8vw,80px) auto; padding:clamp(24px,5vw,48px); border:1px solid var(--color-divider); border-radius:var(--radius-card); background:var(--color-surface); box-shadow:var(--shadow-card); }
  .access-code { display:inline-flex; padding:6px 12px; border-radius:999px; background:var(--color-accent-soft); color:var(--color-accent); font-size:.75rem; font-weight:700; letter-spacing:.1em; }
  h1 { font-size:clamp(1.5rem,4vw,2rem); margin:20px 0 12px; }
  p { color:var(--color-muted); line-height:1.75; margin:0 0 24px; }
  .access-actions { display:flex; flex-wrap:wrap; gap:12px; }
  @media(max-width:600px) { .access-card { margin:24px 16px; } }
`] })
export class ForbiddenPage {}

@Component({ standalone: true, imports: [RouterLink], template: `
  <section class="access-card" aria-labelledby="workspace-title">
    <span class="access-code">KHÔNG GIAN QUẢN TRỊ</span>
    <h1 id="workspace-title">Chưa có chức năng được cấp</h1>
    <p role="status">Vui lòng liên hệ quản trị viên để được phân công quyền truy cập phù hợp.</p>
    <a class="btn-outline" routerLink="/">Về cửa hàng</a>
  </section>`, styles: [`
  :host { display:block; }
  .access-card { max-width:640px; margin:clamp(24px,8vw,80px) auto; padding:clamp(24px,5vw,48px); border:1px solid var(--color-divider); border-radius:var(--radius-card); background:var(--color-surface); box-shadow:var(--shadow-card); }
  .access-code { display:inline-flex; padding:6px 12px; border-radius:999px; background:var(--color-accent-soft); color:var(--color-accent); font-size:.75rem; font-weight:700; letter-spacing:.1em; }
  h1 { font-size:clamp(1.5rem,4vw,2rem); margin:20px 0 12px; }
  p { color:var(--color-muted); line-height:1.75; margin:0 0 24px; }
  .access-actions { display:flex; flex-wrap:wrap; gap:12px; }
  @media(max-width:600px) { .access-card { margin:24px 16px; } }
`] })
export class AdminLandingPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  ngOnInit(): void {
    if (this.auth.isAdmin()) { void this.router.navigate(['/admin/reports'], { replaceUrl: true }); return; }
    const destinations: Array<[StaffPermissionName, string]> = [['order.read', 'orders'], ['catalog.manage', 'products'], ['inventory.manage', 'inventory'], ['refund.propose', 'refunds'], ['content.moderate', 'moderation']];
    const destination = destinations.find(([permission]) => this.auth.can(permission));
    if (!destination && this.auth.canGlobal('payment.read')) { void this.router.navigate(['/admin/refunds'], { replaceUrl: true }); return; }
    if (destination) void this.router.navigate(['/admin', destination[1]], { replaceUrl: true });
  }
}
