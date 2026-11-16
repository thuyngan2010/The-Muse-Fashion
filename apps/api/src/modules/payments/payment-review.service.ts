import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { createHash } from 'node:crypto';
import { AuditService } from '../operations/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { requestHash } from '../../common/idempotency.util.js';
import { PaymentEvent } from './payment.schemas.js';
import { readGpmpayConfig } from './gpmpay.config.js';
import { readSepayConfig } from './sepay.config.js';
import type { PaymentReviewDto } from './payment-review.dto.js';

const OPEN = ['REQUIRES_REVIEW', 'UNMATCHED', 'ESCALATED', 'PENDING_APPROVAL'];
const RESOLVED = ['REFUNDED_EXTERNALLY', 'CLOSED_NO_ACTION', 'OUTGOING_RECONCILED'];

@Injectable()
export class PaymentReviewService {
  constructor(
    @InjectModel(PaymentEvent.name) private readonly events: Model<PaymentEvent>,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(page = 1, limit = 20, view: 'OPEN' | 'RESOLVED' | 'ALL' = 'OPEN') {
    const safePage = Math.max(1, page), safeLimit = Math.min(50, Math.max(1, limit));
    const filter = { resolution: { $in: view === 'ALL' ? [...OPEN, ...RESOLVED] : view === 'RESOLVED' ? RESOLVED : OPEN } };
    const [rows, total] = await Promise.all([
      this.events.find(filter).sort({ createdAt: -1, _id: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.events.countDocuments(filter).exec(),
    ]);
    return { page: safePage, limit: safeLimit, total, items: rows.map(row => this.serialize(row)) };
  }

  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Payment event not found');
    const row = await this.events.findById(id).lean().exec();
    if (!row) throw new NotFoundException('Payment event not found');
    const proposal = row.reviewProposal;
    const evidenceUrl = proposal ? await this.storage.signedReadUrl(proposal.evidenceObjectKey) : null;
    return { ...this.serialize(row), proposalDetail: proposal ? { note: proposal.note,
      bankReference: proposal.bankReference, evidenceUrl } : null };
  }

  async review(id: string, actorId: string, dto: PaymentReviewDto) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Payment event not found');
    await this.storage.assertRefundEvidenceReady(dto.evidenceObjectKey, actorId);
    const body = { ...dto, note: dto.note.trim(), bankReference: dto.bankReference?.trim() };
    if (body.note.length < 10) throw new UnprocessableEntityException('A specific reconciliation note is required');
    const hash = requestHash(body);
    const row = await withCommerceTransaction(this.connection, async session => {
      const event = await this.events.findById(id).session(session).exec();
      if (!event) throw new NotFoundException('Payment event not found');
      if (!OPEN.includes(event.resolution)) {
        if (dto.decision === 'APPROVE' && String(event.reviewedBy) === actorId && event.reviewApprovalHash === hash) return event;
        throw new ConflictException('Payment event has already been resolved');
      }
      if (dto.decision === 'APPROVE' || dto.decision === 'REJECT_PROPOSAL') {
        const proposal = event.reviewProposal;
        if (event.resolution !== 'PENDING_APPROVAL' || !proposal) throw new ConflictException('No proposal is awaiting approval');
        if (String(proposal.proposedBy) === actorId) throw new ForbiddenException('A different Admin must verify the proposal');
        if (dto.decision === 'APPROVE') {
          this.assertProposal(event, proposal.decision, proposal.amount, proposal.bankReference);
          if (proposal.bankReference) {
            const duplicate = await this.events.exists({ provider: event.provider,
              settlementBankReference: proposal.bankReference, _id: { $ne: event._id } }).session(session).exec();
            if (duplicate) throw new ConflictException('Bank reference already belongs to another settlement');
            event.settlementBankReference = proposal.bankReference;
          }
          event.resolution = proposal.decision;
          event.reviewDecision = proposal.decision;
          event.reviewApprovalHash = hash;
        } else {
          event.resolution = 'ESCALATED';
          event.reviewDecision = 'REJECT_PROPOSAL';
          event.reviewProposal = undefined;
        }
      } else if (dto.decision === 'ESCALATED') {
        if (event.resolution === 'PENDING_APPROVAL') throw new ConflictException('Reject the pending proposal before escalating');
        event.resolution = 'ESCALATED'; event.reviewDecision = 'ESCALATED';
      } else {
        if (event.resolution === 'PENDING_APPROVAL') {
          if (String(event.reviewProposal?.proposedBy) === actorId && event.reviewProposal?.requestHash === hash) return event;
          throw new ConflictException('Another resolution proposal is already pending');
        }
        this.assertProposal(event, dto.decision, dto.amount, body.bankReference);
        event.reviewProposal = { decision: dto.decision, note: body.note, evidenceObjectKey: dto.evidenceObjectKey,
          amount: dto.amount, bankReference: body.bankReference, proposedBy: actorId, proposedAt: new Date(), requestHash: hash };
        event.resolution = 'PENDING_APPROVAL'; event.reviewDecision = dto.decision;
      }
      event.reviewNote = body.note; event.evidenceObjectKey = dto.evidenceObjectKey;
      event.reviewedAt = new Date(); event.reviewedBy = actorId;
      await event.save({ session });
      await this.audit.record('payment.event.review', 'payment_event', id, actorId,
        { decision: dto.decision, resolution: event.resolution, proposerId: event.reviewProposal?.proposedBy,
          evidenceObjectKey: dto.evidenceObjectKey }, session);
      // This records verified work performed outside the application. No bank API,
      // order confirmation, inventory allocation or automatic payout runs here.
      return event;
    });
    return this.serialize(row);
  }

  private assertProposal(event: PaymentEvent, decision: string, amount?: number, reference?: string) {
    const merchant = event.provider === 'SEPAY' ? readSepayConfig() : readGpmpayConfig();
    const merchantHash = createHash('sha256').update(merchant.accountNumber).digest('hex');
    const authenticated = event.signatureVerified || event.authenticationMethod === 'API_KEY';
    if (!authenticated) throw new UnprocessableEntityException('Only authenticated bank events can be settled');
    if (decision === 'CLOSED_NO_ACTION') {
      if (event.transferType !== 'in' || event.accountNumberHash === merchantHash) {
        throw new UnprocessableEntityException('Merchant funds cannot be closed without a recorded resolution');
      }
      return;
    }
    const direction = decision === 'REFUNDED_EXTERNALLY' ? 'in' : 'out';
    if (event.transferType !== direction || event.accountNumberHash !== merchantHash) {
      throw new UnprocessableEntityException('Resolution does not match a merchant bank transaction');
    }
    if (amount !== event.transferAmount || !reference || reference.length < 3) {
      throw new UnprocessableEntityException('Exact bank amount and a bank reference are required');
    }
  }

  private serialize(row: PaymentEvent & { _id?: unknown; createdAt?: Date }) {
    const proposal = row.reviewProposal;
    return { id: String(row._id), provider: row.provider, eventId: row.eventId, transferType: row.transferType,
      transferAmount: row.transferAmount, transactionDate: row.transactionDate, content: row.content,
      accountNumberLast4: row.accountNumberLast4, counterAccountLast4: row.counterAccountLast4,
      resolution: row.resolution, matchedAttemptId: row.matchedAttemptId ? String(row.matchedAttemptId) : null,
      matchedRefundId: row.matchedRefundId ? String(row.matchedRefundId) : null,
      reviewDecision: row.reviewDecision ?? null, reviewedAt: row.reviewedAt ?? null,
      reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
      proposal: proposal ? { decision: proposal.decision, proposedBy: String(proposal.proposedBy),
        proposedAt: proposal.proposedAt, amount: proposal.amount } : null,
      createdAt: row.createdAt };
  }
}
