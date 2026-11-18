import { readFileSync } from 'node:fs';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { AdminSupportPage } from './admin/admin-support.page';
import { SupportPage } from './support.page';

const message = (id: string, createdAt: string, senderRole = 'STAFF') =>
  ({ id, ticketId: 't1', senderId: 'u1', senderRole, senderName: 'MUSE', body: `tin ${id}`, createdAt });
const ticket = (status = 'IN_PROGRESS') => ({
  id: 't1', code: 'TKT-ABC234', customerId: 'c1', subject: 'Hỏi về size', category: 'SIZE', orderId: null, status,
  assignedStaffId: null, lastMessageAt: '2026-11-18T03:00:00.000Z', lastMessagePreview: 'xin chào', unreadForCustomer: 0, unreadForStaff: 0,
  firstResponseAt: null, createdAt: '2026-11-18T03:00:00.000Z', updatedAt: '2026-11-18T03:00:00.000Z',
  orderCode: null, assignedStaffName: null, customer: { id: 'c1', fullName: 'An', email: 'an@x.vn', phone: null }, order: null,
});

function make<T>(type: new () => T, api: Record<string, unknown>, auth: Record<string, unknown> = {}) {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api },
    { provide: AuthService, useValue: { isAdmin: () => true, can: () => true, canGlobal: () => true, ...auth } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
    { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
    { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ ticketId: 't1' })) } },
  ] });
  return runInInjectionContext(injector, () => new type());
}

