import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, input, signal } from '@angular/core';

export type RevenueChartDay = { date: string; revenue: number; orders: number };

const HEIGHT = 260;
const PAD = { left: 44, right: 12, top: 16, bottom: 30 };
const PINK = '#f3b7c0';
const ROSE = '#805159';
const BAR = '#efeded';

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const base = value / exp;
  const step = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return step * exp;
}

/** Đường cong đơn điệu (Fritsch–Carlson) đổi sang các đoạn Bézier bậc 3, không vọt quá dữ liệu. */
function smoothPath(points: Array<[number, number]>): string {
  const n = points.length;
  if (n < 2) return '';
  const dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = Math.hypot(a, b);
    if (h > 3) { tangent[i] = (3 * a / h) * slope[i]; tangent[i + 1] = (3 * b / h) * slope[i]; }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = dx[i] / 3;
    d += `C${x0 + h},${y0 + tangent[i] * h} ${x1 - h},${y1 - tangent[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

function vnd(value: number): string { return `${Math.round(value).toLocaleString('vi-VN')}đ`; }
function shortDate(iso: string): string { const [, m, d] = iso.split('-'); return `${d}/${m}`; }
function fullDate(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

/** Biểu đồ doanh thu (đường cong + vùng tô) trên các cột số đơn, vẽ bằng SVG thuần và co giãn theo bề rộng khung. */
@Component({
  selector: 'fc-admin-chart-revenue',
  standalone: true,
  template: `
    <div class="legend" aria-hidden="true">
      <span><i class="dot-line"></i>Doanh thu (triệu đ)</span>
      <span><i class="dot-bar"></i>Đơn hàng</span>
    </div>
    <div class="wrap">
      @if (days().length === 0) {
        <p class="empty">Chưa có dữ liệu trong kỳ này.</p>
      } @else {
        <svg [attr.width]="width()" [attr.height]="height" [attr.viewBox]="'0 0 ' + width() + ' ' + height" role="img"
          [attr.aria-label]="summary()" tabindex="0"
          (pointermove)="onMove($event)" (pointerleave)="hover.set(null)" (keydown)="onKey($event)" (blur)="hover.set(null)">
          <defs>
            <linearGradient id="rev-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#f3b7c0" stop-opacity=".55" />
              <stop offset="1" stop-color="#f3b7c0" stop-opacity="0" />
            </linearGradient>
          </defs>
          @for (tick of ticks(); track tick.y) {
            <line [attr.x1]="left" [attr.x2]="width() - right" [attr.y1]="tick.y" [attr.y2]="tick.y" stroke="#e9e8e7" stroke-dasharray="3 4" />
            <text [attr.x]="left - 8" [attr.y]="tick.y + 4" text-anchor="end" class="axis">{{ tick.label }}</text>
          }
          @for (p of points(); track p.date) {
            <rect [attr.x]="p.x - barWidth() / 2" [attr.y]="p.barY" [attr.width]="barWidth()" [attr.height]="p.barH" rx="2"
              [attr.fill]="p.peak ? pink : bar" [attr.opacity]="hover() === p.index ? 1 : (p.peak ? 1 : .85)" />
          }
          @if (areaPath()) { <path [attr.d]="areaPath()" fill="url(#rev-area)" /> }
          @if (linePath()) { <path [attr.d]="linePath()" fill="none" [attr.stroke]="rose" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /> }
          @for (p of points(); track p.date) {
            @if (p.label) { <text [attr.x]="p.x" [attr.y]="height - 8" text-anchor="middle" class="axis" [class.axis-peak]="p.peak">{{ p.label }}</text> }
          }
          @if (hoverPoint(); as h) {
            <line [attr.x1]="h.x" [attr.x2]="h.x" [attr.y1]="top" [attr.y2]="height - bottom" stroke="#c4c7c7" stroke-dasharray="2 3" />
            <circle [attr.cx]="h.x" [attr.cy]="h.y" r="5" fill="#fff" [attr.stroke]="rose" stroke-width="2.5" />
          }
        </svg>
        @if (hoverPoint(); as h) {
          <div class="tip" [style.left.px]="tipLeft()" [style.top.px]="Math.max(4, h.y - 78)" role="status">
            <strong>{{ h.fullDate }}</strong>
            <span>{{ h.money }}</span>
            <span>{{ h.orders }} đơn đã thanh toán</span>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; font-family: var(--font-sans); }
    .legend { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; font: 400 12px/12px var(--font-sans); color: #444748; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .dot-line { width: 12px; height: 3px; border-radius: 2px; background: #805159; display: inline-block; }
    .dot-bar { width: 10px; height: 10px; border-radius: 2px; background: #f3b7c0; display: inline-block; }
    .wrap { position: relative; min-height: 120px; }
    svg { display: block; max-width: 100%; touch-action: pan-y; }
    svg:focus-visible { outline: 2px solid #805159; outline-offset: 2px; }
    .axis { font: 400 11px var(--font-sans); fill: #444748; }
    .axis-peak { font-weight: 700; fill: #805159; }
    .empty { margin: 48px 0; text-align: center; font-size: 13px; color: #444748; }
    .tip { position: absolute; transform: translateX(-50%); min-width: 150px; padding: 8px 12px; border-radius: 4px; background: #000; color: #fff; display: flex; flex-direction: column; gap: 2px; font: 400 12px/18px var(--font-sans); pointer-events: none; box-shadow: 0 4px 12px #0003; z-index: 1; }
    .tip strong { font-weight: 700; }
  `],
})
export class AdminChartRevenueComponent implements AfterViewInit, OnDestroy {
  readonly days = input<RevenueChartDay[]>([]);

  readonly Math = Math;
  readonly height = HEIGHT;
  readonly left = PAD.left;
  readonly right = PAD.right;
  readonly top = PAD.top;
  readonly bottom = PAD.bottom;
  readonly pink = PINK;
  readonly rose = ROSE;
  readonly bar = BAR;

  readonly width = signal(640);
  readonly hover = signal<number | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: ResizeObserver;

  private readonly plotW = computed(() => Math.max(40, this.width() - PAD.left - PAD.right));
  private readonly plotH = HEIGHT - PAD.top - PAD.bottom;
  private readonly maxRevenue = computed(() => niceMax(Math.max(0, ...this.days().map(d => d.revenue))));
  private readonly maxOrders = computed(() => Math.max(1, ...this.days().map(d => d.orders)));
  private readonly peakIndex = computed(() => {
    const list = this.days();
    let best = -1, value = 0;
    list.forEach((d, i) => { if (d.revenue > value) { value = d.revenue; best = i; } });
    return best;
  });

  readonly barWidth = computed(() => Math.max(4, Math.min(28, (this.plotW() / Math.max(1, this.days().length)) * 0.6)));

  readonly points = computed(() => {
    const list = this.days(), n = list.length, slot = this.plotW() / Math.max(1, n);
    const peak = this.peakIndex(), step = Math.max(1, Math.ceil(n / 8));
    return list.map((d, index) => {
      const barH = d.orders > 0 ? Math.max(3, (d.orders / this.maxOrders()) * this.plotH * 0.5) : 0;
      const showLabel = index === peak || (index % step === 0 && (peak < 0 || Math.abs(index - peak) >= Math.ceil(step / 2)));
      return {
        index, date: d.date, peak: index === peak, orders: d.orders,
        x: PAD.left + slot * (index + 0.5),
        y: PAD.top + this.plotH - (d.revenue / this.maxRevenue()) * this.plotH,
        barH, barY: PAD.top + this.plotH - barH,
        label: showLabel ? shortDate(d.date) + (index === peak ? ' (Đỉnh)' : '') : '',
        fullDate: fullDate(d.date), money: vnd(d.revenue),
      };
    });
  });

  readonly linePath = computed(() => smoothPath(this.points().map(p => [p.x, p.y] as [number, number])));
  readonly areaPath = computed(() => {
    const pts = this.points(), line = this.linePath();
    if (!line) return '';
    const base = PAD.top + this.plotH;
    return `${line}L${pts[pts.length - 1].x},${base}L${pts[0].x},${base}Z`;
  });
  readonly ticks = computed(() => [0, 1, 2, 3, 4].map(i => {
    const value = (this.maxRevenue() * i) / 4;
    const million = value / 1_000_000;
    return { y: PAD.top + this.plotH - (i / 4) * this.plotH, label: million.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) };
  }));
  readonly hoverPoint = computed(() => { const i = this.hover(); return i === null ? null : (this.points()[i] ?? null); });
  readonly tipLeft = computed(() => { const h = this.hoverPoint(); return h ? Math.min(Math.max(h.x, 82), this.width() - 82) : 0; });
  readonly summary = computed(() => {
    const list = this.days();
    const total = list.reduce((s, d) => s + d.revenue, 0), orders = list.reduce((s, d) => s + d.orders, 0);
    return `Biểu đồ doanh thu và số đơn theo ngày, ${list.length} ngày, tổng ${vnd(total)} và ${orders} đơn đã thanh toán. Dùng phím mũi tên để xem từng ngày.`;
  });

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;
    this.width.set(Math.max(280, Math.floor(el.clientWidth || 640)));
    if (typeof ResizeObserver === 'undefined') return;
    this.observer = new ResizeObserver(entries => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0) this.width.set(Math.max(280, w));
    });
    this.observer.observe(el);
  }
  ngOnDestroy(): void { this.observer?.disconnect(); }

  onMove(event: PointerEvent): void {
    const n = this.days().length;
    if (!n) return;
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const idx = Math.floor(((event.clientX - rect.left - PAD.left) / this.plotW()) * n);
    this.hover.set(Math.min(n - 1, Math.max(0, idx)));
  }
  onKey(event: KeyboardEvent): void {
    const n = this.days().length;
    if (!n || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Escape')) return;
    event.preventDefault();
    if (event.key === 'Escape') { this.hover.set(null); return; }
    const current = this.hover() ?? (event.key === 'ArrowRight' ? -1 : n);
    this.hover.set(Math.min(n - 1, Math.max(0, current + (event.key === 'ArrowRight' ? 1 : -1))));
  }
}
