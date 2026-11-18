import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { SupportService, generateTicketCode, previewOf } from './support.service.js';

// ── Kho dữ liệu giả trong bộ nhớ: chỉ hỗ trợ đúng các toán tử service đang dùng. ──
type Doc = Record<string, any>;
const hex = (n: number) => n.toString(16).padStart(24, '0');
let seq = 0x1000;
const nextId = () => hex(++seq);
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v);
const same = (a: unknown, b: unknown) => (a == null || b == null ? a == null && b == null : String(time(a)) === String(time(b)));
const compare = (a: unknown, b: unknown) => (Number(time(a)) > Number(time(b)) ? 1 : Number(time(a)) < Number(time(b)) ? -1 : 0);

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return (cond as Doc[]).some((part) => matches(doc, part));
    const value = doc[key];
    if (cond instanceof RegExp) return typeof value === 'string' && cond.test(value);
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond as Doc).every(([op, arg]) => {
        if (op === '$in') return (arg as unknown[]).some((item) => same(value, item));
        if (op === '$ne') return !same(value, arg);
        if (op === '$gt') return value != null && compare(value, arg) > 0;
        if (op === '$gte') return value != null && compare(value, arg) >= 0;
        throw new Error(`Fake store: unsupported operator ${op}`);
      });
    }
    return same(value, cond);
  });
}

function applyUpdate(doc: Doc, update: Doc): void {
  for (const [op, fields] of Object.entries(update)) {
    for (const [key, value] of Object.entries(fields as Doc)) {
      if (op === '$set') doc[key] = value;
      else if (op === '$inc') doc[key] = (doc[key] ?? 0) + (value as number);
      else if (op === '$unset') delete doc[key];
      else if (op === '$min') { if (doc[key] === undefined || compare(value, doc[key]) < 0) doc[key] = value; }
      else throw new Error(`Fake store: unsupported update ${op}`);
    }
  }
}

class Query {
  private sortSpec: Doc = {};
  private skipN = 0;
  private limitN = Infinity;
  constructor(private readonly run: (q: Query) => unknown) {}
  sort(spec: Doc) { this.sortSpec = spec; return this; }
  skip(n: number) { this.skipN = n; return this; }
  limit(n: number) { this.limitN = n; return this; }
  select() { return this; }
  lean() { return this; }
  session() { return this; }
  async exec() { return this.run(this); }
  ordered(rows: Doc[]) {
    const keys = Object.entries(this.sortSpec);
    const sorted = keys.length ? [...rows].sort((a, b) => {
      for (const [key, dir] of keys) { const c = compare(a[key], b[key]); if (c) return c * (dir as number); }
      return 0;
    }) : rows;
    return sorted.slice(this.skipN, this.skipN + this.limitN).map((row) => structuredClone(row));
  }
}

function fakeModel(docs: Doc[]) {
  return {
    docs,
    find: (filter: Doc) => new Query((q) => q.ordered(docs.filter((d) => matches(d, filter)))),
    findOne: (filter: Doc) => new Query((q) => q.ordered(docs.filter((d) => matches(d, filter)))[0] ?? null),
    countDocuments: (filter: Doc) => ({ exec: async () => docs.filter((d) => matches(d, filter)).length }),
    exists: (filter: Doc) => ({ exec: async () => { const hit = docs.find((d) => matches(d, filter)); return hit ? { _id: hit._id } : null; } }),
    create: async (items: Doc[]) => items.map((item) => {
      const doc = { _id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...item };
      docs.push(doc);
      return structuredClone(doc);
    }),
    updateOne: (filter: Doc, update: Doc) => ({ exec: async () => {
      const hit = docs.find((d) => matches(d, filter));
      if (hit) applyUpdate(hit, update);
      return { matchedCount: hit ? 1 : 0 };
    } }),
    findOneAndUpdate: (filter: Doc, update: Doc) => new Query(() => {
      const hit = docs.find((d) => matches(d, filter));
      if (!hit) return null;
      applyUpdate(hit, update);
      hit.updatedAt = new Date();
      return structuredClone(hit);
    }),
  };
}

