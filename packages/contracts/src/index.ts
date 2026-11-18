export const USER_ROLES = ['CUSTOMER', 'ADMIN', 'STAFF'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthTokens = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user?: UserSummary;
};

export type RegisterResponse = {
  id: string;
  message: string;
  registrationToken: string;
};

export type RegistrationStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED';

export type UserSummary = {
  permissions?: StaffPermissionGrant[];
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED';
  /** false với tài khoản tạo bằng Google và chưa đặt mật khẩu. */
  hasPassword?: boolean;
  phone?: string | null;
  avatarMediaId?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
};

export type UserProfile = UserSummary;

/** Dòng danh sách người dùng của admin; khách hàng có thêm số đơn và chi tiêu (đơn đã thanh toán, không tính đơn hủy). */
export type AdminUserRow = UserSummary & { orderCount?: number; totalSpent?: number };

export type AdminUserList = {
  items: AdminUserRow[];
  page: number;
  limit: number;
  total: number;
  /** Tổng theo trạng thái, tính trên bộ lọc role và q, bỏ qua status. */
  statusCounts: Record<'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED', number>;
};

export type AdminUserDetail = UserSummary & {
  emailVerifiedAt: string | null;
  orderCount?: number;
  totalSpent?: number;
  defaultAddress: { id: string; receiver: string; phone: string; line1: string; ward: string; district: string; province: string; note?: string } | null;
  recentOrders: Array<{ id: string; code: string; state: OrderStatus; money: OrderMoney; createdAt?: string; itemCount: number }>;
};

export type UserAddress = {
  id: string;
  receiver: string;
  phone: string;
  line1: string;
  ward: string;
  district: string;
  province: string;
  note?: string;
  isDefault: boolean;
};

export type Category = {
  id: string;
  status?: 'ACTIVE' | 'HIDDEN';
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  imageMediaId?: string | null;
};

export type ProductVariant = {
  id: string;
  sku: string;
  size: string;
  color: string;
  price: number;
  stockOnHand: number;
  reserved: number;
  available: number;
  status: 'ACTIVE' | 'INACTIVE';
};

export type SizeGuideRow = {
  size: string;
  measurements?: {
    bust?: number;
    waist?: number;
    hip?: number;
    height?: number;
    weight?: number;
  };
};

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  material?: string;
  price: number;
  currency: 'VND';
  images: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  categoryId?: string | null;
};

export type ProductDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  material?: string;
  price: number;
  currency: 'VND';
  images: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  categoryId?: string | null;
  sizeGuide: SizeGuideRow[];
  variants: ProductVariant[];
};

export type CartItem = {
  variantId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  available: number;
};

export type Cart = {
  items: CartItem[];
  subtotal: number;
  updatedAt?: string;
};

export type CheckoutQuote = {
  id: string;
  subtotal: number;
  shippingFee: number;
  voucherDiscount: number;
  payableTotal: number;
  expiresAt: string;
};

export type OrderLine = {
  lineId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
};

export type OrderMoney = {
  subtotal: number;
  shippingFee: number;
  voucherDiscount: number;
  payableTotal: number;
  voucherCode?: string;
};

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'CANCEL_PENDING_REFUND';

export type Order = {
  id: string;
  code: string;
  state: OrderStatus;
  money: OrderMoney;
  items: OrderLine[];
  shippingSnapshot?: {
    receiver: string;
    phone: string;
    line1: string;
    ward: string;
    district: string;
    province: string;
    note?: string;
  };
  statusHistory?: Array<{
    from: string;
    to: string;
    actorId: string;
    reason: string;
    createdAt?: string;
  }>;
  shipment?: {
    carrier: string;
    trackingCode: string;
    status: string;
    events?: Array<{ status: string; description: string; occurredAt: string }>;
  } | null;
  paymentDueAt?: string;
  createdAt?: string;
};

export type AdminOrderSummary = Pick<Order, 'id' | 'code' | 'state' | 'money' | 'createdAt'> & {
  assignedStaffId?: string | null;
  customerId: string;
  itemCount: number;
  shippingSnapshot?: Pick<NonNullable<Order['shippingSnapshot']>, 'receiver' | 'phone'>;
};

