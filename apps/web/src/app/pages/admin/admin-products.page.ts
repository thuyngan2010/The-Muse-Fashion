import { PaginationComponent, PaginationState } from '../../components/pagination.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ProductSummary, Category, ProductVariant } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';

@Component({
  standalone: true,
  imports: [PaginationComponent, CurrencyPipe, FormsModule, ModalComponent],
  template: `
    <div class="admin-products-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Sản phẩm & Danh mục</h1>
          <p class="page-desc">Quản lý catalog thời trang, cấu trúc phân loại, giá cả và biến thể SKU.</p>
        </div>
        <div class="header-btns">
          @if (activeTab() === 'products') {
            <button type="button" class="btn-primary" (click)="openCreateProductModal()">+ Thêm sản phẩm mới</button>
          } @else {
            <button type="button" class="btn-primary" (click)="openCreateCategoryModal()">+ Thêm danh mục mới</button>
          }
        </div>
      </header>

      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'products'"
          (click)="activeTab.set('products')"
        >
          📦 Sản phẩm ({{ products().length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'categories'"
          (click)="activeTab.set('categories')"
        >
          📂 Danh mục phân loại ({{ categories().length }})
        </button>
      </div>

      <!-- PRODUCTS TAB -->
      @if (activeTab() === 'products') {
        @if (loading()) {
          <div class="loading-box">
            <div class="spinner"></div>
            <p>Đang tải danh sách sản phẩm...</p>
          </div>
        } @else if (products().length === 0) {
          <div class="empty-state">
            <p>Chưa có sản phẩm nào. Hãy tạo sản phẩm đầu tiên!</p>
          </div>
        } @else {
          <div class="products-table-card">
            <div class="table-header">
              <span>Sản phẩm</span>
              <span>Đường dẫn (Slug)</span>
              <span>Giá cơ sở</span>
              <span>Trạng thái</span>
              <span>Thao tác</span>
            </div>

            @for (prod of products(); track prod.id) {
              <div class="table-row">
                <div class="prod-cell">
                  <div class="thumb">
                    @if (prod.images && prod.images.length > 0) {
                      <img [src]="prod.images[0]" [alt]="prod.name" />
                    }
                  </div>
                  <strong>{{ prod.name }}</strong>
                </div>
                <span class="slug-cell">{{ prod.slug }}</span>
                <strong class="price-cell">{{ prod.price | currency:'VND':'symbol':'1.0-0' }}</strong>
                <div>
                  <span class="status-badge" [class]="'status-' + (prod.status || 'PUBLISHED').toLowerCase()">
                    {{ prod.status || 'PUBLISHED' }}
                  </span>
                </div>
                <div class="actions-cell">
                  <button type="button" class="btn-action" (click)="openEditProductModal(prod)">Sửa</button>
                  <button type="button" class="btn-action btn-action-accent" (click)="openManageVariantsModal(prod)">⚙ Biến thể</button>
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- CATEGORIES TAB -->
      @if (activeTab() === 'categories') {
        @if (loadingCats()) {
          <div class="loading-box">
            <div class="spinner"></div>
            <p>Đang tải danh mục...</p>
          </div>
        } @else if (categories().length === 0) {
          <div class="empty-state">
            <p>Chưa có danh mục nào. Hãy tạo danh mục đầu tiên!</p>
          </div>
        } @else {
          <div class="products-table-card">
            <div class="table-header cat-grid">
              <span>Tên danh mục</span>
              <span>Đường dẫn (Slug)</span>
              <span>Danh mục cha</span>
              <span>Trạng thái</span>
              <span>Thao tác</span>
            </div>

            @for (cat of categories(); track cat.id) {
              <div class="table-row cat-grid">
                <div class="cat-cell">
                  <strong>{{ cat.name }}</strong>
                </div>
                <span class="slug-cell">{{ cat.slug }}</span>
                <span class="parent-cell">{{ getParentName(cat.parentId) }}</span>
                <div>
                  <span class="status-badge" [class]="cat.status === 'ACTIVE' ? 'status-published' : 'status-archived'">
                    {{ cat.status }}
                  </span>
                </div>
                <div class="actions-cell">
                  <button type="button" class="btn-action" (click)="openEditCategoryModal(cat)">Chỉnh sửa</button>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- Product Modal (Create/Edit Product) -->
    <fc-modal
      [isOpen]="productModalOpen()"
      [title]="editingProductId ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'"
      maxWidth="680px"
      (close)="productModalOpen.set(false)"
    >
      <form (ngSubmit)="saveProduct()" class="modal-form">
        <div class="form-row">
          <label>
            Tên sản phẩm *
            <input type="text" [(ngModel)]="prodName" name="name" (input)="autoSlug()" required />
          </label>
          <label>
            Đường dẫn Slug *
            <input type="text" [(ngModel)]="prodSlug" name="slug" required />
          </label>
        </div>

        <div class="form-row">
          <label>
            Danh mục *
            <select [(ngModel)]="prodCategoryId" name="categoryId" required>
              @for (cat of categories(); track cat.id) {
                <option [value]="cat.id">{{ cat.name }}</option>
              }
            </select>
          </label>
          <label>
            Giá cơ sở (VND) *
            <input type="number" [(ngModel)]="prodPrice" name="price" required min="0" step="1000" />
          </label>
        </div>

        <div class="form-row">
          <label>
            Chất liệu
            <input type="text" [(ngModel)]="prodMaterial" name="material" placeholder="100% Cotton, Linen, Silk..." />
          </label>
          <label>
            Trạng thái
            <select [(ngModel)]="prodStatus" name="status">
              <option value="DRAFT">DRAFT (Bản nháp)</option>
              <option value="PUBLISHED">PUBLISHED (Công khai)</option>
              <option value="ARCHIVED">ARCHIVED (Lưu trữ)</option>
            </select>
          </label>
        </div>

        <label>
          Mô tả sản phẩm
          <textarea [(ngModel)]="prodDescription" name="description" rows="3" placeholder="Mô tả chi tiết form dáng, kiểu cách..."></textarea>
        </label>

        <label>
          URL Hình ảnh (phân tách bởi dấu phẩy)
          <input type="text" [(ngModel)]="prodImagesInput" name="images" placeholder="https://..., https://..." />
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="productModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="saving()">
            {{ saving() ? 'Đang lưu...' : editingProductId ? 'Lưu thay đổi' : 'Tạo sản phẩm' }}
          </button>
        </div>
      </form>
    </fc-modal>

    <!-- Category Modal (POST /categories, PATCH /categories/:categoryId) -->
    <fc-modal
      [isOpen]="categoryModalOpen()"
      [title]="editingCategoryId ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'"
      maxWidth="540px"
      (close)="categoryModalOpen.set(false)"
    >
      <form (ngSubmit)="saveCategory()" class="modal-form">
        <label>
          Tên danh mục *
          <input type="text" [(ngModel)]="catName" name="catName" (input)="autoCategorySlug()" placeholder="Áo sơ mi, Đầm dạ tiệc..." required />
        </label>

        <label>
          Đường dẫn Slug *
          <input type="text" [(ngModel)]="catSlug" name="catSlug" placeholder="ao-so-mi" required />
        </label>

        <div class="form-row">
          <label>
            Trạng thái *
            <select [(ngModel)]="catStatus" name="catStatus">
              <option value="ACTIVE">ACTIVE (Hiển thị)</option>
              <option value="HIDDEN">HIDDEN (Ẩn)</option>
            </select>
          </label>

          <label>
            Danh mục cha
            <select [(ngModel)]="catParentId" name="catParentId">
              <option [value]="null">-- Không có (Danh mục gốc) --</option>
              @for (cat of categories(); track cat.id) {
                @if (cat.id !== editingCategoryId) {
                  <option [value]="cat.id">{{ cat.name }}</option>
                }
              }
            </select>
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-outline" (click)="categoryModalOpen.set(false)">Hủy</button>
          <button type="submit" class="btn-primary" [disabled]="savingCat()">
            {{ savingCat() ? 'Đang lưu...' : editingCategoryId ? 'Cập nhật danh mục' : 'Tạo danh mục' }}
          </button>
        </div>
      </form>
    </fc-modal>

    <!-- Manage Variants Modal (PATCH /admin/products/:productId/variants/:variantId & Add Variant) -->
    <fc-modal
      [isOpen]="variantsManagerOpen()"
      [title]="'Quản lý biến thể: ' + (selectedProduct()?.name || '')"
      maxWidth="760px"
      (close)="variantsManagerOpen.set(false)"
    >
      <div class="variants-manager-body">
        <div class="variants-header-row">
          <h4>Danh sách biến thể hiện tại</h4>
          <button type="button" class="btn-action btn-action-accent" (click)="showAddVariantForm.set(!showAddVariantForm())">
            {{ showAddVariantForm() ? '✕ Đóng form thêm' : '+ Thêm biến thể mới' }}
          </button>
        </div>

        @if (showAddVariantForm()) {
          <!-- Add Variant Form -->
          <form (ngSubmit)="saveNewVariant()" class="sub-form-card">
            <h5>Thêm biến thể mới</h5>
            <div class="form-row">
              <label>
                Mã SKU *
                <input type="text" [(ngModel)]="varSku" name="sku" placeholder="VD: DR-01-S-BLK" required />
              </label>
              <label>
                Giá bán (VND) *
                <input type="number" [(ngModel)]="varPrice" name="price" required min="0" step="1000" />
              </label>
            </div>
            <div class="form-row">
              <label>
                Size / Kích cỡ *
                <input type="text" [(ngModel)]="varSize" name="size" placeholder="S, M, L..." required />
              </label>
              <label>
                Màu sắc *
                <input type="text" [(ngModel)]="varColor" name="color" placeholder="Đen, Trắng, Be..." required />
              </label>
            </div>
            <label>
              Số lượng tồn kho ban đầu *
              <input type="number" [(ngModel)]="varStock" name="stock" required min="0" />
            </label>
            <div class="modal-actions">
              <button type="button" class="btn-outline" (click)="showAddVariantForm.set(false)">Hủy</button>
              <button type="submit" class="btn-primary" [disabled]="savingVariant()">
                {{ savingVariant() ? 'Đang lưu...' : 'Thêm biến thể' }}
              </button>
            </div>
          </form>
        }

        <!-- Edit Variant Form (PATCH /admin/products/:productId/variants/:variantId) -->
        @if (editingVariantId()) {
          <form (ngSubmit)="submitUpdateVariant()" class="sub-form-card edit-card">
            <h5>Chỉnh sửa biến thể (SKU: {{ varEditSku }})</h5>
            <div class="form-row">
              <label>
                Mã SKU *
                <input type="text" [(ngModel)]="varEditSku" name="editSku" required />
              </label>
              <label>
                Giá bán (VND) *
                <input type="number" [(ngModel)]="varEditPrice" name="editPrice" required min="0" step="1000" />
              </label>
            </div>
            <div class="form-row">
              <label>
                Size *
                <input type="text" [(ngModel)]="varEditSize" name="editSize" required />
              </label>
              <label>
                Màu sắc *
                <input type="text" [(ngModel)]="varEditColor" name="editColor" required />
              </label>
            </div>
            <label>
              Trạng thái biến thể
              <select [(ngModel)]="varEditStatus" name="editStatus">
                <option value="ACTIVE">ACTIVE (Đang kinh doanh)</option>
                <option value="INACTIVE">INACTIVE (Ngừng bán)</option>
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn-outline" (click)="cancelEditVariant()">Hủy sửa</button>
              <button type="submit" class="btn-primary" [disabled]="savingVariant()">
                {{ savingVariant() ? 'Đang cập nhật...' : 'Cập nhật biến thể' }}
              </button>
            </div>
          </form>
        }

        <!-- Variants Table -->
        @if (loadingVariants()) {
          <div class="loading-box">
            <div class="spinner"></div>
            <p>Đang tải thông tin biến thể...</p>
          </div>
        } @else if (currentVariants().length === 0) {
          <div class="empty-state">
            <p>Sản phẩm này chưa có biến thể nào được tạo.</p>
          </div>
        } @else {
          <div class="variants-table">
            <div class="v-head">
              <span>SKU</span>
              <span>Size</span>
              <span>Màu</span>
              <span>Giá bán</span>
              <span>Trạng thái</span>
              <span>Thao tác</span>
            </div>
            @for (v of currentVariants(); track v.id) {
              <div class="v-row">
                <code class="v-sku">{{ v.sku }}</code>
                <span>{{ v.size }}</span>
                <span>{{ v.color }}</span>
                <strong>{{ v.price | currency:'VND':'symbol':'1.0-0' }}</strong>
                <div>
                  <span class="status-badge" [class]="v.status === 'ACTIVE' ? 'status-published' : 'status-archived'">
                    {{ v.status }}
                  </span>
                </div>
                <div>
                  <button type="button" class="btn-action" (click)="startEditVariant(v)">Sửa</button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </fc-modal>

    @if (activeTab() === 'products') {<fc-pagination label="Phân trang" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loading()" (pageChange)="paginationChanged($event)" />}
`,
  styles: [`
    .admin-products-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: 1.8rem;
      margin: 0 0 6px;
      font-weight: 500;
    }
    .page-desc {
      color: var(--color-muted);
      font-size: 0.9rem;
      margin: 0;
    }
    .tab-nav {
      display: flex;
      gap: 12px;
      border-bottom: 1px solid var(--color-divider);
      padding-bottom: 10px;
    }
    .tab-btn {
      background: none;
      border: 0;
      padding: 8px 16px;
      font-size: 0.92rem;
      font-weight: 500;
      color: var(--color-muted);
      border-radius: var(--radius-control);
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab-btn.active {
      background: var(--color-text);
      color: var(--color-surface);
      font-weight: 600;
    }
    .products-table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
    }
    .table-header {
      display: grid;
      grid-template-columns: 2.2fr 1.6fr 1.2fr 1.2fr 1.4fr;
      padding: 12px 16px;
      background: var(--color-canvas);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-muted);
      border-bottom: 1px solid var(--color-divider);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .cat-grid {
      grid-template-columns: 2fr 1.8fr 1.5fr 1fr 1fr !important;
    }
    .table-row {
      display: grid;
      grid-template-columns: 2.2fr 1.6fr 1.2fr 1.2fr 1.4fr;
      padding: 14px 16px;
      border-bottom: 1px solid #f6f5f2;
      align-items: center;
      font-size: 0.88rem;
    }
    .prod-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .thumb {
      width: 40px;
      height: 48px;
      background: #eee;
      border-radius: var(--radius-control);
      overflow: hidden;
      flex-shrink: 0;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slug-cell {
      font-family: monospace;
      color: var(--color-muted);
      font-size: 0.82rem;
    }
    .price-cell {
      color: var(--color-accent);
    }
    .parent-cell {
      color: var(--color-muted);
      font-size: 0.84rem;
    }
    .status-badge {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
    }
    .status-published { background: #e8f5e9; color: #2e7d32; }
    .status-draft { background: #fff8e1; color: var(--color-warning); }
    .status-archived { background: #f5f5f5; color: #999; }

    .actions-cell {
      display: flex;
      gap: 8px;
    }
    .btn-action {
      background: var(--color-canvas);
      border: 1px solid var(--color-border);
      padding: 5px 10px;
      border-radius: var(--radius-control);
      font-size: 0.78rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-action:hover {
      background: var(--color-divider);
    }
    .btn-action-accent {
      background: #f4efe9;
      border-color: #dfd4c5;
      color: #745136;
      font-weight: 500;
    }
    .btn-action-accent:hover {
      background: #e9decb;
    }
    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .modal-form label, .sub-form-card label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: #444;
    }
    .modal-form input, .modal-form select, .modal-form textarea,
    .sub-form-card input, .sub-form-card select {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 9px 12px;
      font-size: 0.88rem;
      outline: none;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 10px;
    }
    .loading-box, .empty-state {
      text-align: center;
      padding: 50px 0;
      color: var(--color-muted);
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-divider);
      border-top-color: var(--color-text);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Variants Manager Styles */
    .variants-manager-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .variants-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--color-divider);
    }
    .variants-header-row h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }
    .sub-form-card {
      background: var(--color-canvas);
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sub-form-card h5 {
      margin: 0 0 4px;
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--color-text);
    }
    .edit-card {
      background: #fdfbf7;
      border-color: #dfd4c5;
    }
    .variants-table {
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      overflow: hidden;
      font-size: 0.85rem;
    }
    .v-head {
      display: grid;
      grid-template-columns: 1.8fr 1fr 1fr 1.4fr 1.2fr 1fr;
      padding: 10px 14px;
      background: #f8f7f4;
      font-weight: 600;
      color: var(--color-muted);
      border-bottom: 1px solid var(--color-divider);
    }
    .v-row {
      display: grid;
      grid-template-columns: 1.8fr 1fr 1fr 1.4fr 1.2fr 1fr;
      padding: 10px 14px;
      border-bottom: 1px solid var(--color-canvas);
      align-items: center;
    }
    .v-sku {
      font-family: monospace;
      color: #444;
      font-size: 0.8rem;
    }

    .header-btns { display:flex; flex-wrap:wrap; gap:10px; }
    .cat-cell { font-size:.8125rem; color:var(--color-muted); overflow-wrap:anywhere; }


  `],
})
export class AdminProductsPage implements OnInit {
  readonly pagination = new PaginationState(20);
  paginationChanged(page: number): void { this.pagination.page.set(page); this.loadData(); }

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly activeTab = signal<'products' | 'categories'>('products');

