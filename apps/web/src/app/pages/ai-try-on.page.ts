import { watchAiJob } from '../services/ai-polling';
import { PaginationComponent, PaginationState } from '../components/pagination.component';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { AiJob, ProductSummary } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { Subscription } from 'rxjs';
import { AiJobDetailsComponent } from '../components/ai-job-details.component';
import { STORE_AI_TRY_ON_CONTENT } from '../shared/store-content';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

@Component({
  standalone: true,
  imports: [PaginationComponent, RouterLink, CurrencyPipe, DatePipe, FormsModule, AiJobDetailsComponent],
  template: `
    <main class="try-on-page">
      <header class="hero">
        <span class="eyebrow">PHÒNG THỬ ĐỒ KỸ THUẬT SỐ</span>
        <h1>Thử trước khi chọn</h1>
        <p>Chọn trang phục bạn yêu thích và khám phá diện mạo mới của chính mình. Trải nghiệm trực quan tối giản, không cần số đo phức tạp.</p>
        <a routerLink="/ai/mix-match" class="text-link">Khám phá Mix &amp; Match <span aria-hidden="true">↗</span></a>
      </header>

      <section class="studio-grid" aria-label="Phòng thử đồ">
        <article class="studio-card photo-card">
          <div class="card-heading">
            <div><span class="step-label">BƯỚC 01</span><h2>Bắt đầu bằng ảnh của bạn</h2></div>
            @if (previewUrl()) {
              <div class="photo-actions">
                <button type="button" (click)="fileInput.click()">ĐỔI ẢNH</button><span aria-hidden="true">/</span>
                <button type="button" (click)="clearUpload()">XÓA</button>
              </div>
            }
          </div>
          <input #fileInput type="file" accept="image/jpeg,image/png,image/webp" [disabled]="generating() || uploading()" hidden (change)="onFileSelected($event)" />
          <button type="button" class="upload-canvas" (click)="fileInput.click()" [disabled]="generating() || uploading()">
            @if (previewUrl()) { <img [src]="previewUrl()" alt="Ảnh toàn thân bạn đã tải lên" /> }
            @else {
              <span class="upload-mark" aria-hidden="true">＋</span><strong>TẢI ẢNH TOÀN THÂN</strong><small>PNG, JPG hoặc WEBP · tối đa 10MB</small>
            }
            @if (uploading()) { <span class="upload-overlay" role="status"><span class="spinner"></span>Đang tải và kiểm tra ảnh...</span> }
          </button>
          <button type="button" class="outline-button upload-other" (click)="fileInput.click()" [disabled]="generating() || uploading()">TẢI ẢNH KHÁC TỪ MÁY <span aria-hidden="true">↗</span></button>
          @if (uploadError()) {
            <div class="inline-message error" role="alert"><span>{{ uploadError() }}</span><button type="button" (click)="retryUpload()">THỬ TẢI LẠI</button></div>
          } @else if (uploadedMediaId()) { <p class="inline-message success" role="status">Ảnh đã sẵn sàng để thử đồ.</p> }
          <aside class="tip-box"><strong>Mẹo nhỏ</strong><p>{{ content.tips }}</p></aside>
          <p class="privacy-note"><span aria-hidden="true">◇</span> {{ content.privacy }}</p>
        </article>

        <article class="studio-card outfit-card">
          <div class="card-heading">
            <div><span class="step-label">BƯỚC 02</span><h2>Bạn muốn thử gì hôm nay?</h2></div>
            <a href="#outfit-selection" class="wardrobe-link" data-ui-only>＋ MỞ TỦ ĐỒ</a>
          </div>
          <p class="card-intro">Chọn một thiết kế MUSE để kết hợp với ảnh của bạn.</p>
          <a href="#outfit-selection" class="solid-button collection-button">CHỌN TRANG PHỤC TỪ BST <span aria-hidden="true">↓</span></a>
          <div id="outfit-selection" class="outfit-selection">
            <div class="selection-title"><span>TRANG PHỤC ĐÃ CHỌN</span>@if (getSelectedProduct()) { <strong>01</strong> }</div>
            @if (loadingProducts()) {
              <div class="state-panel compact" role="status"><span class="spinner"></span>Đang tải danh sách trang phục...</div>
            } @else if (productError()) {
              <div class="state-panel compact error" role="alert"><p>{{ productError() }}</p><button type="button" class="outline-button" (click)="loadProducts()">THỬ LẠI</button></div>
            } @else if (getSelectedProduct(); as selected) {
              <div class="selected-product">
                <div class="selected-thumb">@if (selected.images.length) { <img [src]="selected.images[0]" [alt]="selected.name" /> }</div>
                <div><h3>{{ selected.name }}</h3><p>{{ selected.price | currency:'VND':'symbol':'1.0-0' }}</p></div>
                <a [routerLink]="['/products', selected.slug]" aria-label="Xem chi tiết sản phẩm đã chọn">↗</a>
              </div>
            } @else { <p class="empty-selection">Chưa có trang phục để lựa chọn.</p> }
            <div class="products-strip" aria-label="Chọn trang phục">
              @for (product of catalogProducts(); track product.id) {
                <button type="button" class="product-option" [class.active]="selectedProductId() === product.id" (click)="selectedProductId.set(product.id)" [attr.aria-pressed]="selectedProductId() === product.id">
                  @if (product.images.length) { <img [src]="product.images[0]" [alt]="product.name" /> }<span>{{ product.name }}</span>
                </button>
              }
            </div>
          </div>
          <div class="measure-grid" data-ui-only>
            <label>CHIỀU CAO <span><input type="number" min="0" [(ngModel)]="height" name="height" placeholder="—" /> cm</span></label>
            <label>CÂN NẶNG <span><input type="number" min="0" [(ngModel)]="weight" name="weight" placeholder="—" /> kg</span></label>
          </div>
          <label class="consent-row"><input type="checkbox" [(ngModel)]="consentAccepted" name="consent" /><span>Tôi đồng ý xử lý ảnh để tạo bản thử đồ. {{ content.privacy }}</span></label>
          <div class="ready-panel">
            <div><span>SẴN SÀNG TẠO DIỆN MẠO</span><p>{{ content.processingTime }}</p></div>
            <button type="button" class="try-button" [disabled]="generating() || uploading() || !selectedProductId() || !uploadedMediaId() || !consentAccepted || job()?.state === 'PENDING' || job()?.state === 'PROCESSING'" (click)="startTryOn()">{{ generating() ? 'ĐANG KHỞI TẠO...' : 'THỬ ĐỒ NGAY' }} <span aria-hidden="true">↗</span></button>
          </div>
          @if (generationError()) { <p class="inline-message error" role="alert">{{ generationError() }}</p> }
          @if (pollingError()) { <p class="inline-message error" role="status">{{ pollingError() }}</p> }
        </article>
      </section>

      <section class="result-section" aria-labelledby="result-title">
        <div class="section-heading"><span class="section-index">KẾT QUẢ</span><h2 id="result-title">Diện mạo của bạn</h2></div>
        @if (job(); as currentJob) {
          <div class="result-shell">
            <fc-ai-job-details [job]="currentJob" />
            @if (currentJob.state === 'PENDING' || currentJob.state === 'PROCESSING') {
              <div class="state-panel processing" role="status"><span class="spinner large"></span><h3>Đang tạo bản thử đồ</h3><p>Vui lòng giữ trang này mở trong khi kết quả được hoàn tất.</p></div>
            } @else if (currentJob.state === 'FAILED' || currentJob.state === 'EXPIRED') {
              <div class="state-panel error" role="alert"><h3>Không thể tạo ảnh thử đồ</h3><p>{{ currentJob.errorMessage || 'Tác vụ đã kết thúc hoặc hết hạn. Vui lòng thử lại.' }}</p><button type="button" class="outline-button" (click)="resetJob()">THỬ LẠI SET</button></div>
            } @else if (currentJob.state === 'COMPLETED') {
              <div class="completed-result">
                <div class="result-gallery">@for (url of currentJob.resultUrls; track url) { <img [src]="url" alt="Kết quả thử đồ của bạn" /> }</div>
                <div class="result-actions">
                  <button type="button" class="outline-button" data-ui-only>SO SÁNH BEFORE/AFTER</button>
                  <button type="button" class="outline-button" data-ui-only (click)="resetJob()">THỬ LẠI SET</button>
                  @if (getSelectedProduct(); as selected) { <a [routerLink]="['/products', selected.slug]" class="solid-button" data-ui-only>MUA TRỌN SET NÀY</a> }
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="result-empty"><span aria-hidden="true">◇</span><h3>Kết quả sẽ xuất hiện tại đây</h3><p>Tải ảnh, chọn trang phục và nhấn “Thử đồ ngay” để bắt đầu.</p></div>
        }
      </section>

      <section class="trending-section" aria-labelledby="trending-title">
        <div class="section-heading horizontal"><div><span class="section-index">GỢI Ý PHONG CÁCH</span><h2 id="trending-title">Các bản phối thịnh hành</h2></div><a routerLink="/products" class="text-link">XEM TẤT CẢ <span aria-hidden="true">↗</span></a></div>
        @if (loadingProducts()) { <div class="state-panel" role="status"><span class="spinner"></span>Đang tải sản phẩm...</div> }
        @else {
          <div class="trending-grid">
            @for (product of catalogProducts().slice(0, 3); track product.id) {
              <article class="trend-card">
                <a [routerLink]="['/products', product.slug]" class="trend-image">@if (product.images.length) { <img [src]="product.images[0]" [alt]="product.name" /> }</a>
                <div class="trend-info"><h3>{{ product.name }}</h3><p>{{ product.price | currency:'VND':'symbol':'1.0-0' }}</p></div>
                <button type="button" (click)="selectTrendingProduct(product.id)">THỬ SET NÀY <span aria-hidden="true">↗</span></button>
              </article>
            }
          </div>
        }
      </section>

      <section class="history-section" aria-labelledby="history-title">
        <header class="history-title-row">
          <div><span class="section-index">AI STUDIO</span><h2 id="history-title">Lịch sử thử đồ</h2><p>Xem lại các phiên đã tạo từ dữ liệu thật của tài khoản.</p></div>
          <button type="button" class="outline-button" (click)="loadJobHistory()" [disabled]="loadingHistory()">LÀM MỚI</button>
        </header>
        <div class="history-toolbar" data-ui-only>
          <label class="search-box"><span aria-hidden="true">⌕</span><input type="search" [ngModel]="historySearch()" (ngModelChange)="historySearch.set($event)" name="historySearch" placeholder="Tìm theo loại hoặc trạng thái" /></label>
          <div class="filter-tabs" role="group" aria-label="Lọc lịch sử">
            @for (filter of historyFilters; track filter.value) { <button type="button" [class.active]="historyFilter() === filter.value" (click)="historyFilter.set(filter.value)">{{ filter.label }}</button> }
          </div>
        </div>
        @if (loadingHistory()) { <div class="state-panel" role="status"><span class="spinner"></span>Đang tải lịch sử thử đồ...</div> }
        @else if (historyError()) { <div class="state-panel error" role="alert"><p>{{ historyError() }}</p><button type="button" class="outline-button" (click)="loadJobHistory()">THỬ LẠI</button></div> }
        @else if (filteredJobHistory().length === 0) { <div class="state-panel empty"><h3>Chưa có phiên phù hợp</h3><p>Các kết quả thử đồ của bạn sẽ xuất hiện tại đây.</p></div> }
        @else {
          <div class="history-grid">
            @for (historyJob of filteredJobHistory(); track historyJob.id) {
              <article class="history-card">
                <div class="history-image">
                  @if (historyJob.resultUrls.length) { <img [src]="historyJob.resultUrls[0]" alt="Kết quả của phiên thử đồ" /> } @else { <span aria-hidden="true">◇</span> }
                  <span class="history-state">{{ historyJob.state }}</span>
                </div>
                <div class="history-content"><span class="history-kind">{{ historyJob.type === 'TRY_ON' ? 'THỬ ĐỒ' : 'MIX & MATCH' }}</span><h3>Phiên ngày {{ historyJob.createdAt | date:'dd/MM/yyyy' }}</h3><p>{{ historyJob.createdAt | date:'HH:mm' }}</p><button type="button" (click)="selectHistoricalJob(historyJob)">XEM CHI TIẾT <span aria-hidden="true">↗</span></button></div>
              </article>
            }
          </div>
        }
        <fc-pagination label="Lịch sử tạo ảnh" [page]="historyPagination.page()" [total]="historyPagination.total()" [limit]="historyPagination.limit" [loading]="loadingHistory()" (pageChange)="historyPaginationChanged($event)" />
      </section>

      <section class="commitments" aria-label="Cam kết sử dụng">
        @for (item of content.commitments; track item.title; let index = $index) { <article><span>0{{ index + 1 }}</span><div><h3>{{ item.title }}</h3><p>{{ item.description }}</p></div></article> }
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;color:#171513;background:#fbfaf8}*{box-sizing:border-box}button,input{font:inherit}.try-on-page{max-width:1280px;margin:auto;padding:54px 48px 96px}.hero{max-width:770px;margin:0 auto 48px;text-align:center}.eyebrow,.step-label,.section-index{display:inline-block;color:#9b5663;font-size:11px;font-weight:700;letter-spacing:.2em}.eyebrow{padding:8px 13px;background:#f4dde2}.hero h1,.card-heading h2,.section-heading h2,.history-title-row h2{font-family:'Times New Roman',Georgia,serif;font-weight:400}.hero h1{margin:18px 0 12px;font-size:clamp(46px,6vw,76px);line-height:.98;letter-spacing:-.035em}.hero p{max-width:660px;margin:auto;color:#625d58;font-size:15px;line-height:1.75}.text-link{display:inline-flex;gap:8px;align-items:center;margin-top:18px;color:#171513;font-size:12px;font-weight:700;letter-spacing:.12em;text-decoration:none;border-bottom:1px solid;padding-bottom:3px}.studio-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.studio-card{min-width:0;padding:30px;border:1px solid #cbc5bf;background:#fff}.card-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:24px}.card-heading h2{margin:8px 0 0;font-size:31px;line-height:1.05}.photo-actions{display:flex;gap:7px;padding-top:4px;font-size:10px;letter-spacing:.1em;white-space:nowrap}.photo-actions button,.wardrobe-link{padding:0;color:#171513;background:none;border:0;border-bottom:1px solid;text-decoration:none;cursor:pointer}.upload-canvas{position:relative;display:flex;width:100%;height:535px;padding:0;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden;color:#211d1a;background:#f0ede9;border:1px solid #ded9d3;cursor:pointer}.upload-canvas img{width:100%;height:100%;object-fit:contain}.upload-mark{font:300 42px/1 Georgia,serif}.upload-canvas strong{font-size:12px;letter-spacing:.14em}.upload-canvas small{color:#77706a;font-size:11px}.upload-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#ffffffe8;font-size:12px}.outline-button,.solid-button,.upload-other{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:0 18px;border:1px solid #1c1917;background:transparent;color:#171513;font-size:11px;font-weight:700;letter-spacing:.12em;text-decoration:none;cursor:pointer}.solid-button{background:#1d1a18;color:#fff}.upload-other{width:100%;margin-top:12px}.inline-message{display:flex;justify-content:space-between;gap:16px;margin:12px 0 0;padding:12px 14px;border-left:3px solid #315d42;background:#edf5ef;font-size:12px}.inline-message.error{color:#7f2424;border-color:#9f3434;background:#fbefef}.inline-message button{padding:0;border:0;border-bottom:1px solid;background:transparent;font-size:10px;font-weight:700;cursor:pointer}.tip-box{display:grid;grid-template-columns:90px 1fr;gap:14px;margin-top:18px;padding:16px;background:#f8edf0}.tip-box strong{font-family:Georgia,serif;font-size:15px}.tip-box p,.privacy-note{margin:0;color:#6b625d;font-size:11px;line-height:1.55}.privacy-note{margin-top:14px;text-align:center}.wardrobe-link{flex:none;margin-top:4px;font-size:10px;font-weight:700;letter-spacing:.12em}.card-intro{color:#6c655f;font-size:13px;line-height:1.6}.collection-button{width:100%;margin:12px 0 24px}.outfit-selection{padding-top:22px;border-top:1px solid #ded9d4;scroll-margin-top:100px}.selection-title{display:flex;justify-content:space-between;margin-bottom:12px;font-size:10px;font-weight:700;letter-spacing:.15em}.selected-product{display:grid;grid-template-columns:76px 1fr 28px;gap:15px;align-items:center;padding:10px;background:#f7f5f2}.selected-thumb{height:92px;background:#ece8e3}.selected-thumb img{width:100%;height:100%;object-fit:cover}.selected-product h3{margin:0 0 7px;font:400 18px/1.15 Georgia,serif}.selected-product p{margin:0;font-size:12px}.selected-product a{color:#171513;text-decoration:none}.products-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.product-option{padding:0;overflow:hidden;background:#f0ece8;border:1px solid transparent;cursor:pointer}.product-option.active{border-color:#1a1715}.product-option img{display:block;width:100%;aspect-ratio:.78;object-fit:cover}.product-option span{display:block;padding:7px;overflow:hidden;font-size:9px;white-space:nowrap;text-overflow:ellipsis}.measure-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}.measure-grid label{padding:12px;border:1px solid #d4cec8;font-size:9px;font-weight:700;letter-spacing:.12em}.measure-grid label span{display:flex;gap:6px;align-items:baseline;margin-top:8px;color:#6d665f;font-size:11px;letter-spacing:0}.measure-grid input{min-width:0;width:100%;padding:0;border:0;background:transparent;color:#171513;font:400 22px Georgia,serif}.consent-row{display:flex;gap:9px;align-items:flex-start;margin:16px 0;color:#665f59;font-size:11px;line-height:1.5}.consent-row input{margin-top:2px;accent-color:#1d1a18}.ready-panel{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:20px;background:#efc2cb}.ready-panel>div>span{font-size:10px;font-weight:700;letter-spacing:.14em}.ready-panel p{max-width:250px;margin:6px 0 0;font-size:10px;line-height:1.4}.try-button{min-width:180px;min-height:52px;color:#fff;background:#1b1816;border:1px solid #1b1816;font-size:11px;font-weight:700;letter-spacing:.12em;cursor:pointer}.try-button:disabled,button:disabled{opacity:.45;cursor:not-allowed}.result-section,.trending-section,.history-section{margin-top:78px;padding-top:48px;border-top:1px solid #c9c3bd}.section-heading{margin-bottom:26px}.section-heading.horizontal,.history-title-row{display:flex;justify-content:space-between;gap:20px;align-items:flex-end}.section-heading h2,.history-title-row h2{margin:7px 0 0;font-size:43px;line-height:1}.section-heading .text-link{margin:0 0 4px}.result-shell{padding:24px;border:1px solid #cfc9c3;background:#fff}.result-empty,.state-panel{display:flex;min-height:220px;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:30px;border:1px dashed #ccc5bf;text-align:center}.result-empty>span{font-size:38px}.result-empty h3,.state-panel h3{margin:0;font:400 24px Georgia,serif}.result-empty p,.state-panel p{margin:0;color:#6c655e;font-size:13px}.state-panel.compact{min-height:130px}.state-panel.error{color:#7f2424;background:#fff7f7}.spinner{width:24px;height:24px;border:2px solid #d3ccc5;border-top-color:#1d1a18;border-radius:50%;animation:spin .8s linear infinite}.spinner.large{width:42px;height:42px}@keyframes spin{to{transform:rotate(360deg)}}.result-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.result-gallery img{width:100%;max-height:680px;object-fit:contain;background:#eeeae6}.result-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.trending-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.trend-image{display:block;height:490px;overflow:hidden;background:#e9e5e1}.trend-image img{width:100%;height:100%;object-fit:cover;transition:transform .35s}.trend-card:hover img{transform:scale(1.02)}.trend-info{min-height:76px;padding:16px 0 12px;border-bottom:1px solid #d5cfc9}.trend-info h3{margin:0 0 7px;font:400 20px/1.15 Georgia,serif}.trend-info p{margin:0;font-size:12px}.trend-card>button{width:100%;min-height:48px;margin-top:12px;color:#fff;background:#1b1816;border:0;font-size:11px;font-weight:700;letter-spacing:.12em;cursor:pointer}.history-title-row{margin-bottom:28px}.history-title-row p{margin:10px 0 0;color:#6a625c;font-size:13px}.history-toolbar{display:flex;justify-content:space-between;gap:18px;margin-bottom:28px;padding:20px;border:1px solid #cbc5bf;background:#fff}.search-box{display:flex;min-width:320px;align-items:center;gap:8px;padding:0 12px;border:1px solid #d1cbc5}.search-box input{width:100%;height:42px;border:0;outline:0;font-size:12px}.filter-tabs{display:flex;gap:4px;flex-wrap:wrap}.filter-tabs button{padding:0 14px;color:#5f5953;background:transparent;border:0;font-size:10px;font-weight:700;letter-spacing:.1em;cursor:pointer}.filter-tabs button.active{color:#171513;background:#efc2cb}.history-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.history-card{overflow:hidden;border:1px solid #cbc5bf;background:#fff}.history-image{position:relative;display:flex;height:420px;align-items:center;justify-content:center;overflow:hidden;background:#ede9e5}.history-image img{width:100%;height:100%;object-fit:cover}.history-image>span:not(.history-state){font-size:40px}.history-state{position:absolute;top:14px;right:14px;padding:7px 9px;background:#ffffffe8;font-size:9px;font-weight:700;letter-spacing:.1em}.history-content{padding:18px}.history-kind{color:#9b5663;font-size:9px;font-weight:700;letter-spacing:.14em}.history-content h3{margin:8px 0 5px;font:400 21px Georgia,serif}.history-content p{margin:0;color:#6d655f;font-size:11px}.history-content button{width:100%;min-height:44px;margin-top:16px;background:transparent;border:1px solid #1c1917;font-size:10px;font-weight:700;letter-spacing:.12em;cursor:pointer}fc-pagination{display:block;margin-top:30px}.commitments{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:56px;padding-top:40px;border-top:1px solid #c9c3bd}.commitments article{display:flex;gap:13px;padding:16px;border:1px solid #ccc6c0;background:#fff}.commitments article>span{color:#a65e6c;font:italic 17px Georgia,serif}.commitments h3{margin:0 0 5px;font:400 16px Georgia,serif}.commitments p{margin:0;color:#6b645e;font-size:10px;line-height:1.5}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #1b1917;outline-offset:3px}@media(max-width:980px){.try-on-page{padding-inline:24px}.studio-grid{grid-template-columns:1fr}.trend-image{height:380px}.history-grid{grid-template-columns:repeat(2,1fr)}.commitments{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.try-on-page{padding:38px 16px 68px}.hero{margin-bottom:34px}.hero h1{font-size:48px}.studio-card{padding:20px}.card-heading,.ready-panel,.section-heading.horizontal,.history-title-row,.history-toolbar{align-items:stretch;flex-direction:column}.upload-canvas{height:430px}.measure-grid,.trending-grid,.history-grid,.commitments{grid-template-columns:1fr}.products-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.try-button{width:100%}.section-heading h2,.history-title-row h2{font-size:36px}.trend-image,.history-image{height:440px}.search-box{min-width:0;width:100%}.filter-tabs button{min-height:38px}}
  `],
})
export class AiTryOnPage implements OnInit, OnDestroy {
  readonly content = STORE_AI_TRY_ON_CONTENT;
  readonly historyPagination = new PaginationState(12);
  readonly catalogProducts = signal<ProductSummary[]>([]);
  readonly loadingProducts = signal(true);
  readonly productError = signal('');
  readonly selectedProductId = signal('');
  readonly previewUrl = signal('');
  readonly uploadedMediaId = signal('');
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly generating = signal(false);
  readonly generationError = signal('');
  readonly job = signal<AiJob | null>(null);
  readonly jobHistory = signal<AiJob[]>([]);
  readonly loadingHistory = signal(false);
  readonly historyError = signal('');
  readonly pollingError = signal('');
  readonly historyFilter = signal('ALL');
  readonly historyFilters = [
    { label: 'TẤT CẢ', value: 'ALL' }, { label: 'THỬ ĐỒ', value: 'TRY_ON' },
    { label: 'MIX & MATCH', value: 'MIX_MATCH' }, { label: 'HOÀN TẤT', value: 'COMPLETED' },
  ] as const;
  readonly filteredJobHistory = computed(() => {
    const query = this.historySearch().trim().toLowerCase();
    const filter = this.historyFilter();
    return this.jobHistory().filter((item) => {
      const matchesFilter = filter === 'ALL' || item.type === filter || item.state === filter;
      return matchesFilter && (!query || `${item.id} ${item.type} ${item.state} ${item.createdAt}`.toLowerCase().includes(query));
    });
  });
  height: number | null = null;
  weight: number | null = null;
  consentAccepted = false;
  readonly historySearch = signal('');
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private selectedFile?: File;
  private uploadSubscription?: Subscription;
  private pollSubscription?: Subscription;

