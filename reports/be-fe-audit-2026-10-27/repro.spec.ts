// Diagnostic reproductions: these assertions describe the observed defects, not desired behavior.
// Kept outside application tests so they do not make these defects part of the product contract.
import 'reflect-metadata';
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { EMPTY, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../apps/web/src/app/services/api.service';
import { AuthService } from '../../apps/web/src/app/services/auth.service';
import { CartService } from '../../apps/web/src/app/services/cart.service';
import { ToastService } from '../../apps/web/src/app/services/toast.service';
import { ServerStatusService } from '../../apps/web/src/app/services/server-status.service';
import { authInterceptor } from '../../apps/web/src/app/services/auth.interceptor';
import { AdminOrdersPage } from '../../apps/web/src/app/pages/admin/admin-orders.page';
import { AdminRefundsPage } from '../../apps/web/src/app/pages/admin/admin-refunds.page';
import { AdminUsersPage } from '../../apps/web/src/app/pages/admin/admin-users.page';
import { AdminProductsPage } from '../../apps/web/src/app/pages/admin/admin-products.page';
import { ProductPage } from '../../apps/web/src/app/pages/product.page';
import { OrderDetailPage } from '../../apps/web/src/app/pages/order-detail.page';
import { AiTryOnPage } from '../../apps/web/src/app/pages/ai-try-on.page';
import { AiMixMatchPage } from '../../apps/web/src/app/pages/ai-mix-match.page';
import { OrdersPage } from '../../apps/web/src/app/pages/orders.page';
import { PaginationQueryDto } from '../../apps/api/src/common/pagination-query.dto';
import { FailRefundDto } from '../../apps/api/src/modules/payments/refunds.dto';
import { AdminController } from '../../apps/api/src/modules/admin/admin.controller';
import { VoucherService } from '../../apps/api/src/modules/commerce/voucher.service';
import { InventoryReservationService } from '../../apps/api/src/modules/commerce/inventory-reservation.service';
import { InventoryService } from '../../apps/api/src/modules/commerce/inventory.service';
import { OrderService } from '../../apps/api/src/modules/commerce/order.service';
import { ReviewsService } from '../../apps/api/src/modules/community/reviews.service';
import { AiService } from '../../apps/api/src/modules/ai/ai.service';
import { AiCleanupWorker } from '../../apps/api/src/modules/ai/ai-cleanup.worker';
import { sanitizeImage } from '../../apps/api/src/modules/storage/image-sanitize.util';
import { hash, compare } from 'bcryptjs';

vi.mock('@angular/core', async (original) => ({ ...await original<typeof import('@angular/core')>(), effect: vi.fn() }));
vi.hoisted(() => { vi.stubGlobal('window', {}); });

const id = '657000000000000000000002';
const staff = { id, fullName: 'Test Staff', role: 'STAFF', status: 'ACTIVE' };
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
function make<T>(Type: new (...args: any[]) => T, api: any = {}, auth: any = {}, extra: any[] = []) {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth },
    { provide: ToastService, useValue: toast }, { provide: Router, useValue: { url: '/', navigate: vi.fn() } },
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => id } } } },
    { provide: CartService, useValue: {} }, ...extra,
  ] });
  return runInInjectionContext(injector, () => new Type());
}
function q(value: any) {
  const result: any = {};
  for (const method of ['sort', 'skip', 'limit', 'lean', 'session', 'select']) result[method] = vi.fn(() => result);
  result.exec = vi.fn(async () => value);
  return result;
}
function pagedQuery(rows: any[]) {
  const result = q(rows);
  let skip = 0;
  let limit: number | undefined;
  result.skip = vi.fn((n: number) => { skip = n; return result; });
  result.limit = vi.fn((n: number) => { limit = n; return result; });
  result.exec = vi.fn(async () => rows.slice(skip, limit === undefined ? undefined : skip + limit));
  return result;
}
const connection: any = { startSession: async () => ({ withTransaction: async (fn: any) => fn(), endSession: async () => {} }) };
const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', storage);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Audit: FE/API contracts', () => {
  it('the staff assignment picker requests limit=100, rejected by the actual API DTO', async () => {
    const adminListUsers = vi.fn(() => EMPTY);
    make(AdminOrdersPage, { adminListUsers }).openAssignModal({ id } as any);
    expect(adminListUsers).toHaveBeenCalledWith(1, 100);
    const errors = await validate(plainToInstance(PaginationQueryDto, { page: 1, limit: 100 }));
    expect(errors.some(e => e.property === 'limit')).toBe(true);
  });

  it('the refund failure form omits mandatory evidenceObjectKey', async () => {
    const adminFailRefund = vi.fn(() => EMPTY);
    const page = make(AdminRefundsPage, { adminFailRefund });
    page.openFailModal({ id, state: 'APPROVED' } as any);
    page.failReason = 'Transfer failed';
    page.submitFailRefund();
    const payload = adminFailRefund.mock.calls[0][1];
    const errors = await validate(plainToInstance(FailRefundDto, payload));
    expect(errors.some(e => e.property === 'evidenceObjectKey')).toBe(true);
  });

  it('Grant POST uses the replacement service, while FE opens with all old grants unchecked', () => {
    const replaceStaffPermissions = vi.fn();
    const controller = new AdminController({ replaceStaffPermissions } as any, {} as any, {} as any);
    const grants = [{ permission: 'order.read', scope: 'ASSIGNED' }];
    controller.grantPermission({ user: { sub: 'admin' } } as any, id, { grants } as any);
    expect(replaceStaffPermissions).toHaveBeenCalledWith('admin', id, grants);
    const page = make(AdminUsersPage);
    page.openPermissionsModal(staff as any);
    expect(Object.values(page.permState).every(p => !p.enabled)).toBe(true);
  });

  it('draft variant fallback sends invented size/color/price/status back as real values', () => {
    const adminUpdateVariant = vi.fn(() => EMPTY);
    const page = make(AdminProductsPage, {
      product: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      adminListInventory: () => of({ items: [{ variantId: id, sku: 'SKU', productName: 'Draft Product', stockOnHand: 5, reserved: 0, available: 5 }] }),
      adminUpdateVariant,
    });
    page.openManageVariantsModal({ id, name: 'Draft Product', slug: 'draft', price: 200000, status: 'DRAFT' } as any);
    page.startEditVariant(page.currentVariants()[0]);
    page.submitUpdateVariant();
    expect(adminUpdateVariant.mock.calls[0][2]).toMatchObject({ size: '—', color: '—', price: 200000, status: 'ACTIVE' });
  });

  it('after reload, order detail has no previously submitted review ID to update', () => {
    const page = make(OrderDetailPage, { getOrder: () => of({ id, items: [{ lineId: id }] }) });
    page.fetchOrder(id);
    page.openReviewModal({ lineId: id });
    expect(page.editingReviewId()).toBe('');
    expect(page.itemReviews()).toEqual({});
  });

  it('public review responses omit the owner/order item required by the FE edit controls', async () => {
    const row = { _id: id, productId: id, customerId: id, orderItemId: id, stars: 5, content: 'Good' };
    const reviews = { find: () => q([row]), countDocuments: () => q(1) };
    const result = await new ReviewsService(reviews as any, {} as any, {} as any, {} as any).listPublic(id);
    expect(result.items[0]).not.toHaveProperty('customerId');
    expect(result.items[0]).not.toHaveProperty('orderItemId');
    const page = make(ProductPage, {}, { currentUser: () => ({ id }), isAdmin: () => false });
    expect(page.canManageReview(result.items[0] as any)).toBe(false);
  });

  it('approving a refund discards the only response containing its QR', () => {
    const page = make(AdminRefundsPage, {
      adminApproveRefund: () => of({ id, state: 'APPROVED', qrImageUrl: 'https://qr.example.test/image' }),
      adminListRefunds: () => of({ items: [{ id, state: 'APPROVED' }] }),
    });
    vi.stubGlobal('confirm', () => true);
    page.approveRefund({ id } as any);
    expect(page.refunds()[0]).not.toHaveProperty('qrImageUrl');
    expect(page.detailedRefund()).toBeNull();
  });

  it('order history takes the first 20 records and has no total/page state', () => {
    const listOrders = vi.fn(() => of({ items: Array.from({ length: 20 }, (_, i) => ({ id: String(i) })), total: 55, page: 1, limit: 20 }));
    const page = make(OrdersPage, { listOrders });
    page.loadOrders();
    expect(listOrders).toHaveBeenCalledWith();
    expect(page.orders()).toHaveLength(20);
    expect(page).not.toHaveProperty('total');
    expect(page).not.toHaveProperty('page');
  });
});

