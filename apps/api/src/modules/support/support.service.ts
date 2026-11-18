import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import type { ClientSession, Connection, Model } from 'mongoose';
import type {
  AdminSupportTicketDetail, AdminSupportTicketList, SupportMessage as SupportMessageView, SupportMessageList,
  SupportSenderRole, SupportStats, SupportTicket as SupportTicketView, SupportTicketDetail, SupportTicketList,
  SupportTicketStatus,
} from '@fashion/contracts';
import type { UserPrincipal } from '../../common/auth.guard.js';
import { escapeRegex } from '../../common/escape-regex.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { Order } from '../commerce/commerce.schemas.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuditService } from '../operations/audit.service.js';
import { User } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { SupportMessage, SupportTicket } from './support.schemas.js';

type Filter = Record<string, unknown>;
type TicketRow = SupportTicket & { _id: unknown };
type MessageRow = SupportMessage & { _id: unknown };
type Actor = { id: string; role: Exclude<SupportSenderRole, 'SYSTEM'> };
type Page = { page?: number; limit?: number };

const ID_PATTERN = /^[a-f\d]{24}$/i;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREVIEW_LENGTH = 80;
const STATS_WINDOW_DAYS = 7;
const CLOSED_MESSAGE = 'Phiếu đã đóng, vui lòng tạo yêu cầu mới';
const NOT_FOUND_MESSAGE = 'Không tìm thấy phiếu hỗ trợ';
const STATUS_TEXT: Record<'IN_PROGRESS' | 'RESOLVED' | 'CLOSED', string> = {
  IN_PROGRESS: 'Phiếu đã được chuyển sang đang xử lý',
  RESOLVED: 'Phiếu đã được đánh dấu đã giải quyết',
  CLOSED: 'Phiếu đã được đóng',
};

export function generateTicketCode(): string {
  const bytes = randomBytes(6);
  let suffix = '';
  for (const byte of bytes) suffix += CODE_ALPHABET[byte & 31];
  return `TKT-${suffix}`;
}

export function previewOf(body: string): string {
  return Array.from(body.replace(/\s+/g, ' ').trim()).slice(0, PREVIEW_LENGTH).join('');
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
}

