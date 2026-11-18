import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateNested, Max, Min } from 'class-validator';
import { STAFF_PERMISSIONS, type StaffPermissionName } from '../../common/permissions.decorator.js';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

export class AdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['CUSTOMER', 'STAFF', 'ADMIN']) role?: string;
  /** Lọc theo trạng thái; 'ALL' bỏ lọc (kể cả khi có role). */
  @IsOptional() @IsIn(['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'ALL']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class UserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status!: 'ACTIVE' | 'SUSPENDED';
}

export class CreateStaffDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) fullName!: string;
}

export class StaffGrantDto {
  @IsIn(STAFF_PERMISSIONS) permission!: StaffPermissionName;
  @IsIn(['GLOBAL', 'ASSIGNED']) scope!: 'GLOBAL' | 'ASSIGNED';
}

export class StaffGrantsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => StaffGrantDto) grants!: StaffGrantDto[];
}

export class SettingsPatchDto {
  @IsOptional() @IsInt() @Min(0) standardShippingFee?: number;
  @IsOptional() @IsInt() @Min(0) freeShippingThreshold?: number;
  @IsOptional() @IsInt() @Min(0) @Max(9999) lowStockThreshold?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) aiDailyJobs?: number;
}

export class AiQuotaPatchDto {
  @IsInt() @Min(0) @Max(100) dailyJobs!: number;
}
