import { Component, inject } from '@angular/core';
import { ServerStatusService } from '../services/server-status.service';

@Component({
  selector: 'fc-maintenance-overlay',
  standalone: true,
  template: `
    <div class="overlay" role="alertdialog" aria-modal="true" aria-labelledby="maint-title">
      <div class="panel">
        <span class="eyebrow">HỆ THỐNG</span>
        <h1 id="maint-title">Máy chủ đang bảo trì</h1>
        <p>
          Không thể kết nối tới dịch vụ. Có thể hệ thống đang bảo trì hoặc tạm ngưng.
          Vui lòng thử lại sau vài phút.
        </p>
        <button type="button" class="btn-retry" [disabled]="status.checking()" (click)="status.recheck()">
          {{ status.checking() ? 'Đang kiểm tra…' : 'Thử kết nối lại' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(23, 23, 22, 0.72);
      backdrop-filter: blur(4px);
    }
    .panel {
      max-width: 440px;
      width: 100%;
      background: #fff;
      border-radius: var(--radius-card);
      padding: 36px 32px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    }
    .eyebrow {
      font-size: 0.72rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    h1 {
      font-family: Georgia, serif;
      font-size: 1.65rem;
      font-weight: 500;
      margin: 10px 0 16px;
      color: var(--color-text);
    }
    p {
      margin: 0 0 24px;
      color: #555;
      line-height: 1.55;
      font-size: 0.95rem;
    }
    .btn-retry {
      padding: 12px 28px;
      border: none;
      border-radius: var(--radius-control);
      background: var(--color-text);
      color: #fff;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-retry:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .btn-retry:not(:disabled):hover {
      background: #333;
    }
  `],
})
export class MaintenanceOverlayComponent {
  readonly status = inject(ServerStatusService);
}
