import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

export type OrderTab = 'orders' | 'refunds';

/**
 * Hàng tab dùng chung cho Đơn hàng và Hoàn tiền & Đối soát.
 * Mỗi tab chỉ hiện khi có quyền đúng như route đang kiểm; chỉ còn một tab thì ẩn cả hàng.
 */
@Component({
  selector: 'fc-admin-order-tabs',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (tabs().length > 1) {
      <nav class="ot" aria-label="Phân hệ đơn hàng">
        @for (tab of tabs(); track tab.key) {
          <a class="ot-tab" [class.active]="tab.key === active()" [routerLink]="tab.link" [attr.aria-current]="tab.key === active() ? 'page' : null">{{ tab.label }}</a>
        }
      </nav>
    }
  `,
  styles: [`
    :host { display: block; }
    .ot { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--admin-line); margin-bottom: 24px; }
    .ot-tab { padding: 12px 16px; margin-bottom: -1px; font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); text-decoration: none; border-bottom: 2px solid transparent; }
    .ot-tab:hover { color: var(--ui-ink); background: var(--ui-bg-soft); }
    .ot-tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
  `],
})
export class AdminOrderTabsComponent {
  readonly active = input.required<OrderTab>();
  private readonly auth = inject(AuthService);

  readonly tabs = computed(() => {
    const list: Array<{ key: OrderTab; label: string; link: string }> = [];
    if (this.auth.can('order.read')) list.push({ key: 'orders', label: 'Đơn hàng', link: '/admin/orders' });
    if (this.auth.can('refund.propose') || this.auth.canGlobal('payment.read')) list.push({ key: 'refunds', label: 'Hoàn tiền & Đối soát', link: '/admin/refunds' });
    return list;
  });
}
