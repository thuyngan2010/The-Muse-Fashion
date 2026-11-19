import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type Connection } from 'mongoose';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { User, UserDocument } from './user.schema.js';
import { Address, StaffPermission } from './identity.schemas.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { Order } from '../commerce/commerce.schemas.js';
import { AddressDto, UpdateAddressDto, UpdateProfileDto } from './users.dto.js';
import type { StaffPermissionName } from '../../common/permissions.decorator.js';
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) readonly model: Model<User>,
    @InjectModel(StaffPermission.name) private readonly staffPermissions: Model<StaffPermission>,
    @InjectModel(Address.name) private readonly addresses: Model<Address>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectConnection() private readonly connection: Connection,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}
  findByEmail(email: string) { return this.model.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash +verificationTokenHash').exec(); }
  /** Tên hiển thị (họ tên) theo id, dùng để gắn tên người thực hiện vào danh sách quản trị. Không trả email hay dữ liệu nhạy cảm. */
  async displayNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const valid = [...new Set(ids.filter((id): id is string => !!id && Types.ObjectId.isValid(id)).map(String))];
    if (!valid.length) return new Map();
    const rows = await this.model.find({ _id: { $in: valid } }).select('fullName').lean().exec();
    return new Map(rows.map((row) => [String(row._id), row.fullName]));
  }
  findById(id: string) { return Types.ObjectId.isValid(id) ? this.model.findById(id).exec() : Promise.resolve(null); }

  listActiveCustomerIds(limit: number, afterId?: string) {
    return this.model.find({
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
      ...(afterId ? { _id: { $gt: new Types.ObjectId(afterId) } } : {}),
    }).sort({ _id: 1 }).limit(limit).select('_id').lean().exec();
  }
  async permissionScope(staffId: string, permission: StaffPermissionName): Promise<'GLOBAL' | 'ASSIGNED' | null> {
    if (!Types.ObjectId.isValid(staffId)) return null;
    const grants = await this.staffPermissions.find({ staffId, permission }).lean().exec();
    if (grants.some((grant) => grant.scope === 'GLOBAL')) return 'GLOBAL';
    if (grants.some((grant) => grant.scope === 'ASSIGNED')) return 'ASSIGNED';
    return null;
  }

  async hasPermissions(staffId: string, permissions: StaffPermissionName[], orderId?: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(staffId)) return false;
    const required = [...new Set(permissions)];
    if (!required.length) return true;
    for (const permission of required) {
      const scope = await this.permissionScope(staffId, permission);
      if (scope === 'GLOBAL') continue;
      if (scope !== 'ASSIGNED' || !orderId || !Types.ObjectId.isValid(orderId)) return false;
      if (!await this.orders.exists({ _id: orderId, assignedStaffId: staffId })) return false;
    }
    return true;
  }

  private profile(user: UserDocument) {
    return { id: String(user._id), email: user.email, fullName: user.fullName, role: user.role,
      status: user.status, phone: user.phone ?? null, avatarMediaId: user.avatarMediaId ?? null, hasPassword: user.hasPassword !== false,
      createdAt: user.get('createdAt') };
  }

  /** Liên kết ảnh đại diện: công khai nếu có, nếu không thì liên kết ký có thời hạn. Lỗi thì trả null. */
  async avatarUrl(user: UserDocument): Promise<string | null> {
    if (!user.avatarMediaId || !this.moduleRef) return null;
    try {
      const media = await this.media.findOne({ _id: user.avatarMediaId, ownerId: String(user._id),
        purpose: 'avatar', status: 'READY' }).lean().exec();
      if (!media) return null;
      // Nạp muộn để tránh vòng phụ thuộc giữa module người dùng và module lưu trữ.
      const { StorageService } = await import('../storage/storage.service.js');
      const storage = this.moduleRef.get(StorageService, { strict: false });
      return storage.publicUrl(media.key) ?? await storage.signedReadUrl(media.key, 3600);
    } catch {
      return null;
    }
  }

  async getProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return { ...this.profile(user), avatarUrl: await this.avatarUrl(user), permissions: user.role === 'STAFF' ? await this.permissionSnapshot(userId) : [] };
  }

  async permissionSnapshot(staffId: string) {
    const rows = await this.staffPermissions.find({ staffId }).select('permission scope').lean().exec();
    return rows.map(row => ({ permission: row.permission, scope: row.scope }));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (Object.keys(dto).length === 0) throw new BadRequestException('At least one field is required');
    const user = await withCommerceTransaction(this.connection, async (session) => {
      const current = await this.model.findById(userId).session(session).exec();
      if (!current) throw new NotFoundException('User not found');
      if (dto.avatarMediaId) {
        const media = await this.media.findOne({ _id: dto.avatarMediaId, ownerId: userId,
          purpose: 'avatar', status: 'READY' }).session(session).exec();
        if (!media || (media.expiresAt && media.expiresAt <= new Date())) {
          throw new BadRequestException('Avatar media is unavailable');
        }
      }
      const updated = await this.model.findByIdAndUpdate(userId, { $set: dto },
        { new: true, runValidators: true, session }).exec();
      if (!updated) throw new NotFoundException('User not found');
      if (dto.avatarMediaId !== undefined && String(current.avatarMediaId ?? '') !== String(dto.avatarMediaId ?? '')) {
        if (current.avatarMediaId) {
          await this.media.updateOne({ _id: current.avatarMediaId, ownerId: userId,
            purpose: 'avatar', status: 'READY' },
          { $set: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }, { session }).exec();
        }
        if (dto.avatarMediaId) {
          await this.media.updateOne({ _id: dto.avatarMediaId, ownerId: userId,
            purpose: 'avatar', status: 'READY' }, { $unset: { expiresAt: 1 } }, { session }).exec();
        }
      }
      return updated;
    });
    return { ...this.profile(user), avatarUrl: await this.avatarUrl(user), permissions: user.role === 'STAFF' ? await this.permissionSnapshot(String(user._id)) : [] };
  }

  private address(address: Address & { _id: unknown }) {
    return { id: String(address._id), receiver: address.receiver, phone: address.phone,
      line1: address.location.line1, ward: address.location.ward, district: address.location.district,
      province: address.location.province, note: address.note ?? undefined, isDefault: address.isDefault };
  }

  async listAddresses(userId: string) {
    await this.requireCustomer(userId);
    const items = await this.addresses.find({ customerId: userId }).sort({ createdAt: -1 }).lean().exec();
    return { items: items.map((item) => this.address(item)) };
  }

  private async requireCustomer(userId: string) {
    const user = await this.findById(userId);
    if (!user || user.role !== 'CUSTOMER') throw new ForbiddenException('Addresses are for customers only');
  }

  private async clearDefault(userId: string, session: ClientSession) {
    await this.addresses.updateMany({ customerId: userId, isDefault: true },
      { $set: { isDefault: false } }, { session }).exec();
  }

  private handleDuplicate(error: unknown): never {
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      throw new ConflictException('Default address changed concurrently; retry');
    }
    throw error;
  }

  async createAddress(userId: string, dto: AddressDto) {
    await this.requireCustomer(userId);
    const { line1, ward, district, province, isDefault, ...fields } = dto;
    try {
      const created = await withCommerceTransaction(this.connection, async (session) => {
        if (isDefault) await this.clearDefault(userId, session);
        const [address] = await this.addresses.create([{ customerId: userId, ...fields,
          location: { line1, ward, district, province }, isDefault: isDefault ?? false }], { session });
        return address;
      });
      return this.address(created);
    } catch (error) { this.handleDuplicate(error); }
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.requireCustomer(userId);
    if (!Types.ObjectId.isValid(addressId)) throw new NotFoundException('Address not found');
    if (Object.keys(dto).length === 0) throw new BadRequestException('At least one field is required');
    const current = await this.addresses.findOne({ _id: addressId, customerId: userId }).exec();
    if (!current) throw new NotFoundException('Address not found');
    const { line1, ward, district, province, isDefault, ...fields } = dto;
    const set: Record<string, unknown> = { ...fields };
    for (const [key, value] of Object.entries({ line1, ward, district, province })) {
      if (value !== undefined) set[`location.${key}`] = value;
    }
    if (isDefault !== undefined) set.isDefault = isDefault;
    try {
      const updated = await withCommerceTransaction(this.connection, async (session) => {
        if (isDefault) await this.clearDefault(userId, session);
        return this.addresses.findOneAndUpdate({ _id: addressId, customerId: userId }, { $set: set },
          { new: true, runValidators: true, session }).exec();
      });
      if (!updated) throw new NotFoundException('Address not found');
      return this.address(updated);
    } catch (error) { this.handleDuplicate(error); }
  }

  async deleteAddress(userId: string, addressId: string) {
    await this.requireCustomer(userId);
    if (!Types.ObjectId.isValid(addressId)) throw new NotFoundException('Address not found');
    const deleted = await this.addresses.findOneAndDelete({ _id: addressId, customerId: userId }).exec();
    if (!deleted) throw new NotFoundException('Address not found');
  }
}
