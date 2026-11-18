import {
  ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min,
  MinLength, Matches, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

export class AdminProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
}

export class CatalogListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() minPrice?: string;
  @IsOptional() @IsString() maxPrice?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
}

const MAX_PRODUCT_IMAGES = 10;
const IMAGE_URL_OPTIONS = { protocols: ['https'], require_protocol: true, require_tld: true };
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SizeMeasurementsDto {
  [key: string]: number | undefined;
  @IsOptional() @IsNumber() @Min(0) bust?: number;
  @IsOptional() @IsNumber() @Min(0) waist?: number;
  @IsOptional() @IsNumber() @Min(0) hip?: number;
}

export class SizeGuideRowDto {
  @IsString() @MinLength(1) @MaxLength(30) size!: string;
  @IsOptional() @ValidateNested() @Type(() => SizeMeasurementsDto) measurements?: SizeMeasurementsDto;
}

export class CreateProductDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) material?: string;
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsInt() @Min(0) price!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PRODUCT_IMAGES) @ArrayUnique()
  @IsUrl(IMAGE_URL_OPTIONS, { each: true }) @MaxLength(2048, { each: true }) images?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PRODUCT_IMAGES) @ArrayUnique() @IsMongoId({ each: true }) imageMediaIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SizeGuideRowDto) sizeGuide?: SizeGuideRowDto[];
  @IsEnum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status!: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class UpdateProductDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) material?: string;
  @IsOptional() @IsMongoId() categoryId?: string | null;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PRODUCT_IMAGES) @ArrayUnique()
  @IsUrl(IMAGE_URL_OPTIONS, { each: true }) @MaxLength(2048, { each: true }) images?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PRODUCT_IMAGES) @ArrayUnique() @IsMongoId({ each: true }) imageMediaIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SizeGuideRowDto) sizeGuide?: SizeGuideRowDto[];
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class CategoryDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug!: string;
  @IsOptional() @IsMongoId() parentId?: string | null;
  @IsEnum(['ACTIVE', 'HIDDEN']) status!: 'ACTIVE' | 'HIDDEN';
}

export class UpdateCategoryDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @IsOptional() @IsMongoId() parentId?: string | null;
  @IsOptional() @IsEnum(['ACTIVE', 'HIDDEN']) status?: 'ACTIVE' | 'HIDDEN';
}

export class VariantDto {
  @IsString() @Matches(/^[A-Za-z0-9._-]+$/) @MaxLength(80) sku!: string;
  @IsString() @MinLength(1) @MaxLength(30) size!: string;
  @IsString() @MinLength(1) @MaxLength(50) color!: string;
  @IsInt() @Min(0) price!: number;
  @IsInt() @Min(0) stockOnHand!: number;
}

export class UpdateVariantDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9._-]+$/) @MaxLength(80) sku?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30) size?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) color?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

export class SizeSuggestionDto {
  @IsOptional() @IsNumber() @Min(50) @Max(200) bust?: number;
  @IsOptional() @IsNumber() @Min(50) @Max(200) waist?: number;
  @IsOptional() @IsNumber() @Min(50) @Max(200) hip?: number;
}
