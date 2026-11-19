import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service.js';

const OWNER = '64b0000000000000000000ff';
const MEDIA = '64b0000000000000000000ee';
const CAT_QUAN = '64b0000000000000000000c1';
const ids = ['64b000000000000000000001', '64b000000000000000000002', '64b000000000000000000003'];
const chain = <T>(value: T) => ({ select: () => ({ lean: () => ({ exec: async () => value }) }) });

function build(products: Array<{ name: string; categoryId?: string }>) {
  const rows = products.map((product, index) => ({ _id: ids[index], ...product }));
  const productModel = {
    countDocuments: vi.fn(() => ({ exec: async () => rows.length })),
    find: vi.fn(() => chain(rows)),
  };
  const jobs = { findOne: vi.fn(() => ({ lean: () => ({ exec: async () => null }) })) };
  const media = { findById: vi.fn(() => ({ lean: () => ({ exec: async () => ({ status: 'READY', purpose: 'tryon', ownerId: OWNER }) }) })) };
  const categories = { find: vi.fn(() => chain([{ _id: CAT_QUAN, name: 'Quần' }])) };
  // Nếu qua được bước kiểm tra, service sẽ mở transaction: dùng lỗi này để biết đã qua.
  const connection = { startSession: vi.fn(async () => { throw new Error('reached-transaction'); }) };
  const service = new AiService(jobs as never, {} as never, productModel as never, media as never, {} as never,
    { isEnabled: () => true } as never, {} as never, connection as never, {} as never, categories as never);
  const dto = { inputMediaId: MEDIA, productIds: ids.slice(0, rows.length), consentPolicyVersion: 'v1' };
  return { service, dto, connection };
}

describe('Kiểm tra bộ phối khi tạo job MIX_MATCH (trước khi lưu job)', () => {
  it('rejects two bottoms with a Vietnamese 400 and never opens a transaction', async () => {
    const { service, dto, connection } = build([{ name: 'Quần jean ống suông' }, { name: 'Chân váy xếp ly' }]);
    const error = await service.createMixMatch(OWNER, 'key-1', dto).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe('Bạn đang chọn 2 món cùng vị trí (quần/chân váy). Mỗi vị trí chỉ chọn 1 món.');
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('rejects a dress together with a top', async () => {
    const { service, dto } = build([{ name: 'Đầm hoa nhí' }, { name: 'Áo sơ mi lụa' }]);
    await expect(service.createMixMatch(OWNER, 'key-2', dto)).rejects.toThrow('Đầm/jumpsuit đã là cả bộ');
  });

  it('uses the category name (category "Quần" makes an oddly named product a bottom)', async () => {
    const { service, dto } = build([{ name: 'Quần jean' }, { name: 'Mẫu mới mùa hè', categoryId: CAT_QUAN }]);
    await expect(service.createMixMatch(OWNER, 'key-3', dto)).rejects.toThrow('cùng vị trí (quần/chân váy)');
  });

  it('lets valid outfits and unknown products through to job creation', async () => {
    const ok = build([{ name: 'Áo sơ mi lụa' }, { name: 'Quần jean ống suông' }, { name: 'Sản phẩm XYZ' }]);
    await expect(ok.service.createMixMatch(OWNER, 'key-4', ok.dto)).rejects.toThrow('reached-transaction');
  });

  it('does not apply outfit rules to TRY_ON', async () => {
    const tryOn = build([{ name: 'Quần jean' }]);
    await expect(tryOn.service.createTryOn(OWNER, 'key-5', tryOn.dto)).rejects.toThrow('reached-transaction');
  });
});
