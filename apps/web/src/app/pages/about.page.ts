import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type { CommunityPost } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { STORE_ABOUT } from '../shared/store-content';

@Component({
  selector: 'fc-about-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="hero">
      <div class="hero-left">
        <div>
          <span class="eyebrow line">{{ c.hero.eyebrow }}</span>
          <h1>{{ c.hero.title }}</h1>
          <p class="quote">@for (l of c.hero.quote; track l) { {{ l }}<br /> }</p>
        </div>
        <button type="button" class="story-link" (click)="story.scrollIntoView({ behavior: 'smooth' })">
          {{ c.hero.cta }}
          <svg viewBox="0 0 10 14" width="10" height="14" aria-hidden="true"><path d="M5 1v11M1.5 8.5 5 12l3.5-3.5" fill="none" stroke="#000" stroke-width="1.2"/></svg>
        </button>
      </div>
      <div class="hero-right">
        <img [src]="c.hero.image" [alt]="c.hero.imageAlt" (error)="hide($event)" />
        <span class="badge">{{ c.hero.badge }}</span>
      </div>
    </section>

    <section #story class="story">
      <div class="frame"><div class="frame-img tall"><img [src]="c.story.image" [alt]="c.story.imageAlt" (error)="hide($event)" /></div></div>
      <div class="story-text">
        <span class="eyebrow">{{ c.story.eyebrow }}</span>
        <h2>{{ c.story.title }}</h2>
        <div class="paras">@for (p of c.story.paragraphs; track p) { <p>{{ p }}</p> }</div>
        <div class="pillars">
          @for (p of c.story.pillars; track p.title) {
            <div><strong>{{ p.title }}</strong><span>{{ p.text }}</span></div>
          }
        </div>
      </div>
    </section>

    <section class="core">
      <header class="center">
        <span class="eyebrow">{{ c.core.eyebrow }}</span>
        <h2>{{ c.core.title }}</h2>
      </header>
      <div class="cols">
        @for (it of c.core.items; track it.no) {
          <article class="col">
            <div>
              <div class="no">{{ it.no }}</div>
              <h3>{{ it.title }}</h3>
              <p>{{ it.text }}</p>
            </div>
            <a class="col-link" [routerLink]="it.to"><span>{{ it.link }}</span><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1 9 9 1M3 1h6v6" fill="none" stroke="#000" stroke-width="1.2"/></svg></a>
          </article>
        }
      </div>
    </section>

    <section class="tech">
      <div class="tech-text">
        <span class="eyebrow">{{ c.tech.eyebrow }}</span>
        <h2>{{ c.tech.title }}</h2>
        <p class="lead">{{ c.tech.text }}</p>
        <div class="features">
          @for (f of c.tech.features; track f.title) {
            <div class="feature">
              <span class="ico" aria-hidden="true"></span>
              <div><h4>{{ f.title }}</h4><p>{{ f.text }}</p></div>
            </div>
          }
        </div>
        <a routerLink="/ai/try-on" class="btn-dark">{{ c.tech.cta }}</a>
      </div>
      <div class="frame"><div class="frame-img tall"><img [src]="c.tech.image" [alt]="c.tech.imageAlt" (error)="hide($event)" /></div></div>
    </section>

    <section class="lookbook">
      <div class="lb-head">
        <div>
          <span class="eyebrow">{{ c.lookbook.eyebrow }}</span>
          <h2>{{ c.lookbook.title }}</h2>
          <p class="lead">{{ c.lookbook.text }}</p>
        </div>
        <a routerLink="/lookbooks" class="underlined">{{ c.lookbook.cta }}</a>
      </div>
      <div class="lb-grid">
        <a class="lb-main" routerLink="/lookbooks">
          <div class="frame-img lb-tall"><img [src]="c.lookbook.main.image" [alt]="c.lookbook.main.title" (error)="hide($event)" /></div>
          <div class="cap"><div><h3>{{ c.lookbook.main.title }}</h3><span>{{ c.lookbook.main.sub }}</span></div></div>
        </a>
        <div class="lb-side">
          @for (card of c.lookbook.cards; track card.title) {
            <a class="lb-card" routerLink="/lookbooks">
              <div class="frame-img lb-short">
                <img [src]="card.image" [alt]="card.title" (error)="hide($event)" />
                <span class="tag">{{ card.tag }}</span>
              </div>
              <h4>{{ card.title }}</h4>
              <p>{{ card.text }}</p>
            </a>
          }
        </div>
      </div>
    </section>

    @if (posts().length > 0) {
      <section class="community">
        <header class="center">
          <span class="eyebrow">{{ c.community.eyebrow }}</span>
          <h2>{{ c.community.title }}</h2>
          <p class="lead">{{ c.community.text }}</p>
        </header>
        <div class="posts">
          @for (p of posts(); track p.id) {
            <a class="post" routerLink="/community">
              <div class="frame-img post-img">
                @if (p.mediaUrls[0]) { <img [src]="p.mediaUrls[0]" [alt]="p.caption" loading="lazy" /> }
              </div>
              <div class="post-info">
                <strong>{{ p.authorName || c.community.fallbackAuthor }}</strong>
                <p>{{ p.caption }}</p>
              </div>
            </a>
          }
        </div>
        <div class="center"><a routerLink="/community" class="underlined">{{ c.community.cta }}</a></div>
      </section>
    }
  `,
  styles: [`
    :host { display: block; font-family: 'Montserrat', sans-serif; color: #000; background: #fff; }
    h1, h2, h3, h4, p { margin: 0; }
    h1, h2 { font-family: 'Playfair Display', serif; font-weight: 700; }
    a { color: inherit; text-decoration: none; }
    .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .1em; color: #8f485d; text-transform: uppercase; line-height: 14px; }
    .center { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .lead { font-size: 16px; line-height: 26px; color: #444748; max-width: 640px; }
    h2 { font-size: 40px; line-height: 48px; letter-spacing: -.02em; }

    .hero { display: grid; grid-template-columns: 5fr 7fr; min-height: 680px; background: #fbf9f9; border-bottom: 1px solid #e3e2e2; }
    .hero-left { background: #fff; border-right: 1px solid #e3e2e2; padding: 96px 64px; display: flex; flex-direction: column; justify-content: space-between; }
    .line { display: inline-block; padding-bottom: 17px; border-bottom: 1px solid rgba(143,72,93,.2); margin-bottom: 31px; }
    h1 { font-size: 56px; line-height: 64px; letter-spacing: -.02em; margin-bottom: 31px; }
    .quote { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; font-size: 22px; line-height: 35.75px; color: #1b1c1c; }
    .story-link { align-self: flex-start; display: inline-flex; gap: 12px; align-items: center; padding: 0; background: none; border: 0; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .1em; cursor: pointer; }
    .hero-right { position: relative; background: #f5f3f3; overflow: hidden; }
    .hero-right img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .badge { position: absolute; right: 24px; bottom: 24px; padding: 9px 17px; background: rgba(255,255,255,.9); border: 1px solid #e3e2e2; font-size: 11px; font-weight: 600; letter-spacing: .1em; color: #1b1c1c; }

    .frame { border: 1px solid #e3e2e2; background: #fbf9f9; padding: 13px; }
    .frame-img { position: relative; background: #efeded; overflow: hidden; }
    .frame-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tall { height: 712px; }

    .story, .tech { max-width: 1280px; margin: 0 auto; padding: 128px 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; box-sizing: border-box; }
    .story { border-bottom: 1px solid #e3e2e2; }
    .story-text { display: flex; flex-direction: column; gap: 16px; padding-left: 24px; }
    .paras { display: flex; flex-direction: column; gap: 24px; padding: 16px 0 32px; font-size: 16px; line-height: 26px; color: #444748; }
    .pillars { display: flex; gap: 32px; border-top: 1px solid #e3e2e2; padding-top: 33px; }
    .pillars > div { flex: 1; display: flex; flex-direction: column; gap: 10px; }
    .pillars strong { font-family: 'Playfair Display', serif; font-size: 28px; line-height: 36px; }
    .pillars span { font-size: 11px; font-weight: 600; letter-spacing: .1em; color: #747878; line-height: 14px; }

    .core { background: rgba(255,217,225,.5); border-top: 1px solid #e3e2e2; border-bottom: 1px solid #e3e2e2; padding: 112px 48px; }
    .core .cols { max-width: 1184px; margin: 64px auto 0; display: grid; grid-template-columns: repeat(3, 1fr); background: #fff; border: 1px solid #e3e2e2; }
    .col { padding: 48px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; border-right: 1px solid #e3e2e2; }
    .col:last-child { border-right: 0; }
    .no { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 56px; line-height: 56px; color: #e76161; letter-spacing: -.02em; }
    .col h3 { margin-top: 24px; font-size: 16px; font-weight: 600; letter-spacing: .1em; line-height: 24px; }
    .col p { margin-top: 15px; font-size: 14px; line-height: 22.75px; color: #444748; }
    .col-link { display: flex; justify-content: space-between; align-items: center; padding-top: 25px; border-top: 1px solid #e3e2e2; font-size: 11px; font-weight: 600; letter-spacing: .1em; }
    .col-link:hover { color: #8f485d; }

    .tech { border-bottom: 1px solid #e3e2e2; padding: 112px 48px; }
    .tech-text { display: flex; flex-direction: column; gap: 12px; }
    .features { border-top: 1px solid #e3e2e2; margin-top: 28px; padding-top: 28px; display: flex; flex-direction: column; gap: 24px; }
    .feature { display: flex; gap: 16px; }
    .feature + .feature { border-top: 1px solid #e3e2e2; padding-top: 25px; }
    .ico { flex: none; width: 32px; height: 32px; background: #efeded; }
    .feature h4 { font-size: 16px; font-weight: 600; letter-spacing: .06em; line-height: 24px; }
    .feature p { margin-top: 4px; font-size: 14px; line-height: 22px; color: #444748; }
    .btn-dark { align-self: flex-start; margin-top: 28px; padding: 16px 32px; background: #000; color: #fff; font-size: 13px; font-weight: 600; letter-spacing: .1em; }

    .lookbook { background: rgba(255,217,225,.3); padding: 112px 48px; border-bottom: 1px solid rgba(255,217,225,.5); }
    .lb-head, .lb-grid { max-width: 1184px; margin: 0 auto; }
    .lb-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-bottom: 56px; }
    .lb-head > div { display: flex; flex-direction: column; gap: 8px; }
    .underlined { padding-bottom: 5px; border-bottom: 1px solid #000; font-size: 13px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; }
    .underlined:hover { color: #8f485d; border-color: #8f485d; }
    .lb-grid { display: grid; grid-template-columns: 7fr 5fr; gap: 32px; align-items: start; }
    .lb-main, .lb-card { display: block; background: #fff; border: 1px solid #e3e2e2; padding: 13px; }
    .lb-tall { height: 814px; }
    .lb-short { height: 220px; }
    .lb-side { display: flex; flex-direction: column; gap: 32px; }
    .cap { padding: 16px 8px 8px; }
    .cap h3 { font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 600; letter-spacing: .06em; line-height: 24px; }
    .cap span { font-size: 12px; color: #747878; }
    .lb-card h4 { margin-top: 12px; padding: 0 8px; font-size: 16px; font-weight: 600; letter-spacing: .06em; line-height: 24px; }
    .lb-card p { padding: 4px 8px 0; font-size: 12px; line-height: 18px; color: #444748; }
    .tag { position: absolute; left: 12px; bottom: 12px; padding: 5px 11px; background: #fff; border: 1px solid #e3e2e2; font-size: 11px; font-weight: 600; letter-spacing: .16em; }

    .community { padding: 112px 48px; max-width: 1280px; margin: 0 auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 56px; }
    .posts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
    .post { display: block; background: #fbf9f9; border: 1px solid #e3e2e2; padding: 1px; }
    .post-img { height: 368px; }
    .post-info { padding: 17px 16px 16px; border-top: 1px solid #e3e2e2; display: flex; flex-direction: column; gap: 4px; }
    .post-info strong { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
    .post-info p { font-size: 12px; line-height: 18px; color: #444748; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    @media (max-width: 900px) {
      .hero, .story, .tech, .lb-grid, .core .cols { grid-template-columns: 1fr; }
      .hero-left { padding: 48px 24px; gap: 32px; } .hero-right { min-height: 360px; }
      .story, .tech { padding: 64px 20px; } .story-text { padding-left: 0; }
      .tall, .lb-tall { height: 420px; }
      .col { border-right: 0; border-bottom: 1px solid #e3e2e2; }
      .posts { grid-template-columns: repeat(2, 1fr); }
      .lb-head { flex-direction: column; align-items: flex-start; }
      h2 { font-size: 30px; line-height: 38px; }
    }
  `],
})
export class AboutPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly c = STORE_ABOUT;
  readonly posts = signal<CommunityPost[]>([]);
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.api.listPosts(undefined, 1, 4).subscribe({
      next: res => this.posts.set(res.items),
      error: () => this.posts.set([]),
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  hide(e: Event): void { (e.target as HTMLImageElement).style.display = 'none'; }
}
