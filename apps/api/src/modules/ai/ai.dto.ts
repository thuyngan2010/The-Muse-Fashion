import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AiJobWriteDto {
  @IsMongoId() inputMediaId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsMongoId({ each: true })
  productIds!: string[];

  @IsString() @MinLength(1) @MaxLength(50) consentPolicyVersion!: string;
  @IsOptional() @IsIn(['office', 'streetwear', 'evening', 'minimalist']) style?: 'office' | 'streetwear' | 'evening' | 'minimalist';
  @IsOptional() @IsInt() @Min(120) @Max(220) heightCm?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(200) weightKg?: number;
}
