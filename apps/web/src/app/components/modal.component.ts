import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';

let dialogSequence = 0;
let scrollLocks = 0;
let previousOverflow = '';

@Component({
  selector: 'fc-modal', standalone: true,
  template: `
    <dialog #dialog class="modal-dialog" [style.max-width]="maxWidth || '560px'"
      [attr.aria-labelledby]="title ? titleId : null" [attr.aria-label]="title ? null : 'Cửa sổ'"
      (cancel)="onCancel($event)" (keydown.tab)="trapTab($event)" (click)="onBackdropClick($event)">
      <div class="modal-header">
        @if (title) { <h3 [id]="titleId" class="modal-title">{{ title }}</h3> }
        <button type="button" class="modal-close" (click)="close.emit()" aria-label="Đóng cửa sổ">✕</button>
      </div>
      <div class="modal-body"><ng-content /></div>
    </dialog>
  `,
  styles: [`
    .modal-dialog { border:0; padding:0; border-radius: var(--radius-card); width:calc(100% - 40px); max-height:90dvh;
      overflow:auto; background:white; color:var(--color-text); box-shadow:0 20px 60px #0003; }
    .modal-dialog::backdrop { background:rgba(23,23,22,.6); backdrop-filter:blur(3px); }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--color-divider);
    }
    .modal-title {
      font-family: Georgia, serif;
      font-size: 1.35rem;
      font-weight: 500;
      margin: 0;
      color: var(--color-text);
    }
    .modal-close {
      background: none;
      border: 0;
      font-size: 1.1rem;
      color: #5f5a52;
      cursor: pointer;
      padding: 6px;
      border-radius: var(--radius-control);
      line-height: 1;
    }
    .modal-close:hover {
      color: var(--color-text);
      background: var(--color-canvas);
    }
    .modal-body {
      padding: 24px;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleUp {
      from { transform: scale(0.96); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-dialog { border:1px solid var(--color-divider); border-radius:16px; box-shadow:var(--shadow-floating); }
    .modal-header { gap:16px; padding:20px 24px; }
    .modal-title { font-family:inherit; font-weight:600; font-size:1.125rem; line-height:1.5; }
    .modal-close { flex-shrink:0; width:40px; height:40px; }
    @media (max-width:480px) { .modal-dialog { width:calc(100% - 24px); } .modal-header,.modal-body { padding:18px; } }

    @media(prefers-reduced-motion:no-preference) {
      .modal-dialog[open] { animation:fc-dialog-in 180ms cubic-bezier(.2,.7,.2,1); }
      .modal-dialog[open]::backdrop { animation:fc-fade-in 150ms ease-out; }
    }





  `],
})
export class ModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() maxWidth = '560px';
  @Output() close = new EventEmitter<void>();
  @ViewChild('dialog') private dialog?: ElementRef<HTMLDialogElement>;
  readonly titleId = 'fc-modal-title-' + ++dialogSequence;
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
      dialog.showModal(); // native top layer makes the background inert and traps keyboard focus
      this.active = true;
      if (scrollLocks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    } else if (!this.isOpen) this.hide();
  }
  private hide(): void {
    if (!this.active) return;
    this.active = false;
    this.dialog?.nativeElement.close();
    if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }
  onCancel(event: Event): void { event.preventDefault(); this.close.emit(); }
  trapTab(event: Event): void {
    const backwards = (event as KeyboardEvent).shiftKey;
    const controls = Array.from(this.dialog!.nativeElement.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (backwards && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!backwards && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog?.nativeElement) this.close.emit();
  }
}
