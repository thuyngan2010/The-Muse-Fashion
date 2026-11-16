import { Component, input } from '@angular/core';
import type { AiJob } from '@fashion/contracts';

@Component({
  selector: 'fc-ai-job-details', standalone: true,
  template: `
    @if (job().state === 'PENDING' || job().state === 'PROCESSING') {
      <p role="status">{{ phases[job().phase || 'QUEUED'] || 'Đang xử lý...' }}</p>
    }
    @if (job().detectedItems?.length) {
      <div class="detected" aria-label="Các loại sản phẩm đã nhận diện">
        @for (item of job().detectedItems; track item.productId) { <span>{{ categories[item.category] || 'Phụ kiện' }}</span> }
      </div>
    }
    @if (job().planSummary) { <p class="summary">{{ job().planSummary }}</p> }
  `,
  styles: [`:host{display:block;margin:10px 0}.detected{display:flex;flex-wrap:wrap;gap:6px}.detected span{padding:5px 9px;border-radius:12px;background:#f1ece5;font-size:.8rem}.summary{font-size:.9rem;line-height:1.6;color:#555}`],
})
export class AiJobDetailsComponent {
  readonly job = input.required<AiJob>();
  readonly phases: Record<string, string> = { QUEUED: 'Đang chờ xử lý...', ANALYZING: 'Đang nhận diện người, vùng cơ thể và từng sản phẩm...',
    PLANNING: 'Đang lập phương án mặc, đặt phụ kiện và phối các lớp trang phục...', GENERATING: 'Đang tạo ảnh theo phương án đã kiểm tra...' };
  readonly categories: Record<string, string> = { top: 'Áo', bottom: 'Quần / chân váy', dress: 'Váy liền', outerwear: 'Áo khoác',
    shoes: 'Giày', sandals: 'Dép / sandal', glasses: 'Kính', hat: 'Mũ', bag: 'Túi', belt: 'Thắt lưng', scarf: 'Khăn',
    necklace: 'Dây chuyền', earrings: 'Bông tai', bracelet: 'Vòng tay', watch: 'Đồng hồ', ring: 'Nhẫn' };
}
