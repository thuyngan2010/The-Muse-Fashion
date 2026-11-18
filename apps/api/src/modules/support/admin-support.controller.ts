import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import {
  AdminSupportTicketListQueryDto, AssignSupportTicketDto, SendSupportMessageDto, SupportMessagesQueryDto, SupportTicketStatusDto,
} from './support.dto.js';
import { SupportService } from './support.service.js';

/**
 * Quyền STAFF (order.read, phạm vi GLOBAL/ASSIGNED) được kiểm trong service theo từng phiếu,
 * giống GET /admin/orders: guard chung không biết phạm vi ASSIGNED của phiếu.
 */
@ApiTags('Support Admin')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest) {
    return this.support.stats(req.user);
  }

  @Get('tickets')
  list(@Req() req: AuthenticatedRequest, @Query() query: AdminSupportTicketListQueryDto) {
    return this.support.listAdmin(req.user, query);
  }

  @Get('tickets/:id')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.support.getAdmin(req.user, id);
  }

  @Get('tickets/:id/messages')
  messages(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: SupportMessagesQueryDto) {
    return this.support.listMessagesAdmin(req.user, id, query);
  }

  @Post('tickets/:id/messages')
  reply(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SendSupportMessageDto) {
    return this.support.replyAdmin(req.user, id, body.message);
  }

  @Post('tickets/:id/claim')
  @HttpCode(200)
  claim(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.support.claim(req.user, id);
  }

  @Roles('ADMIN')
  @Patch('tickets/:id/assign')
  assign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: AssignSupportTicketDto) {
    return this.support.assign(req.user, id, body.staffId);
  }

  @Patch('tickets/:id/status')
  status(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SupportTicketStatusDto) {
    return this.support.changeStatus(req.user, id, body.status);
  }

  @Post('tickets/:id/read')
  @HttpCode(200)
  read(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.support.markReadAdmin(req.user, id);
  }
}
