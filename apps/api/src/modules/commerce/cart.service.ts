import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { Product } from '../catalog/product.schema.js';
import { ProductVariant } from '../catalog/catalog.schemas.js';
import { Cart } from './commerce.schemas.js';
import type { CartItemDto } from './commerce.dto.js';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly carts: Model<Cart>,
    @InjectModel(ProductVariant.name) private readonly variants: Model<ProductVariant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
  ) {}

  async getCart(customerId: string, session?: ClientSession) {
    const cart = await this.ensureCart(customerId, session);
    return this.buildResponse(cart.items, cart.get('updatedAt') as Date, session);
  }

  async replaceCart(customerId: string, items: CartItemDto[]) {
    const merged = this.mergeItems(items);
    await this.validateItems(merged);
    const cart = await this.carts.findOneAndUpdate(
      { customerId },
      { $set: { items: merged } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
    return this.buildResponse(cart.items, cart.get('updatedAt') as Date);
  }

  async clearCart(customerId: string, session?: ClientSession) {
    await this.carts.updateOne({ customerId }, { $set: { items: [] } }, { session }).exec();
  }

  /** Bỏ khỏi giỏ các sản phẩm vừa đặt hàng; sản phẩm chưa chọn vẫn ở lại giỏ. */
  async removeItems(customerId: string, variantIds: string[], session?: ClientSession) {
    const ids = variantIds.map((id) => new Types.ObjectId(String(id)));
    await this.carts.updateOne({ customerId }, { $pull: { items: { variantId: { $in: ids } } } }, { session }).exec();
  }

  private async ensureCart(customerId: string, session?: ClientSession) {
    return this.carts.findOneAndUpdate(
      { customerId },
      { $setOnInsert: { customerId, items: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session },
    ).exec();
  }

  private mergeItems(items: CartItemDto[]) {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = String(item.variantId);
      map.set(key, Math.min(99, (map.get(key) ?? 0) + item.quantity));
    }
    return [...map.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
  }

  private async validateItems(items: Array<{ variantId: string; quantity: number }>) {
    if (items.length > 100) throw new BadRequestException('Cart exceeds maximum line count');
    for (const item of items) {
      if (!Types.ObjectId.isValid(item.variantId)) throw new BadRequestException('Variant is invalid');
      if (item.quantity < 1 || item.quantity > 99) throw new BadRequestException('Quantity is invalid');
    }
    const variantIds = items.map((item) => item.variantId);
    const variants = await this.variants.find({ _id: { $in: variantIds }, status: 'ACTIVE' }).lean().exec();
    if (variants.length !== variantIds.length) throw new BadRequestException('One or more variants are unavailable');
    const productIds = variants.map((variant) => String(variant.productId));
    const published = await this.products.countDocuments({ _id: { $in: productIds }, status: 'PUBLISHED' }).exec();
    if (published !== new Set(productIds).size) throw new BadRequestException('One or more products are unavailable');
    const byId = new Map(variants.map((variant) => [String(variant._id), variant]));
    for (const item of items) {
      const variant = byId.get(item.variantId);
      if (!variant) continue;
      const available = Math.max(0, variant.stockOnHand - variant.reserved);
      if (available < item.quantity) throw new ConflictException('Requested quantity exceeds available stock');
    }
  }

  private async buildResponse(items: Array<{ variantId: string; quantity: number }>, updatedAt: Date, session?: ClientSession) {
    if (!items.length) return { items: [], subtotal: 0, updatedAt };
    const variants = await this.variants.find({ _id: { $in: items.map((item) => item.variantId) } }).session(session ?? null).lean().exec();
    const products = await this.products.find({ _id: { $in: variants.map((v) => v.productId) } }).session(session ?? null).lean().exec();
    const variantMap = new Map(variants.map((variant) => [String(variant._id), variant]));
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    let subtotal = 0;
    const lines = items.map((item) => {
      const variant = variantMap.get(String(item.variantId));
      if (!variant) throw new BadRequestException('Variant is unavailable');
      const product = productMap.get(String(variant.productId));
      const unitPrice = variant.price;
      subtotal += unitPrice * item.quantity;
      return {
        variantId: String(item.variantId),
        sku: variant.sku,
        productName: product?.name ?? 'Product',
        quantity: item.quantity,
        unitPrice,
        available: Math.max(0, variant.stockOnHand - variant.reserved),
      };
    });
    return { items: lines, subtotal, updatedAt };
  }
}