let visibility = 'visible';
beforeEach(() => {
  visibility = 'visible';
  vi.useFakeTimers();
  vi.stubGlobal('document', {
    get visibilityState() { return visibility; },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function customerApi(status = 'IN_PROGRESS') {
  return {
    listSupportTickets: vi.fn(() => of({ items: [ticket(status)], page: 1, limit: 50, total: 1 })),
    getSupportTicket: vi.fn(() => of(ticket(status))),
    listSupportMessages: vi.fn(() => of({ items: [message('m1', '2026-11-18T03:00:00.000Z', 'CUSTOMER')] })),
    sendSupportMessage: vi.fn(),
    markSupportTicketRead: vi.fn(() => of({ ok: true })),
    closeSupportTicket: vi.fn(),
    listOrders: vi.fn(() => of({ items: [], page: 1, limit: 50, total: 0 })),
  };
}

describe('Chat hỗ trợ – khách hàng', () => {
  it('polling 5 giây dùng after, bỏ qua khi tab ẩn và dừng hẳn khi rời trang', () => {
    const api = customerApi();
    const page = make(SupportPage, api);
    page.ngOnInit();
    expect(page.selectedId()).toBe('t1');
    expect(api.listSupportMessages).toHaveBeenCalledTimes(1); // lần mở phiếu: tải hội thoại

    vi.advanceTimersByTime(5_000);
    expect(api.listSupportMessages).toHaveBeenCalledTimes(2);
    expect(api.listSupportMessages).toHaveBeenLastCalledWith('t1', '2026-11-18T03:00:00.000Z');

    visibility = 'hidden';
    vi.advanceTimersByTime(15_000);
    expect(api.listSupportMessages).toHaveBeenCalledTimes(2);

    visibility = 'visible';
    page.ngOnDestroy();
    vi.advanceTimersByTime(60_000);
    expect(api.listSupportMessages).toHaveBeenCalledTimes(2);
    expect(api.listSupportTickets).toHaveBeenCalledTimes(1); // danh sách cũng ngừng làm mới
  });

  it('tin mới từ polling được nối vào hội thoại, không trùng', () => {
    const api = customerApi();
    const page = make(SupportPage, api);
    page.ngOnInit();
    api.listSupportMessages.mockReturnValue(of({ items: [message('m1', '2026-11-18T03:00:00.000Z', 'CUSTOMER'), message('m2', '2026-11-18T03:00:03.000Z')] }));
    vi.advanceTimersByTime(5_000);
    expect(page.messages().map((m) => m.id)).toEqual(['m1', 'm2']);
    page.ngOnDestroy();
  });

  it('gửi lỗi thì giữ nguyên nội dung ô soạn và hiện thông báo', () => {
    const api = customerApi();
    api.sendSupportMessage.mockReturnValue(throwError(() => ({ status: 429, error: { code: 'RATE_LIMITED', message: 'Bạn gửi tin quá nhanh, vui lòng thử lại sau ít phút' } })));
    const page = make(SupportPage, api);
    page.ngOnInit();
    page.draft.set('  Cho mình hỏi thêm  ');
    page.send();
    expect(api.sendSupportMessage).toHaveBeenCalledWith('t1', 'Cho mình hỏi thêm');
    expect(page.draft()).toBe('  Cho mình hỏi thêm  ');
    expect(page.sending()).toBe(false);
    expect(page.sendError()).toBe('Bạn gửi tin quá nhanh, vui lòng thử lại sau ít phút');
    expect(page.messages().map((m) => m.id)).toEqual(['m1']);
    page.ngOnDestroy();
  });

  it('phiếu CLOSED: không gửi được và giao diện không dựng ô soạn', () => {
    const api = customerApi('CLOSED');
    const page = make(SupportPage, api);
    page.ngOnInit();
    page.draft.set('Gửi thêm');
    page.send();
    expect(api.sendSupportMessage).not.toHaveBeenCalled();
    page.ngOnDestroy();

    const source = readFileSync(new URL('./support.page.ts', import.meta.url), 'utf8');
    const closedAt = source.indexOf("@if (d.status === 'CLOSED')");
    expect(closedAt).toBeGreaterThan(-1);
    expect(source.indexOf('class="closed-box"')).toBeGreaterThan(closedAt);
    expect(source.indexOf('Yêu cầu đã đóng')).toBeGreaterThan(closedAt);
    expect(source.indexOf('<form class="composer"')).toBeGreaterThan(source.indexOf('} @else {', closedAt));
  });
});

describe('Chat hỗ trợ – nhân sự', () => {
  function adminApi(status = 'IN_PROGRESS') {
    return {
      adminSupportStats: vi.fn(() => of({ byStatus: { OPEN: 1, IN_PROGRESS: 1, RESOLVED: 0, CLOSED: 0 }, unreadForStaff: 1, avgFirstResponseMinutes: 12, windowDays: 7 })),
      adminListSupportTickets: vi.fn(() => of({ items: [{ ...ticket(status), customerName: 'An', assignedStaffName: null }], page: 1, limit: 50, total: 1 })),
      adminGetSupportTicket: vi.fn(() => of(ticket(status))),
      adminListSupportMessages: vi.fn(() => of({ items: [message('m1', '2026-11-18T03:00:00.000Z', 'CUSTOMER')] })),
      adminReplySupportTicket: vi.fn(),
      adminMarkSupportTicketRead: vi.fn(() => of({ ok: true })),
    };
  }

  it('polling tin 5 giây dùng after, bỏ qua khi tab ẩn và dừng khi rời trang', () => {
    const api = adminApi();
    const page = make(AdminSupportPage, api);
    page.ngOnInit();
    expect(page.selectedId()).toBe('t1');
    const opened = api.adminListSupportMessages.mock.calls.length;

    vi.advanceTimersByTime(5_000);
    expect(api.adminListSupportMessages).toHaveBeenCalledTimes(opened + 1);
    expect(api.adminListSupportMessages).toHaveBeenLastCalledWith('t1', '2026-11-18T03:00:00.000Z');

    visibility = 'hidden';
    vi.advanceTimersByTime(30_000);
    expect(api.adminListSupportMessages).toHaveBeenCalledTimes(opened + 1);

    visibility = 'visible';
    page.ngOnDestroy();
    const lists = api.adminListSupportTickets.mock.calls.length;
    vi.advanceTimersByTime(60_000);
    expect(api.adminListSupportMessages).toHaveBeenCalledTimes(opened + 1);
    expect(api.adminListSupportTickets).toHaveBeenCalledTimes(lists);
  });

  it('gửi lỗi giữ nội dung ô soạn; phiếu CLOSED không gửi được', () => {
    const api = adminApi();
    api.adminReplySupportTicket.mockReturnValue(throwError(() => ({ status: 409, error: { message: 'Phiếu đã đóng, không thể trả lời' } })));
    const page = make(AdminSupportPage, api);
    page.ngOnInit();
    page.draft.set('Em kiểm tra giúp chị');
    page.send();
    expect(page.draft()).toBe('Em kiểm tra giúp chị');
    expect(page.sendError()).toBe('Phiếu đã đóng, không thể trả lời');
    page.ngOnDestroy();

    const closedApi = adminApi('CLOSED');
    const closedPage = make(AdminSupportPage, closedApi);
    closedPage.ngOnInit();
    closedPage.draft.set('Trả lời');
    closedPage.send();
    expect(closedApi.adminReplySupportTicket).not.toHaveBeenCalled();
    closedPage.ngOnDestroy();
  });
});