// ── Dữ liệu mẫu ──
const CUSTOMER_A = hex(0xa1);
const CUSTOMER_B = hex(0xb1);
const ADMIN = hex(0xad);
const STAFF_GLOBAL = hex(0x51);
const STAFF_ASSIGNED = hex(0x52);
const STAFF_NONE = hex(0x53);
const ORDER_A = hex(0x0a);
const ORDER_B = hex(0x0b);
const principal = (sub: string, role: 'ADMIN' | 'STAFF' | 'CUSTOMER') => ({ sub, role, email: `${sub}@x.vn`, sid: 's' });
const admin = principal(ADMIN, 'ADMIN');
const global = principal(STAFF_GLOBAL, 'STAFF');
const assigned = principal(STAFF_ASSIGNED, 'STAFF');
const noPerm = principal(STAFF_NONE, 'STAFF');
const T0 = new Date('2026-11-18T03:00:00.000Z');
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

function build() {
  const users = fakeModel([
    { _id: CUSTOMER_A, fullName: 'Nguyễn Thu An', email: 'an@example.com', phone: '0900000001', role: 'CUSTOMER', status: 'ACTIVE' },
    { _id: CUSTOMER_B, fullName: 'Trần Bảo', email: 'bao@example.com', role: 'CUSTOMER', status: 'ACTIVE' },
    { _id: ADMIN, fullName: 'Quản Trị', email: 'admin@muse.vn', role: 'ADMIN', status: 'ACTIVE' },
    { _id: STAFF_GLOBAL, fullName: 'Lê Hỗ Trợ', email: 'noibo-global@muse.vn', role: 'STAFF', status: 'ACTIVE' },
    { _id: STAFF_ASSIGNED, fullName: 'Phạm Phụ Trách', email: 'noibo-assigned@muse.vn', role: 'STAFF', status: 'ACTIVE' },
    { _id: STAFF_NONE, fullName: 'Không Quyền', email: 'none@muse.vn', role: 'STAFF', status: 'ACTIVE' },
  ]);
  const orders = fakeModel([
    { _id: ORDER_A, code: 'FCORDERA', state: 'PAID', money: { payableTotal: 450000 }, customerId: CUSTOMER_A, createdAt: new Date('2026-11-10T00:00:00Z') },
    { _id: ORDER_B, code: 'FCORDERB', state: 'PAID', money: { payableTotal: 99000 }, customerId: CUSTOMER_B, createdAt: new Date('2026-11-11T00:00:00Z') },
  ]);
  const tickets = fakeModel([]);
  const messages = fakeModel([]);
  const scopes: Record<string, 'GLOBAL' | 'ASSIGNED' | null> = { [STAFF_GLOBAL]: 'GLOBAL', [STAFF_ASSIGNED]: 'ASSIGNED' };
  const usersService = { permissionScope: vi.fn(async (id: string) => scopes[id] ?? null) };
  const notifications = { createIdempotent: vi.fn(async () => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const connection = { startSession: async () => ({ withTransaction: async (fn: () => Promise<void>) => { await fn(); }, endSession: async () => undefined }) };
  const rateLimit = new RateLimitService(connection as never);
  const service = new SupportService(tickets as never, messages as never, orders as never, users as never, connection as never,
    usersService as never, notifications as never, audit as never, rateLimit);
  return { service, tickets, messages, notifications, audit, usersService };
}

const newTicket = (service: SupportService, customerId = CUSTOMER_A, extra: Record<string, unknown> = {}) =>
  service.createTicket(customerId, { subject: 'Hỏi về size áo', category: 'SIZE', message: 'Mình cao 1m60, nặng 52kg?', ...extra });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe('SupportService – khách hàng', () => {
  it('tạo phiếu OPEN kèm tin nhắn đầu, mã TKT-xxxxxx và chưa đọc phía nhân sự', async () => {
    const { service, messages } = build();
    const ticket = await newTicket(service);
    expect(ticket.code).toMatch(/^TKT-[A-HJ-NP-Z2-9]{6}$/);
    expect(ticket).toMatchObject({ status: 'OPEN', customerId: CUSTOMER_A, unreadForStaff: 1, unreadForCustomer: 0, orderId: null, assignedStaffId: null, firstResponseAt: null });
    expect(ticket.lastMessagePreview).toBe('Mình cao 1m60, nặng 52kg?');
    expect(messages.docs).toHaveLength(1);
    expect(messages.docs[0]).toMatchObject({ ticketId: ticket.id, senderId: CUSTOMER_A, senderRole: 'CUSTOMER' });
  });

  it('chấp nhận orderId của chính khách, từ chối đơn của người khác hoặc không tồn tại', async () => {
    const { service } = build();
    expect((await newTicket(service, CUSTOMER_A, { orderId: ORDER_A })).orderId).toBe(ORDER_A);
    await expect(newTicket(service, CUSTOMER_A, { orderId: ORDER_B })).rejects.toBeInstanceOf(BadRequestException);
    await expect(newTicket(service, CUSTOMER_A, { orderId: hex(0xdead) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('khách chỉ thấy, gửi, đọc, đóng phiếu của mình (người khác nhận 404)', async () => {
    const { service } = build();
    const mine = await newTicket(service);
    await newTicket(service, CUSTOMER_B);
    expect((await service.listMine(CUSTOMER_A, {})).items.map((t) => t.id)).toEqual([mine.id]);
    await expect(service.getMine(CUSTOMER_B, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMessagesMine(CUSTOMER_B, mine.id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.sendMine(CUSTOMER_B, mine.id, 'xin chào')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.markReadMine(CUSTOMER_B, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.closeMine(CUSTOMER_B, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getMine(CUSTOMER_A, 'not-an-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('chi tiết phiếu của khách có mã đơn và tên nhân viên phụ trách, không có email', async () => {
    const { service } = build();
    const ticket = await newTicket(service, CUSTOMER_A, { orderId: ORDER_A });
    await service.claim(global, ticket.id);
    const detail = await service.getMine(CUSTOMER_A, ticket.id);
    expect(detail).toMatchObject({ orderCode: 'FCORDERA', assignedStaffName: 'Lê Hỗ Trợ' });
    expect(JSON.stringify(detail)).not.toContain('@');
  });

  it('khách gửi tin vào phiếu RESOLVED thì mở lại: IN_PROGRESS nếu có người phụ trách, ngược lại OPEN', async () => {
    const { service, tickets } = build();
    const withOwner = await newTicket(service);
    await service.claim(global, withOwner.id);
    await service.changeStatus(global, withOwner.id, 'RESOLVED');
    await service.sendMine(CUSTOMER_A, withOwner.id, 'Vẫn chưa được ạ');
    expect(tickets.docs.find((t) => t._id === withOwner.id)?.status).toBe('IN_PROGRESS');

    const noOwner = await newTicket(service);
    tickets.docs.find((t) => t._id === noOwner.id)!.status = 'RESOLVED';
    await service.sendMine(CUSTOMER_A, noOwner.id, 'Cho mình hỏi thêm');
    expect(tickets.docs.find((t) => t._id === noOwner.id)?.status).toBe('OPEN');
  });

  it('từ chối gửi tin vào phiếu CLOSED với 409 và thông báo tiếng Việt', async () => {
    const { service } = build();
    const ticket = await newTicket(service);
    await service.closeMine(CUSTOMER_A, ticket.id);
    const error = await service.sendMine(CUSTOMER_A, ticket.id, 'Còn đó không?').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('Phiếu đã đóng, vui lòng tạo yêu cầu mới');
  });

  it('gửi tin cập nhật lastMessageAt, preview 80 ký tự và tăng chưa đọc phía nhân sự', async () => {
    const { service, tickets } = build();
    const ticket = await newTicket(service);
    tick(5_000);
    const long = `${'a'.repeat(100)}\nb`;
    await service.sendMine(CUSTOMER_A, ticket.id, long);
    const row = tickets.docs[0];
    expect(row.lastMessagePreview).toHaveLength(80);
    expect(row.lastMessageAt.toISOString()).toBe(new Date(T0.getTime() + 5_000).toISOString());
    expect(row.unreadForStaff).toBe(2);
    await service.markReadMine(CUSTOMER_A, ticket.id);
    expect(tickets.docs[0].unreadForCustomer).toBe(0);
  });

  it('polling: có after thì chỉ trả tin mới hơn, tăng dần; không có after trả tin mới nhất theo thứ tự tăng dần', async () => {
    const { service } = build();
    const ticket = await newTicket(service);
    tick(1_000); const second = await service.sendMine(CUSTOMER_A, ticket.id, 'tin 2');
    tick(1_000); await service.sendMine(CUSTOMER_A, ticket.id, 'tin 3');
    const all = await service.listMessagesMine(CUSTOMER_A, ticket.id, {});
    expect(all.items.map((m) => m.body)).toEqual(['Mình cao 1m60, nặng 52kg?', 'tin 2', 'tin 3']);
    const fresh = await service.listMessagesMine(CUSTOMER_A, ticket.id, { after: second.createdAt });
    expect(fresh.items.map((m) => m.body)).toEqual(['tin 3']);
    expect((await service.listMessagesMine(CUSTOMER_A, ticket.id, { after: new Date(Date.now() + 1000).toISOString() })).items).toEqual([]);
    const lastTwo = await service.listMessagesMine(CUSTOMER_A, ticket.id, { limit: 2 });
    expect(lastTwo.items.map((m) => m.body)).toEqual(['tin 2', 'tin 3']);
  });

  it('giới hạn tần suất: 20 tin/phút và 5 phiếu/giờ, trả 429 tiếng Việt', async () => {
    const { service } = build();
    const ticket = await newTicket(service);
    for (let i = 0; i < 20; i += 1) await service.sendMine(CUSTOMER_A, ticket.id, `tin ${i}`);
    const error = await service.sendMine(CUSTOMER_A, ticket.id, 'tin 21').catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(429);
    expect(error.message).toMatch(/quá nhanh/);
    tick(61_000);
    await expect(service.sendMine(CUSTOMER_A, ticket.id, 'đã hết chờ')).resolves.toBeDefined();

    const other = build().service;
    for (let i = 0; i < 5; i += 1) await newTicket(other, CUSTOMER_B);
    const blocked = await newTicket(other, CUSTOMER_B).catch((e) => e);
    expect(blocked.getStatus()).toBe(429);
    expect(blocked.message).toMatch(/quá nhiều/);
  });
});

describe('SupportService – nhân sự', () => {
  it('tin phản hồi đầu tiên ghi firstResponseAt, OPEN→IN_PROGRESS, gán người trả lời và tạo thông báo', async () => {
    const { service, tickets, notifications } = build();
    const ticket = await newTicket(service);
    tick(30 * 60_000);
    const reply = await service.replyAdmin(global, ticket.id, 'Chào bạn, shop tư vấn size M nhé');
    const row = tickets.docs[0];
    expect(row).toMatchObject({ status: 'IN_PROGRESS', assignedStaffId: STAFF_GLOBAL, unreadForCustomer: 1 });
    expect(row.firstResponseAt.toISOString()).toBe(new Date(T0.getTime() + 30 * 60_000).toISOString());
    expect(reply).toMatchObject({ senderRole: 'STAFF', senderName: 'Lê Hỗ Trợ' });
    expect(notifications.createIdempotent).toHaveBeenCalledWith({
      ownerId: CUSTOMER_A, type: 'SUPPORT_REPLY', title: `MUSE đã phản hồi yêu cầu ${ticket.code}`,
      body: 'Chào bạn, shop tư vấn size M nhé', reference: { ticketId: ticket.id }, dedupKey: `support-reply:${reply.id}`,
    });
    tick(60_000);
    const second = await service.replyAdmin(global, ticket.id, 'Bạn cần gì thêm không?');
    expect(tickets.docs[0].firstResponseAt.toISOString()).toBe(new Date(T0.getTime() + 30 * 60_000).toISOString());
    expect(notifications.createIdempotent).toHaveBeenLastCalledWith(expect.objectContaining({ dedupKey: `support-reply:${second.id}` }));
  });

  it('lỗi tạo thông báo không làm hỏng việc gửi tin', async () => {
    const { service, notifications, messages } = build();
    const ticket = await newTicket(service);
    notifications.createIdempotent.mockRejectedValueOnce(new Error('db down'));
    await expect(service.replyAdmin(admin, ticket.id, 'Đã nhận')).resolves.toMatchObject({ senderRole: 'ADMIN' });
    expect(messages.docs).toHaveLength(2);
  });

  it('nhân sự không trả lời được phiếu CLOSED; phía khách không bị lộ email nhân viên', async () => {
    const { service } = build();
    const ticket = await newTicket(service);
    await service.replyAdmin(global, ticket.id, 'Xin chào');
    const customerView = await service.listMessagesMine(CUSTOMER_A, ticket.id, {});
    expect(customerView.items.find((m) => m.senderRole === 'STAFF')?.senderName).toBe('Lê Hỗ Trợ');
    expect(JSON.stringify(customerView)).not.toMatch(/noibo|@muse\.vn/);
    await service.changeStatus(global, ticket.id, 'CLOSED');
    await expect(service.replyAdmin(global, ticket.id, 'Thêm một ý')).rejects.toBeInstanceOf(ConflictException);
  });

  it('phạm vi: GLOBAL và ADMIN thấy tất cả; ASSIGNED chỉ thấy phiếu được giao; không có order.read bị chặn', async () => {
    const { service } = build();
    const mine = await newTicket(service);
    const other = await newTicket(service, CUSTOMER_B);
    await service.assign(admin, mine.id, STAFF_ASSIGNED);

    expect((await service.listAdmin(admin, {})).total).toBe(2);
    expect((await service.listAdmin(global, {})).total).toBe(2);
    expect((await service.listAdmin(assigned, {})).items.map((t) => t.id)).toEqual([mine.id]);
    expect((await service.listAdmin(assigned, { assigned: 'unassigned' })).total).toBe(0);
    await expect(service.getAdmin(assigned, other.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMessagesAdmin(assigned, other.id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.replyAdmin(assigned, other.id, 'thử')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.changeStatus(assigned, other.id, 'RESOLVED')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.markReadAdmin(assigned, other.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.replyAdmin(assigned, mine.id, 'Em nhận ạ')).resolves.toBeDefined();
    await expect(service.listAdmin(noPerm, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.stats(noPerm)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listAdmin(principal(CUSTOMER_A, 'CUSTOMER'), {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('chỉ ADMIN được phân công; nhân viên phải đang hoạt động và có order.read', async () => {
    const { service, tickets, audit } = build();
    const ticket = await newTicket(service);
    await expect(service.assign(global, ticket.id, STAFF_GLOBAL)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assign(admin, ticket.id, STAFF_NONE)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.assign(admin, ticket.id, CUSTOMER_A)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.assign(admin, ticket.id, 'bad')).rejects.toBeInstanceOf(BadRequestException);

    const assignedTicket = await service.assign(admin, ticket.id, STAFF_GLOBAL);
    expect(assignedTicket).toMatchObject({ assignedStaffId: STAFF_GLOBAL, status: 'IN_PROGRESS' });
    expect(audit.record).toHaveBeenCalledWith('support.ticket.assigned', 'support_ticket', ticket.id, ADMIN, { before: null, after: STAFF_GLOBAL }, expect.anything());

    const released = await service.assign(admin, ticket.id, null);
    expect(released.assignedStaffId).toBeNull();
    expect(tickets.docs[0]).not.toHaveProperty('assignedStaffId');
  });

  it('claim: chỉ GLOBAL/ADMIN nhận phiếu chưa có người phụ trách, ghi audit; nhận lần hai bị 409', async () => {
    const { service, audit } = build();
    const ticket = await newTicket(service);
    await expect(service.claim(assigned, ticket.id)).rejects.toBeInstanceOf(ForbiddenException);
    const claimed = await service.claim(global, ticket.id);
    expect(claimed).toMatchObject({ assignedStaffId: STAFF_GLOBAL, status: 'IN_PROGRESS' });
    expect(audit.record).toHaveBeenCalledWith('support.ticket.claimed', 'support_ticket', ticket.id, STAFF_GLOBAL, { before: null, after: STAFF_GLOBAL }, expect.anything());
    await expect(service.claim(admin, ticket.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('đổi trạng thái thêm tin nhắn SYSTEM, báo khách và ghi audit', async () => {
    const { service, messages, tickets, audit } = build();
    const ticket = await newTicket(service);
    const updated = await service.changeStatus(global, ticket.id, 'RESOLVED');
    expect(updated.status).toBe('RESOLVED');
    expect(messages.docs.at(-1)).toMatchObject({ senderRole: 'SYSTEM', senderId: STAFF_GLOBAL, body: 'Phiếu đã được đánh dấu đã giải quyết' });
    expect(tickets.docs[0]).toMatchObject({ unreadForCustomer: 1, lastMessagePreview: 'Phiếu đã được đánh dấu đã giải quyết' });
    expect(audit.record).toHaveBeenCalledWith('support.ticket.status_changed', 'support_ticket', ticket.id, STAFF_GLOBAL, { before: 'OPEN', after: 'RESOLVED' }, expect.anything());
    const count = messages.docs.length;
    await service.changeStatus(global, ticket.id, 'RESOLVED');
    expect(messages.docs).toHaveLength(count);
  });

  it('khách tự đóng phiếu: có tin SYSTEM, báo nhân sự, ghi audit, gọi lại không lỗi', async () => {
    const { service, tickets, audit } = build();
    const ticket = await newTicket(service);
    expect((await service.closeMine(CUSTOMER_A, ticket.id)).status).toBe('CLOSED');
    expect(tickets.docs[0].unreadForStaff).toBe(2);
    expect(audit.record).toHaveBeenCalledWith('support.ticket.closed_by_customer', 'support_ticket', ticket.id, CUSTOMER_A, { before: 'OPEN', after: 'CLOSED' }, expect.anything());
    await expect(service.closeMine(CUSTOMER_A, ticket.id)).resolves.toMatchObject({ status: 'CLOSED' });
  });

  it('danh sách quản trị: tìm theo mã, tiêu đề, tên/email khách; q được escape regex; lọc assigned=me/unassigned', async () => {
    const { service } = build();
    const a = await newTicket(service, CUSTOMER_A, { subject: 'Đổi size.áo (M)' });
    const b = await newTicket(service, CUSTOMER_B, { subject: 'Hoàn tiền đơn hàng' });
    await service.claim(global, b.id);
    expect((await service.listAdmin(admin, { q: a.code.toLowerCase() })).items.map((t) => t.id)).toEqual([a.id]);
    expect((await service.listAdmin(admin, { q: 'size.áo' })).items.map((t) => t.id)).toEqual([a.id]);
    expect((await service.listAdmin(admin, { q: 'size?áo' })).total).toBe(0);
    expect((await service.listAdmin(admin, { q: '.*' })).total).toBe(0);
    expect((await service.listAdmin(admin, { q: 'bao@example' })).items[0]).toMatchObject({ id: b.id, customerName: 'Trần Bảo', assignedStaffName: 'Lê Hỗ Trợ' });
    expect((await service.listAdmin(global, { assigned: 'me' })).items.map((t) => t.id)).toEqual([b.id]);
    expect((await service.listAdmin(global, { assigned: 'unassigned' })).items.map((t) => t.id)).toEqual([a.id]);
    expect((await service.listAdmin(admin, { status: 'IN_PROGRESS' })).items.map((t) => t.id)).toEqual([b.id]);
  });

  it('chi tiết quản trị có tóm tắt khách và đơn gắn kèm', async () => {
    const { service } = build();
    const ticket = await newTicket(service, CUSTOMER_A, { orderId: ORDER_A });
    const detail = await service.getAdmin(global, ticket.id);
    expect(detail.customer).toEqual({ id: CUSTOMER_A, fullName: 'Nguyễn Thu An', email: 'an@example.com', phone: '0900000001' });
    expect(detail.order).toMatchObject({ id: ORDER_A, code: 'FCORDERA', state: 'PAID', payableTotal: 450000 });
  });

  it('thống kê theo phạm vi: số phiếu theo trạng thái, chưa đọc, thời gian phản hồi đầu trung bình 7 ngày', async () => {
    const { service } = build();
    const a = await newTicket(service);
    const b = await newTicket(service, CUSTOMER_B);
    await newTicket(service, CUSTOMER_B);
    tick(30 * 60_000);
    await service.replyAdmin(global, a.id, 'trả lời sau 30 phút');
    tick(30 * 60_000);
    await service.replyAdmin(global, b.id, 'trả lời sau 60 phút');
    await service.assign(admin, a.id, STAFF_ASSIGNED);
    await service.markReadAdmin(admin, a.id);

    expect(await service.stats(admin)).toEqual({
      byStatus: { OPEN: 1, IN_PROGRESS: 2, RESOLVED: 0, CLOSED: 0 }, unreadForStaff: 2, avgFirstResponseMinutes: 45, windowDays: 7,
    });
    expect((await service.stats(assigned)).byStatus).toEqual({ OPEN: 0, IN_PROGRESS: 1, RESOLVED: 0, CLOSED: 0 });
    tick(8 * 24 * 60 * 60_000);
    expect((await service.stats(admin)).avgFirstResponseMinutes).toBeNull();
  });
});

describe('SupportService – toàn luồng', () => {
  it('khách tạo → nhân sự trả lời → thông báo → khách đọc → giải quyết → khách mở lại → đóng', async () => {
    const { service, tickets, messages, notifications } = build();

    // 1. Khách tạo phiếu kèm đơn của mình.
    const ticket = await newTicket(service, CUSTOMER_A, { category: 'ORDER', orderId: ORDER_A, subject: 'Đơn chưa giao tới' });
    expect(ticket).toMatchObject({ status: 'OPEN', orderId: ORDER_A, unreadForStaff: 1, unreadForCustomer: 0 });
    expect((await service.listAdmin(global, {})).items[0]).toMatchObject({ id: ticket.id, customerName: 'Nguyễn Thu An', orderCode: 'FCORDERA' });

    // 2. Nhân sự trả lời: tự nhận phiếu, sang IN_PROGRESS, khách có thông báo trỏ về phiếu.
    tick(5 * 60_000);
    const reply = await service.replyAdmin(global, ticket.id, 'Shop đang kiểm tra với đơn vị vận chuyển');
    expect(tickets.docs[0]).toMatchObject({ status: 'IN_PROGRESS', assignedStaffId: STAFF_GLOBAL, unreadForCustomer: 1 });
    expect(notifications.createIdempotent).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: CUSTOMER_A, type: 'SUPPORT_REPLY', reference: { ticketId: ticket.id }, dedupKey: `support-reply:${reply.id}`,
    }));

    // 3. Khách mở phiếu: thấy tên nhân viên (không có email), đọc xong thì hết chưa đọc.
    const detail = await service.getMine(CUSTOMER_A, ticket.id);
    expect(detail).toMatchObject({ assignedStaffName: 'Lê Hỗ Trợ', orderCode: 'FCORDERA' });
    const thread = await service.listMessagesMine(CUSTOMER_A, ticket.id, {});
    expect(thread.items.map((m) => m.senderRole)).toEqual(['CUSTOMER', 'STAFF']);
    expect(JSON.stringify({ detail, thread })).not.toContain('noibo-global@muse.vn');
    await service.markReadMine(CUSTOMER_A, ticket.id);
    expect(tickets.docs[0].unreadForCustomer).toBe(0);

    // 4. Nhân sự đánh dấu đã giải quyết (có tin SYSTEM).
    tick(60_000);
    await service.changeStatus(global, ticket.id, 'RESOLVED');
    expect((await service.getMine(CUSTOMER_A, ticket.id)).status).toBe('RESOLVED');
    expect(messages.docs.at(-1)).toMatchObject({ senderRole: 'SYSTEM' });

    // 5. Khách nhắn tiếp: phiếu mở lại (đã có người phụ trách nên IN_PROGRESS), phía nhân sự có chưa đọc.
    tick(60_000);
    await service.sendMine(CUSTOMER_A, ticket.id, 'Vẫn chưa nhận được hàng');
    expect(tickets.docs[0]).toMatchObject({ status: 'IN_PROGRESS', assignedStaffId: STAFF_GLOBAL });
    expect(tickets.docs[0].unreadForStaff).toBeGreaterThan(0);
    expect((await service.stats(global)).unreadForStaff).toBe(1);

    // 6. Polling chỉ lấy tin mới hơn mốc `after`, không tải lại cả hội thoại.
    const last = (await service.listMessagesMine(CUSTOMER_A, ticket.id, {})).items.at(-1)!;
    tick(1_000);
    await service.replyAdmin(global, ticket.id, 'Shop đã giục đơn vị vận chuyển');
    const newer = await service.listMessagesMine(CUSTOMER_A, ticket.id, { after: last.createdAt });
    expect(newer.items).toHaveLength(1);
    expect(newer.items[0].body).toBe('Shop đã giục đơn vị vận chuyển');

    // 7. Khách đóng phiếu: không ai nhắn thêm được nữa.
    await service.closeMine(CUSTOMER_A, ticket.id);
    expect(tickets.docs[0].status).toBe('CLOSED');
    await expect(service.sendMine(CUSTOMER_A, ticket.id, 'Gửi thêm')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.replyAdmin(global, ticket.id, 'Trả lời thêm')).rejects.toBeInstanceOf(ConflictException);
  });

  it('khách khác không đụng được vào phiếu; nhân viên ASSIGNED chỉ làm việc trên phiếu được giao', async () => {
    const { service } = build();
    const ticket = await newTicket(service);
    const other = await newTicket(service, CUSTOMER_B);
    await service.assign(admin, ticket.id, STAFF_ASSIGNED);
    for (const call of [
      () => service.getMine(CUSTOMER_B, ticket.id), () => service.sendMine(CUSTOMER_B, ticket.id, 'x'),
      () => service.closeMine(CUSTOMER_B, ticket.id), () => service.markReadMine(CUSTOMER_B, ticket.id),
    ]) await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getAdmin(assigned, other.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.claim(assigned, other.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getAdmin(assigned, ticket.id)).resolves.toMatchObject({ id: ticket.id });
  });
});

describe('helper', () => {
  it('mã phiếu không trùng ký tự dễ nhầm; preview cắt theo ký tự và gộp khoảng trắng', () => {
    for (let i = 0; i < 200; i += 1) expect(generateTicketCode()).toMatch(/^TKT-[A-HJ-NP-Z2-9]{6}$/);
    expect(previewOf('  a \n\n b  ')).toBe('a b');
    expect(Array.from(previewOf('😀'.repeat(100)))).toHaveLength(80);
  });
});
