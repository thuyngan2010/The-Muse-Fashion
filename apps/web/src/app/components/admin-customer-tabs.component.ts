import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';

export type CustomerTab = 'customers' | 'support';

/** Sự kiện báo số phiếu chưa đọc có thể đã đổi (trang hỗ trợ phát, menu và hàng tab lắng nghe). */
export const SUPPORT_UNREAD_EVENT = 'fc:support-unread-changed';

/**
 * Hàng tab dùng chung cho Danh sách khách hàng và Trung tâm hỗ trợ.
 * Mỗi tab chỉ hiện khi có quyền đúng như route đang kiểm; chỉ còn một tab thì ẩn cả hàng.
 */
@Component({
  selector: 'fc-admin-customer-tabs',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (tabs().length > 1) {
      <nav class="ct" aria-label="Khách hàng và hỗ trợ">
        @for (tab of tabs(); track tab.key) {
          <a class="ct-tab" [class.active]="tab.key === active()" [routerLink]="tab.link" [attr.aria-current]="tab.key === active() ? 'page' : null">
            {{ tab.label }}
            @if (tab.key === 'support' && unread() > 0) {
              <span class="ct-dot" aria-hidden="true">{{ unread() > 99 ? '99+' : unread() }}</span>
              <span class="sr-only">{{ unread() }} phiếu chưa đọc</span>
            }
          </a>
        }
      </nav>
    }
  `,
  styles: [`
    :host { display: block; }
    .ct { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--admin-line); margin-bottom: 24px; }
    .ct-tab { display: inline-flex; align-items: center; gap: 8px; padding: 12px 16px; margin-bottom: -1px; font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); text-decoration: none; border-bottom: 2px solid transparent; }
    .ct-tab:hover { color: var(--ui-ink); background: var(--ui-bg-soft); }
    .ct-tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
    .ct-dot { min-width: 18px; height: 18px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: var(--ui-danger, #b3261e); color: #fff; font: 700 10px/1 var(--font-sans); }
    .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  `],
})
export class AdminCustomerTabsComponent implements OnInit, OnDestroy {
  readonly active = input.required<CustomerTab>();
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly unread = signal(0);
  private readonly onChanged = (): void => this.load();

  readonly tabs = computed(() => {
    const list: Array<{ key: CustomerTab; label: string; link: string }> = [];
    if (this.auth.isAdmin()) list.push({ key: 'customers', label: 'Danh sách khách hàng', link: '/admin/customers' });
    if (this.auth.can('order.read')) list.push({ key: 'support', label: 'Trung tâm hỗ trợ', link: '/admin/support' });
    return list;
  });

  ngOnInit(): void {
    this.load();
    window.addEventListener(SUPPORT_UNREAD_EVENT, this.onChanged);
  }

  ngOnDestroy(): void {
    window.removeEventListener(SUPPORT_UNREAD_EVENT, this.onChanged);
  }

  private load(): void {
    if (!this.auth.can('order.read')) return;
    this.api.adminSupportStats().subscribe({ next: (stats) => this.unread.set(stats.unreadForStaff), error: () => undefined });
  }
}
