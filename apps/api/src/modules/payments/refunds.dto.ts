import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class RefundBeneficiaryDto {
  @IsString() @Matches(/^[0-9]{6}$/) bankBin!: string;
  @IsString() @MinLength(4) @MaxLength(34) accountNumber!: string;
  @IsString() @MinLength(2) @MaxLength(120) accountName!: string;
}

export class ProposeRefundDto {
  @IsMongoId() paymentAttemptId!: string;
  @IsInt() @Min(1) amount!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @ValidateNested() @Type(() => RefundBeneficiaryDto) beneficiary?: RefundBeneficiaryDto;
}

export class CompleteRefundDto {
  @IsString() @MinLength(3) @MaxLength(100) bankReference!: string;
  @IsString() @MinLength(1) @MaxLength(1024) evidenceObjectKey!: string;
}

export class FailRefundDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsString() @MinLength(1) @MaxLength(1024) evidenceObjectKey!: string;
}

export class RejectRefundDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
