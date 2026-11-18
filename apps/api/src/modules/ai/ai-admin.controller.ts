import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { AdminAiJobsQueryDto } from './ai-admin.dto.js';
import { AiAdminService } from './ai-admin.service.js';

@ApiTags('AI Admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/ai-jobs')
export class AdminAiController {
  constructor(private readonly aiAdmin: AiAdminService) {}

  @Get() list(@Query() query: AdminAiJobsQueryDto) {
    return this.aiAdmin.list(query.page ?? 1, query.limit ?? 20, { type: query.type, state: query.state });
  }

  @Get('stats') stats() {
    return this.aiAdmin.stats();
  }

  @Get(':jobId') detail(@Param('jobId') jobId: string) {
    return this.aiAdmin.detail(jobId);
  }
}
