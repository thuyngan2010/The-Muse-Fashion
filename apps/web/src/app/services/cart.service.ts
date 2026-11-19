import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { catchError, of, tap } from 'rxjs';
import type { Cart, CartItem } from '@fashion/contracts';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

const GUEST_CART_KEY = 'fashion_guest_cart';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly cart = signal<Cart | null>(null);
  readonly loading = signal<boolean>(false);

  readonly itemCount = computed(() => {
    const items = this.cart()?.items ?? [];
    return items.reduce((sum, item) => sum + item.quantity, 0);
  });

  readonly subtotal = computed(() => {
    return this.cart()?.subtotal ?? 0;
  });

  constructor() {
    // Whenever auth state changes, re-sync cart
    effect(() => {
      const isAuth = this.auth.isAuthenticated();
      if (isAuth && this.auth.isCustomer()) {
        this.syncGuestCartToBackend();
      } else if (isAuth) {
        this.cart.set({ items: [], subtotal: 0 });
      } else {
        this.loadGuestCart();
      }
    });
  }

  private loadGuestCart(): void {
    try {
      const stored = localStorage.getItem(GUEST_CART_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Cart;
        this.cart.set(parsed);
        return;
      }
    } catch {
      // ignore
    }
    this.cart.set({ items: [], subtotal: 0 });
  }

  private saveGuestCart(cart: Cart): void {
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    } catch {
      // ignore
    }
    this.cart.set(cart);
  }

  private syncGuestCartToBackend(): void {
    let guestItems: CartItem[] = [];
    try {
      const stored = localStorage.getItem(GUEST_CART_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Cart;
        guestItems = parsed.items || [];
      }
    } catch {
      // ignore
    }

    this.loading.set(true);
    this.api.getCart().pipe(
      tap((serverCart) => {
        if (guestItems.length > 0) {
          // Merge guest items with server items
          const itemMap = new Map<string, number>();
          for (const item of serverCart.items) {
            itemMap.set(item.variantId, item.quantity);
          }
          for (const item of guestItems) {
            const current = itemMap.get(item.variantId) ?? 0;
            itemMap.set(item.variantId, Math.min(99, current + item.quantity));
          }
          const merged = Array.from(itemMap.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));

          this.api.replaceCart(merged).pipe(
            tap((updated) => {
              this.cart.set(updated);
              localStorage.removeItem(GUEST_CART_KEY);
              this.loading.set(false);
            }),
            catchError(() => {
              this.cart.set(serverCart);
              this.loading.set(false);
              this.toast.warning('Chưa thể hợp nhất giỏ hàng. Giỏ khách vẫn được giữ lại.');
              return of(null);
            }),
          ).subscribe();
        } else {
          this.cart.set(serverCart);
          this.loading.set(false);
        }
      }),
      catchError(() => { this.loading.set(false); this.toast.error('Không thể tải giỏ hàng.'); return of(null); }),
    ).subscribe();
  }

  mergeCartOnLogin(): void {
    this.syncGuestCartToBackend();
  }

  loadCart(): void {
    if (!this.auth.isAuthenticated()) {
      this.loadGuestCart();
      return;
    }

    this.loading.set(true);
    this.api.getCart().pipe(
      tap((cart) => {
        this.cart.set(cart);
        this.loading.set(false);
      }),
      catchError(() => {
        this.loading.set(false);
        return of(null);
      }),
    ).subscribe();
  }

  addItem(item: { variantId: string; sku: string; productName: string; unitPrice: number; quantity: number; available: number }): void {
    if (this.loading()) return;
    if (this.auth.isAuthenticated() && !this.auth.isCustomer()) {
      this.toast.info('Vui lòng dùng tài khoản khách hàng để mua sắm.');
      return;
    }
    if (item.available <= 0 || !Number.isInteger(item.quantity) || item.quantity < 1) return;
    const currentItems = this.cart()?.items ?? [];
    const existingIndex = currentItems.findIndex((i) => i.variantId === item.variantId);

    let nextItems: CartItem[];
    if (existingIndex >= 0) {
      nextItems = [...currentItems];
      const newQty = Math.min(nextItems[existingIndex].quantity + item.quantity, item.available, 99);
      nextItems[existingIndex] = { ...nextItems[existingIndex], quantity: newQty };
    } else {
      nextItems = [...currentItems, { ...item }];
    }

    this.saveItems(nextItems, 'Đã thêm sản phẩm vào giỏ hàng');
  }

  updateQuantity(variantId: string, quantity: number): void {
    if (this.loading() || !Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      this.removeItem(variantId);
      return;
    }

    const currentItems = this.cart()?.items ?? [];
    const nextItems = currentItems.map((item) => {
      if (item.variantId === variantId) {
        const validQty = Math.min(quantity, item.available, 99);
        return { ...item, quantity: validQty };
      }
      return item;
    });

    this.saveItems(nextItems);
  }

  removeItem(variantId: string): void {
    if (this.loading()) return;
    const currentItems = this.cart()?.items ?? [];
    const nextItems = currentItems.filter((i) => i.variantId !== variantId);
    this.saveItems(nextItems, 'Đã xóa sản phẩm khỏi giỏ hàng');
  }

  clearCart(): void {
    if (this.loading()) return;
    if (this.auth.isAuthenticated()) {
      this.loading.set(true);
      this.api.clearCart().subscribe({
        next: () => { this.resetAfterCheckout(); this.loading.set(false); },
        error: () => { this.loading.set(false); this.toast.error('Không thể xóa giỏ hàng.'); },
      });
    } else {
      this.saveGuestCart({ items: [], subtotal: 0 });
    }
  }

  resetAfterCheckout(): void {
    this.cart.set({ items: [], subtotal: 0 });
    // Đặt hàng chỉ với sản phẩm được tick thì các sản phẩm còn lại vẫn ở giỏ trên máy chủ: tải lại để hiển thị đúng.
    if (this.auth.isAuthenticated() && this.auth.isCustomer()) {
      this.api.getCart().subscribe({ next: (cart) => this.cart.set(cart), error: () => undefined });
    }
  }

  private saveItems(items: CartItem[], toastMsg?: string): void {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const newCart: Cart = { items, subtotal };

    if (this.auth.isAuthenticated()) {
      this.loading.set(true);
      const payload = items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      this.api.replaceCart(payload).pipe(
        tap((res) => {
          this.cart.set(res);
          this.loading.set(false);
          if (toastMsg) this.toast.success(toastMsg);
        }),
        catchError((err) => {
          this.loading.set(false);
          const msg = err.error?.message || 'Không thể cập nhật giỏ hàng.';
          this.toast.error(msg);
          return of(null);
        }),
      ).subscribe();
    } else {
      this.saveGuestCart(newCart);
      if (toastMsg) this.toast.success(toastMsg);
    }
  }
}
