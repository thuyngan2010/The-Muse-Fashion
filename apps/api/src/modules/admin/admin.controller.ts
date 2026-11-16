import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { AdminConfigService } from './admin-config.service.js';
import { AiQuotaPatchDto, CreateStaffDto, SettingsPatchDto, StaffGrantsDto, UserStatusDto, AdminUsersQueryDto } from './admin.dto.js';
import { AdminService } from './admin.service.js';
import { SalesReportService } from './sales-report.service.js';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly config: AdminConfigService,
    private readonly salesReport: SalesReportService,
  ) {}

  @Get('users') listUsers(@Query() query: AdminUsersQueryDto) {
    return this.admin.listUsers(query.page ?? 1, query.limit ?? 20, query.role);
  }

  @Post('staff') createStaff(@Req() req: AuthenticatedRequest, @Body() dto: CreateStaffDto) {
    return this.admin.createStaff(req.user.sub, dto);
  }

  @Post('staff/:staffId/invitation') resendStaffInvitation(@Req() req: AuthenticatedRequest, @Param('staffId') staffId: string) {
    return this.admin.resendStaffInvitation(req.user.sub, staffId);
  }

  @Patch('users/:userId') updateUser(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: UserStatusDto,
  ) {
    return this.admin.updateUserStatus(req.user.sub, userId, body.status);
  }

  @Post('staff/:staffId/permissions')
  grantPermission(
    @Req() req: AuthenticatedRequest,
    @Param('staffId') staffId: string,
    @Body() body: StaffGrantsDto,
  ) {
    return this.admin.grantStaffPermissions(req.user.sub, staffId, body.grants);
  }

  @Get('staff/:staffId/permissions')
  getPermissions(@Param('staffId') staffId: string) { return this.admin.getStaffPermissions(staffId); }

  @Patch('staff/:staffId/permissions')
  updatePermission(
    @Req() req: AuthenticatedRequest,
    @Param('staffId') staffId: string,
    @Body() body: StaffGrantsDto,
  ) {
    return this.admin.replaceStaffPermissions(req.user.sub, staffId, body.grants);
  }

  @Get('reports/sales')
  getSalesReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.salesReport.build(from, to);
  }

  @Get('settings')
  settings() {
    return this.config.getSettings();
  }

  @Patch('settings')
  updateSettings(@Req() req: AuthenticatedRequest, @Body() body: SettingsPatchDto) {
    return this.config.updateSettings(req.user.sub, body);
  }

  @Get('ai-quotas')
  quotas() {
    return this.config.getAiQuota();
  }

  @Patch('ai-quotas')
  updateQuotas(@Req() req: AuthenticatedRequest, @Body() body: AiQuotaPatchDto) {
    return this.config.updateAiQuota(req.user.sub, body);
  }
}
