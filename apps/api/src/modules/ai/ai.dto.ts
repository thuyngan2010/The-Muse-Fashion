import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