describe('Audit: auth, request ordering and AI polling', () => {
  it('a temporary profile network error clears a still valid local login', async () => {
    const auth = make(AuthService, { getProfile: () => throwError(() => new HttpErrorResponse({ status: 0 })) });
    auth.setToken('still-valid-token');
    auth.setCurrentUser({ id, role: 'CUSTOMER' } as any);
    await firstValueFrom(auth.initAuth());
    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });

  it('an expired token on change-password never triggers a refresh', async () => {
    const refresh = vi.fn(() => of({ accessToken: 'new-token' }));
    const injector = Injector.create({ providers: [
      { provide: AuthService, useValue: { token: () => 'expired-token', refresh } },
      { provide: Router, useValue: { url: '/profile' } },
      { provide: ServerStatusService, useValue: {} },
    ] });
    const response = runInInjectionContext(injector, () => authInterceptor(
      new HttpRequest('POST', '/api/v1/auth/change-password', {}),
      () => throwError(() => new HttpErrorResponse({ status: 401 })),
    ));
    await expect(firstValueFrom(response)).rejects.toHaveProperty('status', 401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('an older product response can overwrite the product for the current route', () => {
    const older = new Subject<any>();
    const newer = new Subject<any>();
    const page = make(ProductPage, { product: (slug: string) => slug === 'older' ? older : newer, listReviews: () => of({ items: [] }) });
    page.loadProduct('older');
    page.loadProduct('newer');
    newer.next({ id: 'newer', name: 'New', images: [], variants: [] });
    older.next({ id: 'older', name: 'Old', images: [], variants: [] });
    expect(page.product()?.id).toBe('older');
  });

  it('a pending quantity update can resurrect an item removed by a later request', () => {
    const first = new Subject<any>();
    const second = new Subject<any>();
    const replaceCart = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const page = make(CartService, { replaceCart }, { isAuthenticated: () => true, isCustomer: () => true });
    page.cart.set({ items: [{ variantId: id, quantity: 1, available: 5, unitPrice: 10 }], subtotal: 10 } as any);
    page.updateQuantity(id, 2);
    page.removeItem(id);
    expect(replaceCart).toHaveBeenCalledTimes(2);
    second.next({ items: [], subtotal: 0 });
    first.next({ items: [{ variantId: id, quantity: 2 }], subtotal: 20 });
    expect(page.cart()?.items).toHaveLength(1);
  });

  it.each([['TryOn', AiTryOnPage], ['MixMatch', AiMixMatchPage]] as const)('%s stops polling forever after one network error', (_label, Page) => {
    vi.useFakeTimers();
    const getAiJob = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 0 })));
    const page = make(Page as any, { getAiJob }) as any;
    page.job.set({ id, state: 'PROCESSING' });
    page.pollJob(id);
    vi.advanceTimersByTime(30000);
    expect(getAiJob).toHaveBeenCalledTimes(1);
    expect(page.job().state).toBe('PROCESSING');
    page.ngOnDestroy();
  });
});

