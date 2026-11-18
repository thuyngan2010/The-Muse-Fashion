import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { buildVietQrImageUrl } from '@gpmpay/sdk';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { AuditService } from '../operations/audit.service.js';
import { OutboxEvent } from '../operations/outbox-event.schema.js';
import { Order } from '../commerce/commerce.schemas.js';
import { PaymentAttempt, Refund } from './payment.schemas.js';
import { generateRefundReconciliationCode } from './reconciliation.util.js';
import { serializeRefund } from './refund.mapper.js';
import { reserveRefundBudget } from './refund-budget.util.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';
import type { UserRole } from '@fashion/contracts';
import { encryptBeneficiary, readBeneficiary } from './beneficiary-crypto.util.js';
import { assertSameRequest, requestHash, requireIdempotencyKey } from '../../common/idempotency.util.js';
import type { CompleteRefundDto, FailRefundDto, ProposeRefundDto, RefundBeneficiaryDto, RejectRefundDto } from './refunds.dto.js';

@Injectable()
export class RefundService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Refund.name) private readonly refunds: Model<Refund>,
    @InjectModel(PaymentAttempt.name) private readonly attempts: Model<PaymentAttempt>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(OutboxEvent.name) private readonly outbox: Model<OutboxEvent>,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly users: UsersService,
  ) {}

  async propose(actorId: string, role: UserRole, idempotencyKey: string | undefined, dto: ProposeRefundDto) {
    idempotencyKey = requireIdempotencyKey(idempotencyKey);
    const bodyHash = requestHash(dto);

    const replay = await this.refunds.findOne({ idempotencyKey }).select('+beneficiaryEncrypted').lean().exec();
    if (replay) return this.replayProposal(replay, actorId, role, bodyHash);

    return withCommerceTransaction(this.connection, async (session) => {
      const existing = await this.refunds.findOne({ idempotencyKey }).select('+beneficiaryEncrypted').session(session).lean().exec();
      if (existing) return this.replayProposal(existing, actorId, role, bodyHash);
      const attempt = await this.attempts.findById(dto.paymentAttemptId).session(session).lean().exec();
      if (!attempt || attempt.state !== 'SUCCEEDED') {
        throw new UnprocessableEntityException('Payment is not eligible for refund');
      }
      await this.assertRefundAccess(actorId, role, String(attempt.orderId));
      await reserveRefundBudget(this.attempts, this.refunds, String(attempt._id), attempt.expectedAmount, dto.amount, session);
      const [created] = await this.refunds.create([{
        paymentAttemptId: String(attempt._id),
        orderId: String(attempt.orderId),
        amount: dto.amount,
        state: 'PENDING_APPROVAL',
        idempotencyKey,
        requestHash: bodyHash,
        reason: dto.reason,
        proposedBy: actorId,
        beneficiaryEncrypted: dto.beneficiary ? encryptBeneficiary(dto.beneficiary) : undefined,
        beneficiarySetBy: dto.beneficiary ? actorId : undefined,
      }], { session });
      await this.audit.record('refund.propose', 'refund', String(created._id), actorId, { amount: dto.amount }, session);
      return serializeRefund(created);
    });
  }

  private async replayProposal(existing: Refund & { _id: unknown }, actorId: string, role: UserRole, bodyHash: string) {
    await this.assertRefundAccess(actorId, role, String(existing.orderId));
    if (String(existing.proposedBy) !== actorId) {
      throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency-Key belongs to another actor' });
    }
    assertSameRequest(existing.requestHash, bodyHash);
    return serializeRefund(existing as never);
  }

  async getByReconciliationCode(code: string) {
    return this.refunds.findOne({ reconciliationCode: code.toUpperCase() }).select('+beneficiaryEncrypted').lean().exec();
  }

  async get(refundId: string, actorId: string, role: UserRole) {
    if (!Types.ObjectId.isValid(refundId)) throw new NotFoundException('Refund not found');
    const refund = await this.refunds.findById(refundId).select('+beneficiaryEncrypted').lean().exec();
    if (!refund) throw new NotFoundException('Refund not found');
    await this.assertRefundAccess(actorId, role, String(refund.orderId));
    return role === 'ADMIN' && refund.state === 'APPROVED' ? this.approvedResponse(refund) : serializeRefund(refund as never);
  }

  async list(actorId: string, role: UserRole, state?: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const filter: Record<string, unknown> = state ? { state } : {};
    if (role === 'STAFF') {
      const scope = await this.users.permissionScope(actorId, 'refund.propose');
      if (!scope) throw new ForbiddenException('Refund permission required');
      if (scope === 'ASSIGNED') {
        filter.orderId = { $in: await this.orders.distinct('_id', { assignedStaffId: actorId }).exec() };
      }
    }
    const [rows, total] = await Promise.all([
      this.refunds.find(filter).select('+beneficiaryEncrypted').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.refunds.countDocuments(filter).exec(),
    ]);
    const [orderRows, names] = await Promise.all([
      this.orders.find({ _id: { $in: [...new Set(rows.map((row) => String(row.orderId)))] } }).select('code').lean().exec(),
      this.users.displayNames(rows.map((row) => String(row.proposedBy))),
    ]);
    const codes = new Map(orderRows.map((order) => [String(order._id), order.code]));
    return { page: safePage, limit: safeLimit, total, items: rows.map((row) => ({
      ...(role === 'ADMIN' && row.state === 'APPROVED' ? this.approvedResponse(row) : serializeRefund(row as never)),
      orderCode: codes.get(String(row.orderId)) ?? null,
      proposedByName: names.get(String(row.proposedBy)) ?? null,
    })) };
  }

  async setBeneficiary(refundId: string, actorId: string, role: UserRole, key: string | undefined, dto: RefundBeneficiaryDto) {
    const idempotencyKey = requireIdempotencyKey(key);
    const bodyHash = requestHash(dto);
    if (!Types.ObjectId.isValid(refundId)) throw new NotFoundException('Refund not found');
    return withCommerceTransaction(this.connection, async (session) => {
      const refund = await this.refunds.findById(refundId).select('+beneficiaryEncrypted').session(session).exec();
      if (!refund) throw new NotFoundException('Refund not found');
      await this.assertRefundAccess(actorId, role, String(refund.orderId));
      if (refund.beneficiaryIdempotencyKey === idempotencyKey) {
        assertSameRequest(refund.beneficiaryRequestHash, bodyHash);
        return serializeRefund(refund);
      }
      if (refund.state !== 'PENDING_APPROVAL') throw new ConflictException('Beneficiary cannot be changed after approval');
      refund.beneficiaryEncrypted = encryptBeneficiary(dto);
      refund.beneficiary = undefined;
      refund.beneficiarySetBy = actorId;
      refund.beneficiaryIdempotencyKey = idempotencyKey;
      refund.beneficiaryRequestHash = bodyHash;
      await refund.save({ session });
      await this.audit.record('refund.beneficiary.set', 'refund', refundId, actorId, {}, session);
      return serializeRefund(refund);
    });
  }

  async approve(refundId: string, adminId: string, idempotencyKey: string | undefined) {
    idempotencyKey = requireIdempotencyKey(idempotencyKey);
    if (!Types.ObjectId.isValid(refundId)) throw new NotFoundException('Refund not found');
    return withCommerceTransaction(this.connection, async (session) => {
      const refund = await this.refunds.findById(refundId).select('+beneficiaryEncrypted').session(session).exec();
      if (!refund) throw new NotFoundException('Refund not found');
      if (refund.state === 'APPROVED' && refund.approvalIdempotencyKey === idempotencyKey) return this.approvedResponse(refund);
      if (refund.state !== 'PENDING_APPROVAL') throw new ConflictException('Refund is not pending approval');
      if (String(refund.proposedBy) === adminId) throw new ForbiddenException('Proposer cannot approve the same refund');
      if (refund.beneficiarySetBy && String(refund.beneficiarySetBy) === adminId) {
        throw new ForbiddenException('Beneficiary editor cannot approve the same refund');
      }
      if (!readBeneficiary(refund)) throw new UnprocessableEntityException('Beneficiary must be set before approval');
      refund.reconciliationCode = await this.uniqueRefundCode();
      refund.transferContent = refund.reconciliationCode;
      refund.state = 'APPROVED';
      refund.approvedBy = adminId;
      refund.approvalIdempotencyKey = idempotencyKey;
      refund.approvedAt = new Date();
      await refund.save({ session });
      await this.audit.record('refund.approve', 'refund', refundId, adminId, {}, session);
      return this.approvedResponse(refund);
    });
  }

  async completeManual(refundId: string, adminId: string, idempotencyKey: string | undefined, dto: CompleteRefundDto) {
    idempotencyKey = requireIdempotencyKey(idempotencyKey);
    const bodyHash = requestHash(dto);
    return withCommerceTransaction(this.connection, async (session) => {
      const refund = await this.refunds.findById(refundId).select('+beneficiaryEncrypted').session(session).exec();
      if (!refund) throw new NotFoundException('Refund not found');
      if (String(refund.proposedBy) === adminId) throw new ForbiddenException('Proposer cannot complete the same refund');
      if (refund.state === 'SUCCEEDED' && refund.completionIdempotencyKey === idempotencyKey) {
        assertSameRequest(refund.completionRequestHash, bodyHash);
        return serializeRefund(refund);
      }
      if (refund.state !== 'APPROVED') throw new ConflictException('Refund is not awaiting completion');
      await this.storage.assertRefundEvidenceReady(dto.evidenceObjectKey, adminId);

      refund.state = 'SUCCEEDED';
      refund.bankReference = dto.bankReference;
      refund.evidenceKey = dto.evidenceObjectKey;
      refund.completionIdempotencyKey = idempotencyKey;
      refund.completionRequestHash = bodyHash;
      refund.confirmedBy = adminId;
      refund.refundedAt = new Date();
      await refund.save({ session });

      await this.maybeCloseOrder(refund, session);
      await this.emitRefundCompleted(refund, session);

      await this.audit.record('refund.complete.manual', 'refund', refundId, adminId, { bankReference: dto.bankReference }, session);
      return serializeRefund(refund);
    });
  }

  async reject(refundId: string, adminId: string, key: string | undefined, dto: RejectRefundDto) {
    const idempotencyKey = requireIdempotencyKey(key);
    const bodyHash = requestHash(dto);
    if (!Types.ObjectId.isValid(refundId)) throw new NotFoundException('Refund not found');
    return withCommerceTransaction(this.connection, async session => {
      const refund = await this.refunds.findById(refundId).session(session).exec();
      if (!refund) throw new NotFoundException('Refund not found');
      if (refund.state === 'FAILED' && refund.failureIdempotencyKey === idempotencyKey) {
        assertSameRequest(refund.failureRequestHash, bodyHash);
        return serializeRefund(refund);
      }
      if (refund.state !== 'PENDING_APPROVAL') throw new ConflictException('Only pending proposals can be rejected');
      refund.state = 'FAILED';
      refund.failureReason = dto.reason;
      refund.failureIdempotencyKey = idempotencyKey;
      refund.failureRequestHash = bodyHash;
      refund.confirmedBy = adminId;
      await refund.save({ session });
      await this.audit.record('refund.reject', 'refund', refundId, adminId, { reason: dto.reason }, session);
      return serializeRefund(refund);
    });
  }

  async fail(refundId: string, adminId: string, idempotencyKey: string | undefined, dto: FailRefundDto) {
    idempotencyKey = requireIdempotencyKey(idempotencyKey);
    const bodyHash = requestHash(dto);
    return withCommerceTransaction(this.connection, async (session) => {
      const refund = await this.refunds.findById(refundId).select('+beneficiaryEncrypted').session(session).exec();
      if (!refund) throw new NotFoundException('Refund not found');
      if (refund.state === 'FAILED' && refund.failureIdempotencyKey === idempotencyKey) {
        assertSameRequest(refund.failureRequestHash, bodyHash);
        return serializeRefund(refund);
      }
      if (refund.state !== 'APPROVED') throw new ConflictException('Only approved refunds can be marked failed');
      await this.storage.assertRefundEvidenceReady(dto.evidenceObjectKey, adminId);
      refund.state = 'FAILED';
      refund.failureReason = dto.reason;
      refund.evidenceKey = dto.evidenceObjectKey;
      refund.failureIdempotencyKey = idempotencyKey;
      refund.failureRequestHash = bodyHash;
      refund.confirmedBy = adminId;
      await refund.save({ session });
      await this.audit.record('refund.fail', 'refund', refundId, adminId, { reason: dto.reason }, session);
      return serializeRefund(refund);
    });
  }

  async completeFromWebhook(
    refundId: string,
    paymentEventId: string,
    bankReference: string,
    session: import('mongoose').ClientSession,
  ): Promise<boolean> {
    const refund = await this.refunds.findOneAndUpdate(
      { _id: refundId, state: 'APPROVED' },
      { $set: { state: 'SUCCEEDED', bankReference, refundedAt: new Date(), matchedEventId: paymentEventId } },
      { session, new: true },
    ).exec();
    if (!refund) return false;

    await this.maybeCloseOrder(refund, session);
    await this.emitRefundCompleted(refund, session);
    return true;
  }

  private async emitRefundCompleted(refund: Refund & { _id: unknown }, session: import('mongoose').ClientSession) {
    const refundId = String(refund._id);
    const order = await this.orders.findById(refund.orderId).session(session).lean().exec();
    await this.outbox.create(
      [{
        eventId: randomUUID(),
        type: 'refund.completed',
        occurredAt: new Date(),
        aggregateType: 'refund',
        aggregateId: refundId,
        payload: {
          refundId,
          orderId: String(refund.orderId),
          customerId: order ? String(order.customerId) : undefined,
          amount: refund.amount,
          bankReference: refund.bankReference,
          refundedAt: refund.refundedAt?.toISOString(),
        },
      }],
      { session },
    );
  }

  private async maybeCloseOrder(refund: Refund, session: import('mongoose').ClientSession) {
    // Every completion writes the same order, even when its own snapshot only sees
    // a partial refund. MongoDB retries conflicting transactions with a fresh snapshot.
    // This also serializes completion with order cancellation, which writes this document.
    const order = await this.orders.findOneAndUpdate({ _id: refund.orderId },
      { $inc: { version: 1 } }, { returnDocument: 'after', session }).exec();
    if (!order || order.state !== 'CANCEL_PENDING_REFUND') return;

    const attempt = await this.attempts.findById(refund.paymentAttemptId).session(session).lean().exec();
    if (!attempt) return;

    const succeededTotal = await this.refunds
      .aggregate<{ total: number }>([
        { $match: { paymentAttemptId: attempt._id, state: 'SUCCEEDED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .session(session)
      .exec();

    const total = succeededTotal[0]?.total ?? 0;
    if (total >= attempt.expectedAmount) {
      order.state = 'CANCELLED';
      await order.save({ session });
    }
  }

  private approvedResponse(refund: Refund) {
    const beneficiary = readBeneficiary(refund)!;
    const qrImageUrl = buildVietQrImageUrl({
      bankBin: beneficiary.bankBin,
      accountNumber: beneficiary.accountNumber,
      accountName: beneficiary.accountName,
      amount: refund.amount,
      description: refund.transferContent ?? refund.reconciliationCode ?? '',
      template: 'compact',
    });
    return serializeRefund(refund as Refund & { _id: unknown }, { includeQr: true, qrImageUrl });
  }

  private async uniqueRefundCode(): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const code = generateRefundReconciliationCode();
      const exists = await this.refunds.exists({ reconciliationCode: code }).exec();
      if (!exists) return code;
    }
    throw new ConflictException('Unable to allocate refund reconciliation code');
  }

  private async assertRefundAccess(actorId: string, role: UserRole, orderId: string): Promise<void> {
    if (role === 'ADMIN') return;
    if (role !== 'STAFF' || !await this.users.hasPermissions(actorId, ['refund.propose'], orderId)) {
      throw new ForbiddenException('Refund permission required for this order');
    }
  }
}
