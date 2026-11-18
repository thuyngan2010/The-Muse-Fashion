import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { CreateSupportTicketDto, SendSupportMessageDto, SupportMessagesQueryDto, SupportTicketListQueryDto } from './support.dto.js';
import { SupportService } from './support.service.js';

@ApiTags('Support')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateSupportTicketDto) {
    return this.support.createTicket(req.user.sub, body);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: SupportTicketListQueryDto) {
    return this.support.listMine(req.user.sub, query);
  }

  @Get(':id')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.support.getMine(req.user.sub, id);
  }

  @Get(':id/messages')
  messages(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: SupportMessagesQueryDto) {
    return this.support.listMessagesMine(req.user.sub, id, query);
  }

  @Post(':id/messages')
  send(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SendSupportMessageDto) {
    return this.support.sendMine(req.user.sub, id, body.message);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.support.markReadMine(req.user.sub, id);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.support.closeMine(req.user.sub, id);
  }
}