  ngOnInit(): void {
    this.loadJobHistory();
    const preselectedProduct = this.route.snapshot.queryParams['productId'];
    if (preselectedProduct) this.selectedProductId.set(preselectedProduct);
    this.loadProducts();
  }
  ngOnDestroy(): void { this.uploadSubscription?.unsubscribe(); this.pollSubscription?.unsubscribe(); this.selectedFile = undefined; }
  historyPaginationChanged(page: number): void { this.historyPagination.page.set(page); this.loadJobHistory(); }
  loadProducts(): void {
    this.loadingProducts.set(true); this.productError.set('');
    this.api.products({ limit: 12 }).subscribe({
      next: (res) => { this.catalogProducts.set(res.items); this.loadingProducts.set(false); if (!this.selectedProductId() && res.items.length) this.selectedProductId.set(res.items[0].id); },
      error: () => { this.loadingProducts.set(false); this.productError.set('Không thể tải sản phẩm. Vui lòng thử lại.'); this.toast.error(this.productError()); },
    });
  }
  getSelectedProduct(): ProductSummary | undefined { return this.catalogProducts().find((product) => product.id === this.selectedProductId()); }
  selectTrendingProduct(productId: string): void { this.selectedProductId.set(productId); document.getElementById('outfit-selection')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement; if (!input.files?.length) return;
    const file = input.files[0]; input.value = ''; this.selectedFile = file;
    const reader = new FileReader(); reader.onload = (loadEvent) => { if (this.selectedFile === file) this.previewUrl.set(loadEvent.target?.result as string); }; reader.readAsDataURL(file); this.uploadFile(file);
  }
  clearUpload(): void { this.uploadSubscription?.unsubscribe(); this.selectedFile = undefined; this.previewUrl.set(''); this.uploadedMediaId.set(''); this.uploadError.set(''); this.uploading.set(false); }
  retryUpload(): void { if (this.selectedFile && !this.uploading()) this.uploadFile(this.selectedFile); }
  private uploadFile(file: File): void {
    this.uploadSubscription?.unsubscribe(); this.uploadError.set(''); this.uploadedMediaId.set(''); this.uploading.set(true);
    this.uploadSubscription = this.api.uploadImage(file, 'tryon').subscribe({
      next: (res) => { this.uploadedMediaId.set(res.id); this.uploading.set(false); this.toast.success('Đã tải ảnh, sẵn sàng thử đồ.'); },
      error: (err) => { this.uploading.set(false); this.uploadError.set(err.error?.message || err.message || 'Không thể tải ảnh lên.'); this.toast.error(this.uploadError()); },
    });
  }
  startTryOn(): void {
    if (!this.selectedProductId() || !this.uploadedMediaId() || !this.consentAccepted || this.generating() || this.uploading() || this.job()?.state === 'PENDING' || this.job()?.state === 'PROCESSING') return;
    this.generating.set(true); this.generationError.set('');
    this.api.createTryOn({ productIds: [this.selectedProductId()], inputMediaId: this.uploadedMediaId(), consentPolicyVersion: '2026-10-fashion-agent-v1' }, generateUUID()).subscribe({
      next: (initialJob) => { this.job.set(initialJob); this.generating.set(false); this.pollJob(initialJob.id); },
      error: (err) => { this.generating.set(false); this.generationError.set(err.error?.message || 'Không thể khởi tạo thử đồ hoặc lượt thử hiện không khả dụng.'); this.toast.error(this.generationError()); },
    });
  }
  private pollJob(jobId: string): void {
    this.pollSubscription?.unsubscribe(); this.pollingError.set('');
    this.pollSubscription = watchAiJob(this.api, jobId, () => this.pollingError.set('Kết nối gián đoạn. Đang tự động thử lại...')).subscribe({
      next: (job) => { this.pollingError.set(''); this.job.set(job); if (job.state === 'COMPLETED') this.toast.success('Ảnh AI đã hoàn tất!'); if (job.state === 'FAILED' || job.state === 'EXPIRED') this.toast.error(job.errorMessage || 'Tác vụ đã kết thúc hoặc hết hạn.'); if (['COMPLETED', 'FAILED', 'EXPIRED'].includes(job.state)) this.loadJobHistory(); },
      error: () => { this.job.set(null); this.pollingError.set('Không thể tải tác vụ. Vui lòng chọn lại tác vụ hoặc tải lại trang.'); },
    });
  }
  loadJobHistory(): void {
    this.loadingHistory.set(true); this.historyError.set('');
    this.historyPagination.load(() => this.api.listAiJobs(this.historyPagination.page(), this.historyPagination.limit), {
      next: (res) => { this.jobHistory.set(res.items); this.loadingHistory.set(false); },
      error: () => { this.loadingHistory.set(false); this.historyError.set('Không thể tải lịch sử thử đồ.'); },
    });
  }
  selectHistoricalJob(historyJob: AiJob): void {
    this.pollSubscription?.unsubscribe(); this.job.set(historyJob); if (historyJob.state === 'PENDING' || historyJob.state === 'PROCESSING') this.pollJob(historyJob.id);
    this.toast.info(`Đang hiển thị kết quả tác vụ ${historyJob.id.slice(0, 8)}...`); document.getElementById('result-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  resetJob(): void { this.pollSubscription?.unsubscribe(); this.job.set(null); this.generationError.set(''); }
}
