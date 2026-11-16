import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { SystemSetting } from '../admin/admin.schemas.js';
import { Voucher } from './commerce.schemas.js';

export type CommerceSettings = {
  standardShippingFee: number;
  freeShippingThreshold: number;
  lowStockThreshold: number;
};

const DEFAULT_SETTINGS: CommerceSettings = {
  standardShippingFee: 30_000,
  freeShippingThreshold: 1_000_000,
  lowStockThreshold: 5,
};

export function assertPositivePayableTotal(payableTotal: number): void {
  if (payableTotal <= 0) {
    throw new BadRequestException({ code: 'ZERO_PAYABLE_NOT_SUPPORTED',
      message: 'Đơn hàng phải có số tiền thanh toán lớn hơn 0đ. Vui lòng bỏ hoặc đổi mã giảm giá.' });
  }
}

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(SystemSetting.name) private readonly settings: Model<SystemSetting>,
    @InjectModel(Voucher.name) private readonly vouchers: Model<Voucher>,
  ) {}

  async getSettings(session?: ClientSession): Promise<CommerceSettings> {
    const query = this.settings.find({ key: { $in: ['standardShippingFee', 'freeShippingThreshold', 'lowStockThreshold'] } });
    if (session) query.session(session);
    const rows = await query.lean().exec();
    const map = new Map(rows.map((row) => [row.key, row.value]));
    return {
      standardShippingFee: Number(map.get('standardShippingFee') ?? DEFAULT_SETTINGS.standardShippingFee),
      freeShippingThreshold: Number(map.get('freeShippingThreshold') ?? DEFAULT_SETTINGS.freeShippingThreshold),
      lowStockThreshold: Number(map.get('lowStockThreshold') ?? DEFAULT_SETTINGS.lowStockThreshold),
    };
  }

  shippingFee(subtotal: number, settings: CommerceSettings): number {
    if (subtotal >= settings.freeShippingThreshold) return 0;
    return settings.standardShippingFee;
  }

  async resolveVoucher(code: string | undefined, subtotal: number, session?: ClientSession): Promise<{ discount: number; code?: string }> {
    if (!code?.trim()) return { discount: 0 };
    const query = this.vouchers.findOne({ code: code.trim().toUpperCase() });
    if (session) query.session(session);
    const voucher = await query.exec();
    if (!voucher) throw new BadRequestException({ code: 'VOUCHER_INVALID', message: 'Voucher is invalid' });
    const now = new Date();
    if (voucher.status !== 'ACTIVE') throw new BadRequestException({ code: 'VOUCHER_DISABLED', message: 'Voucher is disabled' });
    if (now < voucher.validFrom || now > voucher.validTo) throw new BadRequestException({ code: 'VOUCHER_EXPIRED', message: 'Voucher is expired' });
    if (voucher.usedCount >= voucher.usageLimit) throw new BadRequestException({ code: 'VOUCHER_EXHAUSTED', message: 'Voucher usage limit reached' });
    if (subtotal < voucher.minimumSubtotal) throw new BadRequestException({ code: 'VOUCHER_MINIMUM_NOT_MET', message: 'Order subtotal does not meet voucher minimum' });
    if (voucher.type === 'PERCENT' && voucher.value > 100) throw new BadRequestException({ code: 'VOUCHER_INVALID', message: 'Voucher is invalid' });

    let discount = voucher.type === 'FIXED' ? voucher.value : Math.floor((subtotal * voucher.value) / 100);
    if (voucher.maxDiscount != null) discount = Math.min(discount, voucher.maxDiscount);
    discount = Math.min(discount, subtotal);
    return { discount, code: voucher.code };
  }

  totals(subtotal: number, voucherDiscount: number, settings: CommerceSettings) {
    const shippingFee = this.shippingFee(subtotal, settings);
    const payableTotal = Math.max(0, subtotal - voucherDiscount + shippingFee);
    // Bank-transfer checkout cannot settle a zero-value order. Reject before persisting
    // its quote or reserving any stock/voucher use during order creation.
    assertPositivePayableTotal(payableTotal);
    return { subtotal, shippingFee, voucherDiscount, payableTotal };
  }
}
