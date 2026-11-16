import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import { Roles } from '../../common/roles.decorator.js';
import { Permissions } from '../../common/permissions.decorator.js';
import { LookbooksService } from './lookbooks.service.js';
import { LookbookWriteDto } from './lookbooks.dto.js';

@ApiTags('Lookbooks')
@Controller('lookbooks')
export class LookbooksController {
  constructor(private readonly lookbooks: LookbooksService) {}

  @Public() @Get() list() { return this.lookbooks.listPublished(); }
  @Public() @Get(':lookbookId') detail(@Param('lookbookId') id: string) { return this.lookbooks.getPublished(id); }

}

@ApiTags('Lookbooks')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Permissions('catalog.manage')
@Controller('admin/lookbooks')
export class AdminLookbooksController {
  constructor(private readonly lookbooks: LookbooksService) {}

  @Get() list() { return this.lookbooks.listAdmin(); }
  @Get(':lookbookId') detail(@Param('lookbookId') id: string) { return this.lookbooks.getAdmin(id); }

  @Post() create(@Body() dto: LookbookWriteDto) { return this.lookbooks.create(dto); }
  @Patch(':lookbookId') update(@Param('lookbookId') id: string, @Body() dto: LookbookWriteDto) { return this.lookbooks.update(id, dto); }
}
