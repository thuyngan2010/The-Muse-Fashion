import { IsBoolean, IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const phonePattern = /^\+?[0-9]{8,15}$/;

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) fullName?: string;
  @IsOptional() @Matches(phonePattern) phone?: string | null;
  @IsOptional() @IsMongoId() avatarMediaId?: string | null;
}

export class AddressDto {
  @IsString() @MinLength(2) @MaxLength(100) receiver!: string;
  @Matches(phonePattern) phone!: string;
  @IsString() @MinLength(3) @MaxLength(255) line1!: string;
  @IsString() @MinLength(1) @MaxLength(100) ward!: string;
  @IsString() @MinLength(1) @MaxLength(100) district!: string;
  @IsString() @MinLength(1) @MaxLength(100) province!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) receiver?: string;
  @IsOptional() @Matches(phonePattern) phone?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(255) line1?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) ward?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) province?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
