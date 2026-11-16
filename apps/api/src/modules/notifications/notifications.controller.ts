import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notification')
@ApiBearerAuth()
@Roles('CUSTOMER', 'ADMIN', 'STAFF')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.notifications.list(req.user.sub, query.page ?? 1, query.limit ?? 20);
  }

  @Patch('read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user.sub);
  }

  @Patch(':notificationId/read')
  markRead(@Req() req: AuthenticatedRequest, @Param('notificationId') id: string) {
    return this.notifications.markRead(req.user.sub, id);
  }
}
