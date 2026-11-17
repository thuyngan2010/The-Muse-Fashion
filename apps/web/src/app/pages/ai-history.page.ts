import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AiJob } from '@fashion/contracts';
import { PaginationComponent, PaginationState } from '../components/pagination.component';
import { ApiService } from '../services/api.service';
import { aiJobStateLabel } from '../shared/labels';
import { STORE_AI_HISTORY_CONTENT, STORE_AI_TRY_ON_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

@Component({
  standalone: true,
  imports: [PageStateComponent, DatePipe, FormsModule, RouterLink, PaginationComponent],
  template: `
    <main class="history-page">
      <header class="page-head">
        <div>
          <span class="eyebrow">{{ content.eyebrow }}</span>
          <h1>{{ content.title }}</h1>
          <p>{{ content.subtitle }}</p>
        </div>
        <div class="head-actions">
          <button type="button" class="outline-button" (click)="loadJobHistory()" [disabled]="loadingHistory()">LÀM MỚI</button>
          <a routerLink="/ai/try-on" class="solid-button">THỬ ĐỒ MỚI +</a>
        </div>
      </header>

      <div class="toolbar">
        <label class="search-box"><span aria-hidden="true">⌕</span><span class="sr-only">Tìm lịch sử</span>
          <input type="search" [ngModel]="search()" (ngModelChange)="search.set($event)" name="historySearch" placeholder="Tìm theo loại hoặc trạng thái" />
        </label>
        <div class="filter-tabs" role="group" aria-label="Lọc lịch sử">
          @for (filter of filters; track filter.value) {
            <button type="button" [class.active]="filter$() === filter.value" [attr.aria-pressed]="filter$() === filter.value" (click)="filter$.set(filter.value)">{{ filter.label }}</button>
          }
        </div>
      </div>

      @if (loadingHistory()) {
        <fc-page-state kind="loading" title="Đang tải lịch sử thử đồ" />
      } @else if (historyError()) {
        <fc-page-state kind="error" title="Không thể tải lịch sử" [message]="historyError()" actionLabel="THỬ LẠI" (action)="loadJobHistory()" />
      } @else if (visibleJobs().length === 0) {
        <fc-page-state kind="empty" [title]="content.emptyTitle" [message]="content.emptyDescription" actionLabel="THỬ ĐỒ NGAY" actionLink="/ai/try-on" />
      } @else {
        <div class="grid">
          @for (job of visibleJobs(); track job.id) {
            <article class="card">
              <div class="card-image">
                @if (job.resultUrls.length) { <img [src]="job.resultUrls[0]" alt="Kết quả của phiên thử đồ" loading="lazy" /> } @else { <span aria-hidden="true">◇</span> }
                <span class="state-badge" [class]="'state-badge state-' + job.state.toLowerCase()">{{ stateLabel(job.state) }}</span>
              </div>
              <div class="card-body">
                <span class="kind">{{ job.type === 'TRY_ON' ? 'THỬ ĐỒ' : 'MIX & MATCH' }}</span>
                @if (job.createdAt) { <p class="saved">LƯU: {{ job.createdAt | date:'dd/MM/yyyy' }} • {{ job.createdAt | date:'HH:mm' }}</p> }
                <div class="card-actions">
                  <a [routerLink]="['/ai/try-on']" [queryParams]="{ jobId: job.id }" class="outline-button">XEM CHI TIẾT</a>
                  <a [routerLink]="['/ai/try-on']" [queryParams]="retryParams(job)" class="solid-button">THỬ LẠI</a>
                </div>
              </div>
            </article>
          }
        </div>
      }

      <fc-pagination label="Lịch sử tạo ảnh" [page]="pagination.page()" [total]="pagination.total()" [limit]="pagination.limit" [loading]="loadingHistory()" (pageChange)="pageChanged($event)" />

      <section class="commitments" aria-label="Cam kết sử dụng">
        @for (item of commitments; track item.title; let index = $index) { <article><span>0{{ index + 1 }}</span><div><h3>{{ item.title }}</h3><p>{{ item.description }}</p></div></article> }
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;color:#171513;background:#fbfaf8}*{box-sizing:border-box}button,input{font:inherit}
    .history-page{max-width:1280px;margin:auto;padding:54px 48px 96px}
    .page-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #c9c3bd}
    .eyebrow{display:inline-block;padding:4px 12px;background:#ffd9e1;color:#3b051b;font-size:11px;font-weight:600;letter-spacing:.1em}
    h1{margin:12px 0 8px;font:400 42px/1.2 'Playfair Display','Times New Roman',serif}
    .page-head p{max-width:640px;margin:0;color:#444748;font-size:15px;line-height:1.7}
    .head-actions{display:flex;gap:10px;flex-wrap:wrap}
    .outline-button,.solid-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #1c1917;background:#fff;color:#171513;font-size:11px;font-weight:700;letter-spacing:.12em;text-decoration:none;cursor:pointer}
    .solid-button{background:#1d1a18;color:#fff}
    .outline-button:disabled{opacity:.5;cursor:not-allowed}
    .toolbar{display:flex;justify-content:space-between;gap:18px;margin-bottom:28px;padding:16px 20px;border:1px solid #cbc5bf;background:#fff}
    .search-box{display:flex;min-width:320px;align-items:center;gap:8px;padding:0 12px;border:1px solid #d1cbc5}
    .search-box input{width:100%;height:42px;border:0;outline:0;font-size:12px}
    .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    .filter-tabs{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
    .filter-tabs button{min-height:36px;padding:0 14px;color:#5f5953;background:transparent;border:0;border-bottom:2px solid transparent;font-size:10px;font-weight:700;letter-spacing:.1em;cursor:pointer}
    .filter-tabs button.active{color:#171513;border-bottom-color:#171513}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
    .card{overflow:hidden;border:1px solid #cbc5bf;background:#fff}
    .card-image{position:relative;display:flex;height:420px;align-items:center;justify-content:center;overflow:hidden;background:#ede9e5;color:#9b9490;font-size:32px}
    .card-image img{width:100%;height:100%;object-fit:cover}
    .state-badge{position:absolute;top:14px;right:14px;padding:7px 10px;background:#ffffffe8;font-size:10px;font-weight:700;letter-spacing:.08em}
    .state-completed{color:#266246}.state-failed,.state-expired{color:#9d2638}.state-pending,.state-processing{color:#8c641a}
    .card-body{padding:18px}
    .kind{color:#9b5663;font-size:10px;font-weight:700;letter-spacing:.12em}
    .saved{margin:8px 0 16px;color:#444748;font-size:12px;letter-spacing:.04em}
    .card-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .commitments{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:56px;padding-top:40px;border-top:1px solid #c9c3bd}
    .commitments article{display:flex;gap:13px;padding:16px;border:1px solid #ccc6c0;background:#fff}
    .commitments article>span{color:#9b5663;font-size:11px;font-weight:700}
    .commitments h3{margin:0 0 6px;font-size:14px}.commitments p{margin:0;color:#444748;font-size:12px;line-height:1.6}
    @media (max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.commitments{grid-template-columns:repeat(2,1fr)}}
    @media (max-width:700px){.history-page{padding:32px 16px 64px}.page-head,.toolbar{flex-direction:column;align-items:stretch}.search-box{min-width:0}.grid,.commitments{grid-template-columns:1fr}.card-image{height:360px}h1{font-size:34px}}
    
  `],
})
export class AiHistoryPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly content = STORE_AI_HISTORY_CONTENT;
  readonly commitments = STORE_AI_TRY_ON_CONTENT.commitments;
  readonly pagination = new PaginationState(12);
  readonly jobs = signal<AiJob[]>([]);
  readonly loadingHistory = signal(true);
  readonly historyError = signal('');
  readonly search = signal('');
  readonly filter$ = signal('ALL');
  readonly filters = [
    { label: 'TẤT CẢ', value: 'ALL' }, { label: 'THỬ ĐỒ', value: 'TRY_ON' },
    { label: 'MIX & MATCH', value: 'MIX_MATCH' }, { label: 'HOÀN TẤT', value: 'COMPLETED' },
  ] as const;
  readonly visibleJobs = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.filter$();
    return this.jobs().filter((job) => {
      if (filter !== 'ALL' && job.type !== filter && job.state !== filter) return false;
      const text = `${job.type === 'TRY_ON' ? 'thử đồ' : 'mix match'} ${this.stateLabel(job.state)} ${job.state} ${job.createdAt ?? ''}`.toLowerCase();
      return !query || text.includes(query);
    });
  });

  ngOnInit(): void { this.loadJobHistory(); }
  pageChanged(page: number): void { this.pagination.page.set(page); this.loadJobHistory(); }
  loadJobHistory(): void {
    this.loadingHistory.set(true); this.historyError.set('');
    this.pagination.load(() => this.api.listAiJobs(this.pagination.page(), this.pagination.limit), {
      next: (res) => { this.jobs.set(res.items); this.loadingHistory.set(false); },
      error: () => { this.loadingHistory.set(false); this.historyError.set('Không thể tải lịch sử thử đồ.'); },
    });
  }
  stateLabel(state: string): string { return aiJobStateLabel(state); }
  /** Thử lại: mở trang thử đồ, chọn sẵn sản phẩm đã nhận diện của phiên nếu có. */
  retryParams(job: AiJob): { productId?: string } {
    const productId = job.detectedItems?.[0]?.productId;
    return productId ? { productId } : {};
  }
}
