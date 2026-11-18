import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type Connection } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { STAFF_PERMISSIONS, type StaffPermissionName } from '../../common/permissions.decorator.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { AuditService } from '../operations/audit.service.js';
import { StaffPermission } from '../users/identity.schemas.js';
import { Address, EmailToken } from '../users/identity.schemas.js';
import { EmailDispatchService } from '../mail/email-dispatch.service.js';
import type { CreateStaffDto } from './admin.dto.js';
import { User } from '../users/user.schema.js';
import { Order } from '../commerce/commerce.schemas.js';
import { serializeOrder } from '../commerce/order.types.js';
import { escapeRegex } from '../../common/escape-regex.js';

const GLOBAL_ONLY: StaffPermissionName[] = ['catalog.manage', 'inventory.manage', 'content.moderate'];
/** Đơn đã thanh toán và chưa hủy/hoàn tiền: dùng cho orderCount và totalSpent. */
const PAID_ORDER_STATES = ['CONFIRMED', 'PREPARING', 'SHIPPING', 'DELIVERED'];
const USER_STATUSES = ['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED'] as const;
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const SYSTEM_LOCKS = 'system_locks';
const ACTIVE_ADMINS_LOCK = 'active-admins';

@Injectable()
export class AdminService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(StaffPermission.name) private readonly permissions: Model<StaffPermission>,
    private readonly audit: AuditService,
    @InjectModel(EmailToken.name) private readonly emailTokens: Model<EmailToken>,
    private readonly email: EmailDispatchService,
    @InjectModel(Order.name) private readonly orders?: Model<Order>,
    @InjectModel(Address.name) private readonly addresses?: Model<Address>,
  ) {}

  async createStaff(actorId: string, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase().trim();
    const passwordHash = await hash(randomBytes(32).toString('hex'), 12);
    try {
      return await withCommerceTransaction(this.connection, async (session) => {
        const [user] = await this.users.create([{ email, fullName: dto.fullName.trim(), role: 'STAFF',
          status: 'ACTIVE', emailVerifiedAt: new Date(), passwordHash }], { session });
        const userId = String(user._id);
        await this.issueInvitation(userId, email, session);
        await this.audit.record('admin.staff.created', 'user', userId, actorId, {}, session);
        return { id: userId, email, fullName: user.fullName, role: user.role, status: user.status };
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async resendStaffInvitation(actorId: string, staffId: string) {
    if (!Types.ObjectId.isValid(staffId)) throw new NotFoundException('Staff not found');
    return withCommerceTransaction(this.connection, async (session) => {
      const staff = await this.users.findById(staffId).session(session).exec();
      if (!staff || staff.role !== 'STAFF') throw new NotFoundException('Staff not found');
      if (staff.status !== 'ACTIVE') throw new ConflictException('Staff account is not active');
      await this.issueInvitation(staffId, staff.email, session);
      await this.audit.record('admin.staff.invitation_resent', 'user', staffId, actorId, {}, session);
      return { staffId, email: staff.email, invitationQueued: true };
    });
  }

  /** Số đơn đã thanh toán (không tính đơn hủy) và tổng chi tiêu theo từng khách. */
  private async customerSpending(customerIds: string[]): Promise<Map<string, { orderCount: number; totalSpent: number }>> {
    const result = new Map<string, { orderCount: number; totalSpent: number }>();
    if (!customerIds.length || !this.orders) return result;
    const rows = await this.orders.aggregate<{ _id: unknown; orderCount: number; totalSpent: number }>([
      { $match: { customerId: { $in: customerIds.map((id) => new Types.ObjectId(id)) }, state: { $in: PAID_ORDER_STATES } } },
      { $group: { _id: '$customerId', orderCount: { $sum: 1 }, totalSpent: { $sum: { $ifNull: ['$money.payableTotal', 0] } } } },
    ]).exec();
    for (const row of rows) result.set(String(row._id), { orderCount: row.orderCount, totalSpent: row.totalSpent });
    return result;
  }

  async listUsers(page = 1, limit = 20, role?: string, search: { status?: string; q?: string } = {}) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;
    // Giữ hành vi cũ: có role mà không có status thì chỉ lấy tài khoản ACTIVE. status=ALL bỏ lọc.
    const status = search.status ?? (role ? 'ACTIVE' : undefined);
    const base: Record<string, unknown> = role ? { role } : {};
    const q = search.q?.trim();
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      base.$or = [{ fullName: pattern }, { email: pattern }];
    }
    const filter: Record<string, unknown> = status && status !== 'ALL' ? { ...base, status } : base;
    const [items, total, countRows] = await Promise.all([
      this.users.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean().exec(),
      this.users.countDocuments(filter).exec(),
      this.users.aggregate<{ _id: string; count: number }>([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]).exec(),
    ]);
    const statusCounts: Record<string, number> = Object.fromEntries(USER_STATUSES.map((s) => [s, 0]));
    for (const row of countRows) statusCounts[row._id] = row.count;
    const spending = role === 'CUSTOMER'
      ? await this.customerSpending(items.map((user) => String(user._id)))
      : null;
    return {
      page: safePage,
      limit: safeLimit,
      total,
      statusCounts,
      items: items.map((user) => ({
        id: String(user._id),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt?.toISOString(),
        ...(spending ? {
          orderCount: spending.get(String(user._id))?.orderCount ?? 0,
          totalSpent: spending.get(String(user._id))?.totalSpent ?? 0,
        } : {}),
      })),
    };
  }

  /** Hồ sơ người dùng cho admin: không có mật khẩu hay token. */
  async getUserDetail(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('User not found');
    const user = await this.users.findById(userId).lean().exec();
    if (!user) throw new NotFoundException('User not found');
    const isCustomer = user.role === 'CUSTOMER';
    const [address, recent, spending] = isCustomer && this.addresses && this.orders
      ? await Promise.all([
        this.addresses.findOne({ customerId: userId, isDefault: true }).lean().exec(),
        this.orders.find({ customerId: userId }).sort({ createdAt: -1 }).limit(3).lean().exec(),
        this.customerSpending([userId]),
      ])
      : [null, [], new Map<string, { orderCount: number; totalSpent: number }>()];
    const loc = (address?.location ?? {}) as Record<string, unknown>;
    return {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt).toISOString() : null,
      createdAt: user.createdAt?.toISOString(),
      orderCount: isCustomer ? spending.get(userId)?.orderCount ?? 0 : undefined,
      totalSpent: isCustomer ? spending.get(userId)?.totalSpent ?? 0 : undefined,
      defaultAddress: address ? {
        id: String(address._id), receiver: address.receiver, phone: address.phone,
        line1: String(loc['line1'] ?? ''), ward: String(loc['ward'] ?? ''),
        district: String(loc['district'] ?? ''), province: String(loc['province'] ?? ''),
        note: address.note ?? undefined,
      } : null,
      recentOrders: recent.map((row) => ({ ...serializeOrder(row), itemCount: row.items?.length ?? 0 })),
    };
  }

  async updateUserStatus(actorId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') throw new BadRequestException('Invalid status');
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('User not found');
    await this.ensureActiveAdminsLock();
    const result = await withCommerceTransaction(this.connection, async (session) => {
      const user = await this.users.findById(userId).session(session).exec();
      if (!user) throw new NotFoundException('User not found');
      if (user.status === 'PENDING_VERIFICATION') throw new BadRequestException('Cannot change status of unverified account');
      if (user.role === 'ADMIN' && status === 'SUSPENDED' && user.status === 'ACTIVE') {
        // Every suspend of an active Admin writes the same lock document, so concurrent suspends
        // hit a write conflict and are retried serially instead of each seeing the other Admin as active.
        await this.connection.collection(SYSTEM_LOCKS).updateOne(
          { _id: ACTIVE_ADMINS_LOCK as never }, { $inc: { version: 1 } }, { session },
        );
        const otherAdmins = await this.users.countDocuments({
          role: 'ADMIN',
          status: 'ACTIVE',
          _id: { $ne: user._id },
        }).session(session).exec();
        if (otherAdmins === 0) {
          await this.audit.record('admin.lock_last_admin_blocked', 'user', userId, actorId, { attemptedStatus: status }, session);
          return null;
        }
      }
      const before = user.status;
      user.status = status;
      await user.save({ session });
      await this.audit.record('admin.user_status_updated', 'user', userId, actorId, { before, after: status }, session);
      return { id: String(user._id), email: user.email, fullName: user.fullName, role: user.role, status: user.status };
    });
    if (!result) throw new ConflictException('Cannot suspend the last active Admin');
    return result;
  }

  async getStaffPermissions(staffId: string) {
    if (!Types.ObjectId.isValid(staffId)) throw new NotFoundException('Staff not found');
    const staff = await this.users.findById(staffId).exec();
    if (!staff || staff.role !== 'STAFF') throw new NotFoundException('Staff not found');
    const rows = await this.permissions.find({ staffId }).lean().exec();
    return { staffId, grants: rows.map(({ permission, scope }) => ({ permission, scope })) };
  }

  async grantStaffPermissions(actorId: string, staffId: string, grants: { permission: StaffPermissionName; scope: 'GLOBAL' | 'ASSIGNED' }[]) {
    return this.writeStaffPermissions(actorId, staffId, grants, false);
  }

  async replaceStaffPermissions(actorId: string, staffId: string, grants: { permission: StaffPermissionName; scope: 'GLOBAL' | 'ASSIGNED' }[]) {
    return this.writeStaffPermissions(actorId, staffId, grants, true);
  }

  private async writeStaffPermissions(actorId: string, staffId: string, grants: { permission: StaffPermissionName; scope: 'GLOBAL' | 'ASSIGNED' }[], replace: boolean) {
    if (!Types.ObjectId.isValid(staffId)) throw new NotFoundException('Staff not found');
    const unique = new Map<string, { permission: StaffPermissionName; scope: 'GLOBAL' | 'ASSIGNED' }>();
    for (const grant of grants) {
      if (!STAFF_PERMISSIONS.includes(grant.permission)) throw new BadRequestException(`Unknown permission: ${grant.permission}`);
      if (GLOBAL_ONLY.includes(grant.permission) && grant.scope !== 'GLOBAL') {
        throw new BadRequestException(`${grant.permission} requires GLOBAL scope`);
      }
      unique.set(`${grant.permission}:${grant.scope}`, grant);
    }
    return withCommerceTransaction(this.connection, async (session) => {
      const staff = await this.users.findById(staffId).session(session).exec();
      if (!staff || staff.role !== 'STAFF') throw new NotFoundException('Staff not found');
      // Serialize grant/replace operations for one staff account.
      await this.users.updateOne({ _id: staffId }, { $inc: { permissionsVersion: 1 } }, { session }).exec();
      if (replace) await this.permissions.deleteMany({ staffId }, { session }).exec();
      if (replace && unique.size) {
        await this.permissions.insertMany([...unique.values()].map((grant) => ({
          staffId,
          permission: grant.permission,
          scope: grant.scope,
          grantedBy: actorId,
        })), { session });
      }
      if (!replace) for (const grant of unique.values()) {
        await this.permissions.updateOne({ staffId, permission: grant.permission, scope: grant.scope },
          { $setOnInsert: { staffId, ...grant, grantedBy: actorId } }, { upsert: true, session }).exec();
      }
      const rows = await this.permissions.find({ staffId }).session(session).lean().exec();
      const result = rows.map(({ permission, scope }) => ({ permission, scope }));
      await this.audit.record(replace ? 'admin.staff_permissions_replaced' : 'admin.staff_permissions_granted', 'staff_permission', staffId, actorId, {
        grants: [...unique.values()],
      }, session);
      return { staffId, grants: result };
    });
  }

  private async issueInvitation(userId: string, email: string, session: ClientSession): Promise<void> {
    const token = randomBytes(32).toString('hex');
    await this.emailTokens.updateMany(
      { userId, purpose: 'RESET_PASSWORD', usedAt: null },
      { $set: { usedAt: new Date() } },
      { session },
    ).exec();
    const [setup] = await this.emailTokens.create([{ userId, purpose: 'RESET_PASSWORD',
      tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) }], { session });
    await this.email.enqueue('staff.invite', email, `staff.invite:${userId}:${String(setup._id)}`, { token }, session);
  }

  private async ensureActiveAdminsLock(): Promise<void> {
    try {
      await this.connection.collection(SYSTEM_LOCKS).updateOne(
        { _id: ACTIVE_ADMINS_LOCK as never }, { $setOnInsert: { version: 0 } }, { upsert: true },
      );
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    }
  }
}