export type PaymentAttempt = {
  canRetry?: boolean;
  reviewOutcome?: 'REFUNDED_EXTERNALLY' | null;
  hasOpenReview?: boolean;
  id: string;
  orderId: string;
  provider: 'GPMPAY' | 'SEPAY';
  state: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REQUIRES_REVIEW';
  amount: number;
  currency: 'VND';
  reconciliationCode: string;
  expiresAt: string;
  paidAt?: string | null;
  bank?: {
    bin: string;
    accountNumberMasked: string;
    accountName: string;
  };
  qrImageUrl?: string;
};

export type Refund = {
  transferContent?: string;
  failureReason?: string;
  id: string;
  bankReference?: string;
  orderId: string;
  paymentAttemptId?: string;
  amount: number;
  reason: string;
  state: 'PENDING_APPROVAL' | 'APPROVED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REQUIRES_REVIEW';
  beneficiary?: {
    bankBin: string;
    accountNumberMasked: string;
    accountName: string;
  };
  qrImageUrl?: string;
  reconciliationCode?: string;
  createdAt?: string;
  proposedBy?: string;
  proposedByName?: string | null;
  orderCode?: string | null;
};

export type Lookbook = {
  id: string;
  title: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  mainImageUrl?: string | null;
  mainMediaId?: string;
  tags?: string[];
  items?: Array<{ productId: string; x: number; y: number; product?: ProductSummary }>;
  products?: ProductSummary[];
};

export type CommunityPost = {
  id: string;
  ownerId: string;
  authorName?: string;
  caption: string;
  mediaUrls: string[];
  taggedProductIds?: string[];
  createdAt?: string;
};

export type CommunityComment = {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string;
  content: string;
  createdAt?: string;
};

export type ProductReview = {
  id: string;
  productId: string;
  stars: number;
  content: string;
  mediaIds?: string[];
  createdAt?: string;
};

export type ReviewMutationResult = {
  id: string;
  orderItemId: string;
  customerId: string;
  stars: number;
  content: string;
  mediaIds: string[];
  mediaUrls: string[];
  status: string;
  createdAt?: string;
};

export type StaffPermissionName =
  | 'catalog.manage' | 'inventory.manage' | 'order.read' | 'order.manage'
  | 'order.cancel' | 'shipment.manage' | 'payment.read' | 'refund.propose'
  | 'content.moderate';
export type StaffPermissionGrant = { permission: StaffPermissionName; scope: 'GLOBAL' | 'ASSIGNED' };
export type StaffPermissionsResult = { staffId: string; grants: StaffPermissionGrant[] };

export type AuditLogEntry = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

export type PaymentReviewAction = 'ESCALATED' | 'CLOSED_NO_ACTION' | 'REFUNDED_EXTERNALLY' | 'OUTGOING_RECONCILED' | 'APPROVE' | 'REJECT_PROPOSAL';
export type PaymentReviewEvent = {
  proposal?: { decision: PaymentReviewAction; proposedBy: string; proposedAt: string; amount?: number } | null;
  proposalDetail?: { note: string; bankReference?: string; evidenceUrl?: string | null } | null;
  reviewedBy?: string | null;
  id: string;
  provider: string;
  eventId: string;
  transferType: string;
  transferAmount: number;
  transactionDate?: string | null;
  content?: string;
  accountNumberLast4?: string;
  counterAccountLast4?: string;
  resolution: string;
  matchedAttemptId: string | null;
  matchedRefundId: string | null;
  reviewDecision: PaymentReviewAction | null;
  reviewedAt: string | null;
  createdAt?: string;
};

export type AiJob = {
  id: string;
  createdAt?: string;
  type: 'TRY_ON' | 'MIX_MATCH';
  state: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  phase?: 'QUEUED' | 'ANALYZING' | 'PLANNING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  planSummary?: string | null;
  detectedItems?: Array<{ productId: string; category: string; targetRegion: string }>;
  quotaCharged: boolean;
  resultUrls: string[];
  errorMessage: string | null;
  expiresAt: string;
};

