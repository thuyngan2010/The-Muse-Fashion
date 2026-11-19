import { describe, expect, it, vi } from 'vitest';
import { CartService } from './cart.service.js';

const V1 = '64b000000000000000000001';
const V2 = '64b000000000000000000002';
const V3 = '64b000000000000000000003';
const M1 = '64b0000000000000000000a1';
const query = <T>(value: T) => ({ session: () => ({ lean: () => ({ exec: async () => value }) }) });

function build(media: Array<Record<string, unknown>>) {
  const carts = { findOneAndUpdate: vi.fn(() => ({ exec: async () => ({
    items: [{ variantId: V1, quantity: 1 }, { variantId: V2, quantity: 2 }, { variantId: V3, quantity: 1 }], get: () => new Date(0) }) })) };
  const variants = { find: vi.fn(() => query([
    { _id: V1, productId: 'p-url', sku: 'A', price: 100, stockOnHand: 5, reserved: 0 },
    { _id: V2, productId: 'p-media', sku: 'B', price: 50, stockOnHand: 5, reserved: 0 },
    { _id: V3, productId: 'p-none', sku: 'C', price: 10, stockOnHand: 5, reserved: 0 },
  ])) };
  const products = { find: vi.fn(() => query([
    { _id: 'p-url', name: 'Áo', images: ['https://cdn/ao.jpg'], imageMediaIds: [M1] },
    { _id: 'p-media', name: 'Quần', images: [], imageMediaIds: [M1] },
    { _id: 'p-none', name: 'Mũ', images: [], imageMediaIds: [] },
  ])) };
  const mediaModel = { find: vi.fn(() => query(media)) };
  const storage = { publicUrl: vi.fn((key: string) => `https://public/${key}`), signedReadUrl: vi.fn(async (key: string) => `https://signed/${key}`) };
  const service = new CartService(carts as never, variants as never, products as never, mediaModel as never, storage as never);
  return { service, mediaModel, storage };
}

describe('Giỏ hàng trả ảnh bìa sản phẩm (imageUrl)', () => {
  it('uses the manual URL first, then the first uploaded image, else null', async () => {
    const { service } = build([{ _id: M1, key: 'k1', visibility: 'PUBLIC' }]);
    const cart = await service.getCart('64b0000000000000000000ff');
    expect(cart.items.map((item) => item.imageUrl)).toEqual(['https://cdn/ao.jpg', 'https://public/k1', null]);
    expect(cart.subtotal).toBe(210);
  });

  it('signs private uploaded images', async () => {
    const { service, storage } = build([{ _id: M1, key: 'k1', visibility: 'PRIVATE' }]);
    const cart = await service.getCart('64b0000000000000000000ff');
    expect(cart.items[1].imageUrl).toBe('https://signed/k1');
    expect(storage.signedReadUrl).toHaveBeenCalledTimes(1);
  });

  it('still answers when media is not READY (no image, no error)', async () => {
    const { service } = build([]);
    const cart = await service.getCart('64b0000000000000000000ff');
    expect(cart.items[1].imageUrl).toBeNull();
  });
});
