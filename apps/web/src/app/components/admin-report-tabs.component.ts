import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

export type ReportTab = 'reports' | 'users' | 'audit';

/**
 * Hàng tab dùng chung cho Báo cáo & Phân quyền.
 * Cả ba màn hình đều chỉ dành cho quản trị viên (adminGuard), nên tab chỉ hiện khi auth.isAdmin().
 */
@Component({
  selector: 'fc-admin-report-tabs',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (tabs().length > 0) {
      <nav class="rt" aria-label="Phân hệ báo cáo và phân quyền">
        @for (tab of tabs(); track tab.key) {
          <a class="rt-tab" [class.active]="tab.key === active()" [routerLink]="tab.link" [attr.aria-current]="tab.key === active() ? 'page' : null">{{ tab.label }}</a>
        }
      </nav>
    }
  `,
  styles: [`
    :host { display: block; }
    .rt { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--admin-line); margin-bottom: 24px; }
    .rt-tab { padding: 12px 16px; margin-bottom: -1px; font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); text-decoration: none; border-bottom: 2px solid transparent; }
    .rt-tab:hover { color: var(--ui-ink); background: var(--ui-bg-soft); }
    .rt-tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
  `],
})
export class AdminReportTabsComponent {
  readonly active = input.required<ReportTab>();
  private readonly auth = inject(AuthService);

  readonly tabs = computed(() => {
    const list: Array<{ key: ReportTab; label: string; link: string }> = [];
    if (this.auth.isAdmin()) {
      list.push({ key: 'reports', label: 'Báo cáo kinh doanh', link: '/admin/reports' });
      list.push({ key: 'users', label: 'Nhân viên & Phân quyền', link: '/admin/users' });
      list.push({ key: 'audit', label: 'Nhật ký hoạt động', link: '/admin/audit' });
    }
    return list;
  });
}
