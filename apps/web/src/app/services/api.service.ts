import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, defer, from, map, switchMap, throwError } from 'rxjs';
import type {
  AuthTokens,
  UserSummary,
  UserProfile,
  UserAddress,
  Category,
  ProductSummary,
  ProductDetail,
  ProductVariant,
  Cart,
  CheckoutQuote,
  Order,
  AdminOrderSummary,
  PaymentAttempt,
  Refund,
  Lookbook,
  CommunityPost,
  CommunityComment,
  ProductReview,
  ReviewMutationResult,
  StaffPermissionGrant,
  StaffPermissionsResult,
  AuditLogEntry,
  PaymentReviewEvent,
  AiJob,
  NotificationItem,
  Voucher,
  InventoryItem,
  InventoryLedgerEntry,
  SalesReport,
  SystemSettings,
  ListResponse,
} from '@fashion/contracts';
import { runtimeConfig } from '../runtime-config';

/** Giá trị bộ lọc công khai của trang sản phẩm. */
export type CatalogFilters = { sizes: string[]; colors: string[]; minPrice: number | null; maxPrice: number | null };

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly api = runtimeConfig.apiBaseUrl;

  // --- Auth ---
  register(fullName: string, email: string, password: string): Observable<{ id?: string; message: string }> {
    return this.http.post<{ id?: string; message: string }>(`${this.api}/auth/register`, { fullName, email, password });
  }

  verifyEmail(token: string): Observable<{ verified: boolean }> {
    return this.http.post<{ verified: boolean }>(`${this.api}/auth/verify-email`, { token });
  }

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/auth/resend-verification`, { email });
  }

  login(email: string, password: string, remember = true): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.api}/auth/login`, { email, password, remember });
  }

  refresh(): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.api}/auth/refresh`, {});
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/logout`, {});
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/auth/reset-password`, { token, newPassword: password });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/change-password`, { currentPassword, newPassword });
  }

  getMe(): Observable<UserSummary> {
    return this.http.get<UserSummary>(`${this.api}/auth/me`);
  }

  // --- User Profile & Addresses ---
  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.api}/users/me`);
  }

  updateProfile(dto: { fullName?: string; phone?: string; avatarMediaId?: string | null }): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.api}/users/me`, dto);
  }

  listAddresses(): Observable<{ items: UserAddress[] }> {
    return this.http.get<{ items: UserAddress[] }>(`${this.api}/users/me/addresses`);
  }

  createAddress(dto: {
    receiver: string;
    phone: string;
    line1: string;
    ward: string;
    district: string;
    province: string;
    note?: string;
    isDefault?: boolean;
  }): Observable<UserAddress> {
    return this.http.post<UserAddress>(`${this.api}/users/me/addresses`, dto);
  }

  updateAddress(id: string, dto: Partial<UserAddress>): Observable<UserAddress> {
    return this.http.patch<UserAddress>(`${this.api}/users/me/addresses/${id}`, dto);
  }

  deleteAddress(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/users/me/addresses/${id}`);
  }

  // --- Catalog ---
  catalogFilters(): Observable<CatalogFilters> {
    return this.http.get<CatalogFilters>(`${this.api}/products/filters`);
  }

  products(params?: {
    q?: string;
    category?: string;
    sort?: string;
    page?: number;
    limit?: number;
    minPrice?: number;
    maxPrice?: number;
    color?: string;
    size?: string;
  }): Observable<ListResponse<ProductSummary>> {
    let p = new HttpParams();
    if (params) {
      if (params.q) p = p.set('q', params.q);
      if (params.category) p = p.set('category', params.category);
      if (params.sort) p = p.set('sort', params.sort);
      if (params.page) p = p.set('page', params.page.toString());
      if (params.limit) p = p.set('limit', params.limit.toString());
      if (params.minPrice !== undefined) p = p.set('minPrice', params.minPrice.toString());
      if (params.maxPrice !== undefined) p = p.set('maxPrice', params.maxPrice.toString());
      if (params.color) p = p.set('color', params.color);
      if (params.size) p = p.set('size', params.size);
    }
    return this.http.get<ListResponse<ProductSummary>>(`${this.api}/products`, { params: p });
  }

  product(slug: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.api}/products/${encodeURIComponent(slug)}`);
  }

  suggestSize(slug: string, dto: { bust?: number; waist?: number; hip?: number; height?: number; weight?: number }): Observable<{
    disclaimer: string;
    suggestedSize: string | null;
    sizeGuide: Array<{ size: string; measurements: Record<string, number> }>;
  }> {
    return this.http.post<{
      disclaimer: string;
      suggestedSize: string | null;
      sizeGuide: Array<{ size: string; measurements: Record<string, number> }>;
    }>(`${this.api}/products/${encodeURIComponent(slug)}/size-suggestion`, dto);
  }

  categories(): Observable<Category[]> {
    return this.http.get<{ items: Category[] }>(`${this.api}/categories`).pipe(map(res => res.items));
  }

  adminCategories(): Observable<Category[]> {
    return this.http.get<{ items: Category[] }>(`${this.api}/admin/categories`).pipe(map(res => res.items));
  }

  adminGetProduct(id: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.api}/admin/products/${encodeURIComponent(id)}`);
  }

  myOrderReviews(orderId: string): Observable<{ items: ReviewMutationResult[] }> {
    return this.http.get<{ items: ReviewMutationResult[] }>(`${this.api}/reviews/mine`, { params: { orderId } });
  }

  myReviewsByIds(reviewIds: string[]): Observable<{ items: ReviewMutationResult[] }> {
    let params = new HttpParams();
    for (const reviewId of reviewIds) params = params.append('reviewIds', reviewId);
    return this.http.get<{ items: ReviewMutationResult[] }>(`${this.api}/reviews/mine`, { params });
  }

  createCategory(dto: { name: string; slug: string; status: 'ACTIVE' | 'HIDDEN'; parentId?: string }): Observable<Category> {
    return this.http.post<Category>(`${this.api}/categories`, dto);
  }

  updateCategory(id: string, dto: { name?: string; slug?: string; status?: 'ACTIVE' | 'HIDDEN'; parentId?: string | null }): Observable<Category> {
    return this.http.patch<Category>(`${this.api}/categories/${id}`, dto);
  }

  // --- Commerce: Cart & Checkout ---
  getCart(): Observable<Cart> {
    return this.http.get<Cart>(`${this.api}/cart`);
  }

  replaceCart(items: Array<{ variantId: string; quantity: number }>): Observable<Cart> {
    return this.http.put<Cart>(`${this.api}/cart`, { items });
  }

  clearCart(): Observable<void> {
    return this.http.delete<void>(`${this.api}/cart`);
  }

  createQuote(dto: { addressId: string; voucherCode?: string; shippingMethod?: 'STANDARD' }): Observable<CheckoutQuote> {
    return this.http.post<CheckoutQuote>(`${this.api}/checkout/quote`, dto);
  }

  createOrder(dto: { quoteId: string }, idempotencyKey?: string): Observable<Order> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.post<Order>(`${this.api}/orders`, dto, { headers });
  }

  listOrders(page = 1, limit = 20): Observable<ListResponse<Order>> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<ListResponse<Order>>(`${this.api}/orders`, { params });
  }

  getOrder(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${this.api}/orders/${orderId}`).pipe(map(order => {
      const shipping = order.shippingSnapshot as (Order['shippingSnapshot'] & { location?: Pick<NonNullable<Order['shippingSnapshot']>, 'line1' | 'ward' | 'district' | 'province'> }) | undefined;
      return { ...order, shippingSnapshot: shipping ? { ...shipping, ...shipping.location } : undefined };
    }));
  }

  cancelOrder(orderId: string, reason: string, idempotencyKey?: string): Observable<Order> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.post<Order>(`${this.api}/orders/${orderId}/cancel`, { reason }, { headers });
  }

  // --- Payments ---
  createPaymentAttempt(orderId: string, idempotencyKey?: string): Observable<PaymentAttempt> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.post<PaymentAttempt>(`${this.api}/payments/attempts`, { orderId }, { headers });
  }

  getPayment(paymentId: string): Observable<PaymentAttempt> {
    return this.http.get<PaymentAttempt>(`${this.api}/payments/${paymentId}`);
  }

  listPayments(page = 1, limit = 20): Observable<ListResponse<PaymentAttempt>> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<ListResponse<PaymentAttempt>>(`${this.api}/payments`, { params });
  }

  latestPaymentForOrder(orderId: string): Observable<PaymentAttempt> {
    return this.http.get<PaymentAttempt>(`${this.api}/payments/order/${orderId}/latest`);
  }

  // --- Lookbooks ---
  listLookbooks(): Observable<{ items: Lookbook[] }> {
    return this.http.get<{ items: Lookbook[] }>(`${this.api}/lookbooks`);
  }

  getLookbook(id: string): Observable<Lookbook> {
    return this.http.get<Lookbook>(`${this.api}/lookbooks/${id}`).pipe(map((book) => ({
      ...book, products: (book.items ?? []).flatMap((item) => item.product ? [item.product] : []),
    })));
  }

  // --- Community & Reviews ---
  listPosts(q?: string, page = 1, limit = 20): Observable<ListResponse<CommunityPost>> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (q) params = params.set('q', q);
    return this.http.get<ListResponse<CommunityPost & { authorId: string; imageUrls: string[] }>>(`${this.api}/community/posts`, { params })
      .pipe(map((res) => ({ ...res, items: res.items.map((post) => ({ ...post, ownerId: post.authorId, mediaUrls: post.imageUrls.filter(Boolean) })) })));
  }

  getPost(id: string): Observable<CommunityPost> {
    return this.http.get<CommunityPost & { authorId?: string; imageUrls?: string[] }>(`${this.api}/community/posts/${id}`).pipe(
      map((post) => ({
        ...post,
        ownerId: post.ownerId || post.authorId || '',
        mediaUrls: post.mediaUrls || (post.imageUrls || []).filter(Boolean),
      })),
    );
  }

  createPost(dto: { caption: string; mediaIds: string[]; taggedProductIds?: string[] }): Observable<CommunityPost> {
    return this.http.post<CommunityPost>(`${this.api}/community/posts`, dto);
  }

  updatePost(id: string, dto: { caption: string; mediaIds: string[] }): Observable<CommunityPost> {
    return this.http.patch<CommunityPost & { authorId: string; imageUrls: string[] }>(
      `${this.api}/community/posts/${encodeURIComponent(id)}`, dto,
    ).pipe(map((post) => ({ ...post, ownerId: post.authorId, mediaUrls: post.imageUrls.filter(Boolean) })));
  }

  deletePost(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/community/posts/${id}`);
  }

  listComments(postId: string): Observable<{ items: CommunityComment[] }> {
    return this.http.get<{ items: Array<CommunityComment & { body: string }> }>(`${this.api}/community/posts/${postId}/comments`)
      .pipe(map((res) => ({ items: res.items.map((c) => ({ ...c, content: c.body })) })));
  }

  createComment(postId: string, content: string): Observable<CommunityComment> {
    return this.http.post<CommunityComment & { body: string }>(`${this.api}/community/posts/${postId}/comments`, { body: content })
      .pipe(map((c) => ({ ...c, content: c.body })));
  }

  updateComment(postId: string, commentId: string, content: string): Observable<CommunityComment> {
    return this.http.patch<CommunityComment & { body: string }>(
      `${this.api}/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      { body: content },
    ).pipe(map((comment) => ({ ...comment, content: comment.body })));
  }

  deleteComment(postId: string, commentId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.api}/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    );
  }

  listReviews(productId: string, page = 1, limit = 20): Observable<ListResponse<ProductReview>> {
    const params = new HttpParams().set('productId', productId).set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<ListResponse<ProductReview>>(`${this.api}/reviews`, { params });
  }

  createReview(dto: { orderItemId: string; stars: number; content: string; mediaIds?: string[] }): Observable<ProductReview> {
    return this.http.post<ProductReview>(`${this.api}/reviews`, dto);
  }

  updateReview(reviewId: string, dto: { orderItemId: string; stars: number; content: string; mediaIds?: string[] }): Observable<ReviewMutationResult> {
    return this.http.patch<ReviewMutationResult>(`${this.api}/reviews/${encodeURIComponent(reviewId)}`, dto);
  }

  deleteReview(reviewId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/reviews/${encodeURIComponent(reviewId)}`);
  }

  // --- AI Experiences ---
  createTryOn(dto: { productIds: string[]; inputMediaId: string; consentPolicyVersion: string; heightCm?: number; weightKg?: number }, idempotencyKey: string): Observable<AiJob> {
    return this.http.post<AiJob>(`${this.api}/ai/try-on`, dto, { headers: { 'idempotency-key': idempotencyKey } });
  }

  createMixMatch(dto: { productIds: string[]; inputMediaId: string; consentPolicyVersion: string; style?: string; heightCm?: number; weightKg?: number }, idempotencyKey: string): Observable<AiJob> {
    return this.http.post<AiJob>(`${this.api}/ai/mix-match`, dto, { headers: { 'idempotency-key': idempotencyKey } });
  }

  getAiJob(id: string): Observable<AiJob> {
    return this.http.get<AiJob>(`${this.api}/ai/jobs/${id}`);
  }

  listAiJobs(page = 1, limit = 20): Observable<ListResponse<AiJob>> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<ListResponse<AiJob>>(`${this.api}/ai/jobs`, { params });
  }

  getAiJobs(page = 1, limit = 20): Observable<ListResponse<AiJob>> {
    return this.listAiJobs(page, limit);
  }

  // --- Notifications ---
  listNotifications(page = 1, limit = 20): Observable<ListResponse<NotificationItem> & { unreadCount: number }> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<ListResponse<NotificationItem> & { unreadCount: number }>(`${this.api}/notifications`, { params });
  }

  markNotificationRead(id: string): Observable<NotificationItem> {
    return this.http.patch<NotificationItem>(`${this.api}/notifications/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.api}/notifications/read-all`, {});
  }

  // --- Storage ---
  presignUpload(dto: { contentType: string; sizeBytes: number; purpose: 'avatar' | 'product' | 'lookbook' | 'community' | 'tryon' | 'refund_evidence' }): Observable<{
    uploadUrl: string;
    objectKey: string;
    requiredHeaders: Record<string, string>;
  }> {
    return this.http.post<{ uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string> }>(`${this.api}/storage/presign`, dto);
  }

  finalizeUpload(dto: { objectKey: string }): Observable<{ id: string; url?: string | null; status: string }> {
    return this.http.post<{ id: string; url?: string | null; status: string }>(`${this.api}/storage/finalize`, dto);
  }

  uploadImage(file: File, purpose: 'avatar' | 'product' | 'lookbook' | 'community' | 'tryon' | 'refund_evidence') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      return throwError(() => new Error('Chọn ảnh JPEG, PNG hoặc WebP, tối đa 10 MB.'));
    }
    return this.presignUpload({ contentType: file.type, sizeBytes: file.size, purpose }).pipe(
      switchMap((upload) => defer(() => from(fetch(upload.uploadUrl, {
        method: 'PUT', body: file, headers: upload.requiredHeaders, credentials: 'omit',
        redirect: 'error', signal: AbortSignal.timeout(30_000),
      }))).pipe(
        switchMap((response) => response.ok || response.status === 412 ? from([undefined])
          : throwError(() => new Error(`Không thể tải ảnh lên (${response.status}).`))),
        catchError(() => {
          const body = new FormData();
          body.append('objectKey', upload.objectKey);
          body.append('file', file);
          return this.http.post<{ uploaded: boolean }>(`${this.api}/storage/upload`, body).pipe(map(() => undefined));
        }),
        switchMap(() => this.finalizeUpload({ objectKey: upload.objectKey }).pipe(map(media => ({ ...media, objectKey: upload.objectKey })))),
      )),
    );
  }

  // --- Admin API ---
  adminListProducts(status?: string, page = 1, limit = 20): Observable<ListResponse<ProductSummary>> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (status) params = params.set('status', status);
    return this.http.get<ListResponse<ProductSummary>>(`${this.api}/admin/products`, { params });
  }

  adminCreateProduct(dto: {
    name: string;
    slug: string;
    description: string;
    material?: string;
    price: number;
    categoryId: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    images?: string[];
    sizeGuide?: Array<{ size: string; measurements: Record<string, number> }>;
  }): Observable<{ id: string; slug: string }> {
    return this.http.post<{ id: string; slug: string }>(`${this.api}/products`, dto);
  }

  adminUpdateProduct(productId: string, dto: Partial<ProductDetail>): Observable<ProductDetail> {
    return this.http.patch<ProductDetail>(`${this.api}/admin/products/${productId}`, dto);
  }

  adminCreateVariant(productId: string, dto: {
    sku: string;
    size: string;
    color: string;
    price: number;
    stockOnHand: number;
  }): Observable<ProductVariant> {
    return this.http.post<ProductVariant>(`${this.api}/admin/products/${productId}/variants`, dto);
  }

  adminUpdateVariant(productId: string, variantId: string, dto: Partial<ProductVariant>): Observable<ProductVariant> {
    return this.http.patch<ProductVariant>(`${this.api}/admin/products/${productId}/variants/${variantId}`, dto);
  }

  adminListOrders(state?: string, page = 1, limit = 20): Observable<ListResponse<AdminOrderSummary>> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (state) params = params.set('state', state);
    return this.http.get<ListResponse<AdminOrderSummary>>(`${this.api}/admin/orders`, { params });
  }

  adminAssignStaff(orderId: string, staffId: string): Observable<Order> {
    return this.http.patch<Order>(`${this.api}/admin/orders/${orderId}/assign`, { staffId });
  }

  adminUpdateOrderStatus(orderId: string, state: string, reason: string): Observable<Order> {
    return this.http.patch<Order>(`${this.api}/admin/orders/${orderId}/status`, { state, reason });
  }

  adminUpdateShipment(orderId: string, dto: {
    carrier: string;
    trackingCode: string;
    status: 'READY' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
    note?: string;
  }): Observable<Order> {
    return this.http.patch<Order>(`${this.api}/admin/orders/${orderId}/shipment`, dto);
  }

  adminListInventory(): Observable<{ items: InventoryItem[] }> {
    return this.http.get<{ items: InventoryItem[] }>(`${this.api}/admin/inventory`);
  }

  adminListLedger(variantId?: string, page = 1, limit = 20): Observable<ListResponse<InventoryLedgerEntry>> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (variantId) params = params.set('variantId', variantId);
    return this.http.get<ListResponse<InventoryLedgerEntry>>(`${this.api}/admin/inventory/ledger`, { params });
  }

  adminAdjustInventory(dto: {
    variantId: string;
    delta: number;
    reason: string;
    expectedVersion: number;
  }, idempotencyKey?: string): Observable<InventoryItem> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.patch<InventoryItem>(`${this.api}/admin/inventory`, dto, { headers });
  }

  adminListVouchers(): Observable<{ items: Voucher[] }> {
    return this.http.get<{ items: Voucher[] }>(`${this.api}/admin/vouchers`);
  }

  adminCreateVoucher(dto: Partial<Voucher>): Observable<Voucher> {
    return this.http.post<Voucher>(`${this.api}/admin/vouchers`, dto);
  }

  adminUpdateVoucher(id: string, dto: Partial<Voucher>): Observable<Voucher> {
    return this.http.patch<Voucher>(`${this.api}/admin/vouchers/${id}`, dto);
  }

  adminDeleteVoucher(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/admin/vouchers/${id}`);
  }

  adminListRefunds(state?: string, page = 1, limit = 20): Observable<ListResponse<Refund>> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (state) params = params.set('state', state);
    return this.http.get<ListResponse<Refund>>(`${this.api}/admin/refunds`, { params });
  }

  adminGetRefund(id: string): Observable<Refund> {
    return this.http.get<Refund>(`${this.api}/admin/refunds/${id}`);
  }

  adminProposeRefund(dto: { paymentAttemptId: string; amount: number; reason: string }, idempotencyKey?: string): Observable<Refund> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.post<Refund>(`${this.api}/admin/refunds`, dto, { headers });
  }

  adminSetRefundBeneficiary(id: string, dto: { bankBin: string; accountNumber: string; accountName: string }, idempotencyKey?: string): Observable<Refund> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.patch<Refund>(`${this.api}/admin/refunds/${id}/beneficiary`, dto, { headers });
  }

  adminApproveRefund(id: string, idempotencyKey?: string): Observable<Refund> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.patch<Refund>(`${this.api}/admin/refunds/${id}/approve`, {}, { headers });
  }

  adminCompleteRefund(id: string, dto: { bankReference: string; evidenceObjectKey: string }, idempotencyKey?: string): Observable<Refund> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.patch<Refund>(`${this.api}/admin/refunds/${id}/complete`, dto, { headers });
  }

  adminRejectRefund(id: string, dto: { reason: string }, idempotencyKey: string): Observable<Refund> {
    return this.http.patch<Refund>(`${this.api}/admin/refunds/${id}/reject`, dto, { headers: { 'idempotency-key': idempotencyKey } });
  }

  adminFailRefund(id: string, dto: { reason: string; evidenceObjectKey: string }, idempotencyKey?: string): Observable<Refund> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.http.patch<Refund>(`${this.api}/admin/refunds/${id}/fail`, dto, { headers });
  }

  adminListModeration(page = 1, limit = 20, status?: string, targetType?: string): Observable<ListResponse<any>> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (status) params = params.set('status', status);
    if (targetType) params = params.set('targetType', targetType);
    return this.http.get<ListResponse<any>>(`${this.api}/admin/moderation`, { params });
  }

  adminModerate(targetId: string, dto: { targetType: 'REVIEW' | 'POST' | 'COMMENT'; action: 'HIDE' | 'RESTORE'; reason: string }): Observable<any> {
    return this.http.patch<any>(`${this.api}/admin/moderation/${targetId}`, dto);
  }

  adminListUsers(page = 1, limit = 20, role?: string): Observable<ListResponse<UserSummary>> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (role) params = params.set('role', role);
    return this.http.get<ListResponse<UserSummary>>(`${this.api}/admin/users`, { params });
  }

  adminUpdateUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED'): Observable<UserSummary> {
    return this.http.patch<UserSummary>(`${this.api}/admin/users/${userId}`, { status });
  }

  adminCreateStaff(dto: { email: string; fullName: string }): Observable<UserSummary> {
    return this.http.post<UserSummary>(`${this.api}/admin/staff`, dto);
  }

  adminResendStaffInvitation(staffId: string): Observable<{ staffId: string; invitationQueued: boolean }> {
    return this.http.post<{ staffId: string; invitationQueued: boolean }>(`${this.api}/admin/staff/${staffId}/invitation`, {});
  }

  adminGrantStaffPermissions(staffId: string, grants: StaffPermissionGrant[]): Observable<StaffPermissionsResult> {
    return this.http.post<StaffPermissionsResult>(`${this.api}/admin/staff/${encodeURIComponent(staffId)}/permissions`, { grants });
  }

  adminGetStaffPermissions(staffId: string): Observable<StaffPermissionsResult> {
    return this.http.get<StaffPermissionsResult>(`${this.api}/admin/staff/${encodeURIComponent(staffId)}/permissions`);
  }

  adminReplaceStaffPermissions(staffId: string, grants: StaffPermissionGrant[]): Observable<StaffPermissionsResult> {
    return this.http.patch<StaffPermissionsResult>(`${this.api}/admin/staff/${encodeURIComponent(staffId)}/permissions`, { grants });
  }

  adminListAuditLogs(query: { entityType?: string; entityId?: string; page?: number; limit?: number } = {}): Observable<ListResponse<AuditLogEntry>> {
    let params = new HttpParams().set('page', String(query.page ?? 1)).set('limit', String(query.limit ?? 20));
    if (query.entityType) params = params.set('entityType', query.entityType);
    if (query.entityId) params = params.set('entityId', query.entityId);
    return this.http.get<ListResponse<AuditLogEntry>>(`${this.api}/admin/audit-logs`, { params });
  }

  adminListPaymentEvents(page = 1, limit = 20, view = 'OPEN'): Observable<ListResponse<PaymentReviewEvent>> {
    const params = new HttpParams().set('page', String(page)).set('limit', String(limit)).set('view', view);
    return this.http.get<ListResponse<PaymentReviewEvent>>(`${this.api}/admin/payment-events`, { params });
  }

  adminGetPaymentEvent(eventId: string): Observable<PaymentReviewEvent> {
    return this.http.get<PaymentReviewEvent>(`${this.api}/admin/payment-events/${eventId}`);
  }

  adminReviewPaymentEvent(eventId: string, dto: {
    decision: import('@fashion/contracts').PaymentReviewAction;
    amount?: number;
    bankReference?: string;
    note: string;
    evidenceObjectKey: string;
  }): Observable<PaymentReviewEvent> {
    return this.http.patch<PaymentReviewEvent>(`${this.api}/admin/payment-events/${encodeURIComponent(eventId)}/review`, dto);
  }

  adminGetSalesReport(from?: string, to?: string): Observable<SalesReport> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<SalesReport>(`${this.api}/admin/reports/sales`, { params });
  }

  adminGetSettings(): Observable<SystemSettings> {
    return this.http.get<SystemSettings>(`${this.api}/admin/settings`);
  }

  adminUpdateSettings(dto: Partial<SystemSettings>): Observable<SystemSettings> {
    return this.http.patch<SystemSettings>(`${this.api}/admin/settings`, dto);
  }

  adminGetAiQuota(): Observable<{ dailyJobs: number }> {
    return this.http.get<{ dailyJobs: number }>(`${this.api}/admin/ai-quotas`);
  }

  adminUpdateAiQuota(dto: { dailyJobs: number }): Observable<{ dailyJobs: number }> {
    return this.http.patch<{ dailyJobs: number }>(`${this.api}/admin/ai-quotas`, dto);
  }

  adminListLookbooks(): Observable<{ items: Lookbook[] }> {
    return this.http.get<{ items: Lookbook[] }>(`${this.api}/admin/lookbooks`);
  }

  adminGetLookbook(id: string): Observable<Lookbook> {
    return this.http.get<Lookbook>(`${this.api}/admin/lookbooks/${id}`);
  }

  adminCreateLookbook(dto: Partial<Lookbook>): Observable<Lookbook> {
    return this.http.post<Lookbook>(`${this.api}/admin/lookbooks`, dto);
  }

  adminUpdateLookbook(id: string, dto: Partial<Lookbook>): Observable<Lookbook> {
    return this.http.patch<Lookbook>(`${this.api}/admin/lookbooks/${id}`, dto);
  }
}

/** Kiểm tra số đo tùy chọn cho Thử đồ AI. Trả chuỗi rỗng nếu hợp lệ hoặc bỏ trống. */
export function heightError(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isInteger(n) && n >= 120 && n <= 220 ? '' : 'Chiều cao phải là số nguyên từ 120 đến 220 cm.';
}
export function weightError(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) && n >= 30 && n <= 200 && Math.abs(n * 10 - Math.round(n * 10)) < 1e-9 ? '' : 'Cân nặng phải từ 30 đến 200 kg (tối đa 1 chữ số thập phân).';
}
/** Chỉ gửi trường nào có giá trị hợp lệ; bỏ trống thì không gửi. */
export function bodyPayload(height: number | null | undefined, weight: number | null | undefined): { heightCm?: number; weightKg?: number } {
  const out: { heightCm?: number; weightKg?: number } = {};
  if (height !== null && height !== undefined && !heightError(height)) out.heightCm = Number(height);
  if (weight !== null && weight !== undefined && !weightError(weight)) out.weightKg = Number(weight);
  return out;
}
