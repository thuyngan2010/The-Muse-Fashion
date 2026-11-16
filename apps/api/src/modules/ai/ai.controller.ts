import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { AiJobWriteDto } from './ai.dto.js';
import { AiService } from './ai.service.js';

@ApiTags('AI Experiences')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('try-on')
  @HttpCode(202)
  tryOn(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: AiJobWriteDto,
  ) {
    return this.ai.createTryOn(req.user.sub, key, body);
  }

  @Post('mix-match')
  @HttpCode(202)
  mixMatch(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: AiJobWriteDto,
  ) {
    return this.ai.createMixMatch(req.user.sub, key, body);
  }

  @Get('jobs/:jobId')
  job(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    return this.ai.getJob(req.user.sub, jobId);
  }

  @Get('jobs')
  jobs(@Req() req: AuthenticatedRequest, @Query() query: PaginationQueryDto) {
    return this.ai.listJobs(req.user.sub, query.page ?? 1, query.limit ?? 20);
  }
}
