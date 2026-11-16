import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AiController } from '../modules/ai/ai.controller.js';
import { AiJobWriteDto } from '../modules/ai/ai.dto.js';
import { AdminController } from '../modules/admin/admin.controller.js';
import { SettingsPatchDto } from '../modules/admin/admin.dto.js';
import { CommunityController, ReviewsController } from '../modules/community/community.controller.js';
import { PostWriteDto, ReviewWriteDto } from '../modules/community/community.dto.js';

describe('controller DTO runtime metadata', () => {
  it.each([
    [AiController, 'tryOn', AiJobWriteDto],
    [AdminController, 'updateSettings', SettingsPatchDto],
    [CommunityController, 'create', PostWriteDto],
    [ReviewsController, 'create', ReviewWriteDto],
  ])('%s.%s exposes a class to ValidationPipe', (controller, method, dto) => {
    const types = Reflect.getMetadata('design:paramtypes', controller.prototype, method) as unknown[];
    expect(types).toContain(dto);
    expect(types).not.toContain(Function);
  });
});
