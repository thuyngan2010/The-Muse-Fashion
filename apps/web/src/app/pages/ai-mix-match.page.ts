import { watchAiJob } from '../services/ai-polling';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { AiJob, ProductSummary } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { Subscription } from 'rxjs';
import { AiJobDetailsComponent } from '../components/ai-job-details.component';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Component({
  standalone: true,
  imports: [RouterLink, CurrencyPipe, FormsModule, AiJobDetailsComponent],
  template: `
    <main class="mix-match-container">
      <header class="page-header">
        <span class="eyebrow">AI STYLING ADVISOR</span>
        <h1 class="page-title">Gợi ý phối đồ AI Mix & Match</h1>
        <p class="page-desc">
          Trợ lý phong cách AI tự động phân tích và tạo nên những bản phối hoàn hảo cho từng dịp xuất hiện.
        </p>
      </header>

      <div class="mix-match-layout">
        <!-- Settings Form -->
        <section class="card config-card">
          <div class="form-group">
            <label class="group-title" for="mix-photo">1. Tải ảnh của bạn</label>
            <input id="mix-photo" type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploading() || generating()" (change)="onFileSelected($event)" />
            @if (uploading()) { <p role="status">Đang tải ảnh...</p> }
            @if (uploadError()) {
              <p role="alert">{{ uploadError() }}</p>
              <button type="button" class="btn-outline" (click)="retryUpload()">Thử tải ảnh lại</button>
            } @else if (uploadedMediaId()) { <p role="status">Ảnh đã tải lên thành công.</p> }
            @if (previewUrl()) { <img [src]="previewUrl()" alt="Ảnh để phối đồ" style="max-width:180px;max-height:200px;object-fit:contain" /> }
          </div>

          <div class="form-group">
            <label class="group-title">2. Chọn món đồ chủ đạo trong bản phối</label>
            @if (loadingProducts()) {
              <p class="notice">Đang tải sản phẩm...</p>
            } @else {
              <div class="products-grid-picker">
                @for (prod of products(); track prod.id) {
                  <div
                    class="product-item-chip"
                    [class.selected]="selectedProductIds().includes(prod.id)"
                    (click)="toggleProduct(prod.id)"
                  >
                    @if (prod.images && prod.images.length > 0) {
                      <img [src]="prod.images[0]" [alt]="prod.name" />
                    }
                    <div class="item-meta">
                      <strong>{{ prod.name }}</strong>
                      <span>{{ prod.price | currency:'VND':'symbol':'1.0-0' }}</span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <div class="consent-box">
            <label class="consent-label">
              <input type="checkbox" [(ngModel)]="consentAccepted" name="consent" />
              <span>Đồng ý phân tích ảnh người và sản phẩm, lập phương án phối đồ và tạo ảnh theo Chính sách AI của thương hiệu.</span>
            </label>
          </div>

          <button
            type="button"
            class="btn-submit"
            [disabled]="generating() || uploading() || !uploadedMediaId() || selectedProductIds().length < 2 || !consentAccepted || job()?.state === 'PENDING' || job()?.state === 'PROCESSING'"
            (click)="generateMixMatch()"
          >
            {{ generating() ? 'Đang tạo bản phối...' : '✨ Tạo gợi ý phối đồ AI' }}
          </button>
        </section>

        <!-- Result Visualizer -->
        <section class="card result-card">
          <h3>Bản phối phong cách đề xuất</h3>

          @if (job(); as j) {
            <fc-ai-job-details [job]="j" />
            @if (j.state === 'PENDING' || j.state === 'PROCESSING') {
              <div class="state-block">
                <div class="spinner"></div>
                <h4>Stylist AI đang thiết kế bản phối...</h4>
                <p>Đang đối chiếu quy tắc màu sắc, chất liệu và phong cách phù hợp.</p>
              </div>
            } @else if (j.state === 'FAILED' || j.state === 'EXPIRED') {
              <div class="state-block">
                <p class="error-msg">{{ j.errorMessage || 'Không thể tạo bản phối vào lúc này. Vui lòng thử lại.' }}</p>
              </div>
            } @else if (j.state === 'COMPLETED') {
              <div class="outfit-results">
                @for (img of j.resultUrls; track img) {
                  <div class="outfit-banner">
                    <img [src]="img" alt="Bản phối hoàn chỉnh" />
                  </div>
                }

                <div class="outfit-items-list">
                  <h4>Các sản phẩm cấu thành set đồ:</h4>
                  @for (prod of getSelectedProducts(); track prod.id) {
                    <div class="outfit-row">
                      <div class="p-thumb">
                        @if (prod.images && prod.images.length > 0) {
                          <img [src]="prod.images[0]" [alt]="prod.name" />
                        }
                      </div>
                      <div class="p-info">
                        <strong>{{ prod.name }}</strong>
                        <span class="p-price">{{ prod.price | currency:'VND':'symbol':'1.0-0' }}</span>
                      </div>
                      <a [routerLink]="['/products', prod.slug]" class="btn-text">Xem chi tiết</a>
                    </div>
                  }
                </div>
              </div>
            }
          } @else {
            <div class="placeholder-block">
              <div class="icon">✨</div>
              <p>Tải ảnh và chọn từ 2 đến 5 sản phẩm để nhận gợi ý phối đồ.</p>
            </div>
          }
        </section>
      </div>
    </main>

    @if (pollingError()) { <p role="status">{{ pollingError() }}</p> }
`,
  styles: [`
    .mix-match-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 50px 6vw 100px;
    }
    .page-header {
      text-align: center;
      max-width: 700px;
      margin: 0 auto 40px;
    }
    .eyebrow {
      font-size: 0.74rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: 2.6rem;
      margin: 8px 0 12px;
      font-weight: 500;
    }
    .page-desc {
      color: var(--color-muted);
      font-size: 1rem;
      line-height: 1.6;
      margin: 0;
    }
    .mix-match-layout {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 40px;
      align-items: start;
    }
    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 30px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    }
    .card h3 {
      font-family: Georgia, serif;
      font-size: 1.25rem;
      font-weight: 500;
      margin: 0 0 18px;
      color: var(--color-text);
    }
    .group-title {
      display: block;
      font-family: Georgia, serif;
      font-size: 1.1rem;
      font-weight: 500;
      margin-bottom: 12px;
      color: var(--color-text);
    }
    .form-group {
      margin-bottom: 24px;
    }
    .style-pills {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .style-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--color-canvas);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.88rem;
      color: #444;
      transition: all 0.15s;
    }
    .style-pill.active {
      background: var(--color-text);
      color: var(--color-surface);
      border-color: var(--color-text);
    }
    .pill-icon {
      font-size: 1.1rem;
    }
    .products-grid-picker {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      max-height: 250px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .product-item-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      background: var(--color-canvas);
      cursor: pointer;
      transition: all 0.15s;
    }
    .product-item-chip.selected {
      border-color: var(--color-text);
      background: #f0ede8;
    }
    .product-item-chip img {
      width: 40px;
      height: 48px;
      object-fit: cover;
      border-radius: var(--radius-control);
    }
    .item-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }
    .item-meta strong {
      font-size: 0.8rem;
      color: var(--color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-meta span {
      font-size: 0.74rem;
      color: var(--color-accent);
    }
    .consent-box {
      background: var(--color-canvas);
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .consent-label {
      display: flex;
      gap: 8px;
      font-size: 0.8rem;
      color: #555;
      cursor: pointer;
    }
    .btn-submit {
      width: 100%;
      background: var(--color-primary);
      color: var(--color-surface);
      border: 0;
      border-radius: var(--radius-control);
      padding: 15px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-submit:hover:not(:disabled) {
      background: #3e3b37;
    }
    .btn-submit:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .state-block, .placeholder-block {
      text-align: center;
      padding: 70px 20px;
      color: var(--color-muted);
    }
    .placeholder-block .icon {
      font-size: 3rem;
      margin-bottom: 12px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    .outfit-banner {
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 20px;
      border: 1px solid var(--color-divider);
    }
    .outfit-banner img {
      width: 100%;
      height: auto;
      object-fit: cover;
    }
    .outfit-items-list h4 {
      font-size: 0.95rem;
      margin: 0 0 12px;
      color: var(--color-text);
    }
    .outfit-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: var(--color-canvas);
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .p-thumb {
      width: 44px;
      height: 52px;
      border-radius: var(--radius-control);
      overflow: hidden;
    }
    .p-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .p-info {
      flex: 1;
    }
    .p-info strong {
      display: block;
      font-size: 0.88rem;
      color: var(--color-text);
    }
    .p-price {
      font-size: 0.8rem;
      color: var(--color-accent);
    }
    .btn-text {
      color: var(--color-text);
      font-size: 0.82rem;
      text-decoration: underline;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 900px) {
      .mix-match-layout {
        grid-template-columns: 1fr;
      }
    }

    .config-card,.result-card { min-width:0; }
    .outfit-results { display:grid; gap:24px; }
    .error-msg { color:var(--color-danger); background:#fbeceb; border:1px solid #edc6c3; border-radius:var(--radius-control); padding:16px; line-height:1.6; }


  `],
})
export class AiMixMatchPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);

  readonly styles = [
    { id: 'office', name: 'Công sở thanh lịch', icon: '💼' },
    { id: 'streetwear', name: 'Dạo phố năng động', icon: '👟' },
    { id: 'evening', name: 'Dạ tiệc sang trọng', icon: '✨' },
    { id: 'minimalist', name: 'Tối giản hiện đại', icon: '🌿' },
  ];

  readonly selectedStyle = signal<string>('office');
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  private selectedFile?: File;
  private uploadSubscription?: Subscription;
  readonly uploadedMediaId = signal('');
  readonly previewUrl = signal('');
  readonly products = signal<ProductSummary[]>([]);
  readonly loadingProducts = signal<boolean>(true);

  readonly selectedProductIds = signal<string[]>([]);
  consentAccepted = false;

  readonly generating = signal<boolean>(false);
  readonly job = signal<AiJob | null>(null);

  private pollSubscription?: Subscription;
  readonly pollingError = signal('');

  ngOnInit(): void {
    this.api.products({ limit: 12 }).subscribe({
      next: (res) => {
        const items = res.items;
        this.products.set(items);
        this.loadingProducts.set(false);
        if (items.length > 0) {
          this.selectedProductIds.set([items[0].id]);
        }
      },
      error: () => {
        this.loadingProducts.set(false);
        this.toast.error('Không thể tải sản phẩm. Vui lòng thử lại.');
      },
    });
  }

  ngOnDestroy(): void {
    this.uploadSubscription?.unsubscribe();
    this.selectedFile = undefined;
    this.pollSubscription?.unsubscribe();
  }

  toggleProduct(id: string): void {
    if (!this.selectedProductIds().includes(id) && this.selectedProductIds().length >= 5) {
      this.toast.warning('Chỉ chọn tối đa 5 sản phẩm.');
      return;
    }
    this.selectedProductIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  getSelectedProducts(): ProductSummary[] {
    const ids = this.selectedProductIds();
    return this.products().filter((p) => ids.includes(p.id));
  }

  generateMixMatch(): void {
    const ids = this.selectedProductIds();
    if (ids.length < 2 || !this.uploadedMediaId() || !this.consentAccepted || this.generating()) return;

    this.generating.set(true);
    const key = generateUUID();

    this.api.createMixMatch({
      productIds: ids,
      style: this.selectedStyle(),
      inputMediaId: this.uploadedMediaId(),
      consentPolicyVersion: '2026-10-fashion-agent-v1',
    }, key).subscribe({
      next: (initialJob) => {
        this.job.set(initialJob);
        this.generating.set(false);
        this.pollJob(initialJob.id);
      },
      error: (err) => {
        this.generating.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo bản phối AI.');
      },
    });
  }

  private pollJob(jobId: string): void {
    this.pollSubscription?.unsubscribe();
    this.pollingError.set('');
    this.pollSubscription = watchAiJob(this.api, jobId, () => this.pollingError.set('Kết nối gián đoạn. Đang tự động thử lại...')).subscribe({
      next: job => {
        this.pollingError.set('');
        this.job.set(job);
        if (job.state === 'COMPLETED') this.toast.success('Ảnh AI đã hoàn tất!');
        if (job.state === 'FAILED' || job.state === 'EXPIRED') this.toast.error(job.errorMessage || 'Tác vụ đã kết thúc hoặc hết hạn.');

      },
      error: () => { this.job.set(null); this.pollingError.set('Không thể tải tác vụ. Vui lòng chọn lại tác vụ hoặc tải lại trang.'); },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => { if (this.selectedFile === file) this.previewUrl.set(String(reader.result)); };
    reader.readAsDataURL(file);
    this.uploadFile(file);
  }

  retryUpload(): void {
    if (this.selectedFile && !this.uploading()) this.uploadFile(this.selectedFile);
  }

  private uploadFile(file: File): void {
    this.uploadSubscription?.unsubscribe();
    this.uploadError.set('');
    this.uploadedMediaId.set('');
    this.uploading.set(true);
    this.uploadSubscription = this.api.uploadImage(file, 'tryon').subscribe({
      next: media => { this.uploadedMediaId.set(media.id); this.uploading.set(false); },
      error: err => {
        this.uploading.set(false);
        this.uploadError.set(err.error?.message || err.message || 'Không thể tải ảnh.');
        this.toast.error(this.uploadError());
      },
    });
  }
}
