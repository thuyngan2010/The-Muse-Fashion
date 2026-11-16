import { PaginationComponent, PaginationState } from '../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { CommunityPost, CommunityComment } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { ModalComponent } from '../components/modal.component';

@Component({
  standalone: true,
  imports: [PaginationComponent, DatePipe, FormsModule, ModalComponent],
  template: `
    <main class="community-page-container">
      <header class="page-header">
        <div class="header-left">
          <span class="eyebrow">FASHION COMMUNITY</span>
          <h1 class="page-title">Cộng đồng phong cách</h1>
          <p class="page-desc">Chia sẻ bản phối, gợi ý thời trang và kết nối cùng cộng đồng yêu cái đẹp.</p>
        </div>

        <div class="header-right">
          @if (auth.isAuthenticated()) {
            <button class="btn-primary" (click)="createModalOpen.set(true)">
              ✍ Đăng bài viết mới
            </button>
          } @else {
            <p class="login-prompt">Đăng nhập để chia sẻ phong cách của bạn.</p>
          }
        </div>
      </header>

      @if (loading()) {
        <p class="notice">Đang tải bảng tin cộng đồng...</p>
      } @else if (error()) {
        <p class="notice error">{{ error() }}</p>
      } @else {
        <div class="posts-feed">
          @for (post of posts(); track post.id) {
            <article class="post-card">
              <div class="post-header">
                <div class="author-circle">
                  {{ post.authorName?.[0] || 'U' }}
                </div>
                <div class="header-meta">
                  <strong class="author-name">{{ post.authorName || 'Thành viên' }}</strong>
                  <span class="post-time">{{ post.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
                </div>

                @if (isAuthor(post)) {
                  <div class="post-actions-menu">
                    <button type="button" class="btn-ghost-sm" (click)="openEditPost(post)" title="Chỉnh sửa bài viết">✏ Sửa</button>
                    <button type="button" class="btn-ghost-sm text-danger" (click)="deletePost(post)" title="Xóa bài viết">🗑 Xóa</button>
                  </div>
                }
              </div>

              @if (post.mediaUrls && post.mediaUrls.length > 0) {
                <div class="post-image-wrap" (click)="viewPostDetail(post.id)">
                  <img [src]="post.mediaUrls[0]" alt="Ảnh bài viết" loading="lazy" />
                </div>
              }

              <div class="post-body">
                <p class="post-caption">{{ post.caption }}</p>
              </div>

              <div class="post-footer">
                <button class="comment-trigger-btn" (click)="openComments(post)">
                  💬 Bình luận
                </button>
                <button class="detail-link-btn" (click)="viewPostDetail(post.id)">
                  🔍 Xem chi tiết
                </button>
              </div>
            </article>
          } @empty {
            <div class="empty-state">
              <p>Chưa có bài viết nào trên bảng tin cộng đồng. Hãy là người đầu tiên chia sẻ!</p>
            </div>
          }
        </div>
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
    .community-page-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 50px 5vw 100px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 50px;
      border-bottom: 1px solid var(--color-divider);
      padding-bottom: 30px;
      flex-wrap: wrap;
    }
    .eyebrow {
      font-size: 0.74rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: 2.5rem;
      margin: 8px 0 10px;
      font-weight: 500;
    }
    .page-desc {
      color: var(--color-muted);
      margin: 0;
      line-height: 1.6;
    }
    .posts-feed {
      display: flex;
      flex-direction: column;
      gap: 36px;
    }
    .post-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
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
    .post-actions-menu {
      display: flex;
      gap: 8px;
    }
    .btn-ghost-sm {
      background: none;
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-control);
      padding: 4px 8px;
      font-size: 0.75rem;
      color: #555;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-ghost-sm:hover {
      background: var(--color-canvas);
      color: var(--color-text);
    }
    .text-danger {
      color: #c62828 !important;
    }
    .text-danger:hover {
      border-color: #ef9a9a;
      background: #ffebee !important;
    }
    .post-image-wrap {
      max-height: 520px;
      background: #eae5de;
      overflow: hidden;
      cursor: pointer;
    }
    .post-image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .post-body {
      padding: 20px;
    }
    .post-caption {
      margin: 0;
      line-height: 1.7;
      color: #2b2824;
      font-size: 0.98rem;
      white-space: pre-line;
    }
    .post-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--color-divider);
      background: var(--color-canvas);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .comment-trigger-btn, .detail-link-btn {
      background: none;
      border: 0;
      color: #555;
      font-size: 0.88rem;
      cursor: pointer;
      font-weight: 500;
    }
    .comment-trigger-btn:hover, .detail-link-btn:hover {
      color: var(--color-text);
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
    .empty-state {
      text-align: center;
      padding: 60px 0;
      color: var(--color-muted);
    }

    .header-left { min-width:0; } .header-right { display:flex; flex-wrap:wrap; gap:12px; }
    .field-label { display:block; font-weight:500; font-size:.875rem; margin-bottom:8px; }
    .no-comments { padding:28px 16px; color:var(--color-muted); background:var(--color-canvas); text-align:center; border-radius:var(--radius-control); }


  `],
})
export class CommunityPage implements OnInit {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadPosts(); }

  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly posts = signal<CommunityPost[]>([]);
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
    this.pagination.load(() => this.api.listPosts(undefined, this.pagination.page(), this.pagination.limit), {
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
