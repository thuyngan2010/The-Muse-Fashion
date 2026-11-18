import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

export class AdminAiJobsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['TRY_ON', 'MIX_MATCH']) type?: string;
  @IsOptional() @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED']) state?: string;
}
