import { PaginationComponent, PaginationState } from '../components/pagination.component';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { CommunityPost, CommunityComment } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { ModalComponent } from '../components/modal.component';
import { PageStateComponent } from '../components/page-state.component';

@Component({
  standalone: true,
  imports: [PageStateComponent, PaginationComponent, DatePipe, FormsModule, ModalComponent],
  template: `
    <main class="blog">
      <header class="banner">
        <span class="eyebrow">MUSE JOURNAL</span>
        <h1>JOURNAL &amp; EDITORIAL - CẢM HỨNG MẶC ĐẸP MỖI NGÀY</h1>
        <p class="banner-desc">Chia sẻ bản phối, gợi ý thời trang và kết nối cùng cộng đồng yêu cái đẹp của MUSE.</p>
        <div class="banner-action">
          @if (auth.isAuthenticated()) {
            <button type="button" class="btn-dark" (click)="createModalOpen.set(true)">ĐĂNG BÀI VIẾT MỚI</button>
          } @else {
            <p class="login-prompt">Đăng nhập để chia sẻ phong cách của bạn.</p>
          }
        </div>
      </header>

      <section class="filter-bar">
        <form class="search" (ngSubmit)="submitSearch()">
          <input type="search" name="q" [(ngModel)]="searchTerm" placeholder="Tìm kiếm bài viết..." aria-label="Tìm kiếm bài viết" />
          <button type="submit" aria-label="Tìm kiếm">
            <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true"><circle cx="6.2" cy="6.2" r="4.7" fill="none" stroke="#171717" stroke-width="1.3"/><path d="m10 10 3.8 3.8" stroke="#171717" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>
        </form>
      </section>

      @if (loading()) {
        <fc-page-state kind="loading" title="Đang tải bảng tin cộng đồng" />
      } @else if (error()) {
        <fc-page-state kind="error" title="Không thể tải bảng tin" [message]="error()" actionLabel="THỬ LẠI" (action)="loadPosts()" />
      } @else {
        @if (featuredPost(); as fp) {
          <article class="cover">
            <div class="cover-img" (click)="viewPostDetail(fp.id)">
              @if (fp.mediaUrls && fp.mediaUrls.length > 0) { <img [src]="fp.mediaUrls[0]" [alt]="titleOf(fp)" /> }
              <span class="cover-badge">COVER STORY</span>
            </div>
            <div class="cover-text">
              <div class="meta">
                <strong>{{ fp.authorName || 'Thành viên' }}</strong>
                @if (fp.createdAt) { <span>{{ fp.createdAt | date:'dd/MM/yyyy' }}</span> }
              </div>
              <h2>{{ titleOf(fp) }}</h2>
              <p class="cover-excerpt">{{ excerptOf(fp) }}</p>
              <div class="cover-actions">
                <button type="button" class="btn-pink" (click)="viewPostDetail(fp.id)">ĐỌC BÀI VIẾT →</button>
                <button type="button" class="link-btn" (click)="openComments(fp)">BÌNH LUẬN</button>
                @if (isAuthor(fp)) {
                  <button type="button" class="link-btn" (click)="openEditPost(fp)" title="Chỉnh sửa bài viết">SỬA</button>
                  <button type="button" class="link-btn danger" (click)="deletePost(fp)" title="Xóa bài viết">XÓA</button>
                }
              </div>
            </div>
          </article>
        }

        @if (posts().length > 0) {
          <section class="latest">
            <div class="latest-head">
              <h3>CÁC BÀI VIẾT MỚI NHẤT</h3>
              <span class="page-of">TRANG {{ pagination.page() }} / {{ totalPages() }}</span>
            </div>
            <div class="grid">
              @for (post of gridPosts(); track post.id) {
                <article class="card">
                  <div class="card-img" (click)="viewPostDetail(post.id)">
                    @if (post.mediaUrls && post.mediaUrls.length > 0) { <img [src]="post.mediaUrls[0]" [alt]="titleOf(post)" loading="lazy" /> }
                  </div>
                  <div class="card-body">
                    <span class="card-meta">{{ post.authorName || 'Thành viên' }}@if (post.createdAt) { • {{ post.createdAt | date:'dd/MM/yyyy' }} }</span>
                    <h4>{{ titleOf(post) }}</h4>
                    <p class="excerpt">{{ excerptOf(post) }}</p>
                    <div class="card-actions">
                      <button type="button" class="read-link" (click)="viewPostDetail(post.id)">ĐỌC BÀI VIẾT →</button>
                      <button type="button" class="link-btn" (click)="openComments(post)">BÌNH LUẬN</button>
                      @if (isAuthor(post)) {
                        <button type="button" class="link-btn" (click)="openEditPost(post)" title="Chỉnh sửa bài viết">SỬA</button>
                        <button type="button" class="link-btn danger" (click)="deletePost(post)" title="Xóa bài viết">XÓA</button>
                      }
                    </div>
                  </div>
                </article>
              }
            </div>
          </section>
        } @else {
          <fc-page-state kind="empty" title="Chưa có bài viết nào" message="Hãy là người đầu tiên chia sẻ trên bảng tin cộng đồng." />
        }
      }
    </main>

    <!-- Create Post Modal -->
    <fc-modal
      [isOpen]="createModalOpen()"
      title="Tạo bài viết mới"
      (close)="createModalOpen.set(false)"
    >
      <form (ngSubmit)="submitPost()" class="create-post-form">
        <label>
          Nội dung chia sẻ *
          <textarea
            [(ngModel)]="newPostCaption"
            name="caption"
            rows="4"
            placeholder="Bạn đang mặc phong cách gì hôm nay? Chia sẻ cảm nhận và tips phối đồ..."
            required
          ></textarea>
        </label>

        <label>
          Ảnh trang phục (JPEG, PNG, WebP) *
          <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploading()" (change)="uploadPostImage($event)" />
          @if (uploading()) { <span role="status" class="hint">Đang tải ảnh lên máy chủ...</span> }
          @if (newPostImageUrl) { <img [src]="newPostImageUrl" alt="Ảnh bài viết" class="preview-img" /> }
        </label>

        <div class="form-actions">
          <button type="button" class="btn-outline" (click)="createModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="submitting() || uploading() || !newPostMediaId() || !newPostCaption.trim()">
            {{ submitting() ? 'Đang đăng...' : 'Đăng bài viết' }}
          </button>
        </div>
      </form>
    </fc-modal>

    <!-- Edit Post Modal (PATCH /community/posts/:postId) -->
    <fc-modal
      [isOpen]="editModalOpen()"
      title="Chỉnh sửa bài viết"
      (close)="editModalOpen.set(false)"
    >
      @if (editingPost(); as ep) {
        <form (ngSubmit)="submitEditPost()" class="create-post-form">
          <label>
            Nội dung chia sẻ *
            <textarea
              [(ngModel)]="editPostCaption"
              name="editCaption"
              rows="4"
              required
            ></textarea>
          </label>

          @if (editPostImageUrl) {
            <div>
              <span class="field-label">Ảnh đính kèm:</span>
              <img [src]="editPostImageUrl" alt="Ảnh bài viết" class="preview-img" />
            </div>
          }

          <label>
            Thay đổi ảnh mới (tùy chọn)
            <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploading()" (change)="uploadEditPostImage($event)" />
            @if (uploading()) { <span role="status" class="hint">Đang tải ảnh lên máy chủ...</span> }
          </label>

          <div class="form-actions">
            <button type="button" class="btn-outline" (click)="editModalOpen.set(false)">Hủy</button>
            <button type="submit" class="btn-primary" [disabled]="submitting() || uploading() || !editPostCaption.trim()">
              {{ submitting() ? 'Đang lưu...' : 'Lưu thay đổi' }}
            </button>
          </div>
        </form>
      }
    </fc-modal>

    <!-- Post Detail Modal (GET /community/posts/:postId) -->
    <fc-modal
      [isOpen]="detailModalOpen()"
      title="Chi tiết bài viết"
      maxWidth="680px"
      (close)="detailModalOpen.set(false)"
    >
      @if (loadingDetail()) {
        <p class="notice">Đang tải chi tiết bài viết...</p>
      } @else if (detailedPost(); as dp) {
        <div class="detail-container">
          <div class="post-header">
            <div class="author-circle">{{ dp.authorName?.[0] || 'U' }}</div>
            <div class="header-meta">
              <strong class="author-name">{{ dp.authorName || 'Thành viên' }}</strong>
              <span class="post-time">{{ dp.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
            </div>
          </div>

          @if (dp.mediaUrls && dp.mediaUrls.length > 0) {
            <div class="detail-image-wrap">
              <img [src]="dp.mediaUrls[0]" alt="Ảnh bài viết" />
            </div>
          }

          <p class="detail-caption">{{ dp.caption }}</p>

          <div class="modal-footer-btn">
            <button type="button" class="btn-primary" (click)="openCommentsFromDetail(dp)">
              💬 Mở khung bình luận
            </button>
          </div>
        </div>
      }
    </fc-modal>

    <!-- Comments Modal (with PATCH/DELETE /community/posts/:postId/comments/:commentId) -->
    <fc-modal
      [isOpen]="commentsModalOpen()"
      [title]="'Bình luận bài viết'"
      maxWidth="600px"
      (close)="commentsModalOpen.set(false)"
    >
      <div class="comments-container">
        <div class="comments-list">
          @for (c of activeComments(); track c.id) {
            <div class="comment-item">
              <div class="comment-header-row">
                <strong class="c-author">{{ c.authorName || 'Khách' }}</strong>
                <span class="c-date">{{ c.createdAt | date:'HH:mm dd/MM' }}</span>

                @if (isCommentAuthor(c)) {
                  <div class="c-actions">
                    <button type="button" class="btn-inline-text" (click)="startEditComment(c)">Sửa</button>
                    <button type="button" class="btn-inline-text text-danger" (click)="deleteComment(c)">Xóa</button>
                  </div>
                }
              </div>

              <!-- Inline edit comment -->
              @if (editingCommentId() === c.id) {
                <div class="inline-edit-box">
                  <input type="text" [(ngModel)]="editCommentContent" (keyup.enter)="saveEditComment(c)" />
                  <div class="inline-actions">
                    <button type="button" class="btn-xs" (click)="editingCommentId.set('')">Hủy</button>
                    <button type="button" class="btn-xs-primary" [disabled]="!editCommentContent.trim()" (click)="saveEditComment(c)">Lưu</button>
                  </div>
                </div>
              } @else {
                <p class="c-content">{{ c.content }}</p>
              }
            </div>
          } @empty {
            <p class="no-comments">Chưa có bình luận nào. Hãy gửi lời bình luận đầu tiên!</p>
          }
        </div>

        @if (auth.isAuthenticated()) {
          <form (ngSubmit)="sendComment()" class="comment-form">
            <input
              type="text"
              [(ngModel)]="commentText"
              name="comment"
              placeholder="Viết bình luận của bạn..."
              required
            />
            <button type="submit" class="btn-primary" [disabled]="!commentText.trim()">Gửi</button>
          </form>
        } @else {
          <p class="login-hint">Vui lòng đăng nhập để gửi bình luận.</p>
        }
      </div>
    </fc-modal>

    <fc-pagination label="Phân trang" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />
`,
  styles: [`
    :host { display: block; font-family: 'Montserrat', sans-serif; color: #000; }
    .blog { background: #fff; }
    .banner { padding: 32px 48px; border-bottom: 1px solid #c4c7c7; max-width: 1280px; margin: 0 auto; box-sizing: border-box; }
    .eyebrow { font-size: 13px; font-weight: 600; letter-spacing: .1em; color: #8f485d; }
    .banner h1 { font-family: 'Playfair Display', serif; font-weight: 400; font-size: 40px; line-height: 48px; letter-spacing: -.025em; margin: 12px 0 16px; max-width: 900px; }
    .banner-desc { margin: 0; max-width: 672px; font-weight: 300; font-size: 16px; line-height: 26px; color: #444748; }
    .banner-action { margin-top: 20px; }
    .btn-dark { height: 40px; padding: 0 24px; background: #171717; color: #fff; border: 1px solid #000; border-radius: 15px; font: inherit; font-size: 12px; font-weight: 700; letter-spacing: .1em; cursor: pointer; }
    .btn-dark:hover { background: #000; }
    .filter-bar { max-width: 1280px; margin: 0 auto; padding: 32px 48px; border-bottom: 1px solid #c4c7c7; display: flex; justify-content: flex-end; align-items: center; gap: 24px; flex-wrap: wrap; box-sizing: border-box; }
    .search { display: flex; width: 420px; max-width: 100%; height: 44px; border: 1px solid #c4c7c7; background: #fff; box-sizing: border-box; }
    .search input { flex: 1; min-width: 0; border: 0; outline: 0; padding: 0 16px; font: inherit; font-size: 14px; background: transparent; border-radius: 0; }
    .search button { width: 44px; border: 0; background: transparent; cursor: pointer; display: grid; place-items: center; padding: 0; }

    .cover { max-width: 1184px; margin: 64px auto 0; display: grid; grid-template-columns: 7fr 5fr; border: 1px solid #000; background: #fff; }
    .cover-img { position: relative; min-height: 475px; background: #efeded; border-right: 1px solid #000; overflow: hidden; cursor: pointer; }
    .cover-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cover-badge { position: absolute; left: 16px; top: 16px; padding: 4px 12px; background: #fff; border: 1px solid #000; font-size: 11px; font-weight: 600; letter-spacing: .05em; }
    .cover-text { padding: 56px; display: flex; flex-direction: column; gap: 16px; justify-content: center; }
    .meta { display: flex; gap: 12px; font-size: 11px; font-weight: 600; letter-spacing: .16em; color: #444748; text-transform: uppercase; }
    .cover-text h2 { margin: 0; font-family: 'Playfair Display', serif; font-weight: 400; font-size: 28px; line-height: 34px; letter-spacing: -.04em; }
    .cover-excerpt { margin: 0; font-weight: 300; font-size: 16px; line-height: 26px; color: #444748; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
    .cover-actions { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 8px; }
    .btn-pink { height: 48px; padding: 0 24px; background: #ffd9e1; border: 2px solid #000; font: inherit; font-size: 13px; font-weight: 600; letter-spacing: .1em; cursor: pointer; }
    .btn-pink:hover { background: #f4b8c1; }
    .link-btn { padding: 0; background: none; border: 0; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .1em; color: #444748; cursor: pointer; }
    .link-btn:hover { color: #8f485d; }
    .link-btn.danger { color: #c62828; }

    .latest { max-width: 1280px; margin: 64px auto 0; padding: 32px 48px 0; border-top: 1px solid #c4c7c7; box-sizing: border-box; }
    .latest-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
    .latest-head h3 { margin: 0; font-family: 'Playfair Display', serif; font-weight: 500; font-size: 22px; letter-spacing: .05em; }
    .page-of { font-size: 11px; font-weight: 600; letter-spacing: .1em; color: #444748; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 48px 32px; }
    .card { border: 1px solid #c4c7c7; display: flex; flex-direction: column; background: #fff; }
    .card-img { aspect-ratio: 371 / 494; background: #efeded; border-bottom: 1px solid #c4c7c7; overflow: hidden; cursor: pointer; }
    .card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .card-body { padding: 24px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .card-meta { font-size: 11px; font-weight: 600; letter-spacing: .16em; color: #444748; text-transform: uppercase; }
    .card h4 { margin: 0; font-family: 'Playfair Display', serif; font-weight: 500; font-size: 22px; line-height: 30px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .excerpt { margin: 0; font-size: 14px; line-height: 22px; color: #444748; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
    .card-actions { margin-top: auto; padding-top: 12px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .read-link { padding: 0 0 4px; background: none; border: 0; border-bottom: 1px solid #000; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .1em; cursor: pointer; }
    .read-link:hover { color: #8f485d; border-color: #8f485d; }
    @media (max-width: 900px) {
      .banner, .filter-bar { padding: 24px 20px; }
      .banner h1 { font-size: 28px; line-height: 36px; }
      .cover { grid-template-columns: 1fr; margin: 32px 20px 0; }
      .cover-img { min-height: 320px; border-right: 0; border-bottom: 1px solid #000; }
      .cover-text { padding: 24px; }
      .latest { padding: 24px 20px 0; }
      .grid { grid-template-columns: 1fr; }
    }

    .post-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--color-canvas);
    }
    .author-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-accent);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
    }
    .header-meta {
      flex: 1;
    }
    .author-name {
      display: block;
      font-size: 0.95rem;
      color: var(--color-text);
    }
    .post-time {
      font-size: 0.78rem;
      color: var(--color-muted);
    }
    .text-danger {
      color: #c62828 !important;
    }
    .text-danger:hover {
      border-color: #ef9a9a;
      background: #ffebee !important;
    }
    .create-post-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .create-post-form label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.88rem;
      color: #444;
    }
    .create-post-form textarea, .create-post-form input {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 12px;
      font-size: 0.92rem;
      outline: none;
    }
    .preview-img {
      max-width: 100%;
      max-height: 220px;
      object-fit: contain;
      border-radius: var(--radius-control);
      border: 1px solid var(--color-divider);
      margin-top: 6px;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 10px;
    }
    .hint {
      font-size: 0.8rem;
      color: var(--color-muted);
    }
    .detail-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .detail-image-wrap img {
      max-width: 100%;
      border-radius: 6px;
      display: block;
    }
    .detail-caption {
      font-size: 1rem;
      line-height: 1.7;
      color: #2b2824;
      white-space: pre-line;
      margin: 0;
    }
    .modal-footer-btn {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
    }
    .comments-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .comments-list {
      max-height: 380px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .comment-item {
      background: var(--color-canvas);
      border-radius: 6px;
      padding: 12px 14px;
      border: 1px solid var(--color-divider);
    }
    .comment-header-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .c-author {
      font-size: 0.88rem;
      color: var(--color-text);
    }
    .c-date {
      font-size: 0.72rem;
      color: var(--color-muted);
      flex: 1;
    }
    .c-actions {
      display: flex;
      gap: 8px;
    }
    .btn-inline-text {
      background: none;
      border: 0;
      padding: 0;
      font-size: 0.75rem;
      color: var(--color-muted);
      cursor: pointer;
      text-decoration: underline;
    }
    .c-content {
      margin: 4px 0 0;
      font-size: 0.9rem;
      color: #333;
      line-height: 1.5;
    }
    .inline-edit-box {
      margin-top: 6px;
      display: flex;
      gap: 8px;
    }
    .inline-edit-box input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      font-size: 0.85rem;
    }
    .inline-actions {
      display: flex;
      gap: 4px;
    }
    .btn-xs {
      padding: 4px 8px;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: var(--radius-control);
      font-size: 0.75rem;
      cursor: pointer;
    }
    .btn-xs-primary {
      padding: 4px 10px;
      border: 0;
      background: var(--color-text);
      color: white;
      border-radius: var(--radius-control);
      font-size: 0.75rem;
      cursor: pointer;
    }
    .comment-form {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .comment-form input {
      flex: 1;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 10px 14px;
      font-size: 0.9rem;
    }
    .login-prompt, .login-hint {
      color: var(--color-muted);
      font-size: 0.88rem;
    }
    .notice {
      color: var(--color-muted);
      text-align: center;
      padding: 40px 0;
    }

    .field-label { display:block; font-weight:500; font-size:.875rem; margin-bottom:8px; }
    .no-comments { padding:28px 16px; color:var(--color-muted); background:var(--color-canvas); text-align:center; border-radius:var(--radius-control); }

  `],
})
export class CommunityPage implements OnInit {
  readonly pagination = new PaginationState(10);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadPosts(); }

  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly posts = signal<CommunityPost[]>([]);
  searchTerm = '';
  private query = '';
  readonly featuredPost = computed(() => (this.pagination.page() === 1 ? this.posts()[0] ?? null : null));
  readonly gridPosts = computed(() => (this.pagination.page() === 1 ? this.posts().slice(1) : this.posts()));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.pagination.total() / this.pagination.limit)));
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');

  // Create Post
  readonly createModalOpen = signal<boolean>(false);
  newPostCaption = '';
  newPostImageUrl = '';
  readonly newPostMediaId = signal('');
  readonly uploading = signal(false);
  readonly submitting = signal<boolean>(false);

  // Edit Post (PATCH /community/posts/:postId)
  readonly editModalOpen = signal<boolean>(false);
  readonly editingPost = signal<CommunityPost | null>(null);
  editPostCaption = '';
  editPostImageUrl = '';
  readonly editPostMediaId = signal('');

  // Detail Post (GET /community/posts/:postId)
  readonly detailModalOpen = signal<boolean>(false);
  readonly detailedPost = signal<CommunityPost | null>(null);
  readonly loadingDetail = signal<boolean>(false);

  // Comments (with PATCH/DELETE comments)
  readonly commentsModalOpen = signal<boolean>(false);
  readonly activePost = signal<CommunityPost | null>(null);
  readonly activeComments = signal<CommunityComment[]>([]);
  commentText = '';
  readonly editingCommentId = signal<string>('');
  editCommentContent = '';

  ngOnInit(): void {
    this.loadPosts();
  }

  loadPosts(): void {
    this.loading.set(true);
    this.error.set('');
    this.pagination.load(() => this.api.listPosts(this.query || undefined, this.pagination.page(), this.pagination.limit), {
      next: (res) => {
        this.posts.set(res.items);
        this.loading.set(false);
      },
      error: () => {
        this.posts.set([]);
        this.error.set('Không thể tải dữ liệu. Vui lòng thử lại.');
        this.loading.set(false);
      },
    });
  }

  submitSearch(): void {
    this.query = this.searchTerm.trim();
    this.pagination.page.set(1);
    this.loadPosts();
  }

  titleOf(post: CommunityPost): string {
    const first = (post.caption || '').split(/\r?\n/)[0].trim();
    return first.length > 80 ? first.slice(0, 77).trimEnd() + '…' : first;
  }

  excerptOf(post: CommunityPost): string {
    const lines = (post.caption || '').split(/\r?\n/);
    const rest = lines.slice(1).join('\n').trim();
    return rest || (lines[0] || '').trim();
  }

  isAuthor(post: CommunityPost): boolean {
    const cur = this.auth.currentUser();
    if (!cur) return false;
    const authorId = post.ownerId || (post as any).authorId;
    return cur.id === authorId || (cur as any).sub === authorId || this.auth.isAdmin();
  }

  isCommentAuthor(comment: CommunityComment): boolean {
    const cur = this.auth.currentUser();
    if (!cur) return false;
    return cur.id === comment.authorId || (cur as any).sub === comment.authorId || this.auth.isAdmin();
  }

  // --- GET /community/posts/:postId ---
  viewPostDetail(postId: string): void {
    this.loadingDetail.set(true);
    this.detailedPost.set(null);
    this.detailModalOpen.set(true);
    this.api.getPost(postId).subscribe({
      next: (post) => {
        this.detailedPost.set(post);
        this.loadingDetail.set(false);
      },
      error: (err) => {
        this.loadingDetail.set(false);
        this.detailModalOpen.set(false);
        this.toast.error(err.error?.message || 'Không thể tải chi tiết bài viết.');
      },
    });
  }

  openCommentsFromDetail(post: CommunityPost): void {
    this.detailModalOpen.set(false);
    this.openComments(post);
  }

  // --- Create Post ---
  submitPost(): void {
    if (!this.newPostCaption.trim() || !this.newPostMediaId() || this.submitting()) return;

    this.submitting.set(true);
    this.api.createPost({
      caption: this.newPostCaption,
      mediaIds: [this.newPostMediaId()],
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.createModalOpen.set(false);
        this.newPostCaption = '';
        this.newPostImageUrl = '';
        this.newPostMediaId.set('');
        this.toast.success('Đã đăng bài viết lên cộng đồng!');
        this.loadPosts();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo bài viết.');
      },
    });
  }

  // --- Edit Post (PATCH /community/posts/:postId) ---
  openEditPost(post: CommunityPost): void {
    this.editingPost.set(post);
    this.editPostCaption = post.caption;
    this.editPostImageUrl = (post.mediaUrls && post.mediaUrls[0]) || '';
    this.editPostMediaId.set((post as any).mediaIds?.[0] || '');
    this.editModalOpen.set(true);
  }

  uploadEditPostImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    const reader = new FileReader();
    reader.onload = () => { this.editPostImageUrl = String(reader.result); };
    reader.readAsDataURL(file);
    this.api.uploadImage(file, 'community').subscribe({
      next: (media) => {
        this.editPostMediaId.set(media.id);
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.toast.error(err.error?.message || 'Không thể tải ảnh.');
      },
    });
  }

  submitEditPost(): void {
    const post = this.editingPost();
    if (!post || !this.editPostCaption.trim() || this.submitting()) return;

    this.submitting.set(true);
    const mediaIds = this.editPostMediaId() ? [this.editPostMediaId()] : [];
    this.api.updatePost(post.id, {
      caption: this.editPostCaption,
      mediaIds,
    }).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        this.editModalOpen.set(false);
        this.toast.success('Đã cập nhật bài viết thành công!');
        this.posts.update((list) =>
          list.map((p) => (p.id === post.id ? { ...p, caption: updated.caption || this.editPostCaption, mediaUrls: updated.mediaUrls || p.mediaUrls } : p))
        );
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật bài viết.');
      },
    });
  }

  // --- DELETE /community/posts/:postId ---
  deletePost(post: CommunityPost): void {
    if (!confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) return;

    this.api.deletePost(post.id).subscribe({
      next: () => {
        this.toast.success('Đã xóa bài viết.');
        this.posts.update((list) => list.filter((p) => p.id !== post.id));
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể xóa bài viết.');
      },
    });
  }

  // --- Comments Modal & Actions ---
  openComments(post: CommunityPost): void {
    this.activeComments.set([]);
    this.commentText = '';
    this.editingCommentId.set('');
    this.activePost.set(post);
    this.commentsModalOpen.set(true);
    this.api.listComments(post.id).subscribe({
      next: (res) => this.activeComments.set(res.items),
      error: () => this.activeComments.set([]),
    });
  }

  sendComment(): void {
    const post = this.activePost();
    if (!post || !this.commentText.trim()) return;

    this.api.createComment(post.id, this.commentText).subscribe({
      next: (c) => {
        this.activeComments.update((list) => [...list, c]);
        this.commentText = '';
        this.toast.success('Đã gửi bình luận');
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể gửi bình luận.');
      },
    });
  }

  // --- PATCH /community/posts/:postId/comments/:commentId ---
  startEditComment(c: CommunityComment): void {
    this.editingCommentId.set(c.id);
    this.editCommentContent = c.content;
  }

  saveEditComment(c: CommunityComment): void {
    const post = this.activePost();
    if (!post || !this.editCommentContent.trim()) return;

    this.api.updateComment(post.id, c.id, this.editCommentContent.trim()).subscribe({
      next: (updated) => {
        this.editingCommentId.set('');
        this.toast.success('Đã cập nhật bình luận.');
        this.activeComments.update((list) =>
          list.map((item) => (item.id === c.id ? { ...item, content: updated.content || this.editCommentContent } : item))
        );
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể cập nhật bình luận.');
      },
    });
  }

  // --- DELETE /community/posts/:postId/comments/:commentId ---
  deleteComment(c: CommunityComment): void {
    const post = this.activePost();
    if (!post) return;
    if (!confirm('Bạn có muốn xóa bình luận này không?')) return;

    this.api.deleteComment(post.id, c.id).subscribe({
      next: () => {
        this.toast.success('Đã xóa bình luận.');
        this.activeComments.update((list) => list.filter((item) => item.id !== c.id));
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể xóa bình luận.');
      },
    });
  }

  uploadPostImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.newPostMediaId.set('');
    this.uploading.set(true);
    const reader = new FileReader();
    reader.onload = () => { this.newPostImageUrl = String(reader.result); };
    reader.readAsDataURL(file);
    this.api.uploadImage(file, 'community').subscribe({
      next: (media) => {
        this.newPostMediaId.set(media.id);
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.toast.error(err.error?.message || err.message || 'Không thể tải ảnh.');
      },
    });
  }
}
