import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import { Roles } from '../../common/roles.decorator.js';
import { Permissions } from '../../common/permissions.decorator.js';
import { CatalogService } from './catalog.service.js';
import { AdminProductsQueryDto, CategoryDto, UpdateCategoryDto, UpdateProductDto, UpdateVariantDto, VariantDto } from './catalog.dto.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';

@ApiTags('Catalog')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Public() @Get() list() { return this.catalog.listCategories(true); }
  @ApiBearerAuth() @Roles('ADMIN', 'STAFF') @Permissions('catalog.manage') @Post() create(@Body() dto: CategoryDto) {
    return this.catalog.createCategory(dto);
  }
  @ApiBearerAuth() @Roles('ADMIN', 'STAFF') @Permissions('catalog.manage') @Patch(':categoryId') update(@Param('categoryId') id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(id, dto);
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Permissions('catalog.manage')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get() list(@Query() query: AdminProductsQueryDto) {
    return this.catalog.listAdmin(query.status, query.page ?? 1, query.limit ?? 20, { q: query.q, category: query.category });
  }

  @Get(':productId') detail(@Param('productId') productId: string) {
    return this.catalog.getAdminProduct(productId);
  }

  @Patch(':productId') update(@Req() req: AuthenticatedRequest, @Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(productId, dto, req.user.sub);
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Permissions('catalog.manage')
@Controller('admin/products/:productId/variants')
export class ProductVariantsController {
  constructor(private readonly catalog: CatalogService) {}

  @Post() create(@Param('productId') productId: string, @Body() dto: VariantDto) {
    return this.catalog.createVariant(productId, dto);
  }

  @Patch(':variantId') update(@Req() req: AuthenticatedRequest, @Param('productId') productId: string, @Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return this.catalog.updateVariant(productId, variantId, dto, req.user.sub);
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Permissions('catalog.manage')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly catalog: CatalogService) {}
  @Get() list() { return this.catalog.listCategories(false); }
}