/** Tác vụ AI trong khu quản trị. Không có ảnh gốc, prompt hay số đo cơ thể của khách. */
export type AdminAiJob = {
  id: string;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  type: 'TRY_ON' | 'MIX_MATCH';
  productNames: string[];
  state: AiJob['state'];
  phase: AiJob['phase'] | null;
  createdAt?: string;
  startedAt: string | null;
  /** Thời điểm tác vụ chạm trạng thái cuối (hoàn thành hoặc thất bại). */
  completedAt: string | null;
  processingMs: number | null;
  errorMessage: string | null;
  attempts: number;
  quotaRefunded: boolean;
};

export type AdminAiJobList = { items: AdminAiJob[]; page: number; limit: number; total: number };

export type AdminAiJobStats = {
  total: number;
  byState: Record<AiJob['state'], number>;
  /** Trung bình của tác vụ hoàn thành trong windowHours giờ qua có ghi nhận thời điểm bắt đầu; null nếu chưa có. */
  avgProcessingMs: number | null;
  avgSampleSize: number;
  windowHours: number;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  reference?: Record<string, unknown>;
  readAt?: string | null;
  createdAt?: string;
};

export type Voucher = {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENT';
  value: number;
  maxDiscount?: number | null;
  minimumSubtotal: number;
  validFrom: string;
  validTo: string;
  usageLimit: number;
  usedCount?: number;
  status: 'ACTIVE' | 'DISABLED';
};

export type InventoryItem = {
  id?: string;
  variantId: string;
  sku: string;
  productName: string;
  stockOnHand: number;
  reserved: number;
  available: number;
  version: number;
};

export type InventoryLedgerEntry = {
  id: string;
  variantId: string | null;
  orderId?: string | null;
  type: string;
  quantity: number;
  eventKey: string;
  reason: string;
  actorId: string;
  actorName?: string | null;
};

export type SalesReport = {
  from: string;
  to: string;
  timezone: string;
  paidRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  orderCount: number;
  orderStatusCounts: Record<string, number>;
  daily: Array<{
    date: string;
    paidRevenue: number;
    refundedAmount: number;
    netRevenue: number;
    paymentCount: number;
  }>;
  topProducts: Array<{ productId: string; productName: string; quantity: number; revenue: number; sku?: string }>;
  generatedAt: string;
};

export type SystemSettings = {
  standardShippingFee: number;
  freeShippingThreshold: number;
  lowStockThreshold: number;
  aiDailyJobs: number;
  updatedAt?: string;
};

export type ListResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export const SUPPORT_TICKET_CATEGORIES = ['ORDER', 'SIZE', 'PAYMENT_REFUND', 'PRODUCT', 'ACCOUNT', 'OTHER'] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];
export const SUPPORT_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type SupportSenderRole = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SYSTEM';

export type SupportTicket = {
  id: string;
  code: string;
  customerId: string;
  subject: string;
  category: SupportTicketCategory;
  orderId: string | null;
  status: SupportTicketStatus;
  assignedStaffId: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadForCustomer: number;
  unreadForStaff: number;
  firstResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type SupportTicketList = ListResponse<SupportTicket>;
export type SupportTicketDetail = SupportTicket & {
  orderCode: string | null;
  assignedStaffName: string | null;
};
export type AdminSupportTicketRow = SupportTicket & {
  customerName: string;
  assignedStaffName: string | null;
  orderCode: string | null;
};
export type AdminSupportTicketList = ListResponse<AdminSupportTicketRow>;
export type AdminSupportTicketDetail = SupportTicketDetail & {
  customer: { id: string; fullName: string; email: string; phone: string | null };
  order: { id: string; code: string; state: string; payableTotal: number; createdAt?: string } | null;
};
export type SupportMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: SupportSenderRole;
  senderName: string;
  body: string;
  createdAt: string;
};
export type SupportMessageList = { items: SupportMessage[] };
export type SupportStats = {
  byStatus: Record<SupportTicketStatus, number>;
  unreadForStaff: number;
  avgFirstResponseMinutes: number | null;
  windowDays: number;
};
