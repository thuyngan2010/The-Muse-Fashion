import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { AddressDto, UpdateAddressDto, UpdateProfileDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() profile(@Req() req: AuthenticatedRequest) { return this.users.getProfile(req.user.sub); }
  @Patch() updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(req.user.sub, dto);
  }
  @Get('addresses') addresses(@Req() req: AuthenticatedRequest) { return this.users.listAddresses(req.user.sub); }
  @Post('addresses') createAddress(@Req() req: AuthenticatedRequest, @Body() dto: AddressDto) {
    return this.users.createAddress(req.user.sub, dto);
  }
  @Patch('addresses/:addressId') updateAddress(@Req() req: AuthenticatedRequest,
    @Param('addressId') id: string, @Body() dto: UpdateAddressDto) {
    return this.users.updateAddress(req.user.sub, id, dto);
  }
  @Delete('addresses/:addressId') @HttpCode(204) deleteAddress(@Req() req: AuthenticatedRequest,
    @Param('addressId') id: string) { return this.users.deleteAddress(req.user.sub, id); }
}
