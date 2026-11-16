import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

export class ReviewListQueryDto extends PaginationQueryDto {
  @IsMongoId() productId!: string;
}

export class MyOrderReviewsQueryDto {
  @IsOptional() @IsMongoId() orderId?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? [value] : value)
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ArrayUnique() @IsMongoId({ each: true }) reviewIds?: string[];
}

export class ModerationListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(['REVIEW', 'POST', 'COMMENT']) targetType?: 'REVIEW' | 'POST' | 'COMMENT';
  @IsOptional() @IsEnum(['PUBLIC', 'HIDDEN', 'PENDING_REVIEW']) status?: string;
}

export class CommunityPostListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
}

export class ReviewWriteDto {
  @IsMongoId() orderItemId!: string;
  @IsInt() @Min(1) @Max(5) stars!: number;
  @IsString() @MinLength(1) @MaxLength(5000) content!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsMongoId({ each: true }) mediaIds?: string[];
}

export class PostWriteDto {
  @IsString() @MinLength(1) @MaxLength(5000) caption!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsMongoId({ each: true }) mediaIds!: string[];
}

export class CommentWriteDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @IsOptional() @IsMongoId() parentId?: string;
}

export class ModerationWriteDto {
  @IsEnum(['REVIEW', 'POST', 'COMMENT']) targetType!: 'REVIEW' | 'POST' | 'COMMENT';
  @IsEnum(['HIDE', 'RESTORE']) action!: 'HIDE' | 'RESTORE';
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
