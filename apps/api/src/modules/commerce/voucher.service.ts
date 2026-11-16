import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { Voucher } from './commerce.schemas.js';
import { AuditService } from '../operations/audit.service.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import type { UpdateVoucherDto, VoucherWriteDto } from './commerce.dto.js';

@Injectable()
export class VoucherService {
  constructor(@InjectModel(Voucher.name) private readonly vouchers: Model<Voucher>,
    @InjectConnection() private readonly connection: Connection, private readonly audit: AuditService) {}

  async list() {
    const items = await this.vouchers.find().sort({ createdAt: -1 }).lean().exec();
    return { items: items.map((item) => this.serialize(item as unknown as Record<string, unknown>)) };
  }

  async create(dto: VoucherWriteDto, actorId?: string) {
    this.validateRules(dto);
    try {
      return await withCommerceTransaction(this.connection, async (session) => {
        const [created] = await this.vouchers.create([{
          ...dto, code: dto.code.toUpperCase(), validFrom: new Date(dto.validFrom), validTo: new Date(dto.validTo),
        }], { session });
        await this.audit.record('voucher.create', 'voucher', String(created._id), actorId,
          { code: created.code }, session);
        return this.serialize(created.toObject() as unknown as Record<string, unknown>);
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        throw new ConflictException('Voucher code already exists');
      }
      throw error;
    }
  }

  async update(voucherId: string, dto: UpdateVoucherDto, actorId?: string) {
    if (!Types.ObjectId.isValid(voucherId)) throw new NotFoundException('Voucher not found');
    if (Object.keys(dto).length === 0) throw new BadRequestException('At least one field is required');
    const payload: Record<string, unknown> = { ...dto };
    if (dto.code) payload.code = dto.code.toUpperCase();
    if (dto.validFrom) payload.validFrom = new Date(dto.validFrom);
    if (dto.validTo) payload.validTo = new Date(dto.validTo);
    if (dto.validFrom && dto.validTo && new Date(dto.validFrom) >= new Date(dto.validTo)) {
      throw new BadRequestException('Voucher validity window is invalid');
    }
    try {
      return await withCommerceTransaction(this.connection, async (session) => {
        const current = await this.vouchers.findById(voucherId)
          .select('code usedCount validFrom validTo type value').session(session).lean().exec();
        if (!current) throw new NotFoundException('Voucher not found');
        // Quotes and historic orders reference this code, including after usage is released.
        if (dto.code && dto.code.toUpperCase() !== current.code) {
          throw new ConflictException('Voucher code is immutable; create a new voucher instead');
        }
        if ((dto.type ?? current.type) === 'PERCENT' && (dto.value ?? current.value) > 100) {
          throw new BadRequestException('Percent voucher cannot exceed 100');
        }
        if (dto.usageLimit !== undefined && dto.usageLimit < (current.usedCount ?? 0)) {
          throw new BadRequestException('Usage limit cannot be lower than the number already used');
        }
        if (new Date(dto.validFrom ?? current.validFrom) >= new Date(dto.validTo ?? current.validTo)) {
          throw new BadRequestException('Voucher validity window is invalid');
        }
        const updated = await this.vouchers.findOneAndUpdate({ _id: voucherId,
          ...(dto.usageLimit !== undefined ? { usedCount: { $lte: dto.usageLimit } } : {}) },
          { $set: payload }, { new: true, runValidators: true, session }).lean().exec();
        if (!updated) throw new ConflictException('Voucher changed concurrently or no longer exists');
        await this.audit.record('voucher.update', 'voucher', voucherId, actorId,
          { fields: Object.keys(payload) }, session);
        return this.serialize(updated as unknown as Record<string, unknown>);
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        throw new ConflictException('Voucher code already exists');
      }
      throw error;
    }
  }

  async remove(voucherId: string, actorId?: string) {
    if (!Types.ObjectId.isValid(voucherId)) throw new NotFoundException('Voucher not found');
    await withCommerceTransaction(this.connection, async (session) => {
      const disabled = await this.vouchers.findByIdAndUpdate(voucherId,
        { $set: { status: 'DISABLED' } }, { session }).exec();
      if (!disabled) throw new NotFoundException('Voucher not found');
      await this.audit.record('voucher.disable', 'voucher', voucherId, actorId, {}, session);
    });
  }

  private validateRules(dto: VoucherWriteDto) {
    if (dto.type === 'PERCENT' && dto.value > 100) throw new BadRequestException('Percent voucher cannot exceed 100');
    if (new Date(dto.validFrom) >= new Date(dto.validTo)) throw new BadRequestException('Voucher validity window is invalid');
  }

  private serialize(voucher: Record<string, unknown>) {
    return {
      id: String(voucher._id),
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      maxDiscount: voucher.maxDiscount ?? null,
      minimumSubtotal: voucher.minimumSubtotal,
      validFrom: new Date(String(voucher.validFrom)).toISOString(),
      validTo: new Date(String(voucher.validTo)).toISOString(),
      usageLimit: voucher.usageLimit,
      usedCount: voucher.usedCount ?? 0,
      status: voucher.status,
    };
  }
}
