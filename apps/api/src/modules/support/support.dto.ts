import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from './support.schemas.js';

// Bỏ ký tự điều khiển (trừ xuống dòng, tab) rồi trim: nội dung luôn là chữ thuần.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export function cleanText(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim() : value;
}
const cleanLine = ({ value }: { value: unknown }) => {
  const text = cleanText(value);
  return typeof text === 'string' ? text.replace(/\s+/g, ' ') : text;
};
const cleanBody = ({ value }: { value: unknown }) => cleanText(value);

export class CreateSupportTicketDto {
  @Transform(cleanLine) @IsString() @MinLength(5) @MaxLength(150) subject!: string;
  @IsIn(SUPPORT_CATEGORIES as string[]) category!: string;
  @IsOptional() @IsMongoId() orderId?: string;
  @Transform(cleanBody) @IsString() @MinLength(1) @MaxLength(2000) message!: string;
}

export class SendSupportMessageDto {
  @Transform(cleanBody) @IsString() @MinLength(1) @MaxLength(2000) message!: string;
}

export class SupportTicketListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(SUPPORT_STATUSES as string[]) status?: string;
}

export class AdminSupportTicketListQueryDto extends SupportTicketListQueryDto {
  @IsOptional() @Transform(cleanLine) @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['me', 'unassigned']) assigned?: 'me' | 'unassigned';
}

export class SupportMessagesQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) after?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class AssignSupportTicketDto {
  @ValidateIf((_object, value) => value !== null) @IsMongoId() staffId!: string | null;
}

export class SupportTicketStatusDto {
  @IsIn(['IN_PROGRESS', 'RESOLVED', 'CLOSED']) status!: 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}
