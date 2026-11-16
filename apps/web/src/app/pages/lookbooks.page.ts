import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Lookbook } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { ModalComponent } from '../components/modal.component';

@Component({
  standalone: true,
  imports: [RouterLink, ModalComponent],
  template: `
    <main class="lookbook-page-container">
      <header class="page-header">
        <span class="eyebrow">EDITORIAL & INSPIRATION</span>
        <h1 class="page-title">Bộ sưu tập Lookbook</h1>
        <p class="page-desc">
          Lấy cảm hứng từ những bản phối thời trang độc đáo, được tuyển chọn bởi stylist và nhà thiết kế.
        </p>
      </header>

      @if (loading()) {
        <p class="notice">Đang tải lookbooks...</p>
      } @else if (error()) {
        <p class="notice error">{{ error() }}</p>
      } @else {
        <div class="lookbook-grid">
          @for (lb of lookbooks(); track lb.id) {
            <article class="lookbook-card" role="button" tabindex="0" [attr.aria-label]="'Xem Lookbook: ' + lb.title" (click)="openDetail(lb)" (keydown.enter)="openDetail(lb)" (keydown.space)="$event.preventDefault(); openDetail(lb)">
              <div class="card-image-wrap">
                @if (lb.mainImageUrl) {
                  <img [src]="lb.mainImageUrl" [alt]="lb.title" loading="lazy" />
                } @else {
                  <div class="card-placeholder">LOOKBOOK</div>
                }
                <div class="card-overlay">
                  <span class="view-btn">Xem bản phối & Sản phẩm →</span>
                </div>
              </div>
              <div class="card-content">
                @if (lb.tags && lb.tags.length > 0) {
                  <div class="tags-row">
                    @for (t of lb.tags; track t) {
                      <span class="tag">#{{ t }}</span>
                    }
                  </div>
                }
                <h3 class="card-title">{{ lb.title }}</h3>
                <p class="card-desc">{{ lb.description }}</p>
              </div>
            </article>
          } @empty {
            <div class="empty-state">
              <p>Chưa có Lookbook nào được xuất bản.</p>
            </div>
          }
        </div>
      }
    </main>

    <!-- Lookbook Detail Modal -->
    <fc-modal
      [isOpen]="detailModalOpen()"
      [title]="activeLookbook()?.title || 'Chi tiết Lookbook'"
      maxWidth="700px"
      (close)="detailModalOpen.set(false)"
    >
      @if (activeLookbook(); as active) {
        <div class="lookbook-modal-body">
          @if (active.mainImageUrl) {
            <div class="modal-image-wrap">
              <img [src]="active.mainImageUrl" [alt]="active.title" />
            </div>
          }
          <p class="modal-desc">{{ active.description }}</p>

          @if (active.products && active.products.length > 0) {
            <div class="tagged-products">
              <h4>Sản phẩm trong bản phối này:</h4>
              <div class="product-mini-list">
                @for (prod of active.products; track prod.id) {
                  <a [routerLink]="['/products', prod.slug]" class="mini-card" (click)="detailModalOpen.set(false)">
                    <div class="mini-img">
                      @if (prod.images && prod.images.length > 0) {
                        <img [src]="prod.images[0]" [alt]="prod.name" />
                      }
                    </div>
                    <div class="mini-info">
                      <strong>{{ prod.name }}</strong>
                      <span>Xem sản phẩm →</span>
                    </div>
                  </a>
                }
              </div>
            </div>
          }
        </div>
      }
    </fc-modal>
  `,
  styles: [`
    .lookbook-page-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 60px 6vw 100px;
    }
    .page-header {
      margin-bottom: 50px;
      max-width: 700px;
    }
    .eyebrow {
      font-size: 0.74rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: clamp(2.2rem, 4vw, 3.2rem);
      margin: 10px 0 16px;
      font-weight: 500;
    }
    .page-desc {
      color: #555049;
      line-height: 1.8;
      font-size: 1.05rem;
    }
    .lookbook-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 40px;
    }
    .lookbook-card {
      cursor: pointer;
      display: flex;
      flex-direction: column;
      border-radius: 6px;
      overflow: hidden;
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .lookbook-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
    }
    .card-image-wrap {
      aspect-ratio: 16/10;
      position: relative;
      background: #eae5de;
      overflow: hidden;
    }
    .card-image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }
    .lookbook-card:hover .card-image-wrap img {
      transform: scale(1.03);
    }
    .card-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: 0.3em;
      color: #a79d93;
    }
    .card-overlay {
      position: absolute;
      inset: 0;
      background: rgba(23, 23, 22, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .lookbook-card:hover .card-overlay {
      opacity: 1;
    }
    .view-btn {
      background: var(--color-surface);
      color: var(--color-text);
      font-size: 0.85rem;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: var(--radius-control);
    }
    .card-content {
      padding: 24px;
    }
    .tags-row {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .tag {
      font-size: 0.75rem;
      color: var(--color-accent);
      font-weight: 600;
    }
    .card-title {
      font-family: Georgia, serif;
      font-size: 1.4rem;
      font-weight: 500;
      margin: 0 0 10px;
      color: var(--color-text);
    }
    .card-desc {
      color: var(--color-muted);
      font-size: 0.92rem;
      line-height: 1.6;
      margin: 0;
    }
    .lookbook-modal-body {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .modal-image-wrap {
      border-radius: 6px;
      overflow: hidden;
      max-height: 400px;
    }
    .modal-image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .modal-desc {
      color: #444;
      line-height: 1.7;
    }
    .tagged-products h4 {
      font-size: 1rem;
      margin: 0 0 14px;
      color: var(--color-text);
    }
    .product-mini-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .mini-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-control);
      background: var(--color-canvas);
      transition: background 0.15s;
    }
    .mini-card:hover {
      background: #f0ede8;
    }
    .mini-img {
      width: 50px;
      height: 60px;
      background: #ddd;
      border-radius: 3px;
      overflow: hidden;
    }
    .mini-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .mini-info strong {
      display: block;
      font-size: 0.88rem;
      color: var(--color-text);
      margin-bottom: 2px;
    }
    .mini-info span {
      font-size: 0.78rem;
      color: var(--color-accent);
      font-weight: 500;
    }
    @media (max-width: 600px) {
      .lookbook-grid {
        grid-template-columns: 1fr;
      }
      .product-mini-list {
        grid-template-columns: 1fr;
      }
    }

    .empty-state { grid-column:1/-1; padding:48px 24px; text-align:center; background:var(--color-canvas); border:1px dashed var(--color-border); border-radius:var(--radius-card); }
    .lookbook-card:focus-visible .card-overlay { opacity:1; }
    @media(hover:none) { .card-overlay { opacity:1; } }


  `],
})
export class LookbooksPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly lookbooks = signal<Lookbook[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');

  readonly activeLookbook = signal<Lookbook | null>(null);
  readonly detailModalOpen = signal<boolean>(false);

  ngOnInit(): void {
    this.loadLookbooks();
  }

  loadLookbooks(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listLookbooks().subscribe({
      next: (res) => {
        this.lookbooks.set(res.items);
        this.loading.set(false);
      },
      error: () => {
        this.lookbooks.set([]);
        this.error.set('Không thể tải dữ liệu. Vui lòng thử lại.');
        this.loading.set(false);
      },
    });
  }

  openDetail(lb: Lookbook): void {
    this.api.getLookbook(lb.id).subscribe({
      next: (full) => {
        this.activeLookbook.set(full);
        this.detailModalOpen.set(true);
      },
      error: () => {
        this.activeLookbook.set(lb);
        this.detailModalOpen.set(true);
      },
    });
  }
}