const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value);
const iso = (value: Date | undefined | null): string | null => (value ? new Date(value).toISOString() : null);
const idOrNull = (value: unknown): string | null => (value ? String(value) : null);

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectModel(SupportTicket.name) private readonly tickets: Model<SupportTicket>,
    @InjectModel(SupportMessage.name) private readonly messages: Model<SupportMessage>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  // ───────────────────────── Khách hàng ─────────────────────────

  async createTicket(customerId: string, dto: { subject: string; category: string; orderId?: string; message: string }): Promise<SupportTicketView> {
    await this.limit(`support:create:${customerId}`, 5, 60 * 60_000, 'Bạn đã tạo quá nhiều yêu cầu hỗ trợ trong một giờ, vui lòng thử lại sau');
    if (dto.orderId) {
      const owned = await this.orders.exists({ _id: dto.orderId, customerId } as never).exec();
      if (!owned) throw new BadRequestException('Đơn hàng không thuộc tài khoản của bạn');
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const ticketId = await withCommerceTransaction(this.connection, async (session) => {
          const now = new Date();
          const [ticket] = await this.tickets.create([{
            code: generateTicketCode(), customerId, subject: dto.subject, category: dto.category,
            ...(dto.orderId ? { orderId: dto.orderId } : {}),
            status: 'OPEN', lastMessageAt: now, lastMessagePreview: previewOf(dto.message),
            unreadForCustomer: 0, unreadForStaff: 1,
          } as never], { session });
          const id = String(ticket._id);
          await this.messages.create([{ ticketId: id, senderId: customerId, senderRole: 'CUSTOMER', body: dto.message, createdAt: now } as never], { session });
          return id;
        });
        return this.ticketView(await this.requireTicket({ _id: ticketId }));
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
    throw new ConflictException('Không thể tạo mã phiếu, vui lòng thử lại');
  }

  async listMine(customerId: string, query: Page & { status?: string }): Promise<SupportTicketList> {
    const { page, limit } = this.paging(query);
    const filter: Filter = { customerId, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await Promise.all([
      this.tickets.find(filter as never).sort({ lastMessageAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.tickets.countDocuments(filter as never).exec(),
    ]);
    return { page, limit, total, items: (rows as TicketRow[]).map((row) => this.ticketView(row)) };
  }

  async getMine(customerId: string, ticketId: string): Promise<SupportTicketDetail> {
    return this.detailView(await this.requireTicket(this.mine(customerId, ticketId)), customerId);
  }

  async listMessagesMine(customerId: string, ticketId: string, query: { after?: string; limit?: number }): Promise<SupportMessageList> {
    const ticket = await this.requireTicket(this.mine(customerId, ticketId));
    return this.listMessages(String(ticket._id), query);
  }

  sendMine(customerId: string, ticketId: string, message: string): Promise<SupportMessageView> {
    return this.appendMessage(this.mine(customerId, ticketId), { id: customerId, role: 'CUSTOMER' }, message);
  }

  async markReadMine(customerId: string, ticketId: string): Promise<{ ok: true }> {
    const filter = this.mine(customerId, ticketId);
    if (!isId(ticketId)) throw new NotFoundException(NOT_FOUND_MESSAGE);
    const result = await this.tickets.updateOne(filter as never, { $set: { unreadForCustomer: 0 } }, { timestamps: false }).exec();
    if (!result.matchedCount) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return { ok: true };
  }

  async closeMine(customerId: string, ticketId: string): Promise<SupportTicketView> {
    const filter = this.mine(customerId, ticketId);
    const updated = await withCommerceTransaction(this.connection, async (session) => {
      const ticket = await this.requireTicket(filter, session);
      if (ticket.status === 'CLOSED') return ticket;
      const closed = await this.applyStatus(ticket, 'CLOSED', { id: customerId }, 'Khách hàng đã đóng phiếu', session);
      await this.audit.record('support.ticket.closed_by_customer', 'support_ticket', String(ticket._id), customerId,
        { before: ticket.status, after: 'CLOSED' }, session);
      return closed;
    });
    return this.ticketView(updated);
  }

  // ───────────────────────── Quản trị / nhân viên ─────────────────────────

  async listAdmin(principal: UserPrincipal, query: Page & { status?: string; q?: string; assigned?: 'me' | 'unassigned' }): Promise<AdminSupportTicketList> {
    const { page, limit } = this.paging(query);
    const scope = await this.staffScope(principal);
    const empty = { page, limit, total: 0, items: [] };
    const filter: Filter = { ...scope.filter };
    if (query.status) filter.status = query.status;
    if (query.assigned === 'me') filter.assignedStaffId = principal.sub;
    if (query.assigned === 'unassigned') {
      if (scope.filter.assignedStaffId) return empty;
      filter.assignedStaffId = null;
    }
    const q = query.q?.trim();
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      const customers = await this.users.find({ role: 'CUSTOMER', $or: [{ fullName: pattern }, { email: pattern }] } as never)
        .select('_id').limit(200).lean().exec();
      filter.$or = [{ code: pattern }, { subject: pattern }, ...(customers.length ? [{ customerId: { $in: customers.map((row) => String(row._id)) } }] : [])];
    }
    const [rows, total] = await Promise.all([
      this.tickets.find(filter as never).sort({ lastMessageAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.tickets.countDocuments(filter as never).exec(),
    ]);
    const list = rows as TicketRow[];
    const names = await this.nameMap(list.flatMap((row) => [String(row.customerId), idOrNull(row.assignedStaffId)]));
    const codes = await this.orderCodes(list.map((row) => idOrNull(row.orderId)));
    return { page, limit, total, items: list.map((row) => ({
      ...this.ticketView(row),
      customerName: names.get(String(row.customerId)) ?? '',
      assignedStaffName: row.assignedStaffId ? names.get(String(row.assignedStaffId)) ?? null : null,
      orderCode: row.orderId ? codes.get(String(row.orderId)) ?? null : null,
    })) };
  }

  async getAdmin(principal: UserPrincipal, ticketId: string): Promise<AdminSupportTicketDetail> {
    const ticket = await this.requireTicket(await this.visible(principal, ticketId));
    const base = await this.detailView(ticket);
    const [customer, order] = await Promise.all([
      this.users.findOne({ _id: ticket.customerId } as never).select('fullName email phone').lean().exec(),
      ticket.orderId ? this.orders.findOne({ _id: ticket.orderId } as never).select('code state money createdAt').lean().exec() : null,
    ]);
    const orderRow = order as (Order & { _id: unknown; createdAt?: Date }) | null;
    return {
      ...base,
      customer: { id: String(ticket.customerId), fullName: customer?.fullName ?? '', email: customer?.email ?? '', phone: customer?.phone ?? null },
      order: orderRow ? {
        id: String(orderRow._id), code: orderRow.code, state: orderRow.state,
        payableTotal: Number(orderRow.money?.['payableTotal'] ?? 0), createdAt: iso(orderRow.createdAt) ?? undefined,
      } : null,
    };
  }

  async listMessagesAdmin(principal: UserPrincipal, ticketId: string, query: { after?: string; limit?: number }): Promise<SupportMessageList> {
    const ticket = await this.requireTicket(await this.visible(principal, ticketId));
    return this.listMessages(String(ticket._id), query);
  }

  async replyAdmin(principal: UserPrincipal, ticketId: string, message: string): Promise<SupportMessageView> {
    const filter = await this.visible(principal, ticketId);
    return this.appendMessage(filter, { id: principal.sub, role: principal.role === 'ADMIN' ? 'ADMIN' : 'STAFF' }, message);
  }

  async claim(principal: UserPrincipal, ticketId: string): Promise<SupportTicketView> {
    const scope = await this.staffScope(principal);
    if (scope.filter.assignedStaffId) throw new ForbiddenException('Chỉ quản trị viên hoặc nhân viên có phạm vi toàn cục mới được nhận phiếu');
    const filter = this.byId(ticketId, scope.filter);
    const updated = await withCommerceTransaction(this.connection, async (session) => {
      const ticket = await this.requireTicket(filter, session);
      if (ticket.status === 'CLOSED') throw new ConflictException('Phiếu đã đóng, không thể nhận');
      if (ticket.assignedStaffId) throw new ConflictException('Phiếu đã có người phụ trách');
      const row = await this.tickets.findOneAndUpdate(
        { _id: ticket._id, assignedStaffId: null, status: { $ne: 'CLOSED' } } as never,
        { $set: { assignedStaffId: principal.sub, ...(ticket.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}) } },
        { new: true, session },
      ).lean().exec();
      if (!row) throw new ConflictException('Phiếu đã có người phụ trách');
      await this.audit.record('support.ticket.claimed', 'support_ticket', String(ticket._id), principal.sub,
        { before: null, after: principal.sub }, session);
      return row as TicketRow;
    });
    return this.ticketView(updated);
  }

  async assign(principal: UserPrincipal, ticketId: string, staffId: string | null): Promise<SupportTicketView> {
    if (principal.role !== 'ADMIN') throw new ForbiddenException('Chỉ quản trị viên mới được phân công phiếu');
    if (staffId !== null) {
      const staff = isId(staffId)
        ? await this.users.findOne({ _id: staffId, role: 'STAFF', status: 'ACTIVE' } as never).select('_id').lean().exec()
        : null;
      if (!staff || !await this.usersService.permissionScope(staffId, 'order.read')) {
        throw new BadRequestException('Nhân viên không hợp lệ hoặc không có quyền xử lý phiếu hỗ trợ');
      }
    }
    const filter = this.byId(ticketId);
    const updated = await withCommerceTransaction(this.connection, async (session) => {
      const ticket = await this.requireTicket(filter, session);
      const update = staffId === null
        ? { $unset: { assignedStaffId: '' } }
        : { $set: { assignedStaffId: staffId, ...(ticket.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}) } };
      const row = await this.tickets.findOneAndUpdate({ _id: ticket._id } as never, update, { new: true, session }).lean().exec();
      await this.audit.record('support.ticket.assigned', 'support_ticket', String(ticket._id), principal.sub,
        { before: idOrNull(ticket.assignedStaffId), after: staffId }, session);
      return row as TicketRow;
    });
    return this.ticketView(updated);
  }

  async changeStatus(principal: UserPrincipal, ticketId: string, status: 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'): Promise<SupportTicketView> {
    const filter = await this.visible(principal, ticketId);
    const updated = await withCommerceTransaction(this.connection, async (session) => {
      const ticket = await this.requireTicket(filter, session);
      if (ticket.status === status) return ticket;
      const row = await this.applyStatus(ticket, status, { id: principal.sub, assignIfFree: status === 'IN_PROGRESS' }, STATUS_TEXT[status], session);
      await this.audit.record('support.ticket.status_changed', 'support_ticket', String(ticket._id), principal.sub,
        { before: ticket.status, after: status }, session);
      return row;
    });
    return this.ticketView(updated);
  }

  async markReadAdmin(principal: UserPrincipal, ticketId: string): Promise<{ ok: true }> {
    const filter = await this.visible(principal, ticketId);
    const result = await this.tickets.updateOne(filter as never, { $set: { unreadForStaff: 0 } }, { timestamps: false }).exec();
    if (!result.matchedCount) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return { ok: true };
  }

  async stats(principal: UserPrincipal): Promise<SupportStats> {
    const { filter } = await this.staffScope(principal);
    const statuses: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60_000);
    const [counts, unread, responded] = await Promise.all([
      Promise.all(statuses.map((status) => this.tickets.countDocuments({ ...filter, status } as never).exec())),
      this.tickets.countDocuments({ ...filter, unreadForStaff: { $gt: 0 } } as never).exec(),
      this.tickets.find({ ...filter, createdAt: { $gte: since }, firstResponseAt: { $ne: null } } as never)
        .select('createdAt firstResponseAt').limit(5000).lean().exec(),
    ]);
    const minutes = (responded as TicketRow[])
      .map((row) => (new Date(row.firstResponseAt as Date).getTime() - new Date(row.createdAt).getTime()) / 60_000)
      .filter((value) => Number.isFinite(value) && value >= 0);
    return {
      byStatus: Object.fromEntries(statuses.map((status, index) => [status, counts[index]])) as Record<SupportTicketStatus, number>,
      unreadForStaff: unread,
      avgFirstResponseMinutes: minutes.length ? Math.round((minutes.reduce((sum, value) => sum + value, 0) / minutes.length) * 10) / 10 : null,
      windowDays: STATS_WINDOW_DAYS,
    };
  }

  // ───────────────────────── Nội bộ ─────────────────────────

  private mine(customerId: string, ticketId: string): Filter {
    return this.byId(ticketId, { customerId });
  }

  /** Id sai định dạng cũng trả 404 (không lộ khác biệt giữa "không tồn tại" và "không phải của bạn"). */
  private byId(ticketId: string, extra: Filter = {}): Filter {
    return { _id: isId(ticketId) ? ticketId : null, ...extra };
  }

  private async staffScope(principal: UserPrincipal): Promise<{ filter: Filter }> {
    if (principal.role === 'ADMIN') return { filter: {} };
    if (principal.role !== 'STAFF') throw new ForbiddenException('Không đủ quyền truy cập');
    const scope = await this.usersService.permissionScope(principal.sub, 'order.read');
    if (!scope) throw new ForbiddenException('Không đủ quyền truy cập');
    return { filter: scope === 'ASSIGNED' ? { assignedStaffId: principal.sub } : {} };
  }

  private async visible(principal: UserPrincipal, ticketId: string): Promise<Filter> {
    return this.byId(ticketId, (await this.staffScope(principal)).filter);
  }

  private async requireTicket(filter: Filter, session?: ClientSession): Promise<TicketRow> {
    if (filter._id === null) throw new NotFoundException(NOT_FOUND_MESSAGE);
    const row = await this.tickets.findOne(filter as never).session(session ?? null).lean().exec();
    if (!row) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return row as TicketRow;
  }

  private paging(query: Page) {
    return { page: Math.max(1, query.page ?? 1), limit: Math.min(50, Math.max(1, query.limit ?? 20)) };
  }

  private async limit(key: string, count: number, windowMs: number, message: string): Promise<void> {
    try {
      await this.rateLimit.consume(key, count, windowMs);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        const retryAfter = (error.getResponse() as { retryAfter?: number } | string);
        throw new HttpException({ code: 'RATE_LIMITED', message, retryAfter: typeof retryAfter === 'object' ? retryAfter.retryAfter : undefined },
          HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }

  /** Ghi tin nhắn + cập nhật phiếu trong một transaction; sau commit mới báo cho khách (nếu là nhân sự trả lời). */
  private async appendMessage(filter: Filter, actor: Actor, body: string): Promise<SupportMessageView> {
    await this.limit(`support:msg:${actor.id}`, 20, 60_000, 'Bạn gửi tin quá nhanh, vui lòng chờ một chút rồi gửi lại');
    const closedMessage = actor.role === 'CUSTOMER' ? CLOSED_MESSAGE : 'Phiếu đã đóng, hãy mở lại phiếu trước khi trả lời';
    const result = await withCommerceTransaction(this.connection, async (session) => {
      const ticket = await this.requireTicket(filter, session);
      if (ticket.status === 'CLOSED') throw new ConflictException(closedMessage);
      const now = new Date();
      const [message] = await this.messages.create([{
        ticketId: String(ticket._id), senderId: actor.id, senderRole: actor.role, body, createdAt: now,
      } as never], { session });
      const set: Filter = { lastMessageAt: now, lastMessagePreview: previewOf(body) };
      const update: Filter = { $set: set };
      if (actor.role === 'CUSTOMER') {
        update.$inc = { unreadForStaff: 1 };
        if (ticket.status === 'RESOLVED') set.status = ticket.assignedStaffId ? 'IN_PROGRESS' : 'OPEN';
      } else {
        update.$inc = { unreadForCustomer: 1 };
        update.$min = { firstResponseAt: now };
        if (ticket.status === 'OPEN') set.status = 'IN_PROGRESS';
        if (!ticket.assignedStaffId) set.assignedStaffId = actor.id;
      }
      const updated = await this.tickets.findOneAndUpdate(
        { _id: ticket._id, status: { $ne: 'CLOSED' } } as never, update, { new: true, session },
      ).lean().exec();
      if (!updated) throw new ConflictException(closedMessage);
      return { ticket: updated as TicketRow, messageId: String((message as unknown as { _id: unknown })._id), createdAt: now };
    });
    if (actor.role !== 'CUSTOMER') await this.notifyReply(result.ticket, result.messageId, body);
    const names = await this.nameMap([actor.id]);
    return {
      id: result.messageId, ticketId: String(result.ticket._id), senderId: actor.id, senderRole: actor.role,
      senderName: names.get(actor.id) ?? this.fallbackName(actor.role), body, createdAt: result.createdAt.toISOString(),
    };
  }

  /** Đổi trạng thái kèm một tin nhắn hệ thống, tăng chưa đọc cho khách (hoặc cho nhân sự khi khách tự đóng). */
  private async applyStatus(
    ticket: TicketRow, status: SupportTicketStatus, actor: { id: string; assignIfFree?: boolean }, text: string, session: ClientSession,
  ): Promise<TicketRow> {
    const now = new Date();
    const byCustomer = actor.id === String(ticket.customerId);
    await this.messages.create([{
      ticketId: String(ticket._id), senderId: actor.id, senderRole: 'SYSTEM', body: text, createdAt: now,
    } as never], { session });
    const set: Filter = { status, lastMessageAt: now, lastMessagePreview: previewOf(text) };
    if (actor.assignIfFree && !ticket.assignedStaffId) set.assignedStaffId = actor.id;
    const row = await this.tickets.findOneAndUpdate(
      { _id: ticket._id } as never,
      { $set: set, $inc: byCustomer ? { unreadForStaff: 1 } : { unreadForCustomer: 1 } },
      { new: true, session },
    ).lean().exec();
    return row as TicketRow;
  }

  private async notifyReply(ticket: TicketRow, messageId: string, body: string): Promise<void> {
    try {
      await this.notifications.createIdempotent({
        ownerId: String(ticket.customerId),
        type: 'SUPPORT_REPLY',
        title: `MUSE đã phản hồi yêu cầu ${ticket.code}`,
        body: previewOf(body),
        reference: { ticketId: String(ticket._id) },
        dedupKey: `support-reply:${messageId}`,
      });
    } catch (error) {
      // Tin nhắn đã lưu; lỗi thông báo không được làm hỏng phản hồi gửi tin.
      this.logger.warn(`Không tạo được thông báo cho phiếu ${ticket.code}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listMessages(ticketId: string, query: { after?: string; limit?: number }): Promise<SupportMessageList> {
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    let rows: MessageRow[];
    if (query.after) {
      rows = await this.messages.find({ ticketId, createdAt: { $gt: new Date(query.after) } } as never)
        .sort({ createdAt: 1, _id: 1 }).limit(limit).lean().exec() as MessageRow[];
    } else {
      // Lần tải đầu: lấy các tin mới nhất rồi đảo lại để trả theo thứ tự tăng dần.
      rows = (await this.messages.find({ ticketId } as never).sort({ createdAt: -1, _id: -1 }).limit(limit).lean().exec() as MessageRow[]).reverse();
    }
    const names = await this.nameMap(rows.map((row) => String(row.senderId)));
    return { items: rows.map((row) => ({
      id: String(row._id), ticketId: String(row.ticketId), senderId: String(row.senderId), senderRole: row.senderRole,
      senderName: row.senderRole === 'SYSTEM' ? 'MUSE' : names.get(String(row.senderId)) ?? this.fallbackName(row.senderRole),
      body: row.body, createdAt: new Date(row.createdAt).toISOString(),
    })) };
  }

  private fallbackName(role: SupportSenderRole): string {
    return role === 'CUSTOMER' ? 'Khách hàng' : 'MUSE';
  }

  /** Chỉ lấy tên hiển thị; không bao giờ trả email nhân viên cho phía khách. */
  private async nameMap(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => isId(id)))];
    if (!unique.length) return new Map();
    const rows = await this.users.find({ _id: { $in: unique } } as never).select('fullName').lean().exec();
    return new Map(rows.map((row) => [String(row._id), row.fullName]));
  }

  private async orderCodes(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => isId(id)))];
    if (!unique.length) return new Map();
    const rows = await this.orders.find({ _id: { $in: unique } } as never).select('code').lean().exec();
    return new Map(rows.map((row) => [String(row._id), row.code]));
  }

  private async detailView(row: TicketRow, customerId?: string): Promise<SupportTicketDetail> {
    const names = await this.nameMap([idOrNull(row.assignedStaffId)]);
    let orderCode: string | null = null;
    if (row.orderId) {
      // Với phía khách, chỉ hiện mã đơn khi đơn đúng là của họ (phòng dữ liệu cũ sai lệch).
      const order = await this.orders.findOne({ _id: row.orderId, ...(customerId ? { customerId } : {}) } as never).select('code').lean().exec();
      orderCode = order?.code ?? null;
    }
    return { ...this.ticketView(row), orderCode, assignedStaffName: row.assignedStaffId ? names.get(String(row.assignedStaffId)) ?? null : null };
  }

  private ticketView(row: TicketRow): SupportTicketView {
    return {
      id: String(row._id), code: row.code, customerId: String(row.customerId), subject: row.subject, category: row.category,
      orderId: idOrNull(row.orderId), status: row.status, assignedStaffId: idOrNull(row.assignedStaffId),
      lastMessageAt: iso(row.lastMessageAt) ?? '', lastMessagePreview: row.lastMessagePreview ?? '',
      unreadForCustomer: row.unreadForCustomer ?? 0, unreadForStaff: row.unreadForStaff ?? 0,
      firstResponseAt: iso(row.firstResponseAt), createdAt: iso(row.createdAt) ?? '', updatedAt: iso(row.updatedAt) ?? '',
    };
  }
}
