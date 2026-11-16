import { Body, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StorageService } from './storage.service.js';
import { PresignDto, FinalizeDto } from './storage.dto.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';

@ApiTags('Storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign') presign(@Req() req: AuthenticatedRequest, @Body() dto: PresignDto) {
    return this.storage.presign(req.user.sub, req.user.role, dto);
  }

  @Post('finalize') finalize(@Req() req: AuthenticatedRequest, @Body() dto: FinalizeDto) {
    return this.storage.finalize(req.user.sub, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 1024 },
  }))
  upload(@Req() req: AuthenticatedRequest, @Body() dto: FinalizeDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.storage.upload(req.user.sub, dto, file);
  }
}
