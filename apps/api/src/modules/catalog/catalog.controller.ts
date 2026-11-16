import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import { Roles } from '../../common/roles.decorator.js';
import { Permissions } from '../../common/permissions.decorator.js';
import { CatalogService } from './catalog.service.js';
import { CatalogListQueryDto, CreateProductDto, SizeSuggestionDto } from './catalog.dto.js';

@ApiTags('Catalog')
@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public() @Get()
  list(@Query() query: CatalogListQueryDto) {
    const parsedMin = query.minPrice !== undefined ? Number(query.minPrice) : undefined;
    const parsedMax = query.maxPrice !== undefined ? Number(query.maxPrice) : undefined;
    if (parsedMin !== undefined && (!Number.isFinite(parsedMin) || parsedMin < 0)) throw new BadRequestException('Invalid minPrice');
    if (parsedMax !== undefined && (!Number.isFinite(parsedMax) || parsedMax < 0)) throw new BadRequestException('Invalid maxPrice');
    return this.catalog.listPublished({
      q: query.q,
      category: query.category,
      sort: query.sort,
      page: query.page ?? 1,
      limit: query.limit ?? 12,
      minPrice: parsedMin,
      maxPrice: parsedMax,
      color: query.color,
      size: query.size,
    });
  }

  @Public() @Post(':slug/size-suggestion')
  suggestSize(@Param('slug') slug: string, @Body() dto: SizeSuggestionDto) {
    return this.catalog.suggestSize(slug, dto);
  }

  @Public() @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.catalog.getPublishedBySlug(slug);
  }

  @ApiBearerAuth() @Roles('ADMIN', 'STAFF') @Permissions('catalog.manage') @Post()
  create(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }
}
