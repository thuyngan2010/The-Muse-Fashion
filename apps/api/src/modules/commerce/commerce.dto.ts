import {
  IsArray, IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, Matches, ValidateNested, NotEquals,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

export class AdminOrdersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() state?: string;
}

export class InventoryLedgerQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() variantId?: string;
}

export class CartItemDto {
  @IsMongoId() variantId!: string;
  @IsInt() @Min(1) @Max(99) quantity!: number;
}

export class ReplaceCartDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CartItemDto) items!: CartItemDto[];
}

export class CheckoutQuoteDto {
  @IsMongoId() addressId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) voucherCode?: string;
  @IsOptional() @IsEnum(['STANDARD']) shippingMethod?: 'STANDARD';
}

export class InventoryAdjustDto {
  @IsMongoId() variantId!: string;
  @IsInt() @NotEquals(0) @Min(-100000) @Max(100000) delta!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}

export class VoucherWriteDto {
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MinLength(3) @MaxLength(50) code!: string;
  @IsEnum(['FIXED', 'PERCENT']) type!: 'FIXED' | 'PERCENT';
  @IsInt() @Min(1) value!: number;
  @IsOptional() @IsInt() @Min(1) maxDiscount?: number | null;
  @IsInt() @Min(0) minimumSubtotal!: number;
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @IsInt() @Min(1) usageLimit!: number;
  @IsEnum(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
}

export class CreateOrderDto {
  @IsUUID() quoteId!: string;
}

export class CancelOrderDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class OrderStatusDto {
  @IsEnum(['CONFIRMED', 'PREPARING', 'SHIPPING', 'DELIVERED'])
  state!: 'CONFIRMED' | 'PREPARING' | 'SHIPPING' | 'DELIVERED';
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
}

export class AssignStaffDto {
  @IsMongoId() staffId!: string;
}

export class ShipmentUpdateDto {
  @IsString() @MinLength(1) @MaxLength(100) carrier!: string;
  @IsString() @MinLength(1) @MaxLength(100) trackingCode!: string;
  @IsEnum(['READY', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED']) status!: 'READY' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class UpdateVoucherDto {
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_-]+$/) @MinLength(3) @MaxLength(50) code?: string;
  @IsOptional() @IsEnum(['FIXED', 'PERCENT']) type?: 'FIXED' | 'PERCENT';
  @IsOptional() @IsInt() @Min(1) value?: number;
  @IsOptional() @IsInt() @Min(1) maxDiscount?: number | null;
  @IsOptional() @IsInt() @Min(0) minimumSubtotal?: number;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @IsOptional() @IsEnum(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED';
}
