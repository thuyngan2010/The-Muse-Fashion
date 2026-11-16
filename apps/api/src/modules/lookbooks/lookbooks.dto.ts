import { IsArray, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class LookbookHotspotDto {
  @IsMongoId() productId!: string;
  @IsNumber() @Min(0) @Max(1) x!: number;
  @IsNumber() @Min(0) @Max(1) y!: number;
}

export class LookbookWriteDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsEnum(['DRAFT', 'PUBLISHED', 'HIDDEN']) status!: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  @IsMongoId() mainMediaId!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => LookbookHotspotDto) items!: LookbookHotspotDto[];
}
