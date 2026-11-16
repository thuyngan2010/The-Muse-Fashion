import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';

@Component({
  standalone: true,
  imports: [PaginationComponent, DatePipe, FormsModule],
  template: `
    <div class="admin-moderation-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Kiểm duyệt Nội dung</h1>
          <p class="page-desc">Phê duyệt hoặc từ chối đánh giá sản phẩm và bài viết cộng đồng trước khi hiển thị công khai.</p>
        </div>
      </header>
      <div class="filters">
        <label>Trạng thái <select [(ngModel)]="statusFilter" (ngModelChange)="filterChanged()">
          <option value="">Tất cả</option><option value="PENDING_REVIEW">Chờ duyệt</option>
          <option value="PUBLIC">Công khai</option><option value="HIDDEN">Đã ẩn</option>
        </select></label>
        <label>Loại nội dung <select [(ngModel)]="typeFilter" (ngModelChange)="filterChanged()">
          <option value="">Tất cả</option><option value="REVIEW">Đánh giá</option>
          <option value="POST">Bài viết</option><option value="COMMENT">Bình luận</option>
        </select></label>
      </div>

      @if (loading()) {
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Đang tải hàng đợi kiểm duyệt...</p>
        </div>
      } @else if (items().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <h3>Hàng đợi kiểm duyệt trống</h3>
          <p>Tất cả nội dung người dùng đăng tải đã được xử lý xong.</p>
        </div>
      } @else {
        <div class="moderation-list">
          @for (item of items(); track item.id) {
            <article class="mod-card">
              <div class="mod-header">
                <span class="type-badge">{{ item.targetType }}</span>
                <span class="date">{{ item.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
              </div>

              <div class="mod-body">
                <p class="author">Tác giả ID: <strong>{{ item.authorId || item.ownerId || 'N/A' }}</strong></p>
                <div class="content-box">
                  <p>{{ item.content || item.caption || '(Không có văn bản)' }}</p>
                </div>
              </div>

              <div class="mod-footer">
                <button type="button" class="btn-reject" (click)="decide(item.id, 'REJECTED')">
                  ✕ Từ chối hiển thị
                </button>
                <button type="button" class="btn-approve" (click)="decide(item.id, 'APPROVED')">
                  ✓ Phê duyệt công khai
                </button>
              </div>
            </article>
          }
        </div>
      }
    </div>

    <fc-pagination label="Phân trang" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />
`,
  styles: [`
    .admin-moderation-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .page-header {
      margin-bottom: 8px;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: 1.8rem;
      margin: 0 0 6px;
      font-weight: 500;
    }
    .page-desc {
      color: var(--color-muted);
      font-size: 0.9rem;
      margin: 0;
    }
    .moderation-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .mod-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .mod-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .type-badge {
      font-size: 0.75rem;
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      padding: 3px 8px;
      border-radius: var(--radius-control);
      font-weight: 600;
      color: var(--color-accent);
    }
    .date {
      font-size: 0.8rem;
      color: var(--color-muted);
    }
    .author {
      font-size: 0.85rem;
      color: var(--color-muted);
      margin: 0 0 8px;
    }
    .content-box {
      background: var(--color-canvas);
      border-radius: 6px;
      padding: 14px;
      border: 1px solid var(--color-divider);
    }
    .content-box p {
      margin: 0;
      font-size: 0.92rem;
      color: #2b2824;
      line-height: 1.6;
    }
    .mod-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--color-canvas);
    }
    .btn-approve {
      background: #2e7d32;
      color: white;
      border: 0;
      padding: 8px 16px;
      border-radius: var(--radius-control);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-reject {
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      color: #c62828;
      padding: 8px 16px;
      border-radius: var(--radius-control);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .empty-state {
      text-align: center;
      padding: 70px 20px;
      background: var(--color-surface);
      border: 1px dashed #dedad2;
      border-radius: var(--radius-card);
    }
    .empty-icon {
      font-size: 2.5rem;
      color: #2e7d32;
      margin-bottom: 12px;
    }
    .empty-state h3 {
      font-family: Georgia, serif;
      font-size: 1.4rem;
      margin: 0 0 6px;
    }
    .empty-state p {
      color: var(--color-muted);
      margin: 0;
      font-size: 0.9rem;
    }
    .loading-box {
      text-align: center;
      padding: 60px 0;
      color: var(--color-muted);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-text);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .filters { display:flex; flex-wrap:wrap; gap:16px; padding:16px 20px; margin-bottom:24px; background:var(--color-surface); border:1px solid var(--color-divider); border-radius:var(--radius-card); }
    .filters label { display:flex; flex-wrap:wrap; align-items:center; gap:10px; font-size:.875rem; color:var(--color-muted); }
    .mod-body { min-width:0; overflow-wrap:anywhere; }


  `],
})
export class AdminModerationPage implements OnInit {
  statusFilter = 'PENDING_REVIEW';
  typeFilter = '';
  filterChanged(): void { this.pagination.reset(); this.loadModeration(); }
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadModeration(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly items = signal<any[]>([]);
  readonly loading = signal<boolean>(true);

  ngOnInit(): void {
    this.loadModeration();
  }

  loadModeration(): void {
    this.loading.set(true);
    this.pagination.load(() => this.api.adminListModeration(this.pagination.page(), this.pagination.limit, this.statusFilter || undefined, this.typeFilter || undefined), {
      next: (res) => {
        this.items.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  decide(id: string, decision: 'APPROVED' | 'REJECTED'): void {
    const item = this.items().find(item => item.id === id);
    if (!item) return;
    this.api.adminModerate(id, { targetType: item.targetType, action: decision === 'APPROVED' ? 'RESTORE' : 'HIDE', reason: decision === 'APPROVED' ? 'Nội dung phù hợp' : 'Nội dung không phù hợp' }).subscribe({
      next: () => {
        this.loadModeration();
        this.toast.success(`Đã ${decision === 'APPROVED' ? 'phê duyệt' : 'từ chối'} nội dung.`);
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể thực hiện kiểm duyệt.');
      },
    });
  }
}
