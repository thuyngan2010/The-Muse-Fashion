import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

export class RefundListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() state?: string;
}

export class CreatePaymentAttemptDto {
  @IsMongoId() orderId!: string;
}
