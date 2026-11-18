import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Lookbook, ProductSummary } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { AdminDrawerComponent } from '../../components/admin-drawer.component';
import { AdminCatalogTabsComponent } from '../../components/admin-catalog-tabs.component';
import { lookbookStatusLabel } from '../../shared/labels';

type HotspotForm = { productId: string; x: number; y: number };

@Component({
  standalone: true,
  imports: [FormsModule, AdminDrawerComponent, AdminCatalogTabsComponent],
  template: `
    <section class="lb">
      <fc-admin-catalog-tabs active="lookbooks">
        <button type="button" class="btn-primary" (click)="newLookbook()">+ Tạo Lookbook</button>
      </fc-admin-catalog-tabs>

      @if (loading()) {
        <div class="state-box"><div class="spinner"></div><p>Đang tải Lookbook…</p></div>
      } @else if (error()) {
        <div class="state-box"><p>{{ error() }}</p><button type="button" class="btn-outline" (click)="load()">Thử lại</button></div>
      } @else if (lookbooks().length === 0) {
        <div class="state-box"><p>Chưa có Lookbook nào. Hãy tạo Lookbook đầu tiên.</p></div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th class="c-img"><span class="sr-only">Ảnh</span></th><th>Lookbook</th><th>Thẻ</th><th>Trạng thái</th><th class="c-act">Thao tác</th></tr></thead>
            <tbody>
              @for (item of lookbooks(); track item.id) {
                <tr>
                  <td class="c-img"><div class="thumb">@if (item.mainImageUrl) { <img [src]="item.mainImageUrl" [alt]="item.title" /> }</div></td>
                  <td>
                    <strong class="p-name">{{ item.title }}</strong>
                    <span class="p-sub">{{ item.description || '—' }}</span>
                  </td>
                  <td>
                    @if (item.tags && item.tags.length > 0) { <div class="tags">@for (tag of item.tags; track tag) { <span class="tag">{{ tag }}</span> }</div> }
                    @else { <span class="muted">—</span> }
                  </td>
                  <td><span class="badge" [class]="'badge s-' + item.status.toLowerCase()">{{ lookbookStatusLabel(item.status) }}</span></td>
                  <td class="c-act">
                    <button type="button" class="icon-btn" (click)="editLookbook(item.id)" [attr.aria-label]="'Sửa Lookbook ' + item.title" title="Sửa">
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <fc-admin-drawer [isOpen]="editing()" [eyebrow]="editingId ? 'Chỉnh sửa' : 'Tạo mới'" [title]="editingId ? 'Chỉnh sửa Lookbook' : 'Tạo Lookbook'"
      width="640px" (close)="editing.set(false)">
      <form class="dform" (ngSubmit)="save()" autocomplete="off">
        <label>Tiêu đề *<input name="title" [(ngModel)]="title" maxlength="200" required /></label>
        <label>Mô tả<textarea name="description" rows="3" [(ngModel)]="description" maxlength="5000"></textarea></label>
        <div class="two">
          <label>Trạng thái
            <select name="status" [(ngModel)]="status">
              <option value="DRAFT">{{ lookbookStatusLabel('DRAFT') }}</option>
              <option value="PUBLISHED">{{ lookbookStatusLabel('PUBLISHED') }}</option>
              <option value="HIDDEN">{{ lookbookStatusLabel('HIDDEN') }}</option>
            </select>
          </label>
          <label>Thẻ (cách nhau bằng dấu phẩy)<input name="tags" [(ngModel)]="tags" /></label>
        </div>
        <label>Ảnh Lookbook *
          <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploading()" (change)="upload($event)" />
        </label>
        @if (uploading()) { <p class="hint">Đang tải ảnh…</p> }
        @if (imageUrl) { <img class="preview" [src]="imageUrl" alt="Ảnh Lookbook" /> }

        <fieldset class="block">
          <legend>Sản phẩm gắn trên ảnh</legend>
          <p class="hint">Tọa độ X và Y tính theo phần trăm chiều rộng, chiều cao của ảnh.</p>
          @for (point of items; track $index; let i = $index) {
            <div class="point">
              <label>Sản phẩm
                <select [name]="'product' + i" [(ngModel)]="point.productId" required>
                  <option value="">Chọn sản phẩm</option>
                  @for (product of products(); track product.id) { <option [value]="product.id">{{ product.name }}</option> }
                  @if (point.productId && !hasProduct(point.productId)) { <option [value]="point.productId">{{ point.productId }}</option> }
                </select>
              </label>
              <label>X %<input type="number" [name]="'x' + i" [(ngModel)]="point.x" min="0" max="100" required /></label>
              <label>Y %<input type="number" [name]="'y' + i" [(ngModel)]="point.y" min="0" max="100" required /></label>
              <button type="button" class="btn-outline small" (click)="items.splice(i, 1)">Xóa</button>
            </div>
          }
          <button type="button" class="btn-outline" (click)="items.push({ productId: '', x: 50, y: 50 })">+ Gắn sản phẩm</button>
        </fieldset>
      </form>
      <div drawer-footer>
        <button type="button" class="btn-outline" (click)="editing.set(false)">Hủy</button>
        <button type="button" class="btn-primary" [disabled]="saving() || uploading()" (click)="save()">{{ saving() ? 'Đang lưu…' : 'Lưu Lookbook' }}</button>
      </div>
    </fc-admin-drawer>
  `,
  styles: [`
    :host { display: block; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .muted { color: var(--ui-subtle); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--admin-line); background: var(--ui-bg); }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
    .tbl th { text-align: left; padding: 12px 14px; background: var(--ui-bg-soft); font: 700 11px/16px var(--font-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--ui-ink-soft); border-bottom: 1px solid var(--admin-line); }
    .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--admin-line-soft); vertical-align: middle; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: var(--admin-canvas); }
    .c-img { width: 88px; } .c-act { text-align: right; white-space: nowrap; }
    .thumb { width: 64px; height: 80px; background: var(--ui-bg-image); overflow: hidden; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .p-name { display: block; font-weight: 600; overflow-wrap: anywhere; }
    .p-sub { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; font-size: 12px; color: var(--ui-subtle); }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag { padding: 2px 8px; background: var(--ui-bg-soft); font-size: 11px; color: var(--ui-ink-soft); }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 11px/16px var(--font-sans); white-space: nowrap; }
    .s-published { background: var(--ui-success-bg); color: var(--ui-success); }
    .s-draft { background: var(--ui-warning-bg); color: var(--ui-warning); }
    .s-hidden, .s-archived { background: var(--ui-bg-soft); color: var(--ui-ink-soft); }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid transparent; border-radius: 2px; background: none; color: var(--ui-ink-soft); cursor: pointer; }
    .icon-btn:hover { background: var(--ui-bg-soft); border-color: var(--admin-line); color: var(--ui-ink); }
    .state-box { text-align: center; padding: 56px 16px; color: var(--ui-ink-soft); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .spinner { width: 30px; height: 30px; border: 3px solid var(--ui-line-soft); border-top-color: var(--ui-ink); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .dform { display: flex; flex-direction: column; gap: 16px; }
    .dform label { display: flex; flex-direction: column; gap: 6px; font: 600 12px/16px var(--font-sans); color: var(--ui-ink-soft); }
    .dform input, .dform select, .dform textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: 2px; background: var(--ui-bg); font: 400 14px/20px var(--font-sans); color: var(--ui-ink); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .preview { max-width: 100%; max-height: 260px; object-fit: contain; background: var(--ui-bg-image); }
    .block { border: 1px solid var(--admin-line); padding: 14px 16px 16px; margin: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .block legend { padding: 0 6px; font: 700 12px/16px var(--font-sans); }
    .hint { margin: 0; font-size: 12px; color: var(--ui-subtle); }
    .point { display: grid; grid-template-columns: minmax(160px, 2fr) 1fr 1fr auto; gap: 10px; align-items: end; }
    .btn-outline.small { padding: 9px 12px; font-size: 12px; }
    @media (max-width: 600px) { .two { grid-template-columns: 1fr; } .point { grid-template-columns: 1fr 1fr; } .point label:first-child { grid-column: 1 / -1; } }
  `],
})
export class AdminLookbooksPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly lookbookStatusLabel = lookbookStatusLabel;
  readonly lookbooks = signal<Lookbook[]>([]);
  readonly products = signal<ProductSummary[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editing = signal(false);
  readonly error = signal('');
  editingId = '';
  title = '';
  description = '';
  status: Lookbook['status'] = 'DRAFT';
  tags = '';
  mainMediaId = '';
  imageUrl = '';
  items: HotspotForm[] = [];

  ngOnInit(): void {
    this.load();
    this.api.adminListProducts('PUBLISHED', 1, 50).subscribe({ next: res => this.products.set(res.items) });
  }
  load(): void {
    this.loading.set(true);
    this.api.adminListLookbooks().subscribe({
      next: res => { this.lookbooks.set(res.items); this.loading.set(false); this.error.set(''); },
      error: err => { this.loading.set(false); this.error.set(err.error?.message || 'Không thể tải Lookbook.'); },
    });
  }
  newLookbook(): void {
    this.editingId = ''; this.title = ''; this.description = ''; this.status = 'DRAFT';
    this.tags = ''; this.mainMediaId = ''; this.imageUrl = ''; this.items = [];
    this.editing.set(true);
  }
  editLookbook(id: string): void {
    this.api.adminGetLookbook(id).subscribe({
      next: item => {
        this.editingId = id; this.title = item.title; this.description = item.description;
        this.status = item.status; this.tags = (item.tags || []).join(', ');
        this.mainMediaId = item.mainMediaId || ''; this.imageUrl = item.mainImageUrl || '';
        this.items = (item.items || []).map(p => ({ productId: p.productId, x: Math.round(p.x * 100), y: Math.round(p.y * 100) }));
        this.editing.set(true);
      },
      error: err => this.toast.error(err.error?.message || 'Không thể tải chi tiết Lookbook.'),
    });
  }
  hasProduct(id: string): boolean { return this.products().some(p => p.id === id); }
  upload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.api.uploadImage(file, 'lookbook').subscribe({
      next: media => { this.mainMediaId = media.id; this.imageUrl = media.url || ''; this.uploading.set(false); },
      error: err => { this.uploading.set(false); this.toast.error(err.error?.message || 'Không thể tải ảnh.'); },
    });
  }
  save(): void {
    if (!this.title.trim() || !this.mainMediaId) { this.toast.warning('Cần tiêu đề và ảnh Lookbook.'); return; }
    if (this.status === 'PUBLISHED' && this.items.length === 0) { this.toast.warning('Cần gắn ít nhất một sản phẩm để xuất bản.'); return; }
    if (this.items.some(p => !p.productId || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100)) {
      this.toast.warning('Điểm gắn sản phẩm cần tọa độ từ 0 đến 100%.'); return;
    }
    const dto = { title: this.title.trim(), description: this.description.trim(), status: this.status,
      mainMediaId: this.mainMediaId, tags: this.tags.split(',').map(x => x.trim()).filter(Boolean),
      items: this.items.map(p => ({ productId: p.productId, x: p.x / 100, y: p.y / 100 })) };
    this.saving.set(true);
    const request = this.editingId ? this.api.adminUpdateLookbook(this.editingId, dto) : this.api.adminCreateLookbook(dto);
    request.subscribe({
      next: () => { this.saving.set(false); this.editing.set(false); this.toast.success('Đã lưu Lookbook.'); this.load(); },
      error: err => { this.saving.set(false); this.toast.error(err.error?.message || 'Không thể lưu Lookbook.'); },
    });
  }
}
