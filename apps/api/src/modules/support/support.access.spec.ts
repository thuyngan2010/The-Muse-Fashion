import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '@fashion/contracts';
import { ROLES_KEY } from '../../common/roles.decorator.js';
import { AdminSupportController } from './admin-support.controller.js';
import { SupportController } from './support.controller.js';

const reflector = new Reflector();

/** Vai trò được phép gọi một handler, tính đúng như AuthGuard (handler ghi đè lớp). */
function allowedRoles(controller: { prototype: object }, handler: string): UserRole[] {
  const fn = (controller.prototype as Record<string, (...args: never[]) => unknown>)[handler];
  return reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [fn, controller as never]) ?? [];
}
const handlersOf = (controller: { prototype: object }) =>
  Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== 'constructor');

describe('Phân quyền theo vai trò của API hỗ trợ', () => {
  it('API khách chỉ cho CUSTOMER: nhân sự và admin nhận 403', () => {
    const handlers = handlersOf(SupportController);
    expect(handlers.length).toBeGreaterThan(0);
    for (const name of handlers) expect(allowedRoles(SupportController, name), name).toEqual(['CUSTOMER']);
  });

  it('API quản trị không mở cho khách (403); chỉ ADMIN được phân công', () => {
    const handlers = handlersOf(AdminSupportController);
    expect(handlers.length).toBeGreaterThan(0);
    for (const name of handlers) {
      const roles = allowedRoles(AdminSupportController, name);
      expect(roles, name).not.toContain('CUSTOMER');
      expect(roles.length, name).toBeGreaterThan(0);
    }
    expect(allowedRoles(AdminSupportController, 'assign')).toEqual(['ADMIN']);
    expect(allowedRoles(AdminSupportController, 'reply')).toEqual(['ADMIN', 'STAFF']);
  });
});
