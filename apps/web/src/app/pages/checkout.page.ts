import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { UserAddress, CheckoutQuote } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { STORE_CART_CONTENT, STORE_CHECKOUT_CONTENT } from '../shared/store-content';
import { catchError, map, Subscription, throwError } from 'rxjs';

/** Đọc danh sách sản phẩm được tick ở giỏ hàng (?items=id1,id2). Không có thì thanh toán cả giỏ. */
export function parseSelectedItems(raw: string | null | undefined): string[] | null {
  const ids = [...new Set((raw ?? '').split(',').map((id) => id.trim()).filter((id) => /^[a-f0-9]{24}$/i.test(id)))];
  return ids.length ? ids : null;
}

/** Mã ưu đãi đã áp dụng ở giỏ hàng (?voucher=CODE) được điền sẵn để tự áp dụng ở bước thanh toán. */
export function parseVoucherCode(raw: string | null | undefined): string {
  const code = (raw ?? '').trim().toUpperCase();
  return code.length > 0 && code.length <= 50 ? code : '';
}

export const VOUCHER_ERRORS: Record<string, string> = {
  VOUCHER_INVALID: 'Mã ưu đãi không hợp lệ.',
  VOUCHER_DISABLED: 'Mã ưu đãi hiện không khả dụng.',
  VOUCHER_EXPIRED: 'Mã ưu đãi đã hết hạn.',
  VOUCHER_EXHAUSTED: 'Mã ưu đãi đã hết lượt sử dụng.',
  VOUCHER_MINIMUM_NOT_MET: 'Đơn hàng chưa đạt giá trị tối thiểu để dùng mã này.',
};

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Component({
  standalone: true,
  imports: [RouterLink, CurrencyPipe, FormsModule],
  template: `
    <main class="checkout-container">
      <header class="page-header">
        <h1 class="page-title">{{ content.title }}</h1>
        <ol class="steps" aria-label="Các bước thanh toán">
          <li><a routerLink="/cart">{{ content.steps[0] }}</a></li>
          <li class="current" aria-current="step">{{ content.steps[1] }}</li>
          <li>{{ content.steps[2] }}</li>
        </ol>
      </header>

      @if (pendingOrder()) {
        <section class="state-card" role="status" aria-live="polite">
          <h2>Đang xác minh kết quả đặt hàng</h2>
          <p>Yêu cầu có thể đã được ghi nhận. Vui lòng kiểm tra lại; không cần tạo đơn khác.</p>
          <button type="button" class="btn-primary" [disabled]="placingOrder()" (click)="recoverPendingOrder()">{{ placingOrder() ? 'Đang kiểm tra…' : 'Kiểm tra đơn hàng' }}</button>
          <a routerLink="/orders" class="link-text">Xem lịch sử đơn hàng</a>
        </section>
      } @else if (orderItems().length === 0) {
        <section class="state-card">
          <p>{{ content.emptyTitle }}</p>
          <a routerLink="/products" class="btn-primary">{{ content.emptyAction }}</a>
        </section>
      } @else {
        <div class="checkout-layout">
          <div class="form-col">
            <section class="checkout-card" aria-labelledby="address-heading">
              <div class="card-title-row">
                <h2 id="address-heading">{{ content.addressTitle }}</h2>
                @if (addresses().length > 0) {
                  <button type="button" class="btn-text" [attr.aria-expanded]="showNewAddressForm()" (click)="toggleNewAddress()">
                    {{ showNewAddressForm() ? content.cancelAddAddress : content.addAddress }}
                  </button>
                }
              </div>

              @if (loadingAddresses()) {
                <p class="notice" role="status">Đang tải danh sách địa chỉ...</p>
              }
              @if (addressLoadError()) {
                <div class="alert-error" role="alert">
                  <p>{{ addressLoadError() }}</p>
                  <button type="button" class="btn-outline" (click)="loadAddresses()">Tải lại địa chỉ</button>
                </div>
              }

              @if (addresses().length > 0) {
                <div class="address-options" role="radiogroup" aria-labelledby="address-heading">
                  @for (addr of addresses(); track addr.id) {
                    <label class="address-radio-card" [class.selected]="selectedAddressId() === addr.id">
                      <input type="radio" name="addressRadio" [value]="addr.id" [checked]="selectedAddressId() === addr.id" (change)="selectAddress(addr.id)" />
                      <div class="addr-info">
                        @if (addr.isDefault) { <span class="default-badge">MẶC ĐỊNH</span> }
                        <strong>{{ addr.receiver }} · {{ addr.phone }}</strong>
                        <p>{{ addr.line1 }}, {{ addr.ward }}, {{ addr.district }}, {{ addr.province }}</p>
                      </div>
                    </label>
                  }
                </div>
              } @else if (!loadingAddresses() && !addressLoadError()) {
                <p class="notice">{{ content.noAddressHint }}</p>
              }

              @if (showNewAddressForm() && !loadingAddresses()) {
                <form (ngSubmit)="saveNewAddress()" class="new-address-form">
                  <div class="form-row">
                    <label>Họ tên người nhận *<input type="text" [(ngModel)]="newReceiver" name="receiver" required /></label>
                    <label>Số điện thoại *<input type="tel" [(ngModel)]="newPhone" name="phone" required /></label>
                  </div>
                  <div class="form-row">
                    <label>Địa chỉ nhà / số đường *<input type="text" [(ngModel)]="newLine1" name="line1" required /></label>
                    <label>Phường / Xã *<input type="text" [(ngModel)]="newWard" name="ward" required /></label>
                  </div>
                  <div class="form-row">
                    <label>Quận / Huyện *<input type="text" [(ngModel)]="newDistrict" name="district" required /></label>
                    <label>Tỉnh / Thành phố *<input type="text" [(ngModel)]="newProvince" name="province" required /></label>
                  </div>
                  <button type="submit" class="btn-primary" [disabled]="savingAddress()">
                    {{ savingAddress() ? 'Đang lưu...' : 'Lưu và dùng địa chỉ này' }}
                  </button>
                </form>
              }
            </section>

            <section class="checkout-card" aria-labelledby="items-heading">
              <div class="card-title-row">
                <h2 id="items-heading">{{ content.itemsTitle }}</h2>
                <a routerLink="/cart" class="btn-text">{{ content.editCart }}</a>
              </div>
              <ul class="order-items">
                @for (item of orderItems(); track item.variantId) {
                  <li>
                    <div class="oi-main">
                      <strong>{{ item.productName }}</strong>
                      <span>SKU: {{ item.sku }} · SL: {{ item.quantity }}</span>
                    </div>
                    <span class="oi-price">{{ item.unitPrice * item.quantity | currency:'VND':'symbol':'1.0-0' }}</span>
                  </li>
                }
              </ul>
            </section>
          </div>

          <aside class="summary-col">
            <div class="summary-card">
              <h2>{{ content.summaryTitle }}</h2>

              <div class="voucher-block">
                <span class="field-label" id="voucher-heading">{{ content.voucherLabel }}</span>
                <div class="voucher-input-row">
                  <input
                    type="text"
                    [placeholder]="content.voucherPlaceholder"
                    [(ngModel)]="voucherCode"
                    (ngModelChange)="voucherError.set('')"
                    aria-labelledby="voucher-heading"
                    [attr.aria-invalid]="voucherError() ? 'true' : null"
                    [attr.aria-describedby]="voucherError() ? 'voucher-feedback' : null"
                    name="voucher"
                    (keyup.enter)="applyQuote()"
                  />
                  <button type="button" class="btn-outline" (click)="applyQuote()" [disabled]="quoting() || !selectedAddressId()">
                    {{ quoting() ? 'Đang kiểm tra...' : 'ÁP DỤNG' }}
                  </button>
                </div>
                @if (voucherError()) {
                  <p id="voucher-feedback" class="voucher-error" role="status">{{ voucherError() }}</p>
                }
                @if (appliedVoucherCode(); as code) {
                  <p class="voucher-success">✓ Đã áp dụng mã: {{ code }}</p>
                }
              </div>

              @if (quote(); as q) {
                <div class="summary-line"><span>Tạm tính</span><strong>{{ q.subtotal | currency:'VND':'symbol':'1.0-0' }}</strong></div>
                <div class="summary-line"><span>Phí vận chuyển</span><span>{{ q.shippingFee | currency:'VND':'symbol':'1.0-0' }}</span></div>
                @if (q.voucherDiscount > 0) {
                  <div class="summary-line discount-line"><span>Giảm giá</span><span>-{{ q.voucherDiscount | currency:'VND':'symbol':'1.0-0' }}</span></div>
                }
                <hr class="summary-divider" />
                <div class="summary-line total-line"><span>TỔNG THANH TOÁN</span><span class="total-amount">{{ q.payableTotal | currency:'VND':'symbol':'1.0-0' }}</span></div>
              } @else {
                <p class="notice" role="status">{{ quoting() ? 'Đang cập nhật báo giá...' : quoteError() || 'Vui lòng chọn hoặc thêm địa chỉ nhận hàng để tính cước phí.' }}</p>
              }

              <button type="button" class="btn-place-order" [disabled]="placingOrder() || quoting() || !quote() || !selectedAddressId()" (click)="placeOrder()">
                {{ placingOrder() ? 'Đang khởi tạo đơn hàng...' : content.placeOrder }}
              </button>
              <p class="terms-text">{{ content.placeOrderNote }}</p>

              <ul class="assurances">
                @for (text of assurances; track text) { <li>{{ text }}</li> }
              </ul>
            </div>
          </aside>
        </div>
      }
    </main>
  `,
  styles: [`
    :host { display: block; background: var(--ui-bg, #fff); color: var(--ui-ink, #171717); font-family: var(--font-sans, "Montserrat", Arial, sans-serif); }
    button, input { font-family: inherit; }
    .checkout-container { width: min(100%, var(--ui-page-max, 1280px)); margin: 0 auto; padding: 64px var(--ui-page-pad, 48px); }
    .page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 34px; padding-bottom: 16px; border-bottom: 1px solid var(--ui-ink, #171717); }
    .page-title { margin: 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 40px; font-weight: 400; line-height: 48px; letter-spacing: -1px; }
    .steps { display: flex; flex-wrap: wrap; gap: 8px 0; margin: 0; padding: 0; list-style: none; color: var(--ui-subtle, #747878); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .steps li + li::before { content: '→'; margin: 0 12px; color: var(--ui-line, #c4c7c7); }
    .steps a { color: var(--ui-ink, #171717); text-decoration: underline; text-underline-offset: 5px; }
    .steps .current { color: var(--ui-accent, #8f485d); }
    .checkout-layout { display: grid; grid-template-columns: minmax(0, 2.16fr) minmax(330px, 1fr); gap: 48px; align-items: start; }
    .form-col, .summary-col { min-width: 0; }
    .summary-col { position: sticky; top: 24px; }
    .checkout-card { margin-bottom: 24px; padding: 28px 32px; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; }
    .card-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,.2); }
    .card-title-row h2, .summary-card h2 { margin: 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 22px; font-weight: 500; line-height: 30px; letter-spacing: -.3px; }
    .notice { margin: 0; color: var(--ui-ink-soft, #444748); font-size: 13px; line-height: 1.6; }
    .btn-text { padding: 0; border: 0; border-bottom: 1px solid var(--ui-accent, #8f485d); background: none; color: var(--ui-accent, #8f485d); font-size: 12px; font-weight: 700; letter-spacing: .5px; text-decoration: none; cursor: pointer; }
    .link-text { color: var(--ui-ink, #171717); font-size: 12px; }
    .btn-primary, .btn-outline { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 22px; border: 1px solid var(--ui-ink, #171717); border-radius: 0; font-size: 12px; font-weight: 700; letter-spacing: .8px; text-decoration: none; cursor: pointer; }
    .btn-primary { background: var(--ui-ink, #171717); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); }
    .btn-outline { background: #fff; color: var(--ui-ink, #171717); }
    .btn-outline:hover:not(:disabled) { background: var(--ui-pink, #f4b8c1); }
    .btn-primary:disabled, .btn-outline:disabled { opacity: .45; cursor: not-allowed; }
    .alert-error { padding: 14px 16px; border: 1px solid var(--ui-danger, #9b2c2c); background: var(--ui-danger-bg, #fff1f1); color: var(--ui-danger, #9b2c2c); font-size: 13px; }
    .alert-error p { margin: 0 0 12px; }
    .address-options { display: flex; flex-direction: column; gap: 12px; }
    .address-radio-card { display: flex; align-items: flex-start; gap: 14px; padding: 16px; border: 1px solid var(--ui-line, #c4c7c7); background: #fff; cursor: pointer; }
    .address-radio-card input { margin-top: 3px; accent-color: var(--ui-ink, #171717); }
    .address-radio-card.selected { border-color: var(--ui-ink, #171717); background: var(--ui-bg-soft, #f5f3f3); }
    .addr-info strong { display: block; margin-bottom: 4px; font-size: 14px; }
    .addr-info p { margin: 0; color: var(--ui-ink-soft, #444748); font-size: 13px; line-height: 1.55; }
    .default-badge { display: inline-block; margin-bottom: 8px; padding: 2px 8px; background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); font-size: 10px; font-weight: 700; letter-spacing: 1px; }
    .new-address-form { display: flex; flex-direction: column; gap: 16px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--ui-line-soft, #e3e2e2); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .new-address-form label { display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .55px; text-transform: uppercase; }
    .new-address-form input, .voucher-input-row input { height: 44px; padding: 0 12px; border: 1px solid var(--ui-line, #c4c7c7); border-radius: 0; background: #fff; color: var(--ui-ink, #171717); font-size: 13px; outline: 0; }
    .new-address-form input:focus-visible, .voucher-input-row input:focus-visible { border-color: var(--ui-ink, #171717); box-shadow: 0 0 0 1px var(--ui-ink, #171717); }
    .field-label { display: block; margin-bottom: 8px; color: var(--ui-subtle, #747878); font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .voucher-block { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--ui-line-soft, #e3e2e2); }
    .voucher-input-row { display: flex; gap: 10px; }
    .voucher-input-row input { flex: 1; min-width: 0; text-transform: uppercase; }
    .voucher-success { margin: 12px 0 0; color: var(--ui-success, #276749); font-size: 13px; font-weight: 600; }
    .voucher-error { margin: 12px 0 0; color: var(--ui-danger, #9b2c2c); font-size: 13px; }
    .order-items { margin: 0; padding: 0; list-style: none; }
    .order-items li { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--ui-line-soft, #e3e2e2); }
    .order-items li:last-child { border-bottom: 0; padding-bottom: 0; }
    .oi-main { display: grid; gap: 4px; min-width: 0; }
    .oi-main strong { font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 16px; font-weight: 400; line-height: 1.4; }
    .oi-main span { color: var(--ui-ink-soft, #444748); font-size: 12px; }
    .oi-price { font-size: 14px; font-weight: 600; white-space: nowrap; }
    .summary-card { padding: 32px; border: 1px solid var(--ui-ink, #171717); background: #fff; }
    .summary-card h2 { margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,.2); }
    .summary-line { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin: 14px 0; color: var(--ui-ink-soft, #444748); font-size: 13px; line-height: 1.45; }
    .summary-line > :last-child { color: var(--ui-ink, #171717); text-align: right; }
    .discount-line > :last-child { color: var(--ui-success, #276749); }
    .summary-divider { margin: 16px 0; border: 0; border-top: 1px solid rgba(0,0,0,.2); }
    .total-line { align-items: baseline; font-size: 12px; font-weight: 700; letter-spacing: .7px; }
    .total-amount { color: var(--ui-price, #c52929); font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 28px; font-weight: 600; line-height: 1.15; }
    .btn-place-order { width: 100%; min-height: 50px; margin-top: 24px; padding: 0 16px; border: 1px solid var(--ui-ink, #171717); background: var(--ui-pink, #f4b8c1); color: var(--ui-ink, #171717); font-size: 12px; font-weight: 800; letter-spacing: 1.2px; cursor: pointer; }
    .btn-place-order:hover:not(:disabled) { background: var(--ui-ink, #171717); color: #fff; }
    .btn-place-order:disabled { border-color: var(--ui-line, #c4c7c7); background: var(--ui-bg-image, #efeded); color: var(--ui-subtle, #747878); cursor: not-allowed; }
    .terms-text { margin: 14px 0 0; color: var(--ui-ink-soft, #444748); font-size: 12px; line-height: 1.55; text-align: center; }
    .assurances { margin: 20px 0 0; padding: 16px 0 0; border-top: 1px solid var(--ui-line-soft, #e3e2e2); list-style: none; display: grid; gap: 8px; color: var(--ui-ink-soft, #444748); font-size: 12px; line-height: 1.5; }
    .state-card { display: grid; justify-items: center; gap: 14px; max-width: 620px; margin: 40px auto; padding: 56px 28px; border: 1px solid var(--ui-line, #c4c7c7); text-align: center; }
    .state-card h2 { margin: 0; font-family: var(--font-serif, "Playfair Display", Georgia, serif); font-size: 24px; font-weight: 500; }
    .state-card p { margin: 0; color: var(--ui-ink-soft, #444748); }
    :is(button, a, input):focus-visible { outline: 2px solid var(--ui-accent, #8f485d); outline-offset: 3px; }
    @media (max-width: 980px) {
      .checkout-container { padding-inline: 28px; }
      .checkout-layout { grid-template-columns: 1fr; }
      .summary-col { position: static; }
    }
    @media (max-width: 640px) {
      .checkout-container { padding: 36px 18px 56px; }
      .page-header { align-items: flex-start; flex-direction: column; }
      .page-title { font-size: 32px; line-height: 40px; }
      .form-row { grid-template-columns: 1fr; }
      .checkout-card, .summary-card { padding: 22px 18px; }
      .voucher-input-row { flex-direction: column; }
      .btn-primary, .btn-outline { width: 100%; }
    }
  `],
})
export class CheckoutPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute, { optional: true });

  readonly content = STORE_CHECKOUT_CONTENT;
  /** Sản phẩm được tick ở giỏ hàng; null = thanh toán cả giỏ. */
  readonly selectedVariantIds = signal<string[] | null>(parseSelectedItems(this.route?.snapshot?.queryParamMap?.get('items')));
  readonly orderItems = computed(() => {
    const items = this.cart.cart()?.items ?? [];
    const selected = this.selectedVariantIds();
    if (!selected) return items;
    const wanted = new Set(selected);
    return items.filter((item) => wanted.has(item.variantId));
  });
  readonly assurances = STORE_CART_CONTENT.assurances;

  readonly addresses = signal<UserAddress[]>([]);
  readonly selectedAddressId = signal<string>('');
  readonly loadingAddresses = signal<boolean>(true);

  readonly showNewAddressForm = signal<boolean>(false);
  newReceiver = '';
  newPhone = '';
  newLine1 = '';
  newWard = '';
  newDistrict = '';
  newProvince = '';
  readonly savingAddress = signal<boolean>(false);

  voucherCode = parseVoucherCode(this.route?.snapshot?.queryParamMap?.get('voucher'));
  readonly appliedVoucherCode = signal('');
  readonly voucherError = signal('');
  readonly quoteError = signal('');
  readonly quote = signal<CheckoutQuote | null>(null);
  readonly quoting = signal<boolean>(false);
  private quoteSubscription?: Subscription;
  private quoteAddressId = '';

  readonly placingOrder = signal<boolean>(false);
  private readonly auth = inject(AuthService, { optional: true });
  private readonly requests = new Subscription();
  readonly addressLoadError = signal('');
  readonly pendingOrder = signal<{ quoteId: string; key: string } | null>(null);

  private recoveryStorageKey(): string { return 'fashion_checkout_pending:' + (this.auth?.currentUser?.()?.id ?? 'anonymous'); }
  private persistPending(): void {
    try {
      const pending = this.pendingOrder();
      if (pending) sessionStorage.setItem(this.recoveryStorageKey(), JSON.stringify(pending));
      else sessionStorage.removeItem(this.recoveryStorageKey());
    } catch { /* The in-memory key still protects retries within this tab. */ }
  }

  ngOnInit(): void {
    try {
      const raw = sessionStorage.getItem(this.recoveryStorageKey());
      const pending = raw ? JSON.parse(raw) : null;
      if (typeof pending?.quoteId === 'string' && typeof pending?.key === 'string') this.pendingOrder.set(pending);
    } catch { /* Browser storage may be unavailable. */ }
    if (this.pendingOrder()) this.recoverPendingOrder();
    else this.loadAddresses();
  }

  ngOnDestroy(): void {
    this.quoteSubscription?.unsubscribe();
    this.requests.unsubscribe();
  }

  loadAddresses(): void {
    this.loadingAddresses.set(true);
    this.addressLoadError.set('');
    this.requests.add(this.api.listAddresses().subscribe({
      next: (res) => {
        this.addresses.set(res.items);
        this.loadingAddresses.set(false);

        if (res.items.length > 0) {
          const defaultAddr = res.items.find((a) => a.isDefault) || res.items[0];
          this.selectedAddressId.set(defaultAddr.id);
          this.applyQuote();
        } else {
          this.showNewAddressForm.set(true);
        }
      },
      error: () => {
        this.loadingAddresses.set(false);
        this.addressLoadError.set('Không thể tải địa chỉ. Vui lòng thử lại.');
      },
    }));
  }

  selectAddress(id: string): void {
    this.selectedAddressId.set(id);
    this.applyQuote();
  }

  toggleNewAddress(): void {
    this.showNewAddressForm.update((v) => !v);
  }

  saveNewAddress(): void {
    if (!this.newReceiver || !this.newPhone || !this.newLine1 || !this.newWard || !this.newDistrict || !this.newProvince) {
      this.toast.warning('Vui lòng điền đầy đủ các thông tin địa chỉ.');
      return;
    }

    this.savingAddress.set(true);
    this.api.createAddress({
      receiver: this.newReceiver,
      phone: this.newPhone,
      line1: this.newLine1,
      ward: this.newWard,
      district: this.newDistrict,
      province: this.newProvince,
      isDefault: this.addresses().length === 0,
    }).subscribe({
      next: (addr) => {
        this.savingAddress.set(false);
        this.showNewAddressForm.set(false);
        this.addresses.update((list) => [addr, ...list]);
        this.selectedAddressId.set(addr.id);
        this.toast.success('Đã lưu địa chỉ giao hàng.');
        this.applyQuote();
      },
      error: (err) => {
        this.savingAddress.set(false);
        this.toast.error(err.error?.message || 'Không thể lưu địa chỉ.');
      },
    });
  }

  applyQuote(): void {
    if (this.pendingOrder()) return;
    const addrId = this.selectedAddressId();
    if (!addrId) return;

    this.quoteSubscription?.unsubscribe();
    const requestedVoucher = this.voucherCode.trim().toUpperCase();
    this.quoting.set(true);
    this.voucherError.set('');
    this.quoteError.set('');
    if (this.quoteAddressId !== addrId) {
      this.quote.set(null);
      this.appliedVoucherCode.set('');
    }
    const variantIds = this.selectedVariantIds() ?? undefined;
    this.quoteSubscription = this.api.createQuote({
      addressId: addrId,
      voucherCode: requestedVoucher || undefined,
      variantIds,
    }).pipe(
      map((q) => ({ q, code: requestedVoucher && q.voucherDiscount > 0 ? requestedVoucher : '' })),
      catchError((err) => {
        const message = VOUCHER_ERRORS[err.error?.code];
        if (!requestedVoucher || err.status !== 400 || !message) return throwError(() => err);
        this.voucherError.set(`${message} Bạn có thể đặt hàng không dùng mã này.`);
        return this.api.createQuote({ addressId: addrId, variantIds }).pipe(map((q) => ({ q, code: '' })));
      }),
    ).subscribe({
      next: ({ q, code }) => {
        this.quote.set(q);
        this.quoteAddressId = addrId;
        this.appliedVoucherCode.set(code);
        this.quoting.set(false);
        if (code) {
          this.toast.success('Áp dụng mã giảm giá thành công!');
        }
      },
      error: (err) => {
        this.quote.set(null);
        this.appliedVoucherCode.set('');
        this.quoting.set(false);
        this.quoteError.set(err.error?.message || 'Không thể cập nhật báo giá. Vui lòng thử lại.');
        this.toast.error(this.quoteError());
      },
    });
  }

  placeOrder(): void {
    if (this.pendingOrder()) { this.recoverPendingOrder(); return; }
    const q = this.quote();
    if (!q || this.placingOrder() || this.quoting()) return;
    if (Date.parse(q.expiresAt) <= Date.now()) {
      this.toast.warning('Báo giá đã hết hạn. Vui lòng kiểm tra lại tổng tiền.');
      this.applyQuote();
      return;
    }

    this.pendingOrder.set({ quoteId: q.id, key: generateUUID() });
    this.persistPending();
    this.recoverPendingOrder();
  }

  recoverPendingOrder(): void {
    const pending = this.pendingOrder();
    if (!pending || this.placingOrder()) return;
    this.placingOrder.set(true);
    // The same POST recovers committed orders even after reload or quote expiry.
    this.requests.add(this.api.createOrder({ quoteId: pending.quoteId }, pending.key).subscribe({
      next: (order) => {
        this.placingOrder.set(false);
        this.pendingOrder.set(null); this.persistPending();
        this.cart.resetAfterCheckout();
        this.toast.success('Đặt hàng thành công! Đang chuyển tới trang thanh toán...');
        this.router.navigate(['/payment', order.id]);
      },
      error: (err) => {
        this.placingOrder.set(false);
        if (!err.status || err.status >= 500 || [408, 429].includes(err.status)) {
          this.toast.warning('Chưa xác định được kết quả. Hãy kiểm tra đơn hàng, không tạo yêu cầu mới.');
          return;
        }
        this.pendingOrder.set(null); this.persistPending();
        this.toast.error(err.error?.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
        this.loadAddresses();
      },
    }));
  }
}
