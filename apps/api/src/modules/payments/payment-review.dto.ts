import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

export class PaymentReviewDto {
  @IsIn(['ESCALATED', 'CLOSED_NO_ACTION', 'REFUNDED_EXTERNALLY', 'OUTGOING_RECONCILED', 'APPROVE', 'REJECT_PROPOSAL'])
  decision!: 'ESCALATED' | 'CLOSED_NO_ACTION' | 'REFUNDED_EXTERNALLY' | 'OUTGOING_RECONCILED' | 'APPROVE' | 'REJECT_PROPOSAL';
  @IsString() @MinLength(10) @MaxLength(1000) note!: string;
  @IsString() @MinLength(1) @MaxLength(1024) evidenceObjectKey!: string;
  @IsOptional() @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) amount?: number;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(100) bankReference?: string;
}

export class PaymentReviewQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['OPEN', 'RESOLVED', 'ALL']) view?: 'OPEN' | 'RESOLVED' | 'ALL';
}
