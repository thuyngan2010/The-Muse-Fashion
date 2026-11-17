import { PaginationComponent, PaginationState } from '../components/pagination.component';
import { Component, OnInit, OnDestroy, inject, signal, computed, effect, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ProductDetail, ProductVariant, ProductReview, ProductSummary, ReviewMutationResult } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { ModalComponent } from '../components/modal.component';
import { STORE_PRODUCT_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

@Component({
  standalone: true,
  imports: [PageStateComponent, PaginationComponent, RouterLink, CurrencyPipe, DatePipe, FormsModule, ModalComponent],
  template: `
    <div class="product-page-container">
      <nav class="breadcrumb" aria-label="Đường dẫn">
        <a routerLink="/">Trang chủ</a> / <span>Sản phẩm</span> / <strong>{{ product()?.name || 'Chi tiết' }}</strong>
      </nav>

      @if (loading()) {
        <fc-page-state kind="loading" title="Đang tải sản phẩm" message="Thông tin sản phẩm đang được cập nhật." />
      } @else if (error()) {
        <fc-page-state kind="error" title="Không thể tải sản phẩm" [message]="error()" actionLabel="VỀ DANH MỤC SẢN PHẨM" actionLink="/products" />
      } @else if (product(); as p) {
        <div class="product-layout">
          <!-- Gallery / Images -->
          <div class="gallery-col">
            <div class="main-image-wrap">
              <div class="image-labels" aria-hidden="true">
                <span>BỘ SƯU TẬP MỚI</span>
                <span>THIẾT KẾ MUSE</span>
              </div>
              @if (currentImage()) {
                <img [src]="currentImage()" [alt]="p.name" class="main-image" />
              } @else {
                <div class="placeholder-main"><span>MUSE</span></div>
              }
              <a class="tryon-corner" [routerLink]="['/ai/try-on']" [queryParams]="{ productId: p.id }"><span aria-hidden="true">✦</span> {{ content.tryOnLabel }}</a>
            </div>
            @if (p.images && p.images.length > 1) {
              <div class="thumbnail-list">
                @for (img of p.images; track img) {
                  <button
                    class="thumb-btn"
                    [class.active]="currentImage() === img"
                    (click)="currentImage.set(img)"
                  >
                    <img [src]="img" [alt]="p.name" />
                  </button>
                }
              </div>
            }
          </div>

          <!-- Product Details & Buy Form -->
          <div class="details-col">
            @if ($any(p).category?.name || $any(p).categoryName) {
              <span class="product-kicker">{{ $any(p).category?.name || $any(p).categoryName }}</span>
            }
            <h1 class="p-title">{{ p.name }}</h1>

            <div class="rating-row">
              <button type="button" class="rating-link" (click)="scrollToReviews()">
                @if (averageRating(); as avg) { <span class="rating-avg"><span aria-hidden="true">★</span> {{ avg }}</span> }
                <span>({{ reviewPagination.total() }} đánh giá)</span>
              </button>
              @if (selectedVariant()?.sku; as sku) { <span class="sku">SKU: {{ sku }}</span> }
            </div>

            <div class="price-box">
              <span class="current-price">{{ selectedVariant()?.price || p.price | currency:'VND':'symbol':'1.0-0' }}</span>
              @if (listPrice(); as old) {
                <span class="old-price">{{ old | currency:'VND':'symbol':'1.0-0' }}</span>
                <span class="sale-badge">-{{ discountPercent() }}%</span>
              }
              @if (selectedVariant()) {
                <span class="stock-status" [class.in-stock]="selectedVariant()!.available > 0" [class.out-of-stock]="selectedVariant()!.available <= 0">
                  {{ selectedVariant()!.available > 0 ? ('Còn ' + selectedVariant()!.available + ' sản phẩm') : 'Hết hàng' }}
                </span>
              }
            </div>

            @if (p.description) {
              <p class="product-intro clamp-3">{{ p.description }}</p>
            }

            <hr class="divider" />

            <!-- Variant Selection: Color -->
            @if (colors().length > 0) {
              <div class="variant-group">
                <label class="variant-label">Màu sắc: <strong>{{ selectedColor() }}</strong></label>
                <div class="option-buttons">
                  @for (c of colors(); track c) {
                    <button
                      type="button"
                      class="option-btn color-option"
                      [class.swatch]="!!swatchHex(c)"
                      [class.active]="selectedColor() === c"
                      [attr.aria-pressed]="selectedColor() === c"
                      [attr.aria-label]="'Màu ' + c"
                      [attr.title]="c"
                      (click)="chooseColor(c)"
                    >
                      @if (swatchHex(c); as hex) { <span class="swatch-fill" [style.background]="hex"></span> } @else { {{ c }} }
                    </button>
                  }
                </div>
                @if (!selectedColor()) {
                  <p class="variant-error" role="alert">Vui lòng chọn màu sắc.</p>
                }
              </div>
            }

            <!-- Variant Selection: Size -->
            @if (sizes().length > 0) {
              <div class="variant-group">
                <div class="size-header">
                  <label class="variant-label">Kích cỡ: <strong>{{ selectedSize() }}</strong></label>
                  <button type="button" class="size-guide-link" (click)="sizeModalOpen.set(true)">
                    📏 Gợi ý chọn size thông minh
                  </button>
                </div>
                <div class="option-buttons">
                  @for (s of sizes(); track s) {
                    <button
                      type="button"
                      class="option-btn size-option"
                      [class.active]="selectedSize() === s"
                      [class.sold-out]="!sizeAvailable(s)"
                      [disabled]="!sizeAvailable(s)"
                      [attr.title]="sizeAvailable(s) ? null : 'Hết hàng'"
                      [attr.aria-pressed]="selectedSize() === s"
                      (click)="chooseSize(s)"
                    >
                      {{ s }}
                    </button>
                  }
                </div>
                @if (!selectedSize()) {
                  <p class="variant-error" role="alert">Vui lòng chọn kích cỡ.</p>
                }
              </div>
            }
            @if (selectedColor() && selectedSize() && !selectedVariant()) {
              <p class="variant-error" role="alert">Màu sắc và kích cỡ đã chọn hiện không khả dụng.</p>
            }

            <!-- Quantity & Add to Cart -->
            <div class="action-row">
              <div class="quantity-stepper">
                <button type="button" (click)="changeQuantity(-1)" [disabled]="quantity() <= 1">-</button>
                <span class="qty-display">{{ quantity() }}</span>
                <button type="button" (click)="changeQuantity(1)" [disabled]="quantity() >= maxQuantity()">+</button>
              </div>

              <button
                type="button"
                class="add-to-cart-btn"
                [disabled]="!canAddToCart()"
                (click)="addToCart()"
              >
                @if (selectedVariant() && selectedVariant()!.available <= 0) {
                  Hết hàng tạm thời
                } @else {
                  Thêm vào giỏ hàng
                }
              </button>
            </div>

            <button type="button" class="buy-now-btn" [disabled]="!canAddToCart() || buyingNow()" (click)="buyNow()">
              {{ buyingNow() ? 'ĐANG XỬ LÝ...' : 'MUA NGAY' }}
            </button>

            <ul class="value-props" aria-label="Cam kết mua sắm">
              @for (item of content.valueProps; track item) { <li>{{ item }}</li> }
            </ul>

            <section class="product-specifications" aria-label="Thông tin sản phẩm">
              @if (p.description) {
                <details class="description-box" open>
                  <summary>Chi tiết sản phẩm</summary>
                  <p>{{ p.description }}</p>
                </details>
              }
              @if (p.material) {
                <details class="description-box">
                  <summary>Chất liệu &amp; bảo quản</summary>
                  <p>{{ p.material }}</p>
                </details>
              }
              @if (sizes().length > 0) {
                <details class="description-box">
                  <summary>Hướng dẫn chọn kích cỡ</summary>
                  <p>Chọn kích cỡ phù hợp với số đo và kiểu mặc mong muốn của bạn.</p>
                  <button type="button" class="accordion-action" (click)="sizeModalOpen.set(true)">
                    MỞ GỢI Ý CHỌN SIZE <span aria-hidden="true">→</span>
                  </button>
                </details>
              }
              <details class="description-box">
                <summary>{{ content.returnPolicy.title }}</summary>
                <p>{{ content.returnPolicy.body }}</p>
              </details>
            </section>
          </div>
        </div>

        <section class="lookbook-banner" aria-label="Triết lý thiết kế">
          <div class="banner-copy">
            <span class="section-kicker">{{ content.banner.eyebrow }}</span>
            <h2>{{ content.banner.title }}</h2>
            <p>{{ content.banner.quote }}</p>
            <a routerLink="/lookbooks" class="banner-link">{{ content.banner.cta }} <span aria-hidden="true">→</span></a>
          </div>
          <div class="banner-media"><img [src]="content.banner.imageSrc" [alt]="content.banner.imageAlt" loading="lazy" (error)="$any($event.target).style.display = 'none'" /></div>
        </section>

        @if (relatedProducts().length > 0) {
          <section class="related-section" aria-label="Gợi ý hoàn hảo">
            <div class="related-heading">
              <div>
                <span class="section-kicker">GỢI Ý HOÀN HẢO</span>
                <h2>Có thể bạn cũng thích</h2>
              </div>
              <a routerLink="/products">XEM TẤT CẢ SẢN PHẨM <span aria-hidden="true">→</span></a>
            </div>
            <div class="related-grid">
              @for (item of relatedProducts(); track item.id) {
                <article class="related-card">
                  <div class="related-media">
                    <a class="related-image" [routerLink]="['/products', item.slug]">
                      @if (item.images && item.images.length > 0) {
                        <img [src]="item.images[0]" [alt]="item.name" loading="lazy">
                      } @else {
                        <span>MUSE</span>
                      }
                    </a>
                  </div>
                  @if (relatedCategory(item); as cat) { <span class="related-cat">{{ cat }}</span> }
                  <h3><a [routerLink]="['/products', item.slug]">{{ item.name }}</a></h3>
                  <p>{{ item.price | currency:'VND':'symbol':'1.0-0' }}</p>
                  <a class="related-link" [routerLink]="['/products', item.slug]">MUA NGAY <span aria-hidden="true">🛒︎</span></a>
                </article>
              }
            </div>
          </section>
        }

        <!-- Reviews & Feedback Section -->
        <section class="reviews-section" id="reviews-section">
          <div class="reviews-header">
            <div>
              <span class="eyebrow">NHẬN XÉT KHÁCH HÀNG</span>
              <h2>Đánh giá sản phẩm ({{ reviewPagination.total() }})</h2>
            </div>
          </div>

          <div class="reviews-list">
            @for (rev of reviews(); track rev.id) {
              <div class="review-item">
                <div class="review-meta">
                  <span class="stars">★ {{ rev.stars }}/5</span>
                  <span class="date">{{ rev.createdAt | date:'dd/MM/yyyy' }}</span>
                </div>
                <p class="review-content">{{ rev.content }}</p>
                @if (canManageReview(rev)) {
                  <div class="review-actions">
                    <button type="button" class="btn-outline" (click)="openEditReview(rev)">Sửa đánh giá</button>
                    <button type="button" class="btn-outline" (click)="deleteReview(rev)">Xóa đánh giá</button>
                  </div>
                }
              </div>
            } @empty {
              <p class="empty-reviews">Chưa có đánh giá nào cho sản phẩm này.</p>
            }
          </div>
          @if (reviewManagementError()) {
            <p class="review-error" role="alert">Không thể tải quyền quản lý đánh giá. <button type="button" (click)="reloadReviews()">Thử lại</button></p>
          }
          <fc-pagination label="Đánh giá sản phẩm" [page]="reviewPagination.page()" [total]="reviewPagination.total()" [limit]="reviewPagination.limit" [loading]="loading()" (pageChange)="reviewPaginationChanged($event)" />
        </section>
      }
    </div>

    <!-- Edit Review Modal (PATCH /reviews/:reviewId) -->
    <fc-modal
      [isOpen]="editReviewModalOpen()"
      title="Chỉnh sửa đánh giá"
      (close)="editReviewModalOpen.set(false)"
    >
      <div class="edit-review-modal-body">
        <div class="stars-select">
          @for (star of [1, 2, 3, 4, 5]; track star) {
            <button
              type="button"
              class="star-btn"
              [class.active]="star <= editReviewStars" [attr.aria-label]="star + ' sao'" [attr.aria-pressed]="star === editReviewStars"
              (click)="editReviewStars = star"
            >
              ★
            </button>
          }
        </div>

        <label class="form-group">
          <span>Nội dung đánh giá</span>
          <textarea [(ngModel)]="editReviewContent" rows="4" required></textarea>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="editReviewModalOpen.set(false)">Hủy</button>
          <button type="button" class="btn-primary" [disabled]="savingReview() || !editReviewContent.trim()" (click)="saveEditReview()">
            {{ savingReview() ? 'Đang lưu...' : 'Lưu thay đổi' }}
          </button>
        </div>
      </div>
    </fc-modal>

    <!-- Smart Size Suggestion Modal -->
    <fc-modal
      [isOpen]="sizeModalOpen()"
      title="Gợi ý kích cỡ thông minh (Smart Size Guide)"
      (close)="sizeModalOpen.set(false)"
    >
      <div class="size-modal-content">
        <p class="hint">Nhập số đo cơ thể để hệ thống gợi ý kích thước phù hợp nhất cho bạn:</p>

        <form (ngSubmit)="calculateSizeSuggestion()" class="measure-form">
          <div class="form-grid">
            <label>
              Vòng ngực (cm)
              <input type="number" [(ngModel)]="measureBust" name="bust" placeholder="Ví dụ: 86" />
            </label>
            <label>
              Vòng eo (cm)
              <input type="number" [(ngModel)]="measureWaist" name="waist" placeholder="Ví dụ: 68" />
            </label>
            <label>
              Vòng hông (cm)
              <input type="number" [(ngModel)]="measureHip" name="hip" placeholder="Ví dụ: 92" />
            </label>
          </div>

          <button type="submit" class="btn-primary" [disabled]="calculatingSize()">
            {{ calculatingSize() ? 'Đang tính toán...' : 'Xem gợi ý size' }}
          </button>
        </form>

        @if (suggestedSizeResult()) {
          <div class="suggestion-result">
            <span class="result-label">Size gợi ý tối ưu:</span>
            <strong class="result-size">{{ suggestedSizeResult() }}</strong>
            <p class="disclaimer">Lưu ý: Gợi ý dựa trên bảng thông số chuẩn của dòng sản phẩm.</p>
            <button class="btn-outline" (click)="applySuggestedSize()">Chọn size này</button>
          </div>
        }
      </div>
    </fc-modal>
`,
  styles: [`
    .product-page-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 30px 6vw 80px;
    }
    .breadcrumb {
      font-size: 0.85rem;
      color: var(--color-muted);
      margin-bottom: 30px;
    }
    .breadcrumb a {
      color: #555;
    }
    .breadcrumb strong {
      color: var(--color-text);
    }
    .product-layout {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 60px;
      margin-bottom: 80px;
    }
    .main-image-wrap {
      aspect-ratio: 4/5;
      background: #eae5de;
      border-radius: 6px;
      overflow: hidden;
    }
    .main-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .placeholder-main {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #a79d93;
      letter-spacing: 0.35em;
      font-weight: 600;
    }
    .thumbnail-list {
      display: flex;
      gap: 12px;
      margin-top: 14px;
      overflow-x: auto;
      padding-bottom: 6px;
    }
    .thumb-btn {
      width: 70px;
      height: 85px;
      border-radius: var(--radius-control);
      border: 2px solid transparent;
      padding: 0;
      background: #eee;
      overflow: hidden;
      cursor: pointer;
      opacity: 0.7;
      transition: all 0.15s;
    }
    .thumb-btn.active {
      border-color: var(--color-text);
      opacity: 1;
    }
    .thumb-btn img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .details-col {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .eyebrow {
      font-size: 0.74rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .p-title {
      font-family: Georgia, serif;
      font-size: 2.5rem;
      font-weight: 500;
      margin: 0;
      line-height: 1.2;
    }
    .price-box {
      display: flex;
      align-items: baseline;
      gap: 16px;
    }
    .current-price {
      font-size: 1.6rem;
      font-weight: 600;
      color: var(--color-accent);
    }
    .stock-status {
      font-size: 0.85rem;
      font-weight: 500;
    }
    .in-stock { color: #2e7d32; }
    .out-of-stock { color: #d32f2f; }
    .description-box {
      color: #555049;
      line-height: 1.8;
      font-size: 0.96rem;
    }
    .meta-item {
      font-size: 0.9rem;
      color: var(--color-muted);
      margin: 0;
    }
    .divider {
      border: 0;
      border-top: 1px solid var(--color-divider);
      margin: 10px 0;
    }
    .variant-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .variant-label {
      font-size: 0.9rem;
      color: #555;
    }
    .size-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .size-guide-link {
      background: none;
      border: 0;
      color: var(--color-accent);
      font-size: 0.84rem;
      text-decoration: underline;
      cursor: pointer;
      padding: 0;
    }
    .option-buttons {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .option-btn {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      padding: 8px 18px;
      border-radius: var(--radius-control);
      font-size: 0.88rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .option-btn:hover {
      border-color: var(--color-text);
    }
    .option-btn.active {
      background: var(--color-primary);
      color: var(--color-surface);
      border-color: var(--color-primary);
    }
    .action-row {
      display: flex;
      gap: 16px;
      margin-top: 10px;
    }
    .quantity-stepper {
      display: flex;
      align-items: center;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      background: var(--color-surface);
    }
    .quantity-stepper button {
      background: none;
      border: 0;
      width: 40px;
      height: 48px;
      font-size: 1.1rem;
      cursor: pointer;
    }
    .quantity-stepper button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .qty-display {
      width: 40px;
      text-align: center;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .add-to-cart-btn {
      flex: 1;
      background: var(--color-primary);
      color: var(--color-surface);
      border: 0;
      border-radius: var(--radius-control);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .add-to-cart-btn:hover:not(:disabled) {
      background: #3e3b37;
    }
    .add-to-cart-btn:disabled {
      background: #bbb7b0;
      cursor: not-allowed;
    }
    .tryon-banner {
      background: #f7f4ef;
      border: 1px dashed #cfc7bc;
      border-radius: 6px;
      padding: 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 15px;
    }
    .tryon-icon {
      font-size: 1.5rem;
    }
    .tryon-info {
      flex: 1;
    }
    .tryon-info strong {
      display: block;
      font-size: 0.9rem;
      color: var(--color-text);
      margin-bottom: 2px;
    }
    .tryon-info p {
      font-size: 0.8rem;
      color: var(--color-muted);
      margin: 0;
    }
    .tryon-btn {
      background: var(--color-accent);
      color: var(--color-surface);
      padding: 8px 16px;
      border-radius: var(--radius-control);
      font-size: 0.82rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .reviews-section {
      border-top: 1px solid var(--color-divider);
      padding-top: 60px;
    }
    .reviews-header h2 {
      font-family: Georgia, serif;
      font-size: 1.8rem;
      font-weight: 500;
      margin: 6px 0 30px;
    }
    .reviews-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .review-item {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      padding: 20px;
    }
    .review-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .stars {
      color: #d97706;
      font-weight: 700;
      font-size: 0.9rem;
    }
    .date {
      font-size: 0.8rem;
      color: var(--color-muted);
      flex: 1;
    }
    .review-mgmt-actions {
      display: flex;
      gap: 8px;
    }
    .btn-rev-action {
      background: none;
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-control);
      padding: 2px 8px;
      font-size: 0.74rem;
      cursor: pointer;
      color: #555;
    }
    .btn-rev-action:hover {
      background: var(--color-canvas);
    }
    .edit-review-modal-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .review-content {
      color: #4a453f;
      line-height: 1.6;
      margin: 0;
    }
    .empty-reviews {
      color: var(--color-muted);
      font-style: italic;
    }
    .size-modal-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .hint {
      color: #555;
      font-size: 0.9rem;
      margin: 0;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 16px;
    }
    .form-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: #444;
    }
    .form-grid input {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 10px;
      font-size: 0.9rem;
    }
    .suggestion-result {
      background: #f7f6f2;
      border-radius: 6px;
      padding: 20px;
      text-align: center;
      margin-top: 10px;
    }
    .result-size {
      display: block;
      font-size: 2.2rem;
      color: var(--color-accent);
      margin: 6px 0;
    }
    .disclaimer {
      font-size: 0.8rem;
      color: var(--color-muted);
      margin-bottom: 14px;
    }
    @media (max-width: 900px) {
      .product-layout {
        grid-template-columns: 1fr;
        gap: 30px;
      }
      .form-grid {
        grid-template-columns: 1fr;
      }
    }

    .gallery-col,.details-col { min-width:0; }
    .stars-select { display:flex; gap:6px; margin-bottom:20px; }
    .star-btn { width:44px; height:44px; padding:0; border:1px solid var(--color-border); border-radius:var(--radius-control); background:var(--color-surface); color:var(--color-muted); font-size:1.5rem; }
    .star-btn.active { color:var(--color-warning); background:#faf0da; border-color:#d7b77a; }
    .star-btn:hover { background:var(--color-accent-soft); }
    .modal-actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:12px; margin-top:24px; padding-top:20px; border-top:1px solid var(--color-divider); }
    .measure-form { display:grid; gap:20px; }
    .measure-form label { display:grid; gap:8px; font-size:.875rem; font-weight:500; }
    .result-label { font-size:.875rem; color:var(--color-muted); }
    .form-group textarea { width:100%; margin-top:8px; }
    .quantity-stepper button { min-width:44px; min-height:44px; }

    @media(prefers-reduced-motion:no-preference) {
      .suggestion-result { animation:fc-menu-in 180ms ease-out; }
    }

    /* MUSE product detail */
    :host { display: block; background: #fff; color: #171717; }
    .product-page-container { width: 100%; max-width: 1280px; margin: 0 auto; padding: 28px 48px 80px; }
    .breadcrumb { margin-bottom: 28px; color: #777; font-size: 11px; letter-spacing: .45px; text-transform: uppercase; }
    .breadcrumb a { color: #444; text-decoration: underline; text-underline-offset: 3px; }
    .breadcrumb strong { color: #171717; font-weight: 700; }
    .product-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(360px, .9fr); gap: 52px; align-items: start; margin-bottom: 88px; }
    .gallery-col { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 20px; align-items: start; }
    .main-image-wrap { grid-column: 2; grid-row: 1; aspect-ratio: 4 / 5; border-radius: 0; background: #eeeae5; }
    .main-image { object-position: center top; }
    .thumbnail-list { grid-column: 1; grid-row: 1; display: flex; flex-direction: column; gap: 12px; max-height: 720px; margin: 0; padding: 0 4px 0 0; overflow-x: hidden; overflow-y: auto; }
    .thumb-btn { flex: 0 0 auto; width: 78px; height: 98px; padding: 0; border: 1px solid transparent; border-radius: 0; background: #eeeae5; opacity: .62; }
    .thumb-btn:hover { opacity: .85; }
    .thumb-btn.active { border-color: #171717; opacity: 1; }
    .thumb-btn:focus-visible, .option-btn:focus-visible, .quantity-stepper button:focus-visible, .add-to-cart-btn:focus-visible, .tryon-btn:focus-visible, .size-guide-link:focus-visible { outline: 2px solid #171717; outline-offset: 3px; }
    .placeholder-main { color: #8c8177; letter-spacing: .4em; }
    .details-col { position: sticky; top: 104px; gap: 22px; padding-top: 4px; }
    .p-title { margin: 0; color: #171717; font-family: Georgia, "Times New Roman", serif; font-size: clamp(2.35rem, 3.6vw, 3.25rem); font-weight: 400; line-height: 1.08; letter-spacing: -.04em; }
    .price-box { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid #d8d8d8; }
    .current-price { color: #c55573; font-size: 1.45rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .stock-status { font-size: 11px; font-weight: 700; letter-spacing: .35px; text-transform: uppercase; }
    .in-stock { color: #147a5a; } .out-of-stock { color: #ba2929; }
    .product-intro { margin: 0; color: #565656; font-size: 14px; line-height: 1.75; }
    .product-specifications { margin-top: 4px; border-top: 1px solid #d8d8d8; }
    .description-box { border-bottom: 1px solid #d8d8d8; color: #565656; font-size: 14px; line-height: 1.7; }
    .description-box summary { position: relative; padding: 16px 28px 16px 0; color: #171717; font-size: 12px; font-weight: 700; letter-spacing: .75px; text-transform: uppercase; cursor: pointer; list-style: none; }
    .description-box summary::-webkit-details-marker { display: none; }
    .description-box summary::after { content: '+'; position: absolute; top: 50%; right: 0; transform: translateY(-50%); font-size: 20px; font-weight: 400; }
    .description-box[open] summary::after { content: '−'; }
    .description-box p { margin: 0 0 18px; }
    .accordion-action {
      margin: 0 0 18px;
      padding: 0 0 4px;
      border: 0;
      border-bottom: 1px solid #171717;
      background: transparent;
      color: #171717;
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .65px;
      cursor: pointer;
    }
    .accordion-links { display: grid; gap: 10px; padding: 0 0 18px; }
    .accordion-links a { width: fit-content; color: #171717; font-size: 11px; font-weight: 700; letter-spacing: .55px; text-decoration: underline; text-underline-offset: 4px; text-transform: uppercase; }
    .divider { display: none; }
    .variant-group { gap: 12px; }
    .variant-label { color: #444; font-size: 12px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
    .variant-label strong { color: #171717; }
    .option-buttons { gap: 10px; }
    .option-btn { min-height: 44px; padding: 0 16px; border: 1px solid #bfbfbf; border-radius: 0; background: #fff; color: #171717; font-size: 12px; font-weight: 600; }
    .option-btn:hover { border-color: #171717; }
    .option-btn.active { border-color: #171717; background: #171717; color: #fff; }
    .color-option { width: 48px; min-width: 48px; height: 48px; padding: 3px; overflow: hidden; font-size: 9px; line-height: 1.05; overflow-wrap: anywhere; text-transform: uppercase; }
    .size-option { min-width: 56px; }
    .size-header { gap: 16px; }
    .size-guide-link { color: #a34e67; font-size: 11px; font-weight: 700; text-underline-offset: 4px; }
    .variant-error { margin: 0; color: #b3261e; font-size: 12px; }
    .action-row { gap: 12px; margin-top: 6px; }
    .quantity-stepper { min-width: 132px; height: 50px; justify-content: space-between; border-color: #171717; border-radius: 0; background: #fff; }
    .quantity-stepper button { width: 42px; height: 48px; color: #171717; }
    .qty-display { width: 38px; font-size: 14px; }
    .add-to-cart-btn { min-height: 50px; padding: 12px 20px; border: 2px solid #171717; border-radius: 0; background: #efb3bd; color: #171717; font-size: 12px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; }
    .add-to-cart-btn:hover:not(:disabled) { background: #171717; color: #fff; }
    .add-to-cart-btn:disabled { border-color: #bdbdbd; background: #e6e3e2; color: #777; }
    .tryon-banner { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; margin-top: 4px; padding: 16px 0; border: 0; border-top: 1px solid #d8d8d8; border-bottom: 1px solid #d8d8d8; border-radius: 0; background: transparent; }
    .tryon-icon { color: #a34e67; font-size: 1.3rem; }
    .tryon-info strong { color: #171717; font-size: 12px; letter-spacing: .5px; text-transform: uppercase; }
    .tryon-info p { margin-top: 4px; color: #696969; font-size: 12px; }
    .tryon-btn { align-self: center; padding: 9px 13px; border: 1px solid #171717; border-radius: 0; background: #fff; color: #171717; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .reviews-section { max-width: 920px; margin: 0 auto; padding-top: 56px; border-top: 1px solid #171717; }
    .reviews-header .eyebrow { color: #a34e67; font-size: 11px; letter-spacing: 1.5px; }
    .reviews-header h2 { margin: 8px 0 30px; color: #171717; font-family: Georgia, "Times New Roman", serif; font-size: 2rem; font-weight: 400; }
    .reviews-list { gap: 14px; }
    .review-item { padding: 20px 0; border: 0; border-bottom: 1px solid #d8d8d8; border-radius: 0; background: transparent; }
    .review-meta { gap: 14px; }
    .stars { color: #a34e67; font-size: 12px; }
    .date { color: #777; font-size: 11px; }
    .review-content { color: #444; font-size: 14px; line-height: 1.7; }
    .review-actions { display: flex; gap: 10px; margin-top: 14px; }
    .review-actions .btn-outline, .review-error button { min-height: 36px; padding: 8px 12px; border: 1px solid #171717; border-radius: 0; background: #fff; color: #171717; font-size: 11px; font-weight: 700; cursor: pointer; }
    .empty-reviews { margin: 0; padding: 32px 0; border-top: 1px solid #d8d8d8; border-bottom: 1px solid #d8d8d8; color: #666; font-style: normal; text-align: center; }
    .review-error { color: #a82121; font-size: 13px; }
    fc-pagination { display: block; margin-top: 28px; }
    .edit-review-modal-body .form-group { display: grid; gap: 8px; }
    .form-group textarea, .form-grid input { padding: 12px; border: 1px solid #bfbfbf; border-radius: 0; background: #fff; font: inherit; }
    .star-btn { border-radius: 0; }
    .modal-actions .btn-primary, .measure-form .btn-primary { min-height: 42px; padding: 10px 18px; border: 1px solid #171717; border-radius: 0; background: #efb3bd; color: #171717; font-weight: 700; }
    .suggestion-result { border-radius: 0; }
    @media (max-width: 1000px) {
      .product-page-container { padding-inline: 28px; }
      .product-layout { grid-template-columns: 1fr; gap: 40px; }
      .details-col { position: static; }
      .gallery-col { grid-template-columns: 96px minmax(0, 1fr); }
      .thumb-btn { width: 90px; height: 112px; }
    }
    @media (max-width: 600px) {
      .product-page-container { padding: 22px 20px 56px; }
      .breadcrumb { line-height: 1.8; }
      .gallery-col { display: flex; flex-direction: column; gap: 12px; }
      .main-image-wrap { width: 100%; aspect-ratio: 4 / 5; order: 1; }
      .thumbnail-list { width: 100%; max-height: none; order: 2; flex-direction: row; overflow-x: auto; overflow-y: hidden; }
      .thumb-btn { width: 68px; height: 84px; }
      .p-title { font-size: 2.25rem; }
      .price-box { align-items: flex-start; flex-direction: column; }
      .size-header { align-items: flex-start; flex-direction: column; }
      .action-row { flex-direction: column; }
      .quantity-stepper { width: 100%; }
      .add-to-cart-btn { width: 100%; }
      .tryon-banner { grid-template-columns: auto 1fr; }
      .tryon-btn { grid-column: 1 / -1; width: 100%; text-align: center; }
      .reviews-section { padding-top: 42px; }
      .form-grid { grid-template-columns: 1fr; }
    }

    .main-image-wrap { position: relative; }
    .image-labels {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 1;
      display: flex;
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .image-labels span {
      padding: 8px 12px;
      background: rgba(255, 255, 255, .94);
      color: #171717;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .product-kicker,
    .section-kicker {
      color: #a34e67;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .real-links-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border-top: 1px solid #d8d8d8;
      border-bottom: 1px solid #d8d8d8;
    }
    .real-links-row a {
      display: flex;
      min-height: 54px;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 10px 8px;
      color: #171717;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .45px;
      text-align: center;
      text-transform: uppercase;
    }
    .real-links-row a + a { border-left: 1px solid #d8d8d8; }
    .real-links-row a:hover { background: #f7e3e7; }
    .real-links-row a:focus-visible,
    .accordion-action:focus-visible,
    .accordion-links a:focus-visible,
    .related-section a:focus-visible {
      outline: 2px solid #171717;
      outline-offset: 3px;
    }
    .related-heading h2 {
      margin: 12px 0 22px;
      color: #171717;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2.1rem, 3.5vw, 3rem);
      font-weight: 400;
      line-height: 1.1;
      letter-spacing: -.035em;
    }
    .related-section { margin-bottom: 104px; }
    .related-heading {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid #d8d8d8;
    }
    .related-heading h2 { margin-bottom: 0; }
    .related-heading > a {
      color: #171717;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .7px;
      text-decoration: underline;
      text-underline-offset: 4px;
      text-transform: uppercase;
    }
    .related-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
    .related-card { min-width: 0; }
    .related-image {
      display: flex;
      width: 100%;
      aspect-ratio: 3 / 4;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #eeeae5;
      color: #8c8177;
      font-size: 12px;
      letter-spacing: .25em;
    }
    .related-image img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 220ms ease; }
    .related-card:hover .related-image img { transform: scale(1.025); }
    .related-card h3 {
      margin: 14px 0 7px;
      color: #2f2f2f;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.45;
      letter-spacing: .45px;
      text-transform: uppercase;
    }
    .related-card p { margin: 0 0 12px; color: #c55573; font-size: 14px; font-weight: 700; }
    .related-link {
      display: inline-flex;
      width: 100%;
      min-height: 42px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 9px 12px;
      border: 1px solid #171717;
      color: #171717;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .8px;
    }
    .related-link:hover { background: #171717; color: #fff; }
    .reviews-section { margin-top: 0; }
    @media (max-width: 900px) {
      .related-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px 20px; }
    }
    @media (max-width: 600px) {
      .image-labels { top: 12px; left: 12px; }
      .real-links-row { grid-template-columns: 1fr; }
      .real-links-row a + a { border-top: 1px solid #d8d8d8; border-left: 0; }
      .related-section { margin-bottom: 72px; }
      .related-heading { align-items: flex-start; flex-direction: column; }
      .related-grid { grid-template-columns: 1fr; }
    }

    .tryon-corner { position:absolute; right:16px; bottom:16px; z-index:1; padding:9px 13px; border:1px solid #171717; background:rgba(255,255,255,.94); color:#171717; font-size:11px; font-weight:700; letter-spacing:.55px; text-decoration:none; text-transform:uppercase; }
    .tryon-corner:hover, .tryon-corner:focus-visible { background:#171717; color:#fff; }
    .rating-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:6px 0 12px; font-size:12px; color:#444748; }
    .rating-link { padding:0; border:0; background:none; color:inherit; font:inherit; letter-spacing:.24px; cursor:pointer; display:inline-flex; gap:8px; align-items:center; }
    .rating-link:hover, .rating-link:focus-visible { text-decoration:underline; }
    .rating-avg { color:#171717; font-weight:600; } .rating-avg span { color:#d89a36; }
    .sku { letter-spacing:.6px; }
    .old-price { color:#747878; font-size:14px; text-decoration:line-through; margin-left:10px; }
    .sale-badge { margin-left:10px; padding:2px 8px; border:1px solid #000; background:#f4b8c1; color:#171717; font-size:11px; font-weight:700; letter-spacing:.55px; }
    .clamp-3 { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .option-btn.swatch { width:36px; min-width:36px; height:36px; min-height:36px; padding:2px; border-color:#c4c7c7; background:#fff; }
    .option-btn.swatch.active { border:2px solid #000; background:#fff; }
    .swatch-fill { display:block; width:100%; height:100%; border:1px solid rgba(196,199,199,.6); }
    .size-option { position:relative; overflow:hidden; }
    .size-option.sold-out { background:#f5f3f3; border-color:rgba(196,199,199,.4); color:#c4c7c7; cursor:not-allowed; }
    .size-option.sold-out::after { content:''; position:absolute; left:-10%; right:-10%; top:50%; border-top:1px solid rgba(196,199,199,.9); transform:rotate(-25deg); }
    .buy-now-btn { width:100%; min-height:48px; margin-top:10px; border:2px solid #171717; background:#fff; color:#171717; font-size:13px; font-weight:700; letter-spacing:2px; cursor:pointer; }
    .buy-now-btn:hover:not(:disabled), .buy-now-btn:focus-visible { background:#171717; color:#fff; }
    .buy-now-btn:disabled { border-color:#bdbdbd; color:#999; cursor:not-allowed; }
    .value-props { display:flex; justify-content:space-between; gap:12px; margin:18px 0 8px; padding:16px 0 0; border-top:1px solid #c4c7c7; list-style:none; font-size:12px; color:#444748; }
    .lookbook-banner { display:grid; grid-template-columns:5fr 7fr; margin:32px 0 56px; border:1px solid #c4c7c7; background:#fff; }
    .banner-copy { display:flex; flex-direction:column; justify-content:center; gap:14px; padding:40px 46px; }
    .banner-copy h2 { margin:0; font:400 28px/36px 'Playfair Display',Georgia,serif; }
    .banner-copy p { margin:0; color:#444748; font-size:14px; line-height:1.65; }
    .banner-link { width:fit-content; padding-bottom:3px; border-bottom:1px solid #b84a62; color:#b84a62; font-size:13px; font-weight:600; letter-spacing:.65px; text-decoration:none; }
    .banner-media { min-height:340px; background:#efeded; } .banner-media img { display:block; width:100%; height:100%; object-fit:cover; }
    @media (max-width:900px) { .lookbook-banner { grid-template-columns:1fr; } .banner-copy { padding:28px 24px; } .banner-media { min-height:240px; } .value-props { flex-direction:column; } }

    .related-heading { align-items: flex-end; border-bottom: 1px solid #000; }
    .related-heading .section-kicker { color: #8f485d; }
    .related-heading h2 { font-weight: 400; font-size: 28px; line-height: 36px; margin: 6px 0 0; }
    .related-heading > a { text-decoration: none; font-size: 13px; letter-spacing: .65px; font-weight: 600; white-space: nowrap; }
    .related-media { position: relative; border: 1px solid rgba(196,199,199,.3); background: #efeded; }
    .related-cat { display: block; margin: 16px 0 0; color: #444748; font-size: 11px; font-weight: 600; letter-spacing: 1.1px; text-transform: uppercase; }
    .related-card h3 { margin: 4px 0 6px; font-size: 16px; font-weight: 600; letter-spacing: .96px; text-transform: none; color: #000; }
    .related-card h3 a { color: inherit; text-decoration: none; }
    .related-card p { color: #000; font-size: 14px; font-weight: 600; margin: 0 0 16px; }
    .related-link { width: calc(100% - 12px); margin: 0 auto; display: flex; min-height: 40px; border-radius: 15px; background: #171717; border-color: #000; color: #fff; font-size: 13px; letter-spacing: 1.3px; }
    .related-link:hover { background: #fff; color: #171717; }
  `],
})
export class ProductPage implements OnInit, OnDestroy {
  private productSubscription?: Subscription;
  private relatedProductsSubscription?: Subscription;
  private routeSubscription?: Subscription;
  private ownedReviewsSubscription?: Subscription;
  readonly reviewPagination = new PaginationState(20);
  reviewPaginationChanged(page: number): void { this.reviewPagination.page.set(page); this.reloadReviews(); }

  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly content = STORE_PRODUCT_CONTENT;
  readonly buyingNow = signal(false);

  readonly product = signal<ProductDetail | null>(null);
  readonly relatedProducts = signal<ProductSummary[]>([]);
  readonly currentImage = signal<string>('');
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');

  readonly colors = signal<string[]>([]);
  readonly sizes = signal<string[]>([]);

  readonly selectedColor = signal<string>('');
  readonly selectedSize = signal<string>('');
  readonly quantity = signal<number>(1);

  readonly reviews = signal<ProductReview[]>([]);
  readonly ownedReviews = signal<Record<string, ReviewMutationResult>>({});
  readonly reviewManagementError = signal(false);
  private readonly ownedReviewsEffect = effect((onCleanup) => {
    const user = this.auth.currentUser();
    const visibleReviews = this.reviews();
    untracked(() => {
      this.ownedReviewsSubscription?.unsubscribe();
      this.ownedReviews.set({});
      this.reviewManagementError.set(false);
      if (user?.role !== 'CUSTOMER' || !visibleReviews.length) return;
      this.ownedReviewsSubscription = this.api.myReviewsByIds(visibleReviews.map(review => review.id)).subscribe({
        next: (owned) => this.ownedReviews.set(Object.fromEntries(owned.items.map(review => [review.id, review]))),
        error: () => this.reviewManagementError.set(true),
      });
    });
    onCleanup(() => this.ownedReviewsSubscription?.unsubscribe());
  }, { manualCleanup: true });

  // Edit Review Modal State (PATCH /reviews/:reviewId)
  readonly editReviewModalOpen = signal<boolean>(false);
  readonly editingReview = signal<ProductReview | null>(null);
  editReviewStars = 5;
  editReviewContent = '';
  readonly savingReview = signal<boolean>(false);

  // Size suggestion modal state
  readonly sizeModalOpen = signal<boolean>(false);
  measureBust?: number;
  measureWaist?: number;
  measureHip?: number;
  readonly calculatingSize = signal<boolean>(false);
  readonly suggestedSizeResult = signal<string | null>(null);

  readonly selectedVariant = computed<ProductVariant | null>(() => {
    const p = this.product();
    if (!p || !p.variants) return null;
    return p.variants.find(
      (v) => v.color === this.selectedColor() && v.size === this.selectedSize()
    ) || null;
  });

  readonly maxQuantity = computed(() => {
    return this.selectedVariant()?.available ?? 0;
  });

  readonly canAddToCart = computed(() => {
    const v = this.selectedVariant();
    return !!v && v.status === 'ACTIVE' && v.available >= this.quantity() && this.quantity() > 0;
  });

  /** Giá gốc, số sao: chỉ có khi API trả về trường tương ứng. */
  readonly listPrice = computed<number | null>(() => {
    const v = this.selectedVariant() as unknown as { compareAtPrice?: number; originalPrice?: number; listPrice?: number } | null;
    const p = this.product() as unknown as { compareAtPrice?: number; originalPrice?: number; listPrice?: number } | null;
    const old = v?.compareAtPrice ?? v?.originalPrice ?? v?.listPrice ?? p?.compareAtPrice ?? p?.originalPrice ?? p?.listPrice;
    const current = this.selectedVariant()?.price ?? this.product()?.price ?? 0;
    return typeof old === 'number' && old > current ? old : null;
  });
  readonly discountPercent = computed(() => {
    const old = this.listPrice();
    const current = this.selectedVariant()?.price ?? this.product()?.price ?? 0;
    return old ? Math.round((1 - current / old) * 100) : 0;
  });
  readonly averageRating = computed<string | null>(() => {
    const p = this.product() as unknown as { ratingAverage?: number; averageRating?: number; rating?: number | { average?: number } } | null;
    const value = p?.ratingAverage ?? p?.averageRating ?? (typeof p?.rating === 'number' ? p.rating : p?.rating?.average);
    return typeof value === 'number' && value > 0 ? value.toFixed(1) : null;
  });

  swatchHex(color: string): string {
    const name = color.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
    const words = ` ${name.replace(/[^a-z0-9]+/g, ' ')} `;
    const sorted = [...this.content.colorSwatches].sort((a, b) => Math.max(...b.keys.map(k => k.length)) - Math.max(...a.keys.map(k => k.length)));
    return sorted.find(entry => entry.keys.some(key => words.includes(` ${key} `)))?.hex ?? '';
  }
  sizeAvailable(size: string): boolean {
    const color = this.selectedColor();
    return (this.product()?.variants ?? []).some(v => v.status === 'ACTIVE' && v.size === size && (!color || v.color === color) && v.available > 0);
  }
  scrollToReviews(): void { document.getElementById('reviews-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /** MUA NGAY: thêm vào giỏ như nút thêm giỏ, thành công thì sang thanh toán (khách chưa đăng nhập sang đăng nhập). */
  buyNow(): void {
    const v = this.selectedVariant();
    if (!v || !this.canAddToCart() || this.buyingNow()) return;
    this.buyingNow.set(true);
    this.addToCart();
    this.whenCartIdle(() => {
      this.buyingNow.set(false);
      const inCart = (this.cart.cart()?.items ?? []).some(item => item.variantId === v.id);
      if (!inCart) return;
      if (!this.auth.isAuthenticated()) { this.router.navigate(['/auth'], { queryParams: { returnUrl: '/checkout' } }); return; }
      this.router.navigate(['/checkout']);
    });
  }
  private whenCartIdle(done: () => void, tries = 0): void {
    if (!this.cart.loading() || tries > 60) { done(); return; }
    setTimeout(() => this.whenCartIdle(done, tries + 1), 100);
  }

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => this.loadProduct(params.get('slug') || ''));
  }

  ngOnDestroy(): void { this.productSubscription?.unsubscribe(); this.relatedProductsSubscription?.unsubscribe(); this.routeSubscription?.unsubscribe(); this.ownedReviewsEffect.destroy(); this.ownedReviewsSubscription?.unsubscribe(); this.reviewPagination.cancel(); }
  reloadReviews(): void { const product = this.product(); if (product) this.loadReviews(product.id); }

  loadProduct(slug: string): void {
    this.productSubscription?.unsubscribe();
    this.reviewPagination.cancel();
    this.reviewPagination.reset();
    this.ownedReviewsSubscription?.unsubscribe();
    this.ownedReviews.set({});
    this.reviewManagementError.set(false);
    this.reviews.set([]);
    this.loading.set(true);
    this.error.set('');
    this.product.set(null);
    this.relatedProductsSubscription?.unsubscribe();
    this.relatedProducts.set([]);
    this.quantity.set(1);
    this.productSubscription = this.api.product(slug).subscribe({
      next: (p) => {
        this.applyProductData(p);
      },
      error: () => {
        this.error.set('Sản phẩm không tồn tại hoặc không thể tải. Vui lòng thử lại.');
        this.loading.set(false);
      },
    });
  }

  private applyProductData(p: ProductDetail): void {
    this.product.set(p);
    this.currentImage.set(p.images[0] ?? '');
    if (p.images && p.images.length > 0) {
      this.currentImage.set(p.images[0]);
    }

    // Extract unique colors & sizes from variants
    const colorsSet = new Set<string>();
    const sizesSet = new Set<string>();
    (p.variants || []).filter(v => v.status === 'ACTIVE').forEach((v) => {
      if (v.color) colorsSet.add(v.color);
      if (v.size) sizesSet.add(v.size);
    });

    const colorList = Array.from(colorsSet);
    const sizeList = Array.from(sizesSet);
    this.colors.set(colorList);
    this.sizes.set(sizeList);

    if (colorList.length > 0) this.selectedColor.set(colorList[0]);
    if (sizeList.length > 0) this.selectedSize.set(sizeList[0]);

    this.loading.set(false);
    this.loadReviews(p.id);
    this.loadRelatedProducts(p);
  }

  private loadRelatedProducts(p: ProductDetail): void {
    const source = p as ProductDetail & { categoryId?: string; category?: { id?: string; slug?: string } };
    const category = source.category?.slug || source.category?.id || source.categoryId;
    const pick = (items: ProductSummary[], exclude: ProductSummary[] = []) =>
      items.filter(item => item.id !== p.id && !exclude.some(e => e.id === item.id));
    const fillGeneral = (current: ProductSummary[]) => {
      if (current.length >= 4) { this.relatedProducts.set(current.slice(0, 4)); return; }
      this.relatedProductsSubscription = this.api.products({ page: 1, limit: 8 }).subscribe({
        next: (res) => this.relatedProducts.set([...current, ...pick(res.items, current)].slice(0, 4)),
        error: () => this.relatedProducts.set(current),
      });
    };
    if (!category) { fillGeneral([]); return; }
    this.relatedProductsSubscription = this.api.products({ category, page: 1, limit: 5 }).subscribe({
      next: (res) => fillGeneral(pick(res.items)),
      error: () => fillGeneral([]),
    });
  }

  relatedCategory(item: ProductSummary): string {
    const x = item as unknown as { categoryName?: string; category?: { name?: string } | string };
    return x.categoryName || (typeof x.category === 'string' ? '' : x.category?.name) || '';
  }

  loadReviews(productId: string): void {
    this.ownedReviewsSubscription?.unsubscribe();
    this.ownedReviews.set({});
    this.reviewManagementError.set(false);
    this.reviewPagination.load(() => this.api.listReviews(productId, this.reviewPagination.page(), this.reviewPagination.limit), {
      next: (res) => {
        this.reviews.set(res.items);
      },
      error: () => {},
    });
  }

  chooseColor(color: string): void {
    this.selectedColor.set(color);
  }

  chooseSize(size: string): void {
    this.selectedSize.set(size);
  }

  changeQuantity(delta: number): void {
    const next = this.quantity() + delta;
    if (next >= 1 && next <= this.maxQuantity()) {
      this.quantity.set(next);
    }
  }

  addToCart(): void {
    const v = this.selectedVariant();
    const p = this.product();
    if (!v || !p || !this.canAddToCart()) return;

    this.cart.addItem({
      variantId: v.id,
      sku: v.sku,
      productName: `${p.name} (${v.color} / ${v.size})`,
      unitPrice: v.price,
      quantity: this.quantity(),
      available: v.available,
    });
  }

  calculateSizeSuggestion(): void {
    const p = this.product();
    if (!p) return;

    if (!this.measureBust && !this.measureWaist && !this.measureHip) {
      this.toast.warning('Vui lòng nhập ít nhất một số đo ngực, eo hoặc hông.');
      return;
    }

    this.calculatingSize.set(true);
    this.api.suggestSize(p.slug, {
      bust: this.measureBust,
      waist: this.measureWaist,
      hip: this.measureHip,
    }).subscribe({
      next: (res) => {
        this.suggestedSizeResult.set(res.suggestedSize);
        this.calculatingSize.set(false);
      },
      error: () => {
        this.calculatingSize.set(false);
        this.toast.error('Không thể tính toán gợi ý size.');
      },
    });
  }

  applySuggestedSize(): void {
    const s = this.suggestedSizeResult();
    if (s && this.sizes().includes(s)) {
      this.selectedSize.set(s);
      this.sizeModalOpen.set(false);
      this.toast.success(`Đã áp dụng kích cỡ: ${s}`);
    } else {
      this.sizeModalOpen.set(false);
    }
  }

  canManageReview(rev: ProductReview): boolean {
    const cur = this.auth.currentUser();
    return cur?.role === 'CUSTOMER' && this.ownedReviews()[rev.id]?.customerId === cur.id;
  }

  openEditReview(rev: ProductReview): void {
    if (!this.canManageReview(rev)) return;
    this.editingReview.set(rev);
    this.editReviewStars = rev.stars;
    this.editReviewContent = rev.content;
    this.editReviewModalOpen.set(true);
  }

  saveEditReview(): void {
    const rev = this.editingReview();
    if (!rev || !this.canManageReview(rev) || !this.editReviewContent.trim() || this.savingReview()) return;
    const owned = this.ownedReviews()[rev.id];

    this.savingReview.set(true);
    // PATCH /reviews/:reviewId
    this.api.updateReview(rev.id, {
      orderItemId: owned.orderItemId,
      stars: this.editReviewStars,
      content: this.editReviewContent.trim(),
      mediaIds: owned.mediaIds,
    }).subscribe({
      next: (res) => {
        this.savingReview.set(false);
        this.editReviewModalOpen.set(false);
        this.toast.success('Đã cập nhật đánh giá. Nội dung đang chờ kiểm duyệt.');
        this.reloadReviews();
      },
      error: (err) => {
        this.savingReview.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật đánh giá.');
      },
    });
  }

  deleteReview(rev: ProductReview): void {
    if (!this.canManageReview(rev)) return;
    if (!confirm('Bạn có chắc chắn muốn xóa đánh giá này không?')) return;

    // DELETE /reviews/:reviewId
    this.api.deleteReview(rev.id).subscribe({
      next: () => {
        this.toast.success('Đã xóa đánh giá sản phẩm.');
        this.reloadReviews();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Không thể xóa đánh giá.');
      },
    });
  }
}
