import type { Connection, Schema } from 'mongoose';
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
import { encryptBeneficiary, type Beneficiary } from '../modules/payments/beneficiary-crypto.util.js';
import { encryptEmailToken } from '../modules/mail/email-token-crypto.util.js';

export const id = '202610240001_baseline';

const schemas: Array<[string, Schema]> = [
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

const canonicalIndexes = [
  ['users', 'role_status', { role: 1, status: 1 }],
  ['inventory_ledger', 'variant_created', { variantId: 1, createdAt: -1 }],
  ['vouchers', 'status_validity', { status: 1, validFrom: 1, validTo: 1 }],
  ['payment_attempts', 'state_expires', { state: 1, expiresAt: 1 }],
  ['payment_events', 'resolution_created', { resolution: 1, createdAt: -1 }],
  ['email_events', 'state_next_attempt', { state: 1, nextAttemptAt: 1 }],
  ['media_objects', 'status_expires', { status: 1, expiresAt: 1 }],
  ['audit_logs', 'entity_created', { entityType: 1, entityId: 1, createdAt: -1 }],
] as const;

export async function up(connection: Connection): Promise<void> {
  const duplicateAttempts = await connection.db!.collection('payment_attempts').aggregate([
    { $match: { state: { $in: ['PENDING', 'SUCCEEDED'] } } },
    { $group: { _id: { orderId: '$orderId', state: '$state' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $limit: 1 },
  ]).toArray();
  if (duplicateAttempts.length) {
    throw new Error('Duplicate active payment attempts exist; reconcile them before applying unique indexes');
  }
  for (const [name, schema] of schemas) {
    const model = connection.models[name] ?? connection.model(name, schema);
    await model.createIndexes();
  }
  for (const [collection, name, keys] of canonicalIndexes) {
    await connection.db!.collection(collection).createIndex(keys, { name });
  }
  await connection.db!.collection('rate_limit_buckets').createIndex({ expiresAt: 1 }, { name: 'expires_ttl', expireAfterSeconds: 0 });
  const oldRefunds = connection.db!.collection('refunds').find({ beneficiary: { $exists: true, $ne: null } },
    { projection: { _id: 1, beneficiary: 1 } });
  for await (const refund of oldRefunds) {
    const beneficiary = refund.beneficiary as Beneficiary;
    await connection.db!.collection('refunds').updateOne({ _id: refund._id, beneficiary: refund.beneficiary },
      { $set: { beneficiaryEncrypted: encryptBeneficiary(beneficiary) }, $unset: { beneficiary: '' } });
  }
  const oldEmails = connection.db!.collection('email_events').find({ 'payload.token': { $type: 'string' } },
    { projection: { _id: 1, payload: 1 } });
  for await (const email of oldEmails) {
    const token = String((email.payload as Record<string, unknown>).token);
    await connection.db!.collection('email_events').updateOne({ _id: email._id, 'payload.token': token },
      { $set: { 'payload.tokenCiphertext': encryptEmailToken(token),
        expiresAt: new Date(Date.now() + 60 * 60_000) }, $unset: { 'payload.token': '' } });
  }
  await connection.db!.collection('ai_jobs').updateMany({ attempts: { $exists: false } }, { $set: { attempts: 0 } });
  await connection.db!.collection('outbox_events').updateMany({ attempts: { $exists: false } }, { $set: { attempts: 0 } });
  await connection.db!.collection('outbox_events').updateMany({}, [{ $set: {
    eventType: { $ifNull: ['$eventType', '$type'] },
    eventVersion: { $ifNull: ['$eventVersion', 1] },
    correlationId: { $ifNull: ['$correlationId', '$eventId'] },
    producer: { $ifNull: ['$producer', '$aggregateType'] },
    aggregateVersion: { $ifNull: ['$aggregateVersion', 1] },
    data: { $ifNull: ['$data', '$payload'] },
  } }]);
  await connection.db!.collection('email_events').updateMany({ attempts: { $exists: false } }, { $set: { attempts: 0 } });
}

export async function verify(connection: Connection): Promise<void> {
  for (const [collection, name] of canonicalIndexes) {
    const indexes = await connection.db!.collection(collection).listIndexes().toArray();
    if (!indexes.some((index) => index.name === name)) throw new Error(`Missing index ${collection}.${name}`);
  }
  const rateIndexes = await connection.db!.collection('rate_limit_buckets').listIndexes().toArray();
  if (!rateIndexes.some((index) => index.name === 'expires_ttl')) throw new Error('Missing rate limit TTL index');
}