describe('Audit: backend data integrity and boundaries', () => {
  it('renaming a used voucher leaves old orders unable to release its usage', async () => {
    const voucher = { _id: id, code: 'OLD', type: 'FIXED', value: 10, usedCount: 1,
      validFrom: new Date(Date.now() - 86400000), validTo: new Date(Date.now() + 86400000) };
    const vouchers = {
      findById: () => q(voucher),
      findOneAndUpdate: (_filter: any, update: any) => { Object.assign(voucher, update.$set); return q(voucher); },
      updateOne: (filter: any) => q({ modifiedCount: filter.code === voucher.code ? 1 : 0 }),
    };
    await new VoucherService(vouchers as any, connection, { record: vi.fn() } as any).update(id, { code: 'NEW' });
    expect(voucher.code).toBe('NEW');
    const reservations = new InventoryReservationService(connection, {} as any, { findOne: () => q(null) } as any, vouchers as any);
    await expect(reservations.releaseVoucherUsage('order', 'OLD', id, {} as any)).rejects.toThrow('Voucher usage cannot be released');
  });

  for (const endpoint of ['ai/jobs', 'admin/inventory/ledger', 'reviews', 'admin/orders']) {
    it(`${endpoint} returns more than the declared page limit`, async () => {
      const rows = Array.from({ length: 4 }, () => ({ _id: id, state: 'FAILED', outputKeys: [], items: [], money: {}, shippingSnapshot: {} }));
      const query = pagedQuery(rows);
      const model = { find: () => query, countDocuments: () => q(4) };
      let result: any;
      if (endpoint === 'ai/jobs') result = await new AiService(model as any, ...Array(8).fill({}) as any).listJobs(id, 1, 1);
      if (endpoint === 'admin/inventory/ledger') result = await new InventoryService(connection, {} as any, {} as any, model as any, {} as any, {} as any).listLedger(undefined, 1, 1);
      if (endpoint === 'reviews') result = await new ReviewsService(model as any, {} as any, {} as any, {} as any).listPublic(id, 1, 1);
      if (endpoint === 'admin/orders') {
        const service = new (OrderService as any)(connection, model, ...Array(14).fill({}));
        result = await service.listAdminOrders({ sub: id, role: 'ADMIN' }, undefined, 1, 1);
      }
      expect(result.limit).toBe(1);
      expect(result.items).toHaveLength(4);
      expect(query.limit).not.toHaveBeenCalled();
    });
  }

  it('old AI cleanup deletes input media even when its expiry was extended for another job', async () => {
    const key = `tryon/${id}/shared.png`;
    const jobs = { find: () => q([{ _id: id, terminalAt: new Date(Date.now() - 25 * 3600000), state: 'COMPLETED', inputKeys: [key], outputKeys: [], inputCleanupDone: false }]), updateOne: () => q({}) };
    const record = { key, status: 'READY', expiresAt: new Date(Date.now() + 7 * 86400000) };
    const deleteMediaRecord = vi.fn(async () => true);
    await new AiCleanupWorker(jobs as any, { findOne: () => q(record) } as any, { deleteMediaRecord } as any).run();
    expect(deleteMediaRecord).toHaveBeenCalledWith(record);
  });

  it.each(['png', 'webp'])('accepts a %s container with no image pixels', (format) => {
    let bytes: Buffer;
    if (format === 'png') {
      bytes = Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex');
    } else {
      bytes = Buffer.alloc(20);
      bytes.write('RIFF', 0); bytes.writeUInt32LE(12, 4); bytes.write('WEBP', 8); bytes.write('JUNK', 12);
    }
    expect(sanitizeImage(bytes, `image/${format}`)).toEqual(bytes);
  });

  it('passwords accepted up to 128 characters are truncated at 72 bytes by bcrypt', async () => {
    const prefix = 'Aa1' + 'x'.repeat(69);
    const encoded = await hash(prefix + 'original', 4);
    expect(await compare(prefix + 'different', encoded)).toBe(true);
  });
});