  readonly products = signal<ProductSummary[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal<boolean>(true);
  readonly loadingCats = signal<boolean>(false);

  readonly productModalOpen = signal<boolean>(false);
  readonly categoryModalOpen = signal<boolean>(false);
  readonly variantsManagerOpen = signal<boolean>(false);

  readonly selectedProduct = signal<ProductSummary | null>(null);
  readonly currentVariants = signal<ProductVariant[]>([]);
  readonly loadingVariants = signal<boolean>(false);

  readonly saving = signal<boolean>(false);
  readonly savingCat = signal<boolean>(false);
  readonly savingVariant = signal<boolean>(false);

  // Product form fields
  prodName = '';
  prodSlug = '';
  prodCategoryId = '';
  prodPrice = 500000;
  prodMaterial = '';
  prodStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'PUBLISHED';
  prodDescription = '';
  prodImagesInput = '';
  editingProductId = '';

  // Category form fields (POST /categories, PATCH /categories/:categoryId)
  catName = '';
  catSlug = '';
  catStatus: 'ACTIVE' | 'HIDDEN' = 'ACTIVE';
  catParentId: string | null = null;
  editingCategoryId = '';

  // New Variant form fields
  showAddVariantForm = signal<boolean>(false);
  varSku = '';
  varSize = 'M';
  varColor = 'Đen';
  varPrice = 500000;
  varStock = 50;

  // Edit Variant form fields (PATCH /admin/products/:productId/variants/:variantId)
  editingVariantId = signal<string>('');
  varEditSku = '';
  varEditSize = '';
  varEditColor = '';
  varEditPrice = 0;
  varEditStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE';

  ngOnInit(): void {
    this.loadData();
    this.loadCategories();
  }

  loadData(): void {
    this.loading.set(true);
    this.pagination.load(() => this.api.adminListProducts(undefined, this.pagination.page(), this.pagination.limit), {
      next: (res) => {
        this.products.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadCategories(): void {
    this.loadingCats.set(true);
    this.api.adminCategories().subscribe({
      next: (cats) => {
        this.categories.set(cats);
        this.loadingCats.set(false);
        if (cats.length > 0 && !this.prodCategoryId) {
          this.prodCategoryId = cats[0].id;
        }
      },
      error: () => this.loadingCats.set(false),
    });
  }

  getParentName(parentId?: string | null): string {
    if (!parentId) return '—';
    const p = this.categories().find((c) => c.id === parentId);
    return p ? p.name : '—';
  }

  autoSlug(): void {
    if (this.editingProductId) return;
    this.prodSlug = this.slugify(this.prodName);
  }

  autoCategorySlug(): void {
    if (this.editingCategoryId) return;
    this.catSlug = this.slugify(this.catName);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  openCreateProductModal(): void {
    this.editingProductId = '';
    this.prodName = '';
    this.prodSlug = '';
    this.prodDescription = '';
    this.prodMaterial = '';
    this.prodPrice = 500000;
    this.prodStatus = 'PUBLISHED';
    this.prodImagesInput = '';
    this.productModalOpen.set(true);
  }

  openEditProductModal(product: ProductSummary): void {
    this.editingProductId = product.id;
    this.prodName = product.name;
    this.prodSlug = product.slug;
    this.prodDescription = product.description || '';
    this.prodMaterial = product.material || '';
    this.prodPrice = product.price;
    this.prodCategoryId = product.categoryId || '';
    this.prodStatus = product.status;
    this.prodImagesInput = (product.images || []).join(', ');
    this.productModalOpen.set(true);
  }

  saveProduct(): void {
    if (!this.prodName || !this.prodSlug || !this.prodCategoryId) {
      this.toast.warning('Vui lòng điền đủ tên, slug và danh mục.');
      return;
    }

    this.saving.set(true);
    const images = this.prodImagesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const dto = {
      name: this.prodName,
      slug: this.prodSlug,
      description: this.prodDescription,
      material: this.prodMaterial || undefined,
      price: this.prodPrice,
      categoryId: this.prodCategoryId,
      status: this.prodStatus,
      images,
    };
    const request = this.editingProductId
      ? this.api.adminUpdateProduct(this.editingProductId, dto)
      : this.api.adminCreateProduct(dto);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.productModalOpen.set(false);
        this.toast.success(this.editingProductId ? 'Đã cập nhật sản phẩm.' : 'Đã tạo sản phẩm mới.');
        this.loadData();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'Không thể lưu sản phẩm.');
      },
    });
  }

  // --- Category Actions (POST /categories, PATCH /categories/:categoryId) ---

  openCreateCategoryModal(): void {
    this.editingCategoryId = '';
    this.catName = '';
    this.catSlug = '';
    this.catStatus = 'ACTIVE';
    this.catParentId = null;
    this.categoryModalOpen.set(true);
  }

  openEditCategoryModal(cat: Category): void {
    this.editingCategoryId = cat.id;
    this.catName = cat.name;
    this.catSlug = cat.slug;
    this.catStatus = cat.status || 'ACTIVE';
    this.catParentId = cat.parentId || null;
    this.categoryModalOpen.set(true);
  }

  saveCategory(): void {
    if (!this.catName.trim() || !this.catSlug.trim()) {
      this.toast.warning('Vui lòng nhập tên và slug của danh mục.');
      return;
    }

    this.savingCat.set(true);
    if (this.editingCategoryId) {
      // PATCH /categories/:categoryId
      this.api.updateCategory(this.editingCategoryId, {
        name: this.catName.trim(),
        slug: this.catSlug.trim(),
        status: this.catStatus,
        parentId: this.catParentId || null,
      }).subscribe({
        next: () => {
          this.savingCat.set(false);
          this.categoryModalOpen.set(false);
          this.toast.success('Đã cập nhật danh mục thành công.');
          this.loadCategories();
        },
        error: (err) => {
          this.savingCat.set(false);
          this.toast.error(err.error?.message || 'Không thể cập nhật danh mục.');
        },
      });
    } else {
      // POST /categories
      this.api.createCategory({
        name: this.catName.trim(),
        slug: this.catSlug.trim(),
        status: this.catStatus,
        parentId: this.catParentId || undefined,
      }).subscribe({
        next: () => {
          this.savingCat.set(false);
          this.categoryModalOpen.set(false);
          this.toast.success('Đã tạo danh mục mới thành công.');
          this.loadCategories();
        },
        error: (err) => {
          this.savingCat.set(false);
          this.toast.error(err.error?.message || 'Không thể tạo danh mục.');
        },
      });
    }
  }

  // --- Variants Manager & Edit (PATCH /admin/products/:productId/variants/:variantId) ---

  openManageVariantsModal(prod: ProductSummary): void {
    this.selectedProduct.set(prod);
    this.showAddVariantForm.set(false);
    this.editingVariantId.set('');
    this.variantsManagerOpen.set(true);
    this.loadProductVariants(prod);
  }

  private loadProductVariants(prod: ProductSummary): void {
    this.loadingVariants.set(true);
    this.api.adminGetProduct(prod.id).subscribe({
      next: (detail) => {
        this.currentVariants.set(detail.variants || []);
        this.loadingVariants.set(false);
      },
      error: () => {
        this.currentVariants.set([]);
        this.loadingVariants.set(false);
        this.toast.error('Không thể tải dữ liệu biến thể. Vui lòng thử lại.');
      },
    });
  }

  saveNewVariant(): void {
    const prod = this.selectedProduct();
    if (!prod || !this.varSku || !this.varSize || !this.varColor) {
      this.toast.warning('Vui lòng điền đủ SKU, size và màu sắc.');
      return;
    }

    this.savingVariant.set(true);
    this.api.adminCreateVariant(prod.id, {
      sku: this.varSku,
      size: this.varSize,
      color: this.varColor,
      price: this.varPrice,
      stockOnHand: this.varStock,
    }).subscribe({
      next: () => {
        this.savingVariant.set(false);
        this.showAddVariantForm.set(false);
        this.toast.success('Đã thêm biến thể mới.');
        this.loadProductVariants(prod);
      },
      error: (err) => {
        this.savingVariant.set(false);
        this.toast.error(err.error?.message || 'Không thể tạo biến thể.');
      },
    });
  }

  startEditVariant(variant: ProductVariant): void {
    this.editingVariantId.set(variant.id);
    this.varEditSku = variant.sku;
    this.varEditSize = variant.size;
    this.varEditColor = variant.color;
    this.varEditPrice = variant.price;
    this.varEditStatus = variant.status || 'ACTIVE';
  }

  cancelEditVariant(): void {
    this.editingVariantId.set('');
  }

  submitUpdateVariant(): void {
    const prod = this.selectedProduct();
    const vid = this.editingVariantId();
    if (!prod || !vid) return;

    this.savingVariant.set(true);
    // PATCH /admin/products/:productId/variants/:variantId
    this.api.adminUpdateVariant(prod.id, vid, {
      sku: this.varEditSku.trim(),
      size: this.varEditSize.trim(),
      color: this.varEditColor.trim(),
      price: this.varEditPrice,
      status: this.varEditStatus,
    }).subscribe({
      next: (updated) => {
        this.savingVariant.set(false);
        this.editingVariantId.set('');
        this.toast.success('Đã cập nhật thông tin biến thể.');
        // Update local state
        this.currentVariants.update((list) =>
          list.map((v) => (v.id === vid ? { ...v, ...updated } : v))
        );
      },
      error: (err) => {
        this.savingVariant.set(false);
        this.toast.error(err.error?.message || 'Không thể cập nhật biến thể.');
      },
    });
  }
}
