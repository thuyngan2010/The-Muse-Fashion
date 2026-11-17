import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type { Category, ProductSummary } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { STORE_HOME_CONTENT } from '../shared/store-content';

type CategoryTile = { category: Category; image: string; count: number | null };

@Component({
  selector: 'fc-home-page',
  standalone: true,
  imports: [RouterLink, CurrencyPipe, NgTemplateOutlet],
  template: `
    <section class="hero" aria-roledescription="carousel" aria-label="Banner chính">
      @for (slide of content.hero.slides; track slide.image; let i = $index) {
        <img class="hero-img" [class.active]="slideIndex() === i" [src]="slide.image" [alt]="slide.alt" />
      }
      <a routerLink="/products" class="hero-cta">{{ content.hero.cta }}</a>
      <button type="button" class="arrow prev" [attr.aria-label]="content.hero.prev" (click)="go(-1)">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="arrow next" [attr.aria-label]="content.hero.next" (click)="go(1)">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </section>

    <section class="block">
      <header class="head">
        <span class="eyebrow">{{ content.categories.eyebrow }}</span>
        <h2>{{ content.categories.title }}</h2>
      </header>
      @if (categoryError()) {
        <p class="note error">{{ content.categories.error }}</p>
      } @else if (tiles().length === 0) {
        <p class="note">{{ content.categories.empty }}</p>
      } @else {
        <div class="grid">
          @for (t of tiles(); track t.category.id) {
            <a class="cat-card" routerLink="/products" [queryParams]="{ category: t.category.slug || t.category.id }">
              <div class="media">
                @if (t.image) { <img [src]="t.image" [alt]="t.category.name" loading="lazy" /> }
              </div>
              <div class="info">
                <h3 class="name">{{ t.category.name }}</h3>
                @if (t.count !== null) { <span class="count">{{ t.count }} sản phẩm</span> }
              </div>
            </a>
          }
        </div>
      }
    </section>

    <section class="block">
      <header class="head">
        <span class="eyebrow">{{ content.newArrivals.eyebrow }}</span>
        <h2>{{ content.newArrivals.title }}</h2>
      </header>
      @if (productError()) {
        <p class="note error">{{ content.newArrivals.error }}</p>
      } @else if (newest().length === 0) {
        <p class="note">{{ content.newArrivals.empty }}</p>
      } @else {
        <div class="grid">
          @for (p of newest(); track p.id) {
            <article class="card">
              <a class="media" [routerLink]="['/products', p.slug]">
                @if (p.images[0]) { <img [src]="p.images[0]" [alt]="p.name" loading="lazy" /> }
              </a>
              <div class="info">
                <span class="cat">{{ categoryName(p) }}</span>
                <h3 class="name"><a [routerLink]="['/products', p.slug]">{{ p.name }}</a></h3>
                <span class="price">{{ p.price | currency:'VND':'symbol':'1.0-0' }}</span>
              </div>
              <a class="btn-buy" [routerLink]="['/products', p.slug]">{{ content.buyNow }} <ng-container *ngTemplateOutlet="cartIcon" /></a>
            </article>
          }
        </div>
        <div class="more">
          <a class="btn-outline" routerLink="/products" [queryParams]="{ sort: 'newest' }">{{ content.newArrivals.viewAll }} <span aria-hidden="true">→</span></a>
        </div>
      }
    </section>

    <section class="banner">
      <img [src]="content.craft.image" [alt]="content.craft.imageAlt" (error)="hideBroken($event)" />
    </section>
    <section class="craft">
      <h2>{{ content.craft.title }}</h2>
      <p>{{ content.craft.text }}</p>
      <div class="craft-actions">
        <a routerLink="/lookbooks" class="btn-dark">{{ content.craft.primary }}</a>
        <a routerLink="/lookbooks" class="btn-outline">{{ content.craft.secondary }}</a>
      </div>
    </section>

    <section class="block">
      <header class="head">
        <span class="eyebrow">{{ content.featured.eyebrow }}</span>
        <h2>{{ content.featured.title }}</h2>
      </header>
      @if (featured().length === 0) {
        <p class="note">{{ content.featured.empty }}</p>
      } @else {
        <div class="grid">
          @for (p of featured(); track p.id) {
            <article class="card">
              <a class="media" [routerLink]="['/products', p.slug]">
                @if (p.images[0]) { <img [src]="p.images[0]" [alt]="p.name" loading="lazy" /> }
              </a>
              <div class="info">
                <span class="cat">{{ categoryName(p) }}</span>
                <h3 class="name"><a [routerLink]="['/products', p.slug]">{{ p.name }}</a></h3>
                <span class="price">{{ p.price | currency:'VND':'symbol':'1.0-0' }}</span>
              </div>
              <a class="btn-buy" [routerLink]="['/products', p.slug]">{{ content.buyNow }} <ng-container *ngTemplateOutlet="cartIcon" /></a>
            </article>
          }
        </div>
        <div class="more">
          <a class="btn-outline" routerLink="/products">{{ content.featured.viewAll }} <span aria-hidden="true">→</span></a>
        </div>
      }
    </section>

    <section class="commitments">
      @for (c of content.commitments; track c.title) {
        <div class="commit"><strong>{{ c.title }}</strong><span>{{ c.text }}</span></div>
      }
    </section>


    <ng-template #cartIcon>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.5 2h2l1.6 7.5h7.2l1.4-5.3H4.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="13" r="1.1" fill="currentColor"/><circle cx="11.5" cy="13" r="1.1" fill="currentColor"/></svg>
    </ng-template>
  `,
  styles: [`
    :host { display: block; font-family: 'Montserrat', sans-serif; color: #000; background: #fff; }
    .hero { position: relative; width: 100%; aspect-ratio: 1280 / 533; background: #f7dfe4; overflow: hidden; }
    .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .5s; }
    .hero-img.active { opacity: 1; }
    .hero-cta { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%); padding: 10px 28px; background: #171717; color: #fff; border-radius: 15px; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-decoration: none; }
    .arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: rgba(0,0,0,.3); backdrop-filter: blur(4px); box-shadow: 0 4px 6px -1px rgba(0,0,0,.1); cursor: pointer; }
    .arrow:hover { background: rgba(0,0,0,.5); }
    .arrow.prev { left: 29px; } .arrow.next { right: 29px; }

    .block { max-width: 1280px; margin: 0 auto; padding: 56px 48px 0; }
    .head { padding-bottom: 17px; margin-bottom: 40px; border-bottom: 1px solid #c4c7c7; display: flex; flex-direction: column; gap: 8px; }
    .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .1em; color: #8f485d; text-transform: uppercase; line-height: 14px; }
    .head h2 { font-family: 'Playfair Display', serif; font-size: 40px; font-weight: 400; line-height: 48px; letter-spacing: -.01em; margin: 0; }
    .note { color: #444748; font-size: 14px; } .note.error { color: #c52929; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 32px; }

    .card { position: relative; display: flex; flex-direction: column; }
    .media { display: block; position: relative; aspect-ratio: 272 / 362.66; background: #e9e8e7; overflow: hidden; }
    .media img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .info { display: flex; flex-direction: column; padding: 12px 0 16px; min-height: 80px; }
    .cat { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #444748; line-height: 14px; }
    .name { margin: 6px 0 0; font-size: 14px; font-weight: 500; letter-spacing: .01em; line-height: 22px; }
    .name a { color: #000; text-decoration: none; }
    .name a:hover { color: #8f485d; }
    .price { margin-top: 4px; font-size: 16px; font-weight: 600; letter-spacing: .06em; line-height: 24px; }
    .btn-buy { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 40px; background: #171717; color: #fff; border: 1px solid #000; border-radius: 15px; font-size: 13px; font-weight: 700; letter-spacing: .1em; text-decoration: none; }
    .btn-buy:hover { background: #000; }
    .cat-card { display: flex; flex-direction: column; color: inherit; text-decoration: none; }
    .cat-card:hover .name { color: #8f485d; }
    .cat-card .name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 500; }
    .count { font-size: 12px; color: #444748; margin-top: 4px; }

    .more { display: flex; justify-content: center; margin-top: 32px; }
    .btn-outline, .btn-dark { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-width: 260px; height: 40px; padding: 0 24px; border: 1px solid #000; border-radius: 15px; font-size: 13px; font-weight: 700; letter-spacing: .1em; text-decoration: none; box-sizing: border-box; }
    .btn-outline { background: #fffefe; color: #000; }
    .btn-outline:hover { background: #f4b8c1; }
    .btn-dark { background: #171717; color: #fff; }

    .banner { margin-top: 64px; }
    .banner img { display: block; width: 100%; aspect-ratio: 1280 / 532; object-fit: cover; }
    .craft { max-width: 640px; margin: 0 auto; padding: 48px 24px 0; text-align: center; }
    .craft h2 { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 500; margin: 0 0 12px; }
    .craft p { font-size: 14px; line-height: 1.7; color: #444748; margin: 0 0 24px; }
    .craft-actions { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; }

    .commitments { max-width: 1280px; margin: 72px auto 0; padding: 32px 48px; border-top: 1px solid #c4c7c7; border-bottom: 1px solid #c4c7c7; display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; box-sizing: border-box; }
    .commit { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #444748; }
    .commit strong { color: #000; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }

    @media (max-width: 900px) {
      .block { padding: 40px 20px 0; }
      .grid, .commitments { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
      .head h2 { font-size: 30px; }
    }
  `],
})
export class HomePage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly content = STORE_HOME_CONTENT;

  readonly slideIndex = signal(0);
  readonly categoryError = signal(false);
  readonly productError = signal(false);
  readonly tiles = signal<CategoryTile[]>([]);
  private readonly allCategories = signal<Category[]>([]);
  private readonly allProducts = signal<ProductSummary[]>([]);
  readonly newest = computed(() => this.allProducts().slice(0, 4));
  readonly featured = computed(() => this.allProducts().slice(4, 8));
  private readonly categoryMap = computed(() => new Map(this.allCategories().map(c => [c.id, c.name])));

  private timer?: ReturnType<typeof setInterval>;
  private readonly subs: Subscription[] = [];

  ngOnInit(): void {
    this.timer = setInterval(() => this.go(1), 6000);

    this.subs.push(this.api.products({ sort: 'newest', limit: 8 }).subscribe({
      next: res => this.allProducts.set(res.items),
      error: () => this.productError.set(true),
    }));

    this.subs.push(this.api.categories().subscribe({
      next: cats => {
        this.allCategories.set(cats);
        const list = cats.slice(0, 4);
        this.tiles.set(list.map(category => ({ category, image: '', count: null })));
        list.forEach((category, i) => {
          this.subs.push(this.api.products({ category: category.slug || category.id, limit: 1 }).subscribe({
            next: res => this.tiles.update(t => t.map((x, j) => j === i
              ? { ...x, image: res.items[0]?.images[0] ?? '', count: typeof res.total === 'number' ? res.total : null }
              : x)),
            error: () => undefined,
          }));
        });
      },
      error: () => this.categoryError.set(true),
    }));
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.subs.forEach(s => s.unsubscribe());
  }

  go(step: number): void {
    const n = this.content.hero.slides.length;
    this.slideIndex.update(i => (i + step + n) % n);
  }

  categoryName(p: ProductSummary): string {
    return (p.categoryId && this.categoryMap().get(p.categoryId)) || '';
  }

  hideBroken(e: Event): void {
    (e.target as HTMLImageElement).style.display = 'none';
  }
}
