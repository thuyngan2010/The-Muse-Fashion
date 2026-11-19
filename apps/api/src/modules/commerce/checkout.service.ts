import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Address } from '../users/identity.schemas.js';
import { CheckoutQuote } from './commerce.schemas.js';
import { CartService } from './cart.service.js';
import { PricingService } from './pricing.service.js';
import { cartFingerprint, selectCartLines } from './order.types.js';
import type { CheckVoucherDto, CheckoutQuoteDto } from './commerce.dto.js';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly carts: CartService,
    private readonly pricing: PricingService,
    @InjectModel(Address.name) private readonly addresses: Model<Address>,
    @InjectModel(CheckoutQuote.name) private readonly quotes: Model<CheckoutQuote>,
  ) {}

  async createQuote(customerId: string, dto: CheckoutQuoteDto) {
    if (!Types.ObjectId.isValid(dto.addressId)) throw new NotFoundException('Address not found');
    const address = await this.addresses.findOne({ _id: dto.addressId, customerId }).lean().exec();
    if (!address) throw new NotFoundException('Address not found');

    const cart = await this.carts.getCart(customerId);
    if (!cart.items.length) throw new BadRequestException('Cart is empty');
    const selected = selectCartLines(cart.items, dto.variantIds);
    if (!selected) throw new BadRequestException('Selected items are not in the cart');

    const settings = await this.pricing.getSettings();
    const { discount: voucherDiscount } = await this.pricing.resolveVoucher(dto.voucherCode, selected.subtotal);
    const totals = this.pricing.totals(selected.subtotal, voucherDiscount, settings);
    const quoteId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const cartItems = selected.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity }));

    await this.quotes.create({
      quoteId,
      customerId,
      addressId: dto.addressId,
      voucherCode: dto.voucherCode?.trim() ? dto.voucherCode.trim().toUpperCase() : undefined,
      cartFingerprint: cartFingerprint(cartItems),
      cartItems,
      subtotal: totals.subtotal,
      shippingFee: totals.shippingFee,
      voucherDiscount: totals.voucherDiscount,
      payableTotal: totals.payableTotal,
      expiresAt,
    });

    return {
      id: quoteId,
      ...totals,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Chỉ kiểm tra mã và tính số tiền giảm trên giỏ hàng hiện tại; không lưu báo giá, không giữ lượt dùng mã. */
  async checkVoucher(customerId: string, dto: CheckVoucherDto) {
    const cart = await this.carts.getCart(customerId);
    if (!cart.items.length) throw new BadRequestException('Cart is empty');
    const selected = selectCartLines(cart.items, dto.variantIds);
    if (!selected) throw new BadRequestException('Selected items are not in the cart');
    const { discount, code } = await this.pricing.resolveVoucher(dto.voucherCode, selected.subtotal);
    return { code: code ?? dto.voucherCode.trim().toUpperCase(), subtotal: selected.subtotal, voucherDiscount: discount };
  }
}
