import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminSupportController } from './admin-support.controller.js';
import {
  AdminSupportTicketListQueryDto, AssignSupportTicketDto, CreateSupportTicketDto, SendSupportMessageDto,
  SupportMessagesQueryDto, SupportTicketStatusDto,
} from './support.dto.js';
import { SupportController } from './support.controller.js';

const errorsOf = async <T extends object>(type: new () => T, plain: object) => (await validate(plainToInstance(type, plain))).map((e) => e.property);
const valid = { subject: 'Hỏi về size áo', category: 'SIZE', message: 'Xin chào' };

describe('Support DTO', () => {
  it('phiếu mới: tiêu đề 5–150 (sau khi trim), tin nhắn 1–2000, loại hợp lệ, orderId là ObjectId', async () => {
    expect(await errorsOf(CreateSupportTicketDto, valid)).toEqual([]);
    expect(await errorsOf(CreateSupportTicketDto, { ...valid, subject: '  abc  ' })).toEqual(['subject']);
    expect(await errorsOf(CreateSupportTicketDto, { ...valid, subject: 'a'.repeat(151) })).toEqual(['subject']);
    expect(await errorsOf(CreateSupportTicketDto, { ...valid, message: '   ' })).toEqual(['message']);
    expect(await errorsOf(CreateSupportTicketDto, { ...valid, message: 'x'.repeat(2001) })).toEqual(['message']);
    expect(await errorsOf(CreateSupportTicketDto, { ...valid, category: 'KHAC' })).toEqual(['category']);
    expect(await errorsOf(CreateSupportTicketDto, { ...valid, orderId: 'zzz' })).toEqual(['orderId']);
    expect(await errorsOf(CreateSupportTicketDto, { ...valid, orderId: '64b7f0c2a1b2c3d4e5f60718' })).toEqual([]);
  });

  it('làm sạch chữ thuần: trim, bỏ ký tự điều khiển, gộp khoảng trắng ở tiêu đề', () => {
    const dto = plainToInstance(CreateSupportTicketDto, { ...valid, subject: '  Hỏi   về\u0000  size  ', message: '  dòng 1\r\ndòng 2\u0007  ' });
    expect(dto.subject).toBe('Hỏi về size');
    expect(dto.message).toBe('dòng 1\ndòng 2');
  });

  it('các DTO còn lại', async () => {
    expect(await errorsOf(SendSupportMessageDto, { message: '' })).toEqual(['message']);
    expect(await errorsOf(AssignSupportTicketDto, { staffId: null })).toEqual([]);
    expect(await errorsOf(AssignSupportTicketDto, { staffId: '64b7f0c2a1b2c3d4e5f60718' })).toEqual([]);
    expect(await errorsOf(AssignSupportTicketDto, { staffId: 'x' })).toEqual(['staffId']);
    expect(await errorsOf(AssignSupportTicketDto, {})).toEqual(['staffId']);
    expect(await errorsOf(SupportTicketStatusDto, { status: 'OPEN' })).toEqual(['status']);
    expect(await errorsOf(SupportTicketStatusDto, { status: 'RESOLVED' })).toEqual([]);
    expect(await errorsOf(SupportMessagesQueryDto, { after: 'hôm qua' })).toEqual(['after']);
    expect(await errorsOf(SupportMessagesQueryDto, { after: '2026-11-18T03:00:00.000Z', limit: '50' })).toEqual([]);
    expect(await errorsOf(SupportMessagesQueryDto, { limit: '101' })).toEqual(['limit']);
    expect(await errorsOf(AdminSupportTicketListQueryDto, { assigned: 'all' })).toEqual(['assigned']);
    expect(await errorsOf(AdminSupportTicketListQueryDto, { assigned: 'me', status: 'OPEN', q: 'abc', page: '2' })).toEqual([]);
  });

  it('controller để lộ lớp DTO cho ValidationPipe', () => {
    const types = (target: object, method: string) => Reflect.getMetadata('design:paramtypes', target, method) as unknown[];
    expect(types(SupportController.prototype, 'create')).toContain(CreateSupportTicketDto);
    expect(types(SupportController.prototype, 'send')).toContain(SendSupportMessageDto);
    expect(types(AdminSupportController.prototype, 'reply')).toContain(SendSupportMessageDto);
    expect(types(AdminSupportController.prototype, 'assign')).toContain(AssignSupportTicketDto);
    expect(types(AdminSupportController.prototype, 'status')).toContain(SupportTicketStatusDto);
  });

  it('phân công chỉ dành cho ADMIN ở tầng route, các route còn lại cho ADMIN và STAFF', () => {
    const roles = (method: string) => Reflect.getMetadata('roles', (AdminSupportController.prototype as never as Record<string, object>)[method]);
    expect(roles('assign')).toEqual(['ADMIN']);
    expect(Reflect.getMetadata('roles', AdminSupportController)).toEqual(['ADMIN', 'STAFF']);
    expect(Reflect.getMetadata('roles', SupportController)).toEqual(['CUSTOMER']);
  });
});
