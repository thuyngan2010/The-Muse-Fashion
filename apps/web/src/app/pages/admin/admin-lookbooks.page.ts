import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Lookbook, ProductSummary } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';

type HotspotForm = { productId: string; x: number; y: number };

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="lookbook-admin">
      <header><div><h1>Lookbook</h1><p>Tạo bộ sưu tập, gắn sản phẩm vào ảnh và xuất bản.</p></div>
        <button type="button" class="btn-primary" (click)="newLookbook()">+ Tạo Lookbook</button></header>
      @if (loading()) { <p>Đang tải Lookbook...</p> }
      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="grid">
        @for (item of lookbooks(); track item.id) {
          <article>
            @if (item.mainImageUrl) { <img [src]="item.mainImageUrl" [alt]="item.title" /> }
            <div class="card-body"><strong>{{ item.title }}</strong><span>{{ item.status }}</span>
              <button type="button" class="btn-outline" (click)="editLookbook(item.id)">Chỉnh sửa</button></div>
          </article>
        }
      </div>
      @if (editing()) {
        <form (ngSubmit)="save()" class="editor">
          <h2>{{ editingId ? 'Chỉnh sửa Lookbook' : 'Tạo Lookbook' }}</h2>
          <label>Tiêu đề *<input name="title" [(ngModel)]="title" maxlength="200" required /></label>
          <label>Mô tả<textarea name="description" [(ngModel)]="description" maxlength="5000"></textarea></label>
          <label>Trạng thái<select name="status" [(ngModel)]="status">
            <option value="DRAFT">Bản nháp</option><option value="PUBLISHED">Xuất bản</option><option value="HIDDEN">Ẩn</option>
          </select></label>
          <label>Thẻ, cách nhau bằng dấu phẩy<input name="tags" [(ngModel)]="tags" /></label>
          <label>Ảnh Lookbook *<input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="uploading()" (change)="upload($event)" /></label>
          @if (uploading()) { <p>Đang tải ảnh...</p> }
          @if (imageUrl) { <img class="preview" [src]="imageUrl" alt="Ảnh Lookbook" /> }
          <h3>Điểm gắn sản phẩm</h3>
          <p>Tọa độ X và Y tính theo phần trăm chiều rộng, chiều cao của ảnh.</p>
          @for (point of items; track $index; let i = $index) {
            <div class="point">
              <label>Sản phẩm<select [name]="'product' + i" [(ngModel)]="point.productId" required>
                <option value="">Chọn sản phẩm</option>
                @for (product of products(); track product.id) { <option [value]="product.id">{{ product.name }}</option> }
                @if (!hasProduct(point.productId) && point.productId) { <option [value]="point.productId">{{ point.productId }}</option> }
              </select></label>
              <label>X %<input type="number" [name]="'x' + i" [(ngModel)]="point.x" min="0" max="100" required /></label>
              <label>Y %<input type="number" [name]="'y' + i" [(ngModel)]="point.y" min="0" max="100" required /></label>
              <button type="button" class="btn-danger" (click)="items.splice(i, 1)">Xóa</button>
            </div>
          }
          <button type="button" class="btn-outline" (click)="items.push({productId: '', x: 50, y: 50})">+ Gắn sản phẩm</button>
          <div class="actions"><button type="button" class="btn-outline" (click)="editing.set(false)">Hủy</button>
            <button type="submit" class="btn-primary" [disabled]="saving() || uploading()">{{ saving() ? 'Đang lưu...' : 'Lưu Lookbook' }}</button></div>
        </form>
      }
    </section>
  `,
  styles: [`
    .lookbook-admin{padding:28px;max-width:1120px;margin:auto;color:#242424}
    header,.actions{display:flex;justify-content:space-between;align-items:center;gap:16px}
    h1{margin:0;font-size:30px}p{color:var(--color-muted)}.error{color:#b42318}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin:24px 0}
    article{border:1px solid #e7e0d8;background:#fff}article img{width:100%;height:180px;object-fit:cover}
    .card-body{display:flex;align-items:center;gap:10px;padding:12px;flex-wrap:wrap}.card-body strong{flex:1 1 100%}
    .card-body span{font-size:12px;color:var(--color-muted)}.card-body button{margin-left:auto}
    .editor{border:1px solid #e7e0d8;background:#fff;padding:22px;display:grid;gap:14px}
    label{display:grid;gap:6px}input,select,textarea{padding:10px;border:1px solid #cfc8c0;border-radius: var(--radius-control);font:inherit;width:100%;box-sizing:border-box}
    .preview{max-width:340px;max-height:240px;object-fit:contain}.point{display:grid;grid-template-columns:minmax(180px,2fr) 1fr 1fr auto;gap:10px;align-items:end}
    @media(max-width:700px){.point{grid-template-columns:1fr 1fr}.point label:first-child{grid-column:1/-1}}

    .lookbook-admin { padding:0; } header,.actions { flex-wrap:wrap; }
    article,.editor { border-radius:var(--radius-card); box-shadow:var(--shadow-card); }
    article { overflow:hidden; } article img { display:block; }
    .card-body { padding:20px; } .card-body span { padding:4px 10px; background:var(--color-accent-soft); color:var(--color-accent); border-radius:999px; font-weight:600; }
    .editor { margin-top:24px; gap:20px; scroll-margin-top:24px; }
    .editor h2,.editor h3 { margin:0; } .editor label { font-size:.875rem; font-weight:500; }
    .actions { border-top:1px solid var(--color-divider); padding-top:20px; justify-content:flex-end; }
    .grid { grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr)); }
    @media(max-width:600px) { .editor { padding:16px; } }


  `],
})
export class AdminLookbooksPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
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
    this.scrollToEditor();
  }
  editLookbook(id: string): void {
    this.api.adminGetLookbook(id).subscribe({
      next: item => {
        this.editingId = id; this.title = item.title; this.description = item.description;
        this.status = item.status; this.tags = (item.tags || []).join(', ');
        this.mainMediaId = item.mainMediaId || ''; this.imageUrl = item.mainImageUrl || '';
        this.items = (item.items || []).map(p => ({ productId: p.productId, x: Math.round(p.x * 100), y: Math.round(p.y * 100) }));
        this.editing.set(true);
        this.scrollToEditor();
      },
      error: err => this.toast.error(err.error?.message || 'Không thể tải chi tiết Lookbook.'),
    });
  }
  hasProduct(id: string): boolean { return this.products().some(p => p.id === id); }
  private scrollToEditor(): void {
    requestAnimationFrame(() => document.querySelector('.editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
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
