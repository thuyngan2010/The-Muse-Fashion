import { watchAiJob } from '../services/ai-polling';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { AiJob, ProductSummary } from '@fashion/contracts';
import { ApiService, bodyPayload, heightError, weightError } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { Subscription } from 'rxjs';
import { STORE_AI_MIX_MATCH_CONTENT } from '../shared/store-content';
import { detectLandscape } from '../shared/ai-photo';
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
      <header class="hero">
        <span class="eyebrow">{{ content.eyebrow }}</span>
        <h1>{{ content.title }}</h1>
        <p>{{ content.description }}</p>
        <div class="hero-links">
          <a routerLink="/ai/history" class="text-link">{{ content.historyLink }}</a>
          <a routerLink="/ai/try-on" class="text-link">{{ content.tryOnLink }}</a>
        </div>
      </header>

      <div class="mix-match-layout">
        <div class="steps-col">
          <section class="card" aria-labelledby="step1-title">
            <span class="step-label">{{ content.step1.label }}</span>
            <h2 id="step1-title">{{ content.step1.title }}</h2>
            <input #fileInput id="mix-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden [disabled]="uploading() || generating()" (change)="onFileSelected($event)" />
            <button type="button" class="upload-canvas" [disabled]="uploading() || generating()" (click)="fileInput.click()">
              @if (previewUrl()) { <img [src]="previewUrl()" alt="Ảnh để phối đồ" /> }
              @else { <span class="upload-mark" aria-hidden="true">＋</span><strong>TẢI ẢNH CỦA BẠN</strong><small>{{ content.uploadHint }}</small> }
            </button>
            <p class="photo-guide">Chỉ cần ảnh thấy rõ khuôn mặt. Nên dùng ảnh <strong>toàn thân, đứng thẳng, đủ sáng, một mình</strong> để kết quả giống bạn nhất. Ảnh chỉ có mặt hoặc nửa người thì AI sẽ tự dựng phần còn lại, nên kém chân thực hơn.</p>
            @if (landscapeHint()) { <p class="photo-hint" role="status">Ảnh nằm ngang thường không thấy toàn thân. Bạn có thể đổi sang ảnh dọc để kết quả đẹp hơn.</p> }
            @if (uploading()) { <p class="msg" role="status">Đang tải ảnh...</p> }
            @if (uploadError()) {
              <div class="msg error" role="alert">
                <span>{{ uploadError() }}</span>
                <button type="button" class="btn-outline small" (click)="retryUpload()">THỬ TẢI LẠI</button>
              </div>
            } @else if (uploadedMediaId()) { <p class="msg success" role="status">Ảnh đã tải lên thành công.</p> }
          </section>

          <section class="card" aria-labelledby="step2-title">
            <span class="step-label">{{ content.step2.label }}</span>
            <h2 id="step2-title">{{ content.step2.title }}</h2>

            <button type="button" class="btn-primary" [attr.aria-expanded]="pickerOpen()" aria-controls="product-picker" (click)="pickerOpen.set(!pickerOpen())">
              {{ pickerOpen() ? content.closePicker : content.pickProducts }}
            </button>

            @if (pickerOpen()) {
              <div id="product-picker" class="picker">
                @if (loadingProducts()) {
                  <p class="msg" role="status">Đang tải sản phẩm...</p>
                } @else if (products().length === 0) {
                  <p class="msg">Hiện chưa có sản phẩm để chọn.</p>
                } @else {
                  <div class="products-grid-picker">
                    @for (prod of products(); track prod.id) {
                      <button type="button" class="product-item-chip" [class.selected]="selectedProductIds().includes(prod.id)" [attr.aria-pressed]="selectedProductIds().includes(prod.id)" (click)="toggleProduct(prod.id)">
                        @if (prod.images && prod.images.length > 0) { <img [src]="prod.images[0]" [alt]="prod.name" /> }
                        <span class="item-meta"><strong>{{ prod.name }}</strong><span>{{ prod.price | currency:'VND':'symbol':'1.0-0' }}</span></span>
                      </button>
                    }
                  </div>
                }
              </div>
            }

            <div class="selected-box">
              <div class="selected-head">
                <span>{{ content.selectedTitle }}</span>
                <strong [class.ok]="selectedProductIds().length >= content.minItems">Đã chọn {{ selectedProductIds().length }}/{{ content.maxItems }}</strong>
              </div>
              @if (getSelectedProducts().length === 0) {
                <p class="muted">{{ content.selectedEmpty }}</p>
              } @else {
                <ul class="selected-strip">
                  @for (prod of getSelectedProducts(); track prod.id) {
                    <li>
                      <span class="p-thumb">@if (prod.images && prod.images.length > 0) { <img [src]="prod.images[0]" [alt]="prod.name" /> }</span>
                      <span class="sel-name">{{ prod.name }}</span>
                      <button type="button" class="remove" [attr.aria-label]="'Bỏ ' + prod.name" (click)="toggleProduct(prod.id)">×</button>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="measure-grid">
              <label>CHIỀU CAO <span><input type="number" inputmode="numeric" min="120" max="220" step="1" [(ngModel)]="height" name="height" placeholder="—" [attr.aria-invalid]="heightError() ? 'true' : null" /> cm</span></label>
              <label>CÂN NẶNG <span><input type="number" inputmode="decimal" min="30" max="200" step="0.1" [(ngModel)]="weight" name="weight" placeholder="—" [attr.aria-invalid]="weightError() ? 'true' : null" /> kg</span></label>
            </div>
            @if (heightError() || weightError()) {
              <p class="measure-error" role="alert">{{ heightError() || weightError() }}</p>
            }
            <p class="measure-note">Không bắt buộc. Giúp AI thể hiện độ dài và độ vừa của trang phục sát hơn.</p>
            @if (!height || !weight) { <p class="measure-hint">Nhập chiều cao và cân nặng giúp AI dựng dáng chính xác hơn, nhất là khi ảnh không toàn thân.</p> }

            <label class="consent-label">
              <input type="checkbox" [(ngModel)]="consentAccepted" name="consent" />
              <span>Đồng ý phân tích ảnh người và sản phẩm, lập phương án phối đồ và tạo ảnh theo Chính sách AI của thương hiệu.</span>
            </label>

            <button
              type="button"
              class="btn-submit"
              [disabled]="generating() || uploading() || !uploadedMediaId() || selectedProductIds().length < 2 || !consentAccepted || job()?.state === 'PENDING' || job()?.state === 'PROCESSING'"
              (click)="generateMixMatch()"
            >
              {{ generating() ? 'ĐANG TẠO BẢN PHỐI...' : content.generate }}
            </button>
          </section>
        </div>

        <section class="card result-card" aria-live="polite">
          <h2>{{ content.resultTitle }}</h2>

          @if (job(); as j) {
            <fc-ai-job-details [job]="j" />
            @if (j.state === 'PENDING' || j.state === 'PROCESSING') {
              <div class="state-block" role="status">
                <div class="spinner" aria-hidden="true"></div>
                <h4>Đang thiết kế bản phối...</h4>
                <p>Đang đối chiếu màu sắc, chất liệu và phong cách phù hợp.</p>
              </div>
            } @else if (j.state === 'FAILED' || j.state === 'EXPIRED') {
              <div class="state-block">
                <p class="error-msg" role="alert">{{ j.errorMessage || 'Không thể tạo bản phối vào lúc này. Vui lòng thử lại.' }}</p>
              </div>
            } @else if (j.state === 'COMPLETED') {
              <div class="outfit-results">
                @for (img of j.resultUrls; track img) {
                  <div class="outfit-banner"><img [src]="img" alt="Bản phối hoàn chỉnh" /></div>
                }
                <div class="outfit-items-list">
                  <h3>{{ content.itemsTitle }}</h3>
                  @for (prod of getSelectedProducts(); track prod.id) {
                    <div class="outfit-row">
                      <span class="p-thumb">@if (prod.images && prod.images.length > 0) { <img [src]="prod.images[0]" [alt]="prod.name" /> }</span>
                      <div class="p-info">
                        <strong>{{ prod.name }}</strong>
                        <span class="p-price">{{ prod.price | currency:'VND':'symbol':'1.0-0' }}</span>
                      </div>
                      <a [routerLink]="['/products', prod.slug]" class="btn-text">{{ content.viewProduct }}</a>
                    </div>
                  }
                </div>
                <a routerLink="/ai/history" class="btn-text history">{{ content.historyLink }} →</a>
              </div>
            }
          } @else {
            <div class="placeholder-block"><p>{{ content.resultEmpty }}</p></div>
          }
        </section>
      </div>
    </main>

    @if (pollingError()) { <p class="msg poll" role="status">{{ pollingError() }}</p> }
`,
  styles: [`
    :host { display: block; background: var(--ui-bg, #fff); color: var(--ui-ink, #171717); font-family: var(--font-sans, "Montserrat", Arial, sans-serif); }
    button, input { font-family: inherit; }
    .mix-match-container { width: min(100%, var(--ui-page-max, 1280px)); margin: 0 auto; padding: 64px var(--ui-page-pad, 48px) 96px; }
    .hero { max-width: 760px; margin: 0 auto 48px; text-align: center; }
    .eyebrow { color: var(--ui-accent, #8f485d); font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .hero h1 { margin: 10px 0 14px; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 44px; font-weight: 400; line-height: 52px; letter-spacing: -1px; }
    .hero p { margin: 0 0 20px; color: var(--ui-ink-soft, #444748); font-size: 14px; line-height: 1.7; }
    .hero-links { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 20px; }
    .text-link { color: var(--ui-ink, #171717); font-size: 12px; font-weight: 700; letter-spacing: .6px; text-decoration: underline; text-underline-offset: 5px; }
    .mix-match-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 40px; align-items: start; }
    .steps-col { display: grid; gap: 24px; min-width: 0; }
    .card { min-width: 0; padding: 32px; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; }
    .step-label { color: var(--ui-accent, #8f485d); font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .card h2 { margin: 6px 0 20px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,.2); font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 22px; font-weight: 500; line-height: 30px; letter-spacing: -.3px; }
    .upload-canvas { display: flex; width: 100%; min-height: 240px; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 0; border: 1px dashed var(--ui-line, #c4c7c7); background: var(--ui-bg-soft, #f5f3f3); color: var(--ui-ink, #171717); font-size: 12px; letter-spacing: .8px; cursor: pointer; overflow: hidden; }
    .upload-canvas:hover:not(:disabled) { border-color: var(--ui-ink, #171717); }
    .upload-canvas:disabled { opacity: .6; cursor: not-allowed; }
    .upload-canvas img { display: block; width: 100%; max-height: 380px; object-fit: contain; }
    .upload-mark { font-size: 28px; color: var(--ui-accent, #8f485d); }
    .upload-canvas small { color: var(--ui-subtle, #747878); font-size: 11px; }
    .msg { margin: 12px 0 0; color: var(--ui-ink-soft, #444748); font-size: 13px; }
    .msg.error { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border: 1px solid var(--ui-danger, #9b2c2c); background: var(--ui-danger-bg, #fff1f1); color: var(--ui-danger, #9b2c2c); }
    .msg.success { color: var(--ui-success, #276749); font-weight: 600; }
    .msg.poll { max-width: 760px; margin: 0 auto 24px; text-align: center; }
    .muted { margin: 0; color: var(--ui-subtle, #747878); font-size: 13px; }
    .btn-primary, .btn-outline, .outline-button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 22px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; font-size: 12px; font-weight: 700; letter-spacing: .8px; text-decoration: none; cursor: pointer; }
    .btn-primary { background: var(--ui-ink, #171717); color: #fff; }
    .btn-primary:hover { background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); }
    .btn-outline, .outline-button { background: #fff; color: var(--ui-ink, #171717); }
    .btn-outline:hover, .outline-button:hover { background: var(--ui-pink, #f4b8c1); }
    .btn-outline.small { min-height: 34px; padding: 0 14px; }
    .picker { margin-top: 16px; padding: 14px; border: 1px solid var(--ui-line-soft, #e3e2e2); background: var(--ui-bg-soft, #f5f3f3); }
    .products-grid-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; max-height: 280px; overflow-y: auto; }
    .product-item-chip { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--ui-line, #c4c7c7); border-radius: 0; background: #fff; color: inherit; text-align: left; cursor: pointer; }
    .product-item-chip.selected { border-color: var(--ui-ink, #171717); background: var(--ui-pink-soft, #ffd9e1); }
    .product-item-chip img { width: 40px; height: 52px; flex: none; object-fit: cover; }
    .item-meta { display: grid; gap: 2px; min-width: 0; }
    .item-meta strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .item-meta span { color: var(--ui-price, #c52929); font-size: 12px; }
    .selected-box { margin: 20px 0; padding: 16px; border: 1px solid var(--ui-line-soft, #e3e2e2); }
    .selected-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; color: var(--ui-subtle, #747878); font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .selected-head strong { color: var(--ui-ink-soft, #444748); }
    .selected-head strong.ok { color: var(--ui-success, #276749); }
    .selected-strip { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .selected-strip li { display: flex; align-items: center; gap: 8px; max-width: 100%; padding: 6px 6px 6px 6px; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; }
    .p-thumb { display: block; width: 40px; height: 48px; flex: none; background: var(--ui-bg-image, #efeded); overflow: hidden; }
    .p-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .sel-name { max-width: 140px; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .remove { width: 28px; height: 28px; border: 0; background: none; color: var(--ui-ink, #171717); font-size: 18px; line-height: 1; cursor: pointer; }
    .remove:hover { color: var(--ui-danger, #9b2c2c); }
    .measure-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
    .measure-grid label { padding: 12px; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
    .measure-grid label span { display: flex; gap: 6px; align-items: baseline; margin-top: 8px; color: var(--ui-ink-soft, #444748); font-size: 12px; letter-spacing: 0; }
    .measure-grid input { min-width: 0; width: 100%; padding: 0; border: 0; background: transparent; color: var(--ui-ink, #171717); font: 400 22px var(--font-serif, Georgia, serif); }
    .measure-error { margin: 0 0 8px; color: var(--ui-danger, #9b2c2c); font-size: 12px; }
    .measure-note { margin: 0 0 16px; color: var(--ui-ink-soft, #444748); font-size: 12px; line-height: 1.5; }
    .photo-guide{margin:12px 0 0;color:#4f4842;font-size:12px;line-height:1.6}.photo-guide strong{color:#171513}.photo-hint{margin:8px 0 0;padding:8px 12px;background:#fff7e6;color:#7a5200;font-size:12px;line-height:1.5}.measure-hint{margin:6px 0 0;color:#9b5663;font-size:11px;line-height:1.5} .measure-hint { margin: -10px 0 16px; }
    @media (max-width: 640px) { .measure-grid { grid-template-columns: 1fr; } }
    .consent-label { display: flex; gap: 8px; margin-bottom: 20px; padding: 12px; background: var(--ui-bg-soft, #f5f3f3); color: var(--ui-ink-soft, #444748); font-size: 12px; line-height: 1.55; cursor: pointer; }
    .btn-submit { width: 100%; min-height: 50px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); font-size: 12px; font-weight: 800; letter-spacing: 1.2px; cursor: pointer; }
    .btn-submit:hover:not(:disabled) { background: var(--ui-ink, #171717); color: #fff; }
    .btn-submit:disabled { border-color: var(--ui-line, #c4c7c7); background: var(--ui-bg-image, #efeded); color: var(--ui-subtle, #747878); cursor: not-allowed; }
    .result-card { position: sticky; top: 24px; border-color: var(--ui-ink, #171717); }
    .state-block, .placeholder-block { padding: 56px 20px; color: var(--ui-ink-soft, #444748); font-size: 13px; text-align: center; }
    .state-block h4 { margin: 12px 0 6px; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 18px; font-weight: 500; }
    .state-block p, .placeholder-block p { margin: 0; line-height: 1.6; }
    .spinner { width: 32px; height: 32px; margin: 0 auto; border: 2px solid var(--ui-line, #c4c7c7); border-top-color: var(--ui-ink, #171717); border-radius: 50%; animation: spin .9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
    .error-msg { padding: 16px; border: 1px solid var(--ui-danger, #9b2c2c); background: var(--ui-danger-bg, #fff1f1); color: var(--ui-danger, #9b2c2c); line-height: 1.6; }
    .outfit-results { display: grid; gap: 24px; }
    .outfit-banner { border: 1px solid var(--ui-line, #c4c7c7); overflow: hidden; }
    .outfit-banner img { display: block; width: 100%; height: auto; }
    .outfit-items-list h3 { margin: 0 0 12px; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 18px; font-weight: 500; }
    .outfit-row { display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid var(--ui-line-soft, #e3e2e2); margin-bottom: 8px; }
    .p-info { flex: 1; min-width: 0; }
    .p-info strong { display: block; font-size: 13px; }
    .p-price { color: var(--ui-price, #c52929); font-size: 12px; }
    .btn-text { color: var(--ui-ink, #171717); font-size: 12px; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
    .btn-text.history { justify-self: start; }
    :is(button, a, input):focus-visible { outline: 2px solid var(--ui-accent, #8f485d); outline-offset: 3px; }
    @media (max-width: 980px) {
      .mix-match-container { padding-inline: 28px; }
      .mix-match-layout { grid-template-columns: 1fr; }
      .result-card { position: static; }
    }
    @media (max-width: 640px) {
      .mix-match-container { padding: 36px 18px 64px; }
      .hero h1 { font-size: 32px; line-height: 40px; }
      .card { padding: 22px 18px; }
      .btn-primary, .outline-button { width: 100%; }
      .outfit-row { flex-wrap: wrap; }
    }
  `],
})
export class AiMixMatchPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);

  readonly content = STORE_AI_MIX_MATCH_CONTENT;
  readonly pickerOpen = signal(false);

  readonly styles = [
    { id: 'office', name: 'Công sở thanh lịch', icon: '💼' },
    { id: 'streetwear', name: 'Dạo phố năng động', icon: '👟' },
    { id: 'evening', name: 'Dạ tiệc sang trọng', icon: '✨' },
    { id: 'minimalist', name: 'Tối giản hiện đại', icon: '🌿' },
  ];

  readonly selectedStyle = signal<string>('office');
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  /** Ảnh nằm ngang (rộng hơn cao): chỉ gợi ý đổi sang ảnh dọc, không chặn. */
  readonly landscapeHint = signal(false);
  private selectedFile?: File;
  private uploadSubscription?: Subscription;
  readonly uploadedMediaId = signal('');
  readonly previewUrl = signal('');
  readonly products = signal<ProductSummary[]>([]);
  readonly loadingProducts = signal<boolean>(true);

  readonly selectedProductIds = signal<string[]>([]);
  consentAccepted = false;
  height: number | null = null;
  weight: number | null = null;
  heightError(): string { return heightError(this.height); }
  weightError(): string { return weightError(this.weight); }

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
    const bodyMsg = this.heightError() || this.weightError();
    if (bodyMsg) { this.toast.error(bodyMsg); return; }

    this.generating.set(true);
    const key = generateUUID();

    this.api.createMixMatch({
      productIds: ids,
      style: this.selectedStyle(),
      inputMediaId: this.uploadedMediaId(),
      consentPolicyVersion: '2026-10-fashion-agent-v1',
      ...bodyPayload(this.height, this.weight),
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
    this.landscapeHint.set(false);
    reader.onload = () => {
      if (this.selectedFile !== file) return;
      const url = String(reader.result);
      this.previewUrl.set(url);
      detectLandscape(url, (landscape) => { if (this.previewUrl() === url) this.landscapeHint.set(landscape); });
    };
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
