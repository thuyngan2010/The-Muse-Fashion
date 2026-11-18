import { Component, computed, input } from '@angular/core';

export type DonutSegment = { key: string; label: string; value: number; color: string };

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Biểu đồ vòng theo tỉ lệ các phần, kèm bảng chú thích (chấm màu, nhãn, số lượng, %), vẽ bằng SVG thuần. */
@Component({
  selector: 'fc-admin-chart-donut',
  standalone: true,
  template: `
    <div class="donut">
      <svg viewBox="0 0 140 140" width="168" height="168" role="img" [attr.aria-label]="summary()">
        <circle cx="70" cy="70" [attr.r]="radius" fill="none" stroke="#efeded" stroke-width="16" />
        @for (arc of arcs(); track arc.key) {
          <circle cx="70" cy="70" [attr.r]="radius" fill="none" [attr.stroke]="arc.color" stroke-width="16"
            [attr.stroke-dasharray]="arc.length + ' ' + (circumference - arc.length)" [attr.stroke-dashoffset]="-arc.offset"
            transform="rotate(-90 70 70)" />
        }
        <text x="70" y="70" text-anchor="middle" class="center-value">{{ centerValue() }}</text>
        <text x="70" y="88" text-anchor="middle" class="center-label">{{ centerLabel() }}</text>
      </svg>
    </div>
    @if (total() > 0) {
      <table class="legend">
        <caption class="sr">Chú thích biểu đồ</caption>
        <tbody>
          @for (row of rows(); track row.key) {
            <tr>
              <td class="name"><i class="swatch" [style.background]="row.color"></i>{{ row.label }}</td>
              <td class="num">{{ row.value.toLocaleString('vi-VN') }}</td>
              <td class="pct">{{ row.percent }}%</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="empty">Chưa có đơn hàng trong kỳ này.</p>
    }
  `,
  styles: [`
    :host { display: block; font-family: var(--font-sans); }
    .donut { display: flex; justify-content: center; padding: 8px 0 16px; }
    .center-value { font: 700 22px var(--font-sans); fill: #1b1c1c; }
    .center-label { font: 700 9px var(--font-sans); letter-spacing: .5px; fill: #444748; }
    .legend { width: 100%; border-collapse: collapse; }
    .legend td { padding: 8px 0; border-top: 1px solid #efeded; font-size: 12px; line-height: 16px; color: #444748; }
    .legend .name { display: flex; align-items: center; gap: 8px; }
    .swatch { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: inset 0 0 0 1px #0000001f; }
    .legend .num { width: 56px; text-align: right; font-weight: 700; font-size: 13px; color: #1b1c1c; }
    .legend .pct { width: 44px; text-align: right; font-size: 11px; }
    .empty { margin: 0; text-align: center; font-size: 13px; color: #444748; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `],
})
export class AdminChartDonutComponent {
  readonly segments = input<DonutSegment[]>([]);
  readonly centerValue = input('—');
  readonly centerLabel = input('HOÀN TẤT');

  readonly radius = RADIUS;
  readonly circumference = CIRCUMFERENCE;
  readonly total = computed(() => this.segments().reduce((sum, s) => sum + Math.max(0, s.value), 0));
  readonly rows = computed(() => this.segments().filter(s => s.value > 0).map(s => ({ ...s, percent: Math.round((s.value / this.total()) * 100) })));
  readonly arcs = computed(() => {
    const total = this.total();
    let offset = 0;
    return total <= 0 ? [] : this.segments().filter(s => s.value > 0).map(s => {
      const length = (s.value / total) * CIRCUMFERENCE;
      const arc = { key: s.key, color: s.color, length, offset };
      offset += length;
      return arc;
    });
  });
  readonly summary = computed(() => `Biểu đồ vòng trạng thái đơn hàng: ${this.rows().map(r => `${r.label} ${r.value} (${r.percent}%)`).join(', ') || 'chưa có dữ liệu'}.`);
}
