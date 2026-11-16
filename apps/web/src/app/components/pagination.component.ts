import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import type { Observable, Subscription } from 'rxjs';
import type { ListResponse } from '@fashion/contracts';

export class PaginationState {
  readonly page = signal(1);
  readonly total = signal(0);
  private subscription?: Subscription;
  constructor(readonly limit = 20) {}
  reset(): void { this.page.set(1); }
  cancel(): void { this.subscription?.unsubscribe(); }
  load<R extends ListResponse<unknown>>(request: () => Observable<R>, observer: { next: (value: R) => void; error?: (error: any) => void }): void {
    this.cancel();
    this.subscription = request().subscribe({
      next: value => {
        this.total.set(value.total);
        const last = Math.max(1, Math.ceil(value.total / this.limit));
        if (this.page() > last) { this.page.set(last); this.load(request, observer); return; }
        observer.next(value);
      },
      error: error => observer.error?.(error),
    });
  }
}

@Component({
  selector: 'fc-pagination', standalone: true,
  template: `@if (total > limit) {
    <nav [attr.aria-label]="label" class="paging">
      <button type="button" class="btn-outline" [disabled]="loading || page <= 1" (click)="pageChange.emit(page - 1)">← Trước</button>
      <span>Trang {{ page }} / {{ pages }} · {{ total }} mục</span>
      <button type="button" class="btn-outline" [disabled]="loading || page >= pages" (click)="pageChange.emit(page + 1)">Sau →</button>
    </nav>
  }`,
  styles: [`.paging{display:flex;justify-content:center;align-items:center;gap:16px;padding:20px;flex-wrap:wrap}.paging button{padding:8px 16px;cursor:pointer}.paging button:disabled{cursor:default;opacity:.5}`],
})
export class PaginationComponent {
  @Input() page = 1;
  @Input() total = 0;
  @Input() limit = 20;
  @Input() loading = false;
  @Input() label = 'Phân trang';
  @Output() readonly pageChange = new EventEmitter<number>();
  get pages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
}
