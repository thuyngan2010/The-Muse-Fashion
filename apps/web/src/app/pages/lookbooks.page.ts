import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Lookbook } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { ModalComponent } from '../components/modal.component';
import { STORE_LOOKBOOKS_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

@Component({
  standalone: true,
  imports: [PageStateComponent, RouterLink, ModalComponent],
  template: `
    <main class="lookbook-page-container">
      <header class="page-header">
        <span class="eyebrow">{{ content.eyebrow }}</span>
        <h1 class="page-title">{{ content.title }}</h1>
        <p class="page-desc">{{ content.description }}</p>
      </header>

      @if (loading()) {
        <fc-page-state kind="loading" [title]="content.loading" />
      } @else if (error()) {
        <fc-page-state kind="error" title="Không tải được bộ sưu tập" [message]="error()" [actionLabel]="content.retry" (action)="loadLookbooks()" />
      } @else if (lookbooks().length === 0) {
        <fc-page-state kind="empty" [title]="content.empty" [actionLabel]="content.emptyAction" actionLink="/products" />
      } @else {
        @if (lookbooks()[0]; as first) {
          <article class="feature-card" role="button" tabindex="0" [attr.aria-label]="'Xem bộ sưu tập: ' + first.title" (click)="openDetail(first)" (keydown.enter)="openDetail(first)" (keydown.space)="$event.preventDefault(); openDetail(first)">
            <div class="feature-image">
              @if (first.mainImageUrl) { <img [src]="first.mainImageUrl" [alt]="first.title" /> } @else { <div class="card-placeholder">MUSE</div> }
            </div>
            <div class="feature-copy">
              @if (first.tags && first.tags.length > 0) {
                <div class="tags-row">@for (t of first.tags; track t) { <span class="tag">#{{ t }}</span> }</div>
              }
              <h2>{{ first.title }}</h2>
              <p>{{ first.description }}</p>
              <span class="view-btn">{{ content.viewCollection }}</span>
            </div>
          </article>
        }

        @if (lookbooks().length > 1) {
          <div class="lookbook-grid">
            @for (lb of lookbooks().slice(1); track lb.id) {
              <article class="lookbook-card" role="button" tabindex="0" [attr.aria-label]="'Xem bộ sưu tập: ' + lb.title" (click)="openDetail(lb)" (keydown.enter)="openDetail(lb)" (keydown.space)="$event.preventDefault(); openDetail(lb)">
                <div class="card-image-wrap">
                  @if (lb.mainImageUrl) { <img [src]="lb.mainImageUrl" [alt]="lb.title" loading="lazy" /> } @else { <div class="card-placeholder">MUSE</div> }
                </div>
                <div class="card-content">
                  @if (lb.tags && lb.tags.length > 0) {
                    <div class="tags-row">@for (t of lb.tags; track t) { <span class="tag">#{{ t }}</span> }</div>
                  }
                  <h3 class="card-title">{{ lb.title }}</h3>
                  <p class="card-desc">{{ lb.description }}</p>
                  <span class="view-btn">{{ content.viewCollection }}</span>
                </div>
              </article>
            }
          </div>
        }
      }
    </main>

    <fc-modal
      [isOpen]="detailModalOpen()"
      [title]="activeLookbook()?.title || content.detailTitle"
      maxWidth="920px"
      (close)="detailModalOpen.set(false)"
    >
      @if (activeLookbook(); as active) {
        <div class="lookbook-modal-body">
          @if (active.mainImageUrl) {
            <div class="modal-image-wrap"><img [src]="active.mainImageUrl" [alt]="active.title" /></div>
          }
          <p class="modal-desc">{{ active.description }}</p>

          <div class="tagged-products">
            <h4>{{ content.productsTitle }}</h4>
            @if (active.products && active.products.length > 0) {
              <ul class="product-list">
                @for (prod of active.products; track prod.id) {
                  <li class="product-row">
                    <a [routerLink]="['/products', prod.slug]" class="product-link" (click)="detailModalOpen.set(false)">
                      <span class="mini-img">@if (prod.images && prod.images.length > 0) { <img [src]="prod.images[0]" [alt]="prod.name" /> }</span>
                      <span class="mini-info"><strong>{{ prod.name }}</strong><span>{{ content.viewProduct }} →</span></span>
                    </a>
                    <a [routerLink]="['/ai/try-on']" [queryParams]="{ productId: prod.id }" class="btn-outline small" (click)="detailModalOpen.set(false)">{{ content.tryOn }}</a>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">{{ content.noProducts }}</p>
            }
          </div>
        </div>
      }
    </fc-modal>
  `,
  styles: [`
    :host { display: block; background: var(--ui-bg, #fff); color: var(--ui-ink, #171717); font-family: var(--font-sans, "Montserrat", Arial, sans-serif); }
    button { font-family: inherit; }
    .lookbook-page-container { width: min(100%, var(--ui-page-max, 1280px)); margin: 0 auto; padding: 64px var(--ui-page-pad, 48px) 96px; }
    .page-header { margin-bottom: 48px; padding-bottom: 20px; border-bottom: 1px solid var(--ui-ink, #171717); max-width: none; }
    .eyebrow { color: var(--ui-accent, #8f485d); font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .page-title { margin: 8px 0 12px; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 40px; font-weight: 400; line-height: 48px; letter-spacing: -1px; }
    .page-desc { max-width: 640px; margin: 0; color: var(--ui-ink-soft, #444748); font-size: 14px; line-height: 1.7; }
    .feature-card { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); margin-bottom: 48px; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; cursor: pointer; }
    .feature-image { min-height: 520px; background: var(--ui-bg-image, #efeded); overflow: hidden; }
    .feature-image img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .feature-copy { display: flex; flex-direction: column; justify-content: center; gap: 16px; padding: 48px; }
    .feature-copy h2 { margin: 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 34px; font-weight: 400; line-height: 42px; letter-spacing: -.6px; }
    .feature-copy p { margin: 0; color: var(--ui-ink-soft, #444748); font-size: 14px; line-height: 1.7; }
    .lookbook-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; }
    .lookbook-card { display: flex; flex-direction: column; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; cursor: pointer; }
    .card-image-wrap { aspect-ratio: 3 / 4; background: var(--ui-bg-image, #efeded); overflow: hidden; }
    .card-image-wrap img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .card-placeholder { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: var(--ui-accent, #8f485d); font-size: 11px; letter-spacing: .2em; }
    .card-content { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 22px 24px 26px; }
    .tags-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag { color: var(--ui-accent, #8f485d); font-size: 11px; font-weight: 700; letter-spacing: .6px; }
    .card-title { margin: 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 22px; font-weight: 500; line-height: 30px; }
    .card-desc { margin: 0; color: var(--ui-ink-soft, #444748); font-size: 13px; line-height: 1.65; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .view-btn { align-self: flex-start; margin-top: auto; padding: 12px 20px; border: 1px solid var(--ui-ink, #171717); background: #fff; color: var(--ui-ink, #171717); font-size: 12px; font-weight: 700; letter-spacing: .8px; }
    .feature-card:hover .view-btn, .lookbook-card:hover .view-btn { background: var(--ui-pink, #f4b8c1); }
    .feature-copy .view-btn { margin-top: 8px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    .btn-primary, .btn-outline { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 22px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; font-size: 12px; font-weight: 700; letter-spacing: .8px; text-decoration: none; cursor: pointer; }
    .btn-primary { background: var(--ui-ink, #171717); color: #fff; }
    .btn-primary:hover { background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); }
    .btn-outline { background: #fff; color: var(--ui-ink, #171717); }
    .btn-outline:hover { background: var(--ui-pink, #f4b8c1); }
    .btn-outline.small { min-height: 36px; padding: 0 16px; }
    .lookbook-modal-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; align-items: start; }
    .modal-image-wrap { grid-row: span 2; background: var(--ui-bg-image, #efeded); overflow: hidden; }
    .modal-image-wrap img { display: block; width: 100%; max-height: 560px; object-fit: cover; }
    .modal-desc { margin: 0; color: var(--ui-ink-soft, #444748); font-size: 14px; line-height: 1.7; }
    .tagged-products h4 { margin: 0 0 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,.2); font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 18px; font-weight: 500; }
    .muted { margin: 0; color: var(--ui-subtle, #747878); font-size: 13px; }
    .product-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .product-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px; border: 1px solid var(--ui-line-soft, #e3e2e2); }
    .product-link { display: flex; align-items: center; gap: 12px; min-width: 0; color: inherit; text-decoration: none; }
    .mini-img { display: block; width: 52px; height: 66px; flex: none; background: var(--ui-bg-image, #efeded); overflow: hidden; }
    .mini-img img { width: 100%; height: 100%; object-fit: cover; }
    .mini-info { display: grid; gap: 2px; min-width: 0; }
    .mini-info strong { font-size: 13px; }
    .mini-info span { color: var(--ui-accent, #8f485d); font-size: 11px; font-weight: 700; }
    :is(button, a, [role="button"]):focus-visible { outline: 2px solid var(--ui-accent, #8f485d); outline-offset: 3px; }
    @media (max-width: 980px) {
      .lookbook-page-container { padding-inline: 28px; }
      .feature-card { grid-template-columns: 1fr; }
      .feature-image { min-height: 360px; }
      .feature-copy { padding: 28px; }
      .lookbook-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .lookbook-modal-body { grid-template-columns: 1fr; }
      .modal-image-wrap { grid-row: auto; }
    }
    @media (max-width: 640px) {
      .lookbook-page-container { padding: 36px 18px 64px; }
      .page-title { font-size: 32px; line-height: 40px; }
      .lookbook-grid { grid-template-columns: 1fr; }
      .view-btn, .btn-primary, .btn-outline { width: 100%; text-align: center; justify-content: center; }
      .btn-outline.small { width: auto; }
      .product-row { flex-wrap: wrap; }
    }
  `],
})
export class LookbooksPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly content = STORE_LOOKBOOKS_CONTENT;

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
