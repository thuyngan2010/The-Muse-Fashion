import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { UserAddress, CheckoutQuote } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { catchError, map, Subscription, throwError } from 'rxjs';

const VOUCHER_ERRORS: Record<string, string> = {
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
        <span class="eyebrow">THANH TOÁN</span>
        <h1 class="page-title">Xác nhận đơn hàng</h1>
      </header>

      @if (pendingOrder()) {
        <section class="checkout-card" role="status" aria-live="polite">
          <h2>Đang xác minh kết quả đặt hàng</h2>
          <p>Yêu cầu có thể đã được ghi nhận. Vui lòng kiểm tra lại; không cần tạo đơn khác.</p>
          <button type="button" class="btn-primary" [disabled]="placingOrder()" (click)="recoverPendingOrder()">{{ placingOrder() ? 'Đang kiểm tra…' : 'Kiểm tra đơn hàng' }}</button>
          <a routerLink="/orders">Xem lịch sử đơn hàng</a>
        </section>
      } @else if (cart.itemCount() === 0) {
        <div class="empty-notice">
          <p>Giỏ hàng của bạn đang trống.</p>
          <a routerLink="/" class="btn-primary">Quay lại cửa hàng</a>
        </div>
      } @else {
        <div class="checkout-layout">
          <!-- Left Column: Address & Details -->
          <div class="form-col">
            <!-- Step 1: Delivery Address -->
            <section class="checkout-card">
              <div class="card-title-row">
                <h3>1. Địa chỉ giao hàng</h3>
                <button type="button" class="btn-text" (click)="toggleNewAddress()">
                  {{ showNewAddressForm() ? 'Hủy thêm địa chỉ' : '+ Thêm địa chỉ mới' }}
                </button>
              </div>

              @if (addressLoadError()) {
                <p role="alert">{{ addressLoadError() }}</p>
                <button type="button" class="btn-outline" (click)="loadAddresses()">Tải lại địa chỉ</button>
              }
              @if (loadingAddresses()) {
                <p class="notice">Đang tải danh sách địa chỉ...</p>
              }

              <!-- Existing addresses radio list -->
              @if (!showNewAddressForm() && addresses().length > 0) {
                <div class="address-options">
                  @for (addr of addresses(); track addr.id) {
                    <label class="address-radio-card" [class.selected]="selectedAddressId() === addr.id">
                      <input
                        type="radio"
                        name="addressRadio"
                        [value]="addr.id"
                        [checked]="selectedAddressId() === addr.id"
                        (change)="selectAddress(addr.id)"
                      />
                      <div class="addr-info">
                        <strong>{{ addr.receiver }} · {{ addr.phone }}</strong>
                        <p>{{ addr.line1 }}, {{ addr.ward }}, {{ addr.district }}, {{ addr.province }}</p>
                        @if (addr.isDefault) {
                          <span class="default-badge">Mặc định</span>
                        }
                      </div>
                    </label>
                  }
                </div>
              }

              <!-- Inline New Address Form -->
              @if (showNewAddressForm() || addresses().length === 0) {
                <form (ngSubmit)="saveNewAddress()" class="new-address-form">
                  <div class="form-row">
                    <label>
                      Họ tên người nhận *
                      <input type="text" [(ngModel)]="newReceiver" name="receiver" required />
                    </label>
                    <label>
                      Số điện thoại *
                      <input type="tel" [(ngModel)]="newPhone" name="phone" required />
                    </label>
                  </div>
                  <div class="form-row">
                    <label>
                      Địa chỉ nhà / số đường *
                      <input type="text" [(ngModel)]="newLine1" name="line1" required />
                    </label>
                    <label>
                      Phường / Xã *
                      <input type="text" [(ngModel)]="newWard" name="ward" required />
                    </label>
                  </div>
                  <div class="form-row">
                    <label>
                      Quận / Huyện *
                      <input type="text" [(ngModel)]="newDistrict" name="district" required />
                    </label>
                    <label>
                      Tỉnh / Thành phố *
                      <input type="text" [(ngModel)]="newProvince" name="province" required />
                    </label>
                  </div>
                  <button type="submit" class="btn-primary" [disabled]="savingAddress()">
                    {{ savingAddress() ? 'Đang lưu...' : 'Lưu và dùng địa chỉ này' }}
                  </button>
                </form>
              }
            </section>

            <!-- Step 2: Voucher / Mã giảm giá -->
            <section class="checkout-card">
              <h3 id="voucher-heading">2. Mã ưu đãi / Voucher</h3>
              <div class="voucher-input-row">
                <input
                  type="text"
                  placeholder="Nhập mã ưu đãi của bạn"
                  [(ngModel)]="voucherCode"
                  (ngModelChange)="voucherError.set('')"
                  aria-labelledby="voucher-heading"
                  [attr.aria-invalid]="voucherError() ? 'true' : null"
                  [attr.aria-describedby]="voucherError() ? 'voucher-feedback' : null"
                  name="voucher"
                  (keyup.enter)="applyQuote()"
                />
                <button type="button" class="btn-outline" (click)="applyQuote()" [disabled]="quoting()">
                  {{ quoting() ? 'Đang kiểm tra...' : 'Áp dụng' }}
                </button>
              </div>
              @if (voucherError()) {
                <p id="voucher-feedback" class="voucher-error" role="status">{{ voucherError() }}</p>
              }
              @if (appliedVoucherCode(); as code) {
                <p class="voucher-success">✓ Đã áp dụng mã: {{ code }}</p>
              }
            </section>
          </div>

          <!-- Right Column: Order Summary & Pay -->
          <aside class="summary-col">
            <div class="summary-card">
              <h3>Chi tiết thanh toán</h3>

              @if (quote(); as q) {
                <div class="summary-line">
                  <span>Tạm tính hàng</span>
                  <strong>{{ q.subtotal | currency:'VND':'symbol':'1.0-0' }}</strong>
                </div>

                <div class="summary-line">
                  <span>Phí vận chuyển</span>
                  <span>{{ q.shippingFee | currency:'VND':'symbol':'1.0-0' }}</span>
                </div>

                @if (q.voucherDiscount > 0) {
                  <div class="summary-line discount-line">
                    <span>Giảm giá voucher</span>
                    <span>-{{ q.voucherDiscount | currency:'VND':'symbol':'1.0-0' }}</span>
                  </div>
                }

                <hr class="summary-divider" />

                <div class="summary-line total-line">
                  <span>Tổng thanh toán</span>
                  <span class="total-amount">{{ q.payableTotal | currency:'VND':'symbol':'1.0-0' }}</span>
                </div>
              } @else {
                <p class="notice" role="status">{{ quoting() ? 'Đang cập nhật báo giá...' : quoteError() || 'Vui lòng chọn hoặc thêm địa chỉ nhận hàng để tính cước phí.' }}</p>
              }

              <button
                type="button"
                class="btn-place-order"
                [disabled]="placingOrder() || quoting() || !quote() || !selectedAddressId()"
                (click)="placeOrder()"
              >
                {{ placingOrder() ? 'Đang khởi tạo đơn hàng...' : 'Xác nhận đặt hàng & Thanh toán VietQR' }}
              </button>

              <p class="terms-text">
                Bằng việc xác nhận, bạn đồng ý với các điều khoản mua sắm và chính sách giao hàng của Fashion Commerce.
              </p>
            </div>
          </aside>
        </div>
      }
    </main>
  `,
  styles: [`
    .checkout-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 6vw 100px;
    }
    .page-header {
      margin-bottom: 30px;
    }
    .eyebrow {
      font-size: 0.74rem;
      letter-spacing: 0.25em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .page-title {
      font-family: Georgia, serif;
      font-size: 2.4rem;
      font-weight: 500;
      margin: 8px 0 0;
    }
    .checkout-layout {
      display: grid;
      grid-template-columns: 1fr 400px;
      gap: 40px;
      align-items: start;
    }
    .checkout-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 26px;
      margin-bottom: 24px;
    }
    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .card-title-row h3, .checkout-card h3 {
      font-family: Georgia, serif;
      font-size: 1.25rem;
      font-weight: 500;
      margin: 0;
    }
    .btn-text {
      background: none;
      border: 0;
      color: var(--color-accent);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .address-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .address-radio-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      border: 1px solid var(--color-divider);
      border-radius: 6px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .address-radio-card.selected {
      border-color: var(--color-text);
      background: var(--color-canvas);
    }
    .addr-info strong {
      display: block;
      font-size: 0.95rem;
      color: var(--color-text);
      margin-bottom: 4px;
    }
    .addr-info p {
      font-size: 0.88rem;
      color: var(--color-muted);
      margin: 0 0 6px;
      line-height: 1.5;
    }
    .default-badge {
      font-size: 0.72rem;
      background: #e8e4dc;
      color: #555;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }
    .new-address-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 14px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .new-address-form label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: #444;
    }
    .new-address-form input {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 10px 12px;
      font-size: 0.9rem;
    }
    .voucher-input-row {
      display: flex;
      gap: 10px;
      margin-top: 14px;
    }
    .voucher-input-row input {
      flex: 1;
      min-width: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 10px 14px;
      font-size: 0.9rem;
      text-transform: uppercase;
    }
    .voucher-success {
      font-size: 0.85rem;
      color: #2e7d32;
      font-weight: 500;
      margin: 10px 0 0;
    }
    .voucher-error {
      color: #a12424;
      font-size: 0.85rem;
      margin: 10px 0 0;
    }
    .summary-card {
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: 28px;
    }
    .summary-card h3 {
      font-family: Georgia, serif;
      font-size: 1.35rem;
      font-weight: 500;
      margin: 0 0 20px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--color-divider);
    }
    .summary-line {
      display: flex;
      justify-content: space-between;
      margin-bottom: 14px;
      font-size: 0.92rem;
      color: #555;
    }
    .discount-line {
      color: #2e7d32;
    }
    .summary-divider {
      border: 0;
      border-top: 1px solid var(--color-divider);
      margin: 16px 0;
    }
    .total-line {
      font-size: 1.15rem;
      color: var(--color-text);
      font-weight: 600;
    }
    .total-amount {
      color: var(--color-accent);
      font-size: 1.4rem;
    }
    .btn-place-order {
      width: 100%;
      background: var(--color-primary);
      color: var(--color-surface);
      border: 0;
      border-radius: var(--radius-control);
      padding: 16px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 20px;
      transition: background 0.15s;
    }
    .btn-place-order:hover:not(:disabled) {
      background: #3e3b37;
    }
    .btn-place-order:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .terms-text {
      font-size: 0.76rem;
      color: var(--color-muted);
      line-height: 1.5;
      margin-top: 14px;
      text-align: center;
    }
    @media (max-width: 860px) {
      .checkout-layout {
        grid-template-columns: 1fr;
      }
      .form-row {
        grid-template-columns: 1fr;
      }
    }
    .form-col,.summary-col { min-width:0; } .empty-notice { padding:48px 24px; text-align:center; background:var(--color-canvas); border-radius:var(--radius-card); border:1px dashed var(--color-border); }

  `],
})
export class CheckoutPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

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

  voucherCode = '';
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
    this.quoteSubscription = this.api.createQuote({
      addressId: addrId,
      voucherCode: requestedVoucher || undefined,
    }).pipe(
      map((q) => ({ q, code: requestedVoucher && q.voucherDiscount > 0 ? requestedVoucher : '' })),
      catchError((err) => {
        const message = VOUCHER_ERRORS[err.error?.code];
        if (!requestedVoucher || err.status !== 400 || !message) return throwError(() => err);
        this.voucherError.set(`${message} Bạn có thể đặt hàng không dùng mã này.`);
        return this.api.createQuote({ addressId: addrId }).pipe(map((q) => ({ q, code: '' })));
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
