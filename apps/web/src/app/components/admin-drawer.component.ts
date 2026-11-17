import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';

let drawerSequence = 0;
let drawerScrollLocks = 0;
let drawerPreviousOverflow = '';

/**
 * Ngăn kéo trượt từ bên phải dùng chung cho khu quản trị.
 * - Nút đóng ở đầu ngăn; Esc hoặc bấm nền tối cũng đóng (phát sự kiện `close`).
 * - Cuộn nền bị khóa khi mở; phím Tab xoay vòng trong ngăn; trả focus về nút đã mở.
 * - Nội dung chính chèn mặc định; vùng chân (nút lưu...) chèn bằng thuộc tính `drawer-footer`.
 */
@Component({
  selector: 'fc-admin-drawer',
  standalone: true,
  template: `
    <dialog #dialog class="drawer" [style.--drawer-w]="width"
      [attr.aria-labelledby]="title ? titleId : null" [attr.aria-label]="title ? null : 'Ngăn chi tiết'"
      (cancel)="onCancel($event)" (keydown.tab)="trapTab($event)" (click)="onBackdropClick($event)">
      <header class="drawer-head">
        <div class="drawer-heading">
          @if (eyebrow) { <span class="drawer-eyebrow">{{ eyebrow }}</span> }
          @if (title) { <h2 [id]="titleId" class="drawer-title">{{ title }}</h2> }
          @if (subtitle) { <p class="drawer-subtitle">{{ subtitle }}</p> }
        </div>
        <button type="button" class="drawer-close" (click)="close.emit()" aria-label="Đóng ngăn chi tiết">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div class="drawer-body"><ng-content /></div>
      <footer class="drawer-footer"><ng-content select="[drawer-footer]" /></footer>
    </dialog>
  `,
  styles: [`
    .drawer {
      position: fixed; inset: 0 0 0 auto; margin: 0; padding: 0;
      width: min(var(--drawer-w, var(--admin-drawer-w, 520px)), 100vw); max-width: 100vw;
      height: 100dvh; max-height: 100dvh;
      border: 0; border-left: 1px solid var(--admin-line, #e5e5e5);
      background: var(--ui-bg, #fff); color: var(--ui-ink, #171717);
      font-family: var(--font-sans);
      box-shadow: -16px 0 48px #17171726;
      flex-direction: column; overflow: hidden;
    }
    .drawer[open] { display: flex; }
    .drawer::backdrop { background: rgba(23, 23, 23, .45); }
    .drawer-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
      padding: 20px 24px; border-bottom: 1px solid var(--admin-line, #e5e5e5); flex-shrink: 0;
    }
    .drawer-heading { min-width: 0; }
    .drawer-eyebrow { display: block; margin-bottom: 4px; font: 700 10px/12px var(--font-sans); letter-spacing: .5px; text-transform: uppercase; color: var(--ui-accent, #8f485d); }
    .drawer-title { margin: 0; font: 500 22px/30px var(--font-serif); overflow-wrap: anywhere; }
    .drawer-subtitle { margin: 4px 0 0; font-size: 12px; line-height: 1.5; color: var(--ui-ink-soft, #444748); }
    .drawer-close {
      flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border: 1px solid transparent; border-radius: 2px;
      background: none; color: var(--ui-ink, #171717);
    }
    .drawer-close:hover { background: var(--ui-bg-soft, #f5f3f3); border-color: var(--admin-line, #e5e5e5); }
    .drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; }
    .drawer-footer { flex-shrink: 0; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--admin-line, #e5e5e5); background: var(--ui-bg, #fff); }
    .drawer-footer:empty { display: none; }
    @media (max-width: 640px) { .drawer-head, .drawer-body, .drawer-footer { padding-left: 16px; padding-right: 16px; } }
    @media (prefers-reduced-motion: no-preference) {
      .drawer[open] { animation: fc-drawer-in 220ms cubic-bezier(.2, .7, .2, 1); }
      .drawer[open]::backdrop { animation: fc-drawer-fade 180ms ease-out; }
    }
    @keyframes fc-drawer-in { from { transform: translateX(32px); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes fc-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class AdminDrawerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() eyebrow = '';
  @Input() subtitle = '';
  @Input() width = '520px';
  @Output() close = new EventEmitter<void>();
  @ViewChild('dialog') private dialog?: ElementRef<HTMLDialogElement>;
  readonly titleId = 'fc-admin-drawer-title-' + ++drawerSequence;
  private active = false;
  private opener?: HTMLElement;

  ngAfterViewInit(): void { this.sync(); }
  ngOnChanges(): void { this.sync(); }
  ngOnDestroy(): void { this.hide(); }

  private sync(): void {
    const dialog = this.dialog?.nativeElement;
    if (!dialog) return;
    if (this.isOpen && !this.active) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      dialog.showModal(); // top layer: nền trở nên inert, focus bị giữ trong ngăn
      this.active = true;
      if (drawerScrollLocks++ === 0) { drawerPreviousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    } else if (!this.isOpen) this.hide();
  }
  private hide(): void {
    if (!this.active) return;
    this.active = false;
    this.dialog?.nativeElement.close();
    if (--drawerScrollLocks === 0) document.body.style.overflow = drawerPreviousOverflow;
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }
  onCancel(event: Event): void { event.preventDefault(); this.close.emit(); } // Esc
  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog?.nativeElement) this.close.emit();
  }
  trapTab(event: Event): void {
    const backwards = (event as KeyboardEvent).shiftKey;
    const controls = Array.from(this.dialog!.nativeElement.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (backwards && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!backwards && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
