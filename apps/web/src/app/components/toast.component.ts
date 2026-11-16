import { Component, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'fc-toast',
  standalone: true,
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="'toast-' + toast.type" role="alert">
          <div class="toast-content">
            @if (toast.title) {
              <strong class="toast-title">{{ toast.title }}</strong>
            }
            <span class="toast-message">{{ toast.message }}</span>
          </div>
          <button class="toast-close" (click)="toastService.dismiss(toast.id)" aria-label="Đóng thông báo">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 380px;
      width: calc(100% - 40px);
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      background: var(--color-surface);
      border-left: 4px solid var(--color-text);
      animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      font-size: 0.9rem;
      line-height: 1.4;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .toast-success { border-left-color: #2e7d32; }
    .toast-error { border-left-color: #d32f2f; }
    .toast-warning { border-left-color: #ed6c02; }
    .toast-info { border-left-color: #0288d1; }
    .toast-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .toast-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text);
    }
    .toast-message {
      color: #4a453e;
    }
    .toast-close {
      background: none;
      border: 0;
      font-size: 1.25rem;
      line-height: 1;
      color: #8b847c;
      cursor: pointer;
      padding: 0 4px;
    }
    .toast-close:hover {
      color: var(--color-text);
    }

    .toast { border:1px solid var(--color-divider); border-left-width:4px; border-radius:var(--radius-card); box-shadow:var(--shadow-floating); line-height:1.6; }
    .toast-success { border-left-color:var(--color-success); } .toast-error { border-left-color:var(--color-danger); }
    .toast-warning { border-left-color:var(--color-warning); } .toast-info { border-left-color:var(--color-info); }
    .toast-content { min-width:0; overflow-wrap:anywhere; gap:4px; } .toast-close { width:32px; min-height:32px; flex-shrink:0; color:var(--color-muted); border-radius:6px; }


  `],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
}
