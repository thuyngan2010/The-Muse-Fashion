import { IsIn, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class PresignDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp']) contentType!: 'image/jpeg' | 'image/png' | 'image/webp';
  @IsInt() @Min(1) sizeBytes!: number;
  @IsIn(['avatar', 'product', 'lookbook', 'community', 'tryon', 'refund_evidence']) purpose!: 'avatar' | 'product' | 'lookbook' | 'community' | 'tryon' | 'refund_evidence';
}

export class FinalizeDto {
  @IsString() @MaxLength(1024) objectKey!: string;
}
