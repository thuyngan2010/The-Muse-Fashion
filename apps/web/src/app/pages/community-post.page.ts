import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type { Category, CommunityComment, CommunityPost, ProductSummary } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { PageStateComponent } from '../components/page-state.component';

/** Dòng đầu của nội dung là tiêu đề bài viết (giống thẻ bài ở trang Cộng đồng). */
export function postTitle(caption: string | undefined): string {
  return (caption || '').split(/\r?\n/)[0].trim();
}

/** Phần nội dung sau tiêu đề, tách đoạn theo dòng trống. */
export function postParagraphs(caption: string | undefined): string[] {
  const rest = (caption || '').split(/\r?\n/).slice(1).join('\n').trim();
  return rest ? rest.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : [];
}

/** Thời gian đọc ước tính: khoảng 200 từ mỗi phút, tối thiểu 1 phút. */
export function readingMinutes(caption: string | undefined): number {
  const words = (caption || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** Trang chi tiết bài viết Cộng đồng (Blog), bố cục theo Figma "Chi tiết Blog". */
@Component({
  standalone: true,
  imports: [PageStateComponent, RouterLink, DatePipe, CurrencyPipe, FormsModule],
  template: `
    @if (loading()) {
      <fc-page-state kind="loading" title="Đang tải bài viết" />
    } @else if (error()) {
      <fc-page-state kind="error" title="Không thể tải bài viết" [message]="error()" actionLabel="VỀ TRANG CỘNG ĐỒNG" actionLink="/community" />
    } @else if (post(); as p) {
      <main class="editorial">
        <header class="article-head">
          <div class="meta-row">
            <span class="badge">CỘNG ĐỒNG MUSE</span>
            <span class="dot" aria-hidden="true">•</span>
            <span class="meta">{{ minutes() }} PHÚT ĐỌC</span>
            @if (p.createdAt) {
              <span class="dot" aria-hidden="true">•</span>
              <span class="meta">NGÀY {{ p.createdAt | date:'dd.MM.yyyy' }}</span>
            }
          </div>
          <h1>{{ title() }}</h1>
          <div class="byline-bar">
            <div class="byline">
              <span class="byline-mark" aria-hidden="true">{{ authorInitial() }}</span>
              <div>
                <strong>BỞI {{ (p.authorName || 'Thành viên') }}</strong>
                <span>Thành viên cộng đồng MUSE</span>
              </div>
            </div>
            <div class="share">
              <span class="share-label">CHIA SẺ:</span>
              <button type="button" class="icon-btn" (click)="copyLink()" aria-label="Sao chép liên kết bài viết" title="Sao chép liên kết">
                <svg viewBox="0 0 16 8" width="15" height="7" aria-hidden="true"><path d="M6.5 1H4a3 3 0 0 0 0 6h2.5M9.5 1H12a3 3 0 0 1 0 6H9.5M5 4h6" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="share-btn" (click)="scrollToComments()">BÌNH LUẬN</button>
            </div>
          </div>
        </header>

        @if (p.mediaUrls[0]; as cover) {
          <section class="cover">
            <figure class="cover-frame">
              <img [src]="cover" [alt]="title()" />
              <span class="cover-badge">MUSE COMMUNITY • {{ (p.authorName || 'Thành viên') }}</span>
            </figure>
            <div class="cover-caption">
              <span>Ảnh: {{ p.authorName || 'Thành viên' }} - chia sẻ trên MUSE Community.</span>
              @if (p.createdAt) { <span class="cover-date">{{ p.createdAt | date:'dd/MM/yyyy HH:mm' }}</span> }
            </div>
          </section>
        }

        <div class="article-grid">
          <aside class="aside">
            <div class="aside-index">
              <h4>THÔNG TIN BÀI VIẾT</h4>
              <ul>
                <li class="strong">{{ p.authorName || 'Thành viên' }}</li>
                @if (p.createdAt) { <li>Đăng ngày {{ p.createdAt | date:'dd/MM/yyyy' }}</li> }
                <li>{{ minutes() }} phút đọc</li>
                <li>{{ comments().length }} bình luận</li>
              </ul>
            </div>
            <div class="aside-box">
              <span>VỀ MUSE COMMUNITY</span>
              <p>Nơi thành viên chia sẻ bản phối, cảm hứng và mẹo mặc đẹp cùng cộng đồng yêu thời trang của MUSE.</p>
            </div>
          </aside>

          <article class="article-body">
            <div class="section-no"><span>01</span><i aria-hidden="true"></i></div>
            @for (para of paragraphs(); track $index) {
              <p class="para">{{ para }}</p>
            } @empty {
              <p class="para">{{ title() }}</p>
            }

            @if (extraImages().length > 0) {
              <div class="image-grid">
                @for (img of extraImages(); track img; let i = $index) {
                  <figure class="image-card">
                    <img [src]="img" [alt]="title() + ' - ảnh ' + (i + 2)" loading="lazy" />
                    <figcaption>LOOK {{ (i + 2).toString().padStart(2, '0') }}</figcaption>
                  </figure>
                }
              </div>
            }

            <p class="sign-off">Bài viết được chia sẻ bởi thành viên cộng đồng MUSE. Nội dung thể hiện cảm nhận và phong cách riêng của tác giả.</p>

            <section id="comments" class="comments" aria-labelledby="comments-title">
              <h3 id="comments-title">BÌNH LUẬN ({{ comments().length }})</h3>
              @for (c of comments(); track c.id) {
                <div class="comment">
                  <div class="comment-head">
                    <strong>{{ c.authorName || 'Khách' }}</strong>
                    <span>{{ c.createdAt | date:'HH:mm dd/MM' }}</span>
                    @if (isCommentAuthor(c)) {
                      <span class="comment-actions">
                        <button type="button" (click)="startEditComment(c)">Sửa</button>
                        <button type="button" class="danger" (click)="deleteComment(c)">Xóa</button>
                      </span>
                    }
                  </div>
                  @if (editingCommentId() === c.id) {
                    <div class="comment-edit">
                      <input type="text" [(ngModel)]="editCommentContent" (keyup.enter)="saveEditComment(c)" aria-label="Sửa bình luận" />
                      <button type="button" (click)="editingCommentId.set('')">Hủy</button>
                      <button type="button" class="primary" [disabled]="!editCommentContent.trim()" (click)="saveEditComment(c)">Lưu</button>
                    </div>
                  } @else {
                    <p>{{ c.content }}</p>
                  }
                </div>
              } @empty {
                <p class="no-comments">Chưa có bình luận nào. Hãy gửi lời bình luận đầu tiên!</p>
              }
              @if (auth.isAuthenticated()) {
                <form class="comment-form" (ngSubmit)="sendComment()">
                  <input type="text" name="comment" [(ngModel)]="commentText" placeholder="Viết bình luận của bạn..." aria-label="Viết bình luận" required />
                  <button type="submit" [disabled]="!commentText.trim()">GỬI</button>
                </form>
              } @else {
                <p class="no-comments">Vui lòng <a routerLink="/auth">đăng nhập</a> để gửi bình luận.</p>
              }
            </section>
          </article>
        </div>

        @if (products().length > 0) {
          <section class="shop">
            <div class="shop-inner">
              <div class="shop-head">
                <div>
                  <span class="eyebrow">CURATED SELECTION</span>
                  <h2>GỢI Ý TỪ MUSE</h2>
                </div>
                <p>Khám phá các thiết kế mới nhất để hoàn thiện phong cách của bạn</p>
              </div>
              <div class="product-grid">
                @for (pr of products(); track pr.id) {
                  <article class="product">
                    <a class="product-media" [routerLink]="['/products', pr.slug]">
                      @if (pr.images[0]) { <img [src]="pr.images[0]" [alt]="pr.name" loading="lazy" /> }
                    </a>
                    <div class="product-info">
                      <span class="product-cat">{{ categoryName(pr) }}</span>
                      <h3><a [routerLink]="['/products', pr.slug]">{{ pr.name }}</a></h3>
                      <span class="product-price">{{ pr.price | currency:'VND':'symbol':'1.0-0' }}</span>
                    </div>
                    <a class="buy" [routerLink]="['/products', pr.slug]">MUA NGAY
                      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.5 2h2l1.6 7.5h7.2l1.4-5.3H4.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="13" r="1.1" fill="currentColor"/><circle cx="11.5" cy="13" r="1.1" fill="currentColor"/></svg>
                    </a>
                  </article>
                }
              </div>
            </div>
          </section>
        }

        @if (related().length > 0) {
          <section class="related">
            <div class="related-head">
              <div>
                <span class="eyebrow">JOURNAL CONTINUATION</span>
                <h2>BÀI VIẾT LIÊN QUAN</h2>
              </div>
              <a routerLink="/community" class="all-link">XEM TẤT CẢ BÀI VIẾT</a>
            </div>
            <div class="related-grid">
              @for (r of related(); track r.id) {
                <a class="related-card" [routerLink]="['/community', r.id]">
                  <span class="related-img">@if (r.mediaUrls[0]) { <img [src]="r.mediaUrls[0]" [alt]="titleOf(r)" loading="lazy" /> }</span>
                  <span class="related-meta">{{ r.authorName || 'Thành viên' }} • {{ minutesOf(r) }} PHÚT ĐỌC</span>
                  <h3>{{ titleOf(r) }}</h3>
                  <p>{{ excerptOf(r) }}</p>
                </a>
              }
            </div>
          </section>
        }
      </main>
    }
  `,
  styles: [`
    :host { display:block; background:#fff; color:#000; font-family:'Montserrat',sans-serif; }
    .editorial { max-width:1280px; margin:0 auto; }
    .article-head { margin:0 48px; padding:56px 0 0; border-bottom:1px solid #e3e2e2; }
    .meta-row { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
    .badge { display:inline-flex; align-items:center; height:24px; padding:0 12px; background:#ffd9e1; border:1px solid #000; color:#3b051b; font-size:11px; font-weight:600; letter-spacing:1.76px; box-sizing:border-box; }
    .dot { color:#c4c7c7; font-size:16px; line-height:24px; }
    .meta { color:#444748; font-size:11px; font-weight:600; letter-spacing:1.76px; line-height:14px; }
    h1 { max-width:896px; margin:16px 0 15px; font-family:'Playfair Display',serif; font-weight:400; font-size:52px; line-height:59.8px; letter-spacing:-1.3px; overflow-wrap:anywhere; }
    .byline-bar { display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap; padding:24px 0; border-top:1px solid #e3e2e2; }
    .byline { display:flex; align-items:center; gap:16px; }
    .byline-mark { display:grid; place-items:center; width:44px; height:44px; background:#000; color:#fff; font:400 18px/28px 'Playfair Display',serif; text-transform:uppercase; }
    .byline strong { display:block; font-size:13px; font-weight:600; line-height:16px; letter-spacing:1.82px; text-transform:uppercase; }
    .byline span { display:block; color:#444748; font-size:12px; line-height:18px; letter-spacing:.24px; }
    .share { display:flex; align-items:center; gap:8px; }
    .share-label { margin-right:6px; color:#444748; font-size:11px; font-weight:600; letter-spacing:1.76px; }
    .icon-btn, .share-btn { height:36px; border:1px solid #000; background:#fff; cursor:pointer; font:inherit; }
    .icon-btn { width:36px; display:grid; place-items:center; padding:0; }
    .share-btn { padding:0 12px; font-size:11px; font-weight:600; letter-spacing:1.76px; }
    .icon-btn:hover, .share-btn:hover { background:#ffd9e1; }

    .cover { margin:32px 48px 0; }
    .cover-frame { position:relative; margin:0; border:1px solid #000; background:#e9e8e7; overflow:hidden; aspect-ratio:1182 / 780; }
    .cover-frame img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .cover-badge { position:absolute; left:16px; top:16px; display:inline-flex; align-items:center; height:34px; padding:0 12px; background:#fff; border:1px solid #000; font-size:11px; font-weight:600; letter-spacing:1.76px; text-transform:uppercase; box-sizing:border-box; }
    .cover-caption { display:flex; justify-content:space-between; gap:16px; padding:12px 0; border-bottom:1px solid #e3e2e2; color:#444748; font-size:12px; line-height:18px; letter-spacing:.24px; }
    .cover-date { color:#747878; font-size:11px; font-weight:600; letter-spacing:1.1px; white-space:nowrap; }

    .article-grid { display:grid; grid-template-columns:244px minmax(0,768px); justify-content:center; gap:78px; padding:24px 48px 0; }
    .aside { position:sticky; top:24px; align-self:start; }
    .aside-index { border-top:2px solid #000; padding-top:16px; }
    .aside h4 { margin:0 0 16px; font-size:13px; font-weight:600; line-height:16px; letter-spacing:1.82px; }
    .aside ul { margin:0; padding:0; list-style:none; display:grid; gap:12px; }
    .aside li { color:#444748; font-size:12px; line-height:18px; letter-spacing:.24px; }
    .aside li.strong { color:#000; font-weight:500; }
    .aside-box { margin-top:32px; padding:24px; background:#f5f3f3; border:1px solid #e3e2e2; }
    .aside-box span { font-size:11px; font-weight:600; letter-spacing:1.76px; }
    .aside-box p { margin:8px 0 0; color:#444748; font-size:12px; line-height:19.5px; letter-spacing:.24px; }

    .section-no { display:flex; align-items:center; gap:12px; margin:24px 0 20px; color:#8f485d; font-size:13px; font-weight:600; letter-spacing:1.82px; }
    .section-no i { flex:1; height:1px; background:#e3e2e2; }
    .para { margin:0 0 16px; color:#1b1c1c; font-size:14px; line-height:22.75px; letter-spacing:.14px; white-space:pre-line; overflow-wrap:anywhere; }
    .image-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; margin:32px 0; }
    .image-card { margin:0; padding:8px 8px 16px; background:#f5f3f3; border:1px solid #e3e2e2; }
    .image-card img { display:block; width:100%; height:440px; object-fit:cover; }
    .image-card figcaption { margin-top:16px; font-size:11px; font-weight:600; letter-spacing:1.76px; }
    .sign-off { margin:40px 0 0; padding-top:24px; border-top:1px solid #e3e2e2; color:#444748; font-size:14px; line-height:22px; letter-spacing:.14px; }

    .comments { margin:40px 0 0; padding:24px; border:1px solid #000; scroll-margin-top:24px; }
    .comments h3 { margin:0 0 16px; font-size:13px; font-weight:600; letter-spacing:1.3px; }
    .comment { padding:12px 0; border-top:1px solid #e3e2e2; }
    .comment-head { display:flex; align-items:center; gap:10px; font-size:12px; }
    .comment-head span { color:#747878; font-size:11px; }
    .comment-actions { margin-left:auto; display:flex; gap:10px; }
    .comment-actions button, .comment-edit button { padding:0; border:0; background:none; font:inherit; font-size:11px; font-weight:600; text-decoration:underline; cursor:pointer; }
    .comment-actions .danger { color:#b3261e; }
    .comment p { margin:6px 0 0; color:#1b1c1c; font-size:13px; line-height:20px; white-space:pre-line; overflow-wrap:anywhere; }
    .comment-edit { display:flex; gap:10px; align-items:center; margin-top:8px; }
    .comment-edit input, .comment-form input { flex:1; min-width:0; height:40px; padding:0 12px; border:1px solid #c4c7c7; font:inherit; font-size:13px; }
    .no-comments { margin:8px 0 0; color:#444748; font-size:13px; }
    .comment-form { display:flex; gap:8px; margin-top:16px; }
    .comment-form button { height:40px; padding:0 20px; border:1px solid #000; border-radius:15px; background:#171717; color:#fff; font:inherit; font-size:12px; font-weight:700; letter-spacing:1.3px; cursor:pointer; }
    .comment-form button:disabled { opacity:.45; cursor:not-allowed; }

    .eyebrow { display:block; color:#8f485d; font-size:11px; font-weight:600; line-height:14px; letter-spacing:1.1px; text-transform:uppercase; }
    .shop { margin-top:96px; background:#f5f3f3; border-top:1px solid #000; border-bottom:1px solid #000; }
    .shop-inner { padding:39px 48px 46px; }
    .shop-head { display:flex; justify-content:space-between; align-items:flex-end; gap:24px; flex-wrap:wrap; padding-bottom:17px; border-bottom:1px solid #000; }
    .shop-head h2 { margin:8px 0 0; font-family:'Playfair Display',serif; font-weight:400; font-size:40px; line-height:48px; letter-spacing:-.4px; }
    .shop-head p { margin:0; color:#444748; font-size:12px; line-height:18px; letter-spacing:.24px; }
    .product-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:24px; margin-top:40px; }
    .product { display:flex; flex-direction:column; background:#fff; border:1px solid #e3e2e2; }
    .product-media { display:block; height:320px; background:#efeded; overflow:hidden; }
    .product-media img { width:100%; height:100%; object-fit:cover; display:block; }
    .product-info { display:grid; gap:4px; padding:16px; flex:1; }
    .product-cat { min-height:14px; color:#444748; font-size:11px; font-weight:600; letter-spacing:1.76px; text-transform:uppercase; }
    .product-info h3 { margin:0; font-size:14px; font-weight:500; line-height:22px; letter-spacing:.14px; }
    .product-info h3 a { color:inherit; text-decoration:none; }
    .product-price { font-size:14px; font-weight:600; line-height:22px; }
    .buy { display:flex; align-items:center; justify-content:center; gap:10px; height:40px; margin:0 8px 16px; background:#171717; border:1px solid #000; border-radius:15px; color:#fff; font-size:13px; font-weight:700; letter-spacing:1.3px; text-decoration:none; }
    .buy:hover { background:#000; }

    .related { padding:64px 48px 32px; }
    .related-head { display:flex; justify-content:space-between; align-items:flex-end; gap:24px; padding-bottom:17px; border-bottom:1px solid #e3e2e2; }
    .related-head h2 { margin:4px 0 0; font-family:'Playfair Display',serif; font-weight:500; font-size:28px; line-height:36px; }
    .all-link { color:#000; font-size:13px; font-weight:600; letter-spacing:1.82px; text-decoration:underline; }
    .related-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:32px; margin-top:32px; }
    .related-card { display:block; color:inherit; text-decoration:none; }
    .related-img { display:block; height:269px; background:#efeded; border:1px solid #e3e2e2; overflow:hidden; }
    .related-img img { width:100%; height:100%; object-fit:cover; display:block; }
    .related-meta { display:block; margin-top:8px; color:#8f485d; font-size:11px; font-weight:600; letter-spacing:1.76px; text-transform:uppercase; }
    .related-card h3 { margin:8px 0 0; font-family:'Playfair Display',serif; font-weight:500; font-size:22px; line-height:30px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .related-card p { margin:8px 0 0; color:#444748; font-size:12px; line-height:18px; letter-spacing:.24px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-line; }
    .related-card:hover h3 { text-decoration:underline; }

    @media (max-width:980px) {
      .article-grid { grid-template-columns:1fr; gap:32px; }
      .aside { position:static; order:2; }
      .product-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .related-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
    @media (max-width:640px) {
      .article-head, .cover { margin-left:16px; margin-right:16px; }
      .article-grid, .shop-inner, .related { padding-left:16px; padding-right:16px; }
      h1 { font-size:34px; line-height:42px; }
      .image-grid, .product-grid, .related-grid { grid-template-columns:1fr; }
      .cover-caption, .related-head { flex-direction:column; align-items:flex-start; }
      .shop-head h2 { font-size:30px; line-height:38px; }
    }
  `],
})
export class CommunityPostPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly post = signal<CommunityPost | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly comments = signal<CommunityComment[]>([]);
  readonly related = signal<CommunityPost[]>([]);
  readonly products = signal<ProductSummary[]>([]);
  private readonly categories = signal<Category[]>([]);
  readonly editingCommentId = signal('');
  commentText = '';
  editCommentContent = '';

  readonly title = computed(() => postTitle(this.post()?.caption) || 'Bài viết cộng đồng');
  readonly paragraphs = computed(() => postParagraphs(this.post()?.caption));
  readonly minutes = computed(() => readingMinutes(this.post()?.caption));
  readonly extraImages = computed(() => (this.post()?.mediaUrls ?? []).slice(1));
  readonly authorInitial = computed(() => (this.post()?.authorName?.trim()[0] || 'M'));
  private readonly categoryMap = computed(() => new Map(this.categories().map((c) => [c.id, c.name])));

  private readonly subs: Subscription[] = [];
  private postSub?: Subscription;

  ngOnInit(): void {
    this.subs.push(this.route.paramMap.subscribe((params) => this.load(params.get('postId') ?? '')));
    this.subs.push(this.api.products({ sort: 'newest', limit: 4 }).subscribe({ next: (res) => this.products.set(res.items), error: () => this.products.set([]) }));
    this.subs.push(this.api.categories().subscribe({ next: (cats) => this.categories.set(cats), error: () => undefined }));
  }

  ngOnDestroy(): void {
    this.postSub?.unsubscribe();
    this.subs.forEach((s) => s.unsubscribe());
  }

  load(postId: string): void {
    this.postSub?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.post.set(null);
    this.comments.set([]);
    this.editingCommentId.set('');
    if (!postId) {
      this.loading.set(false);
      this.error.set('Không tìm thấy bài viết.');
      return;
    }
    this.postSub = this.api.getPost(postId).subscribe({
      next: (post) => {
        this.post.set(post);
        this.loading.set(false);
        this.api.listComments(post.id).subscribe({ next: (res) => this.comments.set(res.items), error: () => this.comments.set([]) });
        this.api.listPosts(undefined, 1, 4).subscribe({
          next: (res) => this.related.set(res.items.filter((item) => item.id !== post.id).slice(0, 3)),
          error: () => this.related.set([]),
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Bài viết không tồn tại hoặc đã bị ẩn.');
      },
    });
  }

  titleOf(post: CommunityPost): string {
    const first = postTitle(post.caption);
    return first.length > 80 ? first.slice(0, 77).trimEnd() + '…' : first;
  }

  excerptOf(post: CommunityPost): string {
    return postParagraphs(post.caption).join('\n') || postTitle(post.caption);
  }

  minutesOf(post: CommunityPost): number {
    return readingMinutes(post.caption);
  }

  categoryName(product: ProductSummary): string {
    return (product.categoryId && this.categoryMap().get(product.categoryId)) || '';
  }

  copyLink(): void {
    const url = globalThis.location?.href ?? '';
    const clipboard = globalThis.navigator?.clipboard;
    if (!url || !clipboard) { this.toast.error('Trình duyệt không hỗ trợ sao chép liên kết.'); return; }
    clipboard.writeText(url).then(
      () => this.toast.success('Đã sao chép liên kết bài viết.'),
      () => this.toast.error('Không thể sao chép liên kết.'),
    );
  }

  scrollToComments(): void {
    globalThis.document?.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  isCommentAuthor(comment: CommunityComment): boolean {
    const cur = this.auth.currentUser();
    if (!cur) return false;
    return cur.id === comment.authorId || this.auth.isAdmin();
  }

  sendComment(): void {
    const post = this.post();
    if (!post || !this.commentText.trim()) return;
    this.api.createComment(post.id, this.commentText).subscribe({
      next: (c) => {
        this.comments.update((list) => [...list, c]);
        this.commentText = '';
        this.toast.success('Đã gửi bình luận');
      },
      error: (err) => this.toast.error(err.error?.message || 'Không thể gửi bình luận.'),
    });
  }

  startEditComment(c: CommunityComment): void {
    this.editingCommentId.set(c.id);
    this.editCommentContent = c.content;
  }

  saveEditComment(c: CommunityComment): void {
    const post = this.post();
    const content = this.editCommentContent.trim();
    if (!post || !content) return;
    this.api.updateComment(post.id, c.id, content).subscribe({
      next: (updated) => {
        this.editingCommentId.set('');
        this.toast.success('Đã cập nhật bình luận.');
        this.comments.update((list) => list.map((item) => (item.id === c.id ? { ...item, content: updated.content || content } : item)));
      },
      error: (err) => this.toast.error(err.error?.message || 'Không thể cập nhật bình luận.'),
    });
  }

  deleteComment(c: CommunityComment): void {
    const post = this.post();
    if (!post || !confirm('Bạn có muốn xóa bình luận này không?')) return;
    this.api.deleteComment(post.id, c.id).subscribe({
      next: () => {
        this.toast.success('Đã xóa bình luận.');
        this.comments.update((list) => list.filter((item) => item.id !== c.id));
      },
      error: (err) => this.toast.error(err.error?.message || 'Không thể xóa bình luận.'),
    });
  }
}
