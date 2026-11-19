import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of } from 'rxjs';
import type { Category, InventoryItem, ProductDetail, ProductSummary, ProductVariant } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal.component';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { AdminCatalogTabsComponent } from '../../components/admin-catalog-tabs.component';
import { PaginationComponent } from '../../components/pagination.component';
import { categoryStatusLabel, productStatusLabel, variantStatusLabel } from '../../shared/labels';

type StockFilter = 'all' | 'in' | 'low' | 'out';
type SortKey = 'default' | 'name' | 'priceAsc' | 'priceDesc' | 'stockAsc' | 'stockDesc';
type VariantEdit = { sku: string; size: string; color: string; price: number; status: 'ACTIVE' | 'INACTIVE' };
type ProductRow = {
  product: ProductSummary;
  detail: ProductDetail | null;
  minPrice: number;
  maxPrice: number;
  available: number | null;
  colors: string[];
  sizes: string[];
};

const MAX_IMAGES = 10;
const DEFAULT_LOW_STOCK = 10;

const COLOR_HEX: Record<string, string> = {
  'đen': '#171717', 'trắng': '#ffffff', 'be': '#e5d8c3', 'kem': '#f3ead7', 'nâu': '#7a5638',
  'xám': '#8b8f91', 'ghi': '#9aa0a2', 'đỏ': '#c52929', 'hồng': '#f4b8c1', 'cam': '#e2762f',
  'vàng': '#e6c54a', 'xanh lá': '#4f8a5b', 'xanh rêu': '#5b6b3a', 'xanh dương': '#3f6fb0',
  'xanh navy': '#1f2d4d', 'xanh': '#3f6fb0', 'tím': '#7a5a9a', 'bạc': '#c4c7c7',
};

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, ModalComponent, AdminDrawerComponent, AdminCatalogTabsComponent, PaginationComponent],
  template: `
    <div class="ap">
      <fc-admin-catalog-tabs [active]="activeTab()">
        @if (auth.can('inventory.manage')) {
          <a class="btn-outline" routerLink="/admin/inventory">Điều chỉnh tồn kho</a>
        }
        @if (activeTab() === 'products') {
          <button type="button" class="btn-primary" (click)="openCreateProduct()">+ Thêm sản phẩm</button>
        } @else {
          <button type="button" class="btn-primary" (click)="openCreateCategory()">+ Thêm danh mục</button>
        }
      </fc-admin-catalog-tabs>

      @if (activeTab() === 'products') {
        <!-- KPI -->
        <section class="kpis" aria-label="Chỉ số sản phẩm và kho">
          <article class="kpi">
            <span class="kpi-label">Tổng mã đang bán</span>
            <strong class="kpi-value">{{ publishedTotal() ?? '—' }}</strong>
            <span class="kpi-note">Sản phẩm trạng thái Đang bán</span>
          </article>
          <article class="kpi">
            <span class="kpi-label">Cảnh báo tồn thấp</span>
            <strong class="kpi-value">{{ lowCount() ?? '—' }}</strong>
            <span class="kpi-note">Tồn khả dụng ≤ {{ effectiveThreshold() }} · {{ stockScope() }}</span>
          </article>
          <article class="kpi">
            <span class="kpi-label">Hết hàng</span>
            <strong class="kpi-value">{{ outCount() ?? '—' }}</strong>
            <span class="kpi-note">Tồn khả dụng bằng 0 · {{ stockScope() }}</span>
          </article>
          <article class="kpi">
            <span class="kpi-label">Giá trị kho</span>
            <strong class="kpi-value">{{ stockValue() === null ? '—' : money(stockValue()!) }}</strong>
            <span class="kpi-note">Tồn khả dụng × giá, trên {{ detailCount() }} sản phẩm của trang này</span>
          </article>
        </section>

        <!-- Bộ lọc -->
        <section class="filters">
          <label class="f-search">
            <span class="sr-only">Tìm sản phẩm</span>
            <input type="search" [ngModel]="query()" (ngModelChange)="onSearch($event)" name="q" placeholder="Tìm theo tên hoặc SKU" />
          </label>
          <label class="f-sel">Trạng thái
            <select [ngModel]="statusFilter()" (ngModelChange)="setStatusFilter($event)" name="status">
              <option value="">Tất cả</option>
              <option value="PUBLISHED">{{ productStatusLabel('PUBLISHED') }}</option>
              <option value="ARCHIVED">{{ productStatusLabel('ARCHIVED') }}</option>
            </select>
          </label>
          <label class="f-sel">Danh mục
            <select [ngModel]="categoryFilter()" (ngModelChange)="setCategoryFilter($event)" name="categoryFilter">
              <option value="">Tất cả</option>
              @for (cat of categories(); track cat.id) { <option [value]="cat.id">{{ cat.name }}</option> }
            </select>
          </label>
          <label class="f-sel">Tồn kho
            <select [ngModel]="stockFilter()" (ngModelChange)="stockFilter.set($event)" name="stock">
              <option value="all">Tất cả</option>
              <option value="in">Còn hàng</option>
              <option value="low">Tồn thấp</option>
              <option value="out">Hết hàng</option>
            </select>
          </label>
          <label class="f-sel">Sắp xếp
            <select [ngModel]="sortKey()" (ngModelChange)="sortKey.set($event)" name="sort">
              <option value="default">Mặc định</option>
              <option value="name">Tên A → Z</option>
              <option value="priceAsc">Giá thấp → cao</option>
              <option value="priceDesc">Giá cao → thấp</option>
              <option value="stockAsc">Tồn ít → nhiều</option>
              <option value="stockDesc">Tồn nhiều → ít</option>
            </select>
          </label>
          <label class="f-sel">Hiển thị
            <select [ngModel]="pageSize()" (ngModelChange)="setPageSize($event)" name="size">
              <option [ngValue]="10">10 dòng mỗi trang</option>
              <option [ngValue]="20">20 dòng mỗi trang</option>
              <option [ngValue]="50">50 dòng mỗi trang</option>
            </select>
          </label>
        </section>
        <p class="scope-note">Lọc tồn kho và sắp xếp chỉ áp dụng cho {{ products().length }} sản phẩm của trang đang xem. Tìm kiếm, danh mục và trạng thái lọc trên toàn bộ danh sách.</p>

        @if (loading()) {
          <div class="state-box"><div class="spinner"></div><p>Đang tải danh sách sản phẩm…</p></div>
        } @else if (loadError()) {
          <div class="state-box"><p>{{ loadError() }}</p><button type="button" class="btn-outline" (click)="loadProducts()">Thử lại</button></div>
        } @else if (rows().length === 0) {
          <div class="state-box"><p>{{ products().length === 0 ? (hasServerFilter() ? 'Không tìm thấy sản phẩm khớp tìm kiếm hoặc bộ lọc.' : 'Chưa có sản phẩm nào.') : 'Không có sản phẩm khớp bộ lọc tồn kho trên trang này.' }}</p></div>
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th class="c-img"><span class="sr-only">Ảnh</span></th>
                  <th>Sản phẩm</th><th>Danh mục</th><th>Giá</th><th>Biến thể</th><th class="c-num">Tồn khả dụng</th><th>Trạng thái</th><th class="c-act">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.product.id) {
                  <tr>
                    <td class="c-img">
                      <div class="thumb">@if (row.product.coverImage ?? row.product.images[0]; as cover) { <img [src]="cover" [alt]="row.product.name" /> }</div>
                    </td>
                    <td>
                      <strong class="p-name">{{ row.product.name }}</strong>
                      <span class="p-sub">{{ row.product.material || '—' }}</span>
                    </td>
                    <td>{{ categoryName(row.product.categoryId) }}</td>
                    <td class="c-price">
                      @if (row.detail === null) { {{ money(row.product.price) }} }
                      @else if (row.minPrice === row.maxPrice) { {{ money(row.minPrice) }} }
                      @else { {{ money(row.minPrice) }} – {{ money(row.maxPrice) }} }
                    </td>
                    <td>
                      @if (row.detail === null) { <span class="muted">{{ detailsLoading() ? 'Đang tải…' : '—' }}</span> }
                      @else if (row.detail.variants.length === 0) { <span class="muted">Chưa có biến thể</span> }
                      @else {
                        <div class="dots">
                          @for (c of row.colors; track c) { <span class="dot" [style.background]="colorHex(c)" [title]="c"></span> }
                          <span class="muted">{{ row.colors.length }} màu</span>
                        </div>
                        <span class="p-sub">{{ row.sizes.join(', ') }}</span>
                      }
                    </td>
                    <td class="c-num">
                      @if (row.available === null) { <span class="muted">—</span> }
                      @else { <span [class.stock-low]="row.available > 0 && row.available <= effectiveThreshold()" [class.stock-out]="row.available === 0">{{ row.available }}</span> }
                    </td>
                    <td><span class="badge" [class]="'badge s-' + row.product.status.toLowerCase()">{{ productStatusLabel(row.product.status) }}</span></td>
                    <td class="c-act">
                      <a class="icon-btn" [href]="'/products/' + row.product.slug" target="_blank" rel="noopener" [attr.aria-label]="'Xem ' + row.product.name + ' trên cửa hàng'" title="Xem trên cửa hàng">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                      </a>
                      <button type="button" class="icon-btn" (click)="openEditProduct(row.product)" [attr.aria-label]="'Sửa ' + row.product.name" title="Sửa">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                      </button>
                      @if (row.product.status !== 'ARCHIVED') {
                        <button type="button" class="icon-btn" (click)="askArchive(row.product)" [attr.aria-label]="'Lưu trữ ' + row.product.name" title="Lưu trữ">
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <fc-pagination [page]="page()" [total]="total()" [limit]="pageSize()" [loading]="loading()" label="sản phẩm" (pageChange)="goToPage($event)" />
        }
      } @else {
        <!-- TAB DANH MỤC -->
        @if (loadingCats()) {
          <div class="state-box"><div class="spinner"></div><p>Đang tải danh mục…</p></div>
        } @else if (categories().length === 0) {
          <div class="state-box"><p>Chưa có danh mục nào. Hãy tạo danh mục đầu tiên.</p></div>
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Tên danh mục</th><th>Đường dẫn</th><th>Danh mục cha</th><th>Trạng thái</th><th class="c-act">Thao tác</th></tr></thead>
              <tbody>
                @for (cat of categories(); track cat.id) {
                  <tr>
                    <td><strong class="p-name">{{ cat.name }}</strong></td>
                    <td class="mono">{{ cat.slug }}</td>
                    <td>{{ parentName(cat.parentId) }}</td>
                    <td><span class="badge" [class]="cat.status === 'HIDDEN' ? 'badge s-archived' : 'badge s-published'">{{ categoryStatusLabel(cat.status ?? 'ACTIVE') }}</span></td>
                    <td class="c-act">
                      <button type="button" class="icon-btn" (click)="openEditCategory(cat)" [attr.aria-label]="'Sửa danh mục ' + cat.name" title="Sửa">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>

    <!-- Drawer sản phẩm -->
    <fc-admin-drawer [isOpen]="productDrawerOpen()" [eyebrow]="editingProductId ? 'Chỉnh sửa' : 'Tạo mới'"
      [title]="editingProductId ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm'" [subtitle]="editingProductId ? prodName : ''" width="640px"
      (close)="closeProductDrawer()">
      <form class="dform" (ngSubmit)="saveProduct()" autocomplete="off">
        <label>Tên sản phẩm *
          <input type="text" name="name" [(ngModel)]="prodName" (input)="autoSlug()" required maxlength="200" />
        </label>
        <div class="two">
          <label>Đường dẫn (slug) *
            <input type="text" name="slug" [(ngModel)]="prodSlug" required />
          </label>
          <label>Danh mục *
            <select name="categoryId" [(ngModel)]="prodCategoryId" required>
              <option value="">Chọn danh mục</option>
              @for (cat of categories(); track cat.id) { <option [value]="cat.id">{{ cat.name }}</option> }
            </select>
          </label>
        </div>
        <div class="two">
          <label>Chất liệu
            <input type="text" name="material" [(ngModel)]="prodMaterial" placeholder="Cotton, lụa, linen…" />
          </label>
          <label>Giá cơ sở (đ) *
            <input type="number" name="price" [(ngModel)]="prodPrice" required min="0" step="1000" />
          </label>
        </div>
        <label>Mô tả
          <textarea name="description" rows="3" [(ngModel)]="prodDescription" placeholder="Form dáng, chất vải, cách phối…"></textarea>
        </label>

        <!-- Hình ảnh -->
        <fieldset class="block">
          <legend>Hình ảnh <span class="muted">({{ prodImages().length }}/10 · ảnh đầu tiên là ảnh bìa)</span></legend>
          <div class="imgs">
            @for (url of prodImages(); track url; let i = $index) {
              <div class="img-item">
                <img [src]="url" [alt]="'Ảnh sản phẩm ' + (i + 1)" />
                @if (i === 0) { <span class="cover-tag">Ảnh bìa</span> }
                <div class="img-tools">
                  @if (i > 0) { <button type="button" (click)="makeCover(i)" title="Đặt làm ảnh bìa">Đặt bìa</button> }
                  <button type="button" (click)="removeImage(i)" title="Xóa ảnh" [attr.aria-label]="'Xóa ảnh ' + (i + 1)">Xóa</button>
                </div>
              </div>
            }
            @if (prodImages().length < 10) {
              <label class="img-add" [class.disabled]="uploading()">
                <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploading()" (change)="uploadImage($event)" />
                <span>{{ uploading() ? 'Đang tải…' : '+ Thêm ảnh' }}</span>
              </label>
            }
          </div>
          <span class="hint">JPEG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh.</span>
        </fieldset>

        <!-- Biến thể -->
        <fieldset class="block">
          <legend>Biến thể (màu · size)</legend>
          @if (!editingProductId) {
            <p class="hint">Lưu sản phẩm trước, sau đó thêm biến thể tại đây.</p>
          } @else if (loadingVariants()) {
            <p class="hint">Đang tải biến thể…</p>
          } @else {
            @for (v of variants(); track v.id) {
              <div class="variant">
                <label>Màu<input type="text" [name]="'vc' + v.id" [(ngModel)]="variantEdits[v.id].color" /></label>
                <label>Size<input type="text" [name]="'vs' + v.id" [(ngModel)]="variantEdits[v.id].size" /></label>
                <label>Giá (đ)<input type="number" [name]="'vp' + v.id" [(ngModel)]="variantEdits[v.id].price" min="0" step="1000" /></label>
                <label>SKU<input type="text" [name]="'vk' + v.id" [(ngModel)]="variantEdits[v.id].sku" /></label>
                <label>Trạng thái
                  <select [name]="'vt' + v.id" [(ngModel)]="variantEdits[v.id].status">
                    <option value="ACTIVE">{{ variantStatusLabel('ACTIVE') }}</option>
                    <option value="INACTIVE">{{ variantStatusLabel('INACTIVE') }}</option>
                  </select>
                </label>
                <div class="v-stock">
                  <span class="v-stock-label">Tồn kho</span>
                  <strong>{{ v.available }}</strong>
                  <span class="muted">(chỉ xem)</span>
                  @if (auth.can('inventory.manage')) {
                    <a class="link" routerLink="/admin/inventory" [queryParams]="{ adjust: v.id }">Điều chỉnh</a>
                  }
                </div>
              </div>
            } @empty {
              <p class="hint">Sản phẩm chưa có biến thể.</p>
            }

            @if (showAddVariant()) {
              <div class="variant add">
                <label>Màu<input type="text" name="nvColor" [ngModelOptions]="{ standalone: true }" [(ngModel)]="varColor" /></label>
                <label>Size<input type="text" name="nvSize" [ngModelOptions]="{ standalone: true }" [(ngModel)]="varSize" /></label>
                <label>Giá (đ)<input type="number" name="nvPrice" [ngModelOptions]="{ standalone: true }" [(ngModel)]="varPrice" min="0" step="1000" /></label>
                <label>SKU<input type="text" name="nvSku" [ngModelOptions]="{ standalone: true }" [(ngModel)]="varSku" /></label>
                <label>Tồn ban đầu<input type="number" name="nvStock" [ngModelOptions]="{ standalone: true }" [(ngModel)]="varStock" min="0" /></label>
                <div class="v-actions">
                  <button type="button" class="btn-outline" (click)="showAddVariant.set(false)">Hủy</button>
                  <button type="button" class="btn-primary" [disabled]="savingVariant()" (click)="addVariant()">{{ savingVariant() ? 'Đang thêm…' : 'Thêm biến thể' }}</button>
                </div>
              </div>
            } @else {
              <button type="button" class="btn-outline" (click)="startAddVariant()">+ Thêm biến thể</button>
            }
          }
        </fieldset>

        <!-- Hiển thị website -->
        <div class="visibility">
          <label class="switch">
            <input type="checkbox" name="visible" [checked]="prodStatus === 'PUBLISHED'" (change)="toggleVisible($event)" />
            <span class="track" aria-hidden="true"></span>
            <span><strong>Đang hiển thị trên website</strong>
              <small>{{ prodStatus === 'PUBLISHED' ? 'Khách hàng nhìn thấy và mua được sản phẩm.' : prodStatus === 'ARCHIVED' ? 'Sản phẩm đang được lưu trữ. Bật để đưa lên website trở lại.' : 'Đang ở dạng bản nháp, khách hàng chưa thấy.' }}</small>
            </span>
          </label>
        </div>

        <div class="threshold">
          <span>Ngưỡng cảnh báo hết hàng</span>
          <strong>{{ settingsThreshold() === null ? '—' : settingsThreshold() + ' sản phẩm' }}</strong>
          <small>Dùng chung cho toàn hệ thống.</small>
          @if (auth.isAdmin()) { <a class="link" routerLink="/admin/settings">Đổi trong Cài đặt</a> }
        </div>
      </form>
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="closeProductDrawer()">Hủy</button>
        <button type="button" class="btn-primary" [disabled]="saving() || uploading()" (click)="saveProduct()">{{ saving() ? 'Đang lưu…' : editingProductId ? 'Lưu thay đổi' : 'Tạo sản phẩm' }}</button>
      </div>
    </fc-admin-drawer>

    <!-- Drawer danh mục -->
    <fc-admin-drawer [isOpen]="categoryDrawerOpen()" [eyebrow]="editingCategoryId ? 'Chỉnh sửa' : 'Tạo mới'"
      [title]="editingCategoryId ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'" width="480px" (close)="categoryDrawerOpen.set(false)">
      <form class="dform" (ngSubmit)="saveCategory()" autocomplete="off">
        <label>Tên danh mục *
          <input type="text" name="catName" [(ngModel)]="catName" (input)="autoCategorySlug()" placeholder="Áo sơ mi, Đầm dạ tiệc…" required />
        </label>
        <label>Đường dẫn (slug) *
          <input type="text" name="catSlug" [(ngModel)]="catSlug" placeholder="ao-so-mi" required />
        </label>
        <label>Trạng thái
          <select name="catStatus" [(ngModel)]="catStatus">
            <option value="ACTIVE">{{ categoryStatusLabel('ACTIVE') }}</option>
            <option value="HIDDEN">{{ categoryStatusLabel('HIDDEN') }}</option>
          </select>
        </label>
        <label>Danh mục cha
          <select name="catParent" [(ngModel)]="catParentId">
            <option [ngValue]="null">Không có (danh mục gốc)</option>
            @for (cat of categories(); track cat.id) {
              @if (cat.id !== editingCategoryId) { <option [ngValue]="cat.id">{{ cat.name }}</option> }
            }
          </select>
        </label>
      </form>
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="categoryDrawerOpen.set(false)">Hủy</button>
        <button type="button" class="btn-primary" [disabled]="savingCat()" (click)="saveCategory()">{{ savingCat() ? 'Đang lưu…' : editingCategoryId ? 'Lưu thay đổi' : 'Tạo danh mục' }}</button>
      </div>
    </fc-admin-drawer>

    <!-- Xác nhận lưu trữ -->
    <fc-modal [isOpen]="archiveTarget() !== null" title="Lưu trữ sản phẩm?" maxWidth="460px" (close)="archiveTarget.set(null)">
      <p class="confirm-text">“{{ archiveTarget()?.name }}” sẽ chuyển sang trạng thái Đã lưu trữ và không còn hiển thị trên website. Bạn có thể bật hiển thị lại trong màn hình chỉnh sửa.</p>
      <div class="confirm-actions">
        <button type="button" class="btn-outline" (click)="archiveTarget.set(null)">Hủy</button>
        <button type="button" class="btn-primary" [disabled]="archiving()" (click)="confirmArchive()">{{ archiving() ? 'Đang lưu trữ…' : 'Lưu trữ' }}</button>
      </div>
    </fc-modal>
  `,
  styles: [`
    :host { display: block; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .muted { color: var(--ui-subtle); font-size: 12px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .kpi { background: var(--ui-bg); border: 1px solid var(--admin-line); padding: 18px 20px; display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { font: 700 11px/16px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-ink-soft); }
    .kpi-value { font: 500 30px/36px var(--font-serif); color: var(--ui-ink); overflow-wrap: anywhere; }
    .kpi-note { font-size: 11px; line-height: 16px; color: var(--ui-subtle); }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .f-search { flex: 1 1 240px; }
    .f-search input, .f-sel select, .dform input, .dform select, .dform textarea {
      width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px;
      background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink);
    }
    .f-sel { display: flex; flex-direction: column; gap: 4px; font: 600 11px/14px var(--font-sans); color: var(--ui-ink-soft); min-width: 150px; }
    .scope-note { margin: 10px 0 16px; font-size: 12px; color: var(--ui-subtle); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 880px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); white-space: nowrap; }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: var(--admin-canvas); }
    .c-img { width: 72px; } .c-num { text-align: right; } .c-act { text-align: right; white-space: nowrap; } .c-price { white-space: nowrap; font-weight: 600; }
    .thumb { width: 48px; height: 60px; background: var(--ui-bg-image); overflow: hidden; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .p-name { display: block; font-weight: 600; color: var(--ui-ink); overflow-wrap: anywhere; }
    .p-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--ui-subtle); }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; color: var(--ui-ink-soft); }
    .dots { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--ui-line); }
    .stock-low { color: var(--ui-warning); font-weight: 700; } .stock-out { color: var(--ui-danger); font-weight: 700; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); white-space: nowrap; }
    .s-published { background: var(--ui-success-bg); color: var(--ui-success); }
    .s-draft { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .s-archived { background: var(--ui-bg-soft); color: var(--ui-ink-soft); }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid transparent; border-radius: 2px; background: none; color: var(--ui-ink-soft); cursor: pointer; text-decoration: none; }
    .icon-btn:hover { background: var(--ui-bg-soft); border-color: var(--admin-line); color: var(--ui-ink); }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .link { color: var(--ui-accent); font-weight: 600; font-size: 12px; text-decoration: underline; }
    .btn-outline { text-decoration: none; display: inline-flex; align-items: center; }

    .dform { display: flex; flex-direction: column; gap: 16px; }
    .dform label { display: flex; flex-direction: column; gap: 6px; font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .block { border: 1px solid var(--admin-line); padding: 14px 16px 16px; margin: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .block legend { padding: 0 6px; font: 700 12px/16px var(--font-sans); color: var(--ui-ink); }
    .hint { margin: 0; font-size: 12px; color: var(--ui-subtle); }
    .imgs { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
    .img-item { position: relative; aspect-ratio: 4 / 5; background: var(--ui-bg-image); overflow: hidden; }
    .img-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-tag { position: absolute; left: 4px; top: 4px; padding: 2px 6px; background: var(--ui-ink); color: #fff; font: 700 10px/14px var(--font-sans); }
    .img-tools { position: absolute; inset: auto 0 0 0; display: flex; gap: 2px; background: #171717b3; }
    .img-tools button { flex: 1; border: 0; background: none; color: #fff; padding: 5px 2px; font: 600 10px/12px var(--font-sans); cursor: pointer; }
    .img-tools button:hover { background: #ffffff26; }
    .img-add { display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 5; border: 1px dashed var(--ui-line); cursor: pointer; font: 600 12px var(--font-sans); color: var(--ui-ink-soft); text-align: center; }
    .img-add input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .img-add:hover { background: var(--ui-bg-soft); } .img-add.disabled { opacity: .6; cursor: progress; }
    .variant { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 12px; background: var(--admin-canvas); border: 1px solid var(--admin-line-soft); }
    .variant.add { background: var(--ui-pink-soft); border-color: var(--ui-pink); }
    .v-stock { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; align-self: end; padding-bottom: 8px; font-size: 13px; }
    .v-stock-label { font: 600 12px var(--font-sans); color: var(--ui-ink-soft); }
    .v-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; }
    .visibility { border: 1px solid var(--admin-line); padding: 14px 16px; }
    .switch { flex-direction: row !important; align-items: center; gap: 12px !important; cursor: pointer; }
    .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .track { position: relative; flex-shrink: 0; width: 44px; height: 24px; border-radius: 999px; background: var(--ui-line); transition: background .15s; }
    .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .switch input:checked + .track { background: var(--ui-accent); }
    .switch input:checked + .track::after { transform: translateX(20px); }
    .switch input:focus-visible + .track { outline: 2px solid var(--ui-ink); outline-offset: 2px; }
    .switch strong { display: block; font-size: 13px; color: var(--ui-ink); } .switch small { display: block; font-weight: 400; color: var(--ui-subtle); font-size: 12px; margin-top: 2px; }
    .threshold { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--ui-ink-soft); }
    .threshold small { color: var(--ui-subtle); }
    .confirm-text { margin: 0 0 20px; font-size: 14px; line-height: 22px; color: var(--ui-ink-soft); }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }
    @media (max-width: 980px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .kpis { grid-template-columns: 1fr; } .two, .variant { grid-template-columns: 1fr; } }
  `],
})
export class AdminProductsPage implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly productStatusLabel = productStatusLabel;
  protected readonly categoryStatusLabel = categoryStatusLabel;
  protected readonly variantStatusLabel = variantStatusLabel;

  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly activeTab = computed<'products' | 'categories'>(() => this.queryParams()?.get('tab') === 'categories' ? 'categories' : 'products');

  // Danh sách + bộ lọc
  readonly products = signal<ProductSummary[]>([]);
  readonly details = signal<Record<string, ProductDetail>>({});
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly detailsLoading = signal(false);
  readonly loadingCats = signal(false);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = signal(20);
  readonly statusFilter = signal('');
  readonly stockFilter = signal<StockFilter>('all');
  readonly sortKey = signal<SortKey>('default');
  readonly query = signal('');
  readonly categoryFilter = signal('');
  readonly hasServerFilter = computed(() => !!(this.query().trim() || this.statusFilter() || this.categoryFilter()));
  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();
  private listSub?: Subscription;
  private detailsSub?: Subscription;

  // KPI
  readonly publishedTotal = signal<number | null>(null);
  readonly inventory = signal<InventoryItem[] | null>(null);
  readonly settingsThreshold = signal<number | null>(null);
  readonly effectiveThreshold = computed(() => this.settingsThreshold() ?? DEFAULT_LOW_STOCK);

  private readonly stockNumbers = computed<number[] | null>(() => {
    const inv = this.inventory();
    if (inv) return inv.map(i => i.available);
    const d = Object.values(this.details());
    return d.length > 0 ? d.flatMap(p => p.variants.map(v => v.available)) : null;
  });
  readonly stockScope = computed(() => this.inventory() ? 'toàn kho' : 'trong trang này');
  readonly lowCount = computed(() => { const s = this.stockNumbers(); return s ? s.filter(n => n <= this.effectiveThreshold()).length : null; });
  readonly outCount = computed(() => { const s = this.stockNumbers(); return s ? s.filter(n => n === 0).length : null; });
  readonly detailCount = computed(() => Object.keys(this.details()).length);
  readonly stockValue = computed<number | null>(() => {
    const d = Object.values(this.details());
    if (d.length === 0) return null;
    return d.reduce((sum, p) => sum + p.variants.reduce((s, v) => s + v.available * v.price, 0), 0);
  });

  readonly rows = computed<ProductRow[]>(() => {
    const details = this.details();
    const threshold = this.effectiveThreshold();
    let list = this.products().map<ProductRow>(product => {
      const detail = details[product.id] ?? null;
      const prices = detail ? detail.variants.map(v => v.price) : [];
      return {
        product, detail,
        minPrice: prices.length ? Math.min(...prices) : product.price,
        maxPrice: prices.length ? Math.max(...prices) : product.price,
        available: detail ? detail.variants.reduce((s, v) => s + v.available, 0) : null,
        colors: detail ? [...new Set(detail.variants.map(v => v.color))] : [],
        sizes: detail ? [...new Set(detail.variants.map(v => v.size))] : [],
      };
    });
    const sf = this.stockFilter();
    if (sf !== 'all') {
      list = list.filter(r => {
        if (r.available === null) return false;
        if (sf === 'out') return r.available === 0;
        if (sf === 'low') return r.available > 0 && r.available <= threshold;
        return r.available > threshold;
      });
    }
    const sk = this.sortKey();
    const byPrice = (r: ProductRow) => r.minPrice;
    const byStock = (r: ProductRow) => r.available ?? -1;
    if (sk === 'name') list = [...list].sort((a, b) => a.product.name.localeCompare(b.product.name, 'vi'));
    else if (sk === 'priceAsc') list = [...list].sort((a, b) => byPrice(a) - byPrice(b));
    else if (sk === 'priceDesc') list = [...list].sort((a, b) => byPrice(b) - byPrice(a));
    else if (sk === 'stockAsc') list = [...list].sort((a, b) => byStock(a) - byStock(b));
    else if (sk === 'stockDesc') list = [...list].sort((a, b) => byStock(b) - byStock(a));
    return list;
  });

  // Drawer sản phẩm
  readonly productDrawerOpen = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly prodImages = signal<string[]>([]);
  /**
   * Ảnh tải lên được lưu dạng media riêng tư (API trả url = null) nên gửi bằng imageMediaIds;
   * map này nối URL xem trước đang hiển thị với mediaId tương ứng.
   */
  private readonly mediaIdByUrl = new Map<string, string>();
  /** mediaId của sản phẩm đang sửa chưa có URL xem trước (giữ nguyên khi lưu). */
  private pendingMediaIds: string[] = [];
  private rawImageCount = 0;
  readonly variants = signal<ProductVariant[]>([]);
  readonly loadingVariants = signal(false);
  readonly showAddVariant = signal(false);
  readonly savingVariant = signal(false);
  editingProductId = '';
  prodName = '';
  prodSlug = '';
  prodCategoryId = '';
  prodPrice = 500000;
  prodMaterial = '';
  prodStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'PUBLISHED';
  prodDescription = '';
  variantEdits: Record<string, VariantEdit> = {};
  private variantOriginals: Record<string, VariantEdit> = {};
  varSku = '';
  varSize = 'M';
  varColor = '';
  varPrice = 500000;
  varStock = 0;

  // Danh mục
  readonly categoryDrawerOpen = signal(false);
  readonly savingCat = signal(false);
  editingCategoryId = '';
  catName = '';
  catSlug = '';
  catStatus: 'ACTIVE' | 'HIDDEN' = 'ACTIVE';
  catParentId: string | null = null;

  // Lưu trữ
  readonly archiveTarget = signal<ProductSummary | null>(null);
  readonly archiving = signal(false);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.query.set(params.get('q')?.trim() ?? '');
    this.categoryFilter.set(params.get('category') ?? '');
    // Chờ 300ms sau khi ngừng gõ, về trang 1, ghi lên URL rồi gọi API; yêu cầu cũ bị hủy trong loadProducts.
    this.subs.add(this.search$.pipe(map(v => v.trim()), debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.page.set(1);
      this.syncUrl();
      this.loadProducts();
    }));
    this.loadProducts();
    this.loadCategories();
    this.api.adminListProducts('PUBLISHED', 1, 1).subscribe({ next: res => this.publishedTotal.set(res.total), error: () => this.publishedTotal.set(null) });
    // Dữ liệu kho và ngưỡng chỉ đọc khi tài khoản có quyền; thiếu quyền thì bỏ qua êm.
    if (this.auth.can('inventory.manage')) {
      this.api.adminListInventory().subscribe({ next: res => this.inventory.set(res.items), error: () => this.inventory.set(null) });
    }
    if (this.auth.isAdmin()) {
      this.api.adminGetSettings().subscribe({ next: s => this.settingsThreshold.set(s.lowStockThreshold), error: () => this.settingsThreshold.set(null) });
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.listSub?.unsubscribe();
    this.detailsSub?.unsubscribe();
  }

  money(value: number): string {
    return `${Math.round(value).toLocaleString('vi-VN')}đ`;
  }

  onSearch(value: string): void {
    this.query.set(value);
    this.search$.next(value);
  }

  setCategoryFilter(value: string): void {
    this.categoryFilter.set(value);
    this.page.set(1);
    this.syncUrl();
    this.loadProducts();
  }

  /** Giữ ?q= và ?category= trên URL để tải lại trang vẫn còn bộ lọc; các tham số khác (tab) giữ nguyên. */
  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: this.query().trim() || null, category: this.categoryFilter() || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  colorHex(name: string): string {
    return COLOR_HEX[name.trim().toLowerCase()] ?? '#c4c7c7';
  }

  categoryName(id?: string | null): string {
    if (!id) return '—';
    return this.categories().find(c => c.id === id)?.name ?? '—';
  }

  parentName(parentId?: string | null): string {
    return parentId ? this.categoryName(parentId) : '—';
  }

  // --- Tải dữ liệu ---
  loadProducts(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.listSub?.unsubscribe();
    this.listSub = this.api.adminListProducts(this.statusFilter() || undefined, this.page(), this.pageSize(), {
      q: this.query().trim() || undefined, category: this.categoryFilter() || undefined,
    }).subscribe({
      next: res => {
        this.products.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
        this.loadDetails(res.items);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(err.error?.message || 'Không thể tải danh sách sản phẩm.');
      },
    });
  }

  /** Danh sách sản phẩm không kèm biến thể, nên lấy chi tiết từng dòng của trang hiện tại. */
  private loadDetails(items: ProductSummary[]): void {
    this.details.set({});
    if (items.length === 0) return;
    this.detailsLoading.set(true);
    this.detailsSub?.unsubscribe();
    this.detailsSub = forkJoin(items.map(p => this.api.adminGetProduct(p.id).pipe(catchError(() => of(null))))).subscribe(results => {
      const map: Record<string, ProductDetail> = {};
      for (const d of results) if (d) map[d.id] = d;
      this.details.set(map);
      this.detailsLoading.set(false);
    });
  }

  loadCategories(): void {
    this.loadingCats.set(true);
    this.api.adminCategories().subscribe({
      next: cats => { this.categories.set(cats); this.loadingCats.set(false); },
      error: () => this.loadingCats.set(false),
    });
  }

  setStatusFilter(value: string): void { this.statusFilter.set(value); this.page.set(1); this.loadProducts(); }
  setPageSize(value: number): void { this.pageSize.set(Number(value)); this.page.set(1); this.loadProducts(); }
  goToPage(page: number): void { this.page.set(page); this.loadProducts(); }

  // --- Drawer sản phẩm ---
  openCreateProduct(): void {
    this.editingProductId = '';
    this.prodName = ''; this.prodSlug = ''; this.prodDescription = ''; this.prodMaterial = '';
    this.prodPrice = 500000; this.prodStatus = 'DRAFT'; this.prodCategoryId = '';
    this.prodImages.set([]); this.variants.set([]); this.variantEdits = {}; this.variantOriginals = {};
    this.mediaIdByUrl.clear(); this.pendingMediaIds = []; this.rawImageCount = 0;
    this.showAddVariant.set(false);
    this.productDrawerOpen.set(true);
  }

  openEditProduct(product: ProductSummary): void {
    this.editingProductId = product.id;
    this.prodName = product.name; this.prodSlug = product.slug;
    this.prodDescription = product.description || ''; this.prodMaterial = product.material || '';
    this.prodPrice = product.price; this.prodCategoryId = product.categoryId || '';
    this.prodStatus = product.status;
    this.prodImages.set([...(product.images || [])]);
    this.mediaIdByUrl.clear();
    this.rawImageCount = (product.images || []).length;
    this.pendingMediaIds = [...((product as ProductSummary & { imageMediaIds?: string[] }).imageMediaIds ?? [])];
    this.showAddVariant.set(false);
    this.variants.set([]); this.variantEdits = {}; this.variantOriginals = {};
    this.productDrawerOpen.set(true);
    this.loadVariants();
  }

  closeProductDrawer(): void { this.productDrawerOpen.set(false); }

  private loadVariants(): void {
    if (!this.editingProductId) return;
    this.loadingVariants.set(true);
    this.api.adminGetProduct(this.editingProductId).subscribe({
      next: detail => {
        this.applyVariants(detail.variants || []);
        this.attachMediaPreviews(detail.images || []);
        this.loadingVariants.set(false);
      },
      error: () => {
        this.loadingVariants.set(false);
        this.toast.error('Không thể tải biến thể. Vui lòng thử lại.');
      },
    });
  }

  private applyVariants(list: ProductVariant[]): void {
    this.variants.set(list);
    this.variantEdits = {}; this.variantOriginals = {};
    for (const v of list) {
      const edit: VariantEdit = { sku: v.sku, size: v.size, color: v.color, price: v.price, status: v.status || 'ACTIVE' };
      this.variantEdits[v.id] = { ...edit };
      this.variantOriginals[v.id] = edit;
    }
  }

  autoSlug(): void { if (!this.editingProductId) this.prodSlug = this.slugify(this.prodName); }
  autoCategorySlug(): void { if (!this.editingCategoryId) this.catSlug = this.slugify(this.catName); }

  private slugify(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  }

  toggleVisible(event: Event): void {
    this.prodStatus = (event.target as HTMLInputElement).checked ? 'PUBLISHED' : 'DRAFT';
  }

  /** Chi tiết sản phẩm trả ảnh theo thứ tự: URL thường trước, rồi ảnh media theo imageMediaIds. */
  private attachMediaPreviews(images: string[]): void {
    const ids = this.pendingMediaIds;
    if (!ids.length || images.length !== this.rawImageCount + ids.length) return;
    const previews = images.slice(this.rawImageCount);
    previews.forEach((url, i) => this.mediaIdByUrl.set(url, ids[i]));
    this.pendingMediaIds = [];
    this.prodImages.update(list => [...list.slice(0, this.rawImageCount), ...previews, ...list.slice(this.rawImageCount)]);
  }

  uploadImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (this.prodImages().length + this.pendingMediaIds.length >= MAX_IMAGES) { this.toast.warning(`Tối đa 10 ảnh cho mỗi sản phẩm.`); return; }
    this.uploading.set(true);
    this.api.uploadImage(file, 'product').subscribe({
      next: media => {
        this.uploading.set(false);
        const preview = media.url || URL.createObjectURL(file);
        this.mediaIdByUrl.set(preview, media.id);
        this.prodImages.update(list => [...list, preview]);
      },
      error: err => {
        this.uploading.set(false);
        this.toast.error(err.error?.message || err.message || 'Không thể tải ảnh.');
      },
    });
  }

  removeImage(index: number): void {
    const url = this.prodImages()[index];
    if (url) this.mediaIdByUrl.delete(url);
    this.prodImages.update(list => list.filter((_, i) => i !== index));
  }
  makeCover(index: number): void {
    this.prodImages.update(list => { const next = [...list]; const [item] = next.splice(index, 1); return [item, ...next]; });
  }

  saveProduct(): void {
    if (!this.prodName.trim() || !this.prodSlug.trim() || !this.prodCategoryId) {
      this.toast.warning('Vui lòng điền đủ tên, slug và danh mục.');
      return;
    }
    const dto = {
      name: this.prodName.trim(),
      slug: this.prodSlug.trim(),
      description: this.prodDescription,
      material: this.prodMaterial || undefined,
      price: this.prodPrice,
      categoryId: this.prodCategoryId,
      status: this.prodStatus,
      ...this.imagePayload(),
    };
    this.saving.set(true);

    if (!this.editingProductId) {
      this.api.adminCreateProduct(dto).subscribe({
        next: created => {
          this.saving.set(false);
          this.toast.success('Đã tạo sản phẩm. Hãy thêm biến thể cho sản phẩm.');
          this.editingProductId = created.id;
          this.loadProducts();
          this.loadVariants();
        },
        error: err => { this.saving.set(false); this.toast.error(err.error?.message || 'Không thể lưu sản phẩm.'); },
      });
      return;
    }

    const changed = Object.keys(this.variantEdits).filter(id => this.isVariantChanged(id));
    const productId = this.editingProductId;
    const variantCalls = changed.map(id => {
      const e = this.variantEdits[id];
      return this.api.adminUpdateVariant(productId, id, {
        sku: e.sku.trim(), size: e.size.trim(), color: e.color.trim(), price: Number(e.price), status: e.status,
      });
    });
    forkJoin([this.api.adminUpdateProduct(productId, dto), ...variantCalls]).subscribe({
      next: () => {
        this.saving.set(false);
        this.productDrawerOpen.set(false);
        this.toast.success('Đã cập nhật sản phẩm.');
        this.loadProducts();
      },
      error: err => { this.saving.set(false); this.toast.error(err.error?.message || 'Không thể lưu sản phẩm.'); },
    });
  }

  /** Tách ảnh: URL thường gửi qua images, ảnh tải lên gửi qua imageMediaIds (giữ thứ tự hiển thị). */
  imagePayload(): { images: string[]; imageMediaIds: string[] } {
    const list = this.prodImages();
    return {
      images: list.filter(url => !this.mediaIdByUrl.has(url)),
      imageMediaIds: [...list.filter(url => this.mediaIdByUrl.has(url)).map(url => this.mediaIdByUrl.get(url)!), ...this.pendingMediaIds],
    };
  }

  private isVariantChanged(id: string): boolean {
    const a = this.variantEdits[id]; const b = this.variantOriginals[id];
    return !!a && !!b && (a.sku !== b.sku || a.size !== b.size || a.color !== b.color || Number(a.price) !== b.price || a.status !== b.status);
  }

  startAddVariant(): void {
    this.varSku = ''; this.varSize = 'M'; this.varColor = ''; this.varPrice = this.prodPrice; this.varStock = 0;
    this.showAddVariant.set(true);
  }

  addVariant(): void {
    if (!this.editingProductId || !this.varSku.trim() || !this.varSize.trim() || !this.varColor.trim()) {
      this.toast.warning('Vui lòng điền đủ SKU, size và màu sắc.');
      return;
    }
    this.savingVariant.set(true);
    this.api.adminCreateVariant(this.editingProductId, {
      sku: this.varSku.trim(), size: this.varSize.trim(), color: this.varColor.trim(),
      price: this.varPrice, stockOnHand: this.varStock,
    }).subscribe({
      next: () => {
        this.savingVariant.set(false);
        this.showAddVariant.set(false);
        this.toast.success('Đã thêm biến thể mới.');
        this.loadVariants();
        this.loadProducts();
      },
      error: err => { this.savingVariant.set(false); this.toast.error(err.error?.message || 'Không thể tạo biến thể.'); },
    });
  }

  // --- Lưu trữ ---
  askArchive(product: ProductSummary): void { this.archiveTarget.set(product); }
  confirmArchive(): void {
    const target = this.archiveTarget();
    if (!target) return;
    this.archiving.set(true);
    this.api.adminUpdateProduct(target.id, { status: 'ARCHIVED' }).subscribe({
      next: () => {
        this.archiving.set(false);
        this.archiveTarget.set(null);
        this.toast.success('Đã lưu trữ sản phẩm.');
        this.loadProducts();
      },
      error: err => { this.archiving.set(false); this.toast.error(err.error?.message || 'Không thể lưu trữ sản phẩm.'); },
    });
  }

  // --- Danh mục ---
  openCreateCategory(): void {
    this.editingCategoryId = ''; this.catName = ''; this.catSlug = ''; this.catStatus = 'ACTIVE'; this.catParentId = null;
    this.categoryDrawerOpen.set(true);
  }

  openEditCategory(cat: Category): void {
    this.editingCategoryId = cat.id; this.catName = cat.name; this.catSlug = cat.slug;
    this.catStatus = cat.status || 'ACTIVE'; this.catParentId = cat.parentId || null;
    this.categoryDrawerOpen.set(true);
  }

  saveCategory(): void {
    if (!this.catName.trim() || !this.catSlug.trim()) {
      this.toast.warning('Vui lòng nhập tên và slug của danh mục.');
      return;
    }
    this.savingCat.set(true);
    const done = (message: string) => { this.savingCat.set(false); this.categoryDrawerOpen.set(false); this.toast.success(message); this.loadCategories(); };
    const fail = (fallback: string) => (err: { error?: { message?: string } }) => { this.savingCat.set(false); this.toast.error(err.error?.message || fallback); };
    if (this.editingCategoryId) {
      this.api.updateCategory(this.editingCategoryId, {
        name: this.catName.trim(), slug: this.catSlug.trim(), status: this.catStatus, parentId: this.catParentId || null,
      }).subscribe({ next: () => done('Đã cập nhật danh mục.'), error: fail('Không thể cập nhật danh mục.') });
    } else {
      this.api.createCategory({
        name: this.catName.trim(), slug: this.catSlug.trim(), status: this.catStatus, parentId: this.catParentId || undefined,
      }).subscribe({ next: () => done('Đã tạo danh mục mới.'), error: fail('Không thể tạo danh mục.') });
    }
  }
}
