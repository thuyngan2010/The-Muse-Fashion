import type { Connection, IndexDirection, IndexOptions, Schema } from 'mongoose';
import { UserSchema } from '../modules/users/user.schema.js';
import { AddressSchema, AuthSessionSchema, EmailTokenSchema, StaffPermissionSchema } from '../modules/users/identity.schemas.js';
import { ProductSchema } from '../modules/catalog/product.schema.js';
import { CategorySchema, ProductVariantSchema } from '../modules/catalog/catalog.schemas.js';
import { CartSchema, CheckoutQuoteSchema, OrderSchema, OrderEventSchema, InventoryLedgerSchema, VoucherSchema, ShipmentSchema } from '../modules/commerce/commerce.schemas.js';
import { PaymentAttemptSchema, PaymentEventSchema, RefundSchema } from '../modules/payments/payment.schemas.js';
import { ReviewSchema, CommunityPostSchema, CommentSchema, ModerationLogSchema } from '../modules/community/community.schemas.js';
import { LookbookSchema } from '../modules/lookbooks/lookbook.schema.js';
import { AiJobSchema, AiQuotaSchema, AiConsentSchema } from '../modules/ai/ai.schemas.js';
import { EmailEventSchema } from '../modules/mail/email-event.schema.js';
import { MediaObjectSchema } from '../modules/storage/media-object.schema.js';
import { NotificationSchema } from '../modules/notifications/notification.schema.js';
import { AuditLogSchema } from '../modules/operations/audit.schema.js';
import { OutboxEventSchema } from '../modules/operations/outbox-event.schema.js';
import { SystemSettingSchema } from '../modules/admin/admin.schemas.js';

export const modelSchemas: Array<[string, Schema]> = [
  ['User', UserSchema], ['Address', AddressSchema], ['AuthSession', AuthSessionSchema],
  ['EmailToken', EmailTokenSchema], ['StaffPermission', StaffPermissionSchema],
  ['Product', ProductSchema], ['Category', CategorySchema], ['ProductVariant', ProductVariantSchema],
  ['Cart', CartSchema], ['CheckoutQuote', CheckoutQuoteSchema], ['Order', OrderSchema],
  ['OrderEvent', OrderEventSchema], ['InventoryLedger', InventoryLedgerSchema],
  ['Voucher', VoucherSchema], ['Shipment', ShipmentSchema],
  ['PaymentAttempt', PaymentAttemptSchema], ['PaymentEvent', PaymentEventSchema], ['Refund', RefundSchema],
  ['Review', ReviewSchema], ['CommunityPost', CommunityPostSchema], ['Comment', CommentSchema],
  ['ModerationLog', ModerationLogSchema], ['Lookbook', LookbookSchema],
  ['AiJob', AiJobSchema], ['AiQuota', AiQuotaSchema], ['AiConsent', AiConsentSchema],
  ['EmailEvent', EmailEventSchema], ['MediaObject', MediaObjectSchema],
  ['Notification', NotificationSchema], ['AuditLog', AuditLogSchema], ['OutboxEvent', OutboxEventSchema],
  ['SystemSetting', SystemSettingSchema],
];

export type DeclaredIndex = {
  model: string;
  collection: string;
  keys: Record<string, IndexDirection>;
  options: IndexOptions;
};

export function declaredIndexes(): DeclaredIndex[] {
  return modelSchemas.flatMap(([model, schema]) => {
    const collection = schema.get('collection');
    if (!collection) throw new Error(`Schema ${model} must declare an explicit collection name`);
    return schema.indexes().map(([keys, options]) => ({
      model, collection, keys: keys as Record<string, IndexDirection>, options: (options ?? {}) as IndexOptions,
    }));
  });
}

export function ensureModels(connection: Connection) {
  return modelSchemas.map(([name, schema]) => connection.models[name] ?? connection.model(name, schema));
}
