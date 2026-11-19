import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { NotificationsPage } from './notifications.page';

const item = (id: string, readAt: string | null) => ({ id, type: 'ORDER_UPDATED', title: id, body: '', readAt, createdAt: '2026-11-18T00:00:00.000Z' }) as unknown as NotificationItem;

describe('NotificationsPage read filter', () => {
  it('"ĐÃ ĐỌC" shows only read notifications and counts total minus unread', () => {
    const api = { listNotifications: vi.fn(() => of({ items: [item('a', null), item('b', '2026-11-18T01:00:00.000Z'), item('c', '2026-11-18T02:00:00.000Z')], total: 16, unreadCount: 6 })) };
    const injector = Injector.create({ providers: [
      { provide: ApiService, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const page = runInInjectionContext(injector, () => new NotificationsPage());
    page.ngOnInit();

    expect(page.readCount()).toBe(10);
    page.tab.set('read');
    expect(page.visibleNotifications().map((n) => n.id)).toEqual(['b', 'c']);
    page.tab.set('unread');
    expect(page.visibleNotifications().map((n) => n.id)).toEqual(['a']);
    page.tab.set('all');
    expect(page.visibleNotifications()).toHaveLength(3);
  });
});
