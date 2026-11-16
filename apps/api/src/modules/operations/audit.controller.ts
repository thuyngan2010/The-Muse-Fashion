import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { AuditService } from './audit.service.js';
import { AuditQueryDto } from './audit-query.dto.js';

@ApiTags('Audit')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query.entityType, query.entityId, query.page ?? 1, query.limit ?? 20);
  }
}
