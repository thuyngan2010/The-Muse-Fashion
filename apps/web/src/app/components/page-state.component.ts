import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

export type PageStateKind = 'loading' | 'empty' | 'error' | 'success';

/**
 * Trạng thái dùng chung: đang tải, rỗng, lỗi (kèm nút thử lại) và thành công.
 * Có actionLink thì nút là liên kết; ngược lại nút phát sự kiện `action`.
 */
@Component({
  selector: 'fc-page-state',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="state" [class]="'state state--' + kind()" [attr.role]="kind() === 'error' ? 'alert' : 'status'" [attr.aria-live]="kind() === 'error' ? 'assertive' : 'polite'">
      @if (kind() === 'loading') {
        <span class="spinner" aria-hidden="true"></span>
      } @else {
        <span class="mark" aria-hidden="true">
          @switch (kind()) {
            @case ('error') { ! }
            @case ('success') { ✓ }
            @default { MUSE }
          }
        </span>
      }
      @if (title()) { <h2>{{ title() }}</h2> }
      @if (message()) { <p>{{ message() }}</p> }
      @if (kind() !== 'loading' && actionLabel()) {
        @if (actionLink()) {
          <a class="state-action" [routerLink]="actionLink()">{{ actionLabel() }}</a>
        } @else {
          <button type="button" class="state-action" (click)="action.emit()">{{ actionLabel() }}</button>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .state { max-width: 620px; margin: 64px auto; padding: 56px 28px; border: 1px solid var(--ui-line); background: var(--ui-bg); color: var(--ui-ink); font-family: var(--font-sans); text-align: center; }
    .mark { display: inline-flex; width: 60px; height: 60px; align-items: center; justify-content: center; margin-bottom: 20px; border: 1px solid var(--ui-ink); color: var(--ui-accent); font-family: var(--font-serif); font-size: 13px; letter-spacing: .15em; }
    .state--error .mark { color: var(--ui-danger); border-color: var(--ui-danger); border-radius: 50%; font-size: 22px; letter-spacing: 0; }
    .state--success .mark { color: var(--ui-success); border-color: var(--ui-success); border-radius: 50%; font-size: 22px; letter-spacing: 0; }
    .spinner { display: inline-block; width: 36px; height: 36px; margin-bottom: 20px; border: 2px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    h2 { margin: 0 0 10px; font-family: var(--font-serif); font-size: 28px; font-weight: 400; line-height: 36px; }
    p { margin: 0 0 24px; color: var(--ui-ink-soft); font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }
    .state--loading p, h2:last-child, p:last-child { margin-bottom: 0; }
    .state-action { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 24px; border: 1px solid var(--ui-ink); border-radius: 0; background: var(--ui-pink); color: var(--ui-ink); font: 700 12px var(--font-sans); letter-spacing: .08em; text-decoration: none; cursor: pointer; }
    .state-action:hover { background: var(--ui-ink); color: #fff; }
    @media (max-width: 640px) {
      .state { margin: 32px 16px; padding: 40px 20px; }
      .state-action { width: 100%; }
    }
  `],
})
export class PageStateComponent {
  readonly kind = input<PageStateKind>('loading');
  readonly title = input('');
  readonly message = input('');
  readonly actionLabel = input('');
  readonly actionLink = input<string | readonly unknown[] | null>(null);
  readonly action = output<void>();
}
