import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, type Connection } from 'mongoose';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { AuditService } from '../operations/audit.service.js';
import { SystemSetting } from './admin.schemas.js';
import type { AiQuotaPatchDto, SettingsPatchDto } from './admin.dto.js';

const SETTING_KEYS = ['standardShippingFee', 'freeShippingThreshold', 'lowStockThreshold', 'aiDailyJobs'] as const;
const DEFAULTS: Record<(typeof SETTING_KEYS)[number], number> = {
  standardShippingFee: 30_000,
  freeShippingThreshold: 1_000_000,
  lowStockThreshold: 5,
  aiDailyJobs: 5,
};

@Injectable()
export class AdminConfigService {
  constructor(
    @InjectModel(SystemSetting.name) private readonly settings: Model<SystemSetting>,
    private readonly audit: AuditService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async getSettings() {
    const rows = await this.settings.find({ key: { $in: [...SETTING_KEYS] } }).lean().exec();
    const map = new Map(rows.map((row) => [row.key, row]));
    return {
      standardShippingFee: this.readNumber(map.get('standardShippingFee'), DEFAULTS.standardShippingFee),
      freeShippingThreshold: this.readNumber(map.get('freeShippingThreshold'), DEFAULTS.freeShippingThreshold),
      lowStockThreshold: this.readNumber(map.get('lowStockThreshold'), DEFAULTS.lowStockThreshold),
      aiDailyJobs: this.readNumber(map.get('aiDailyJobs'), DEFAULTS.aiDailyJobs),
      updatedAt: this.latestUpdatedAt(rows as Array<{ updatedAt?: Date }>),
    };
  }

  async updateSettings(actorId: string, dto: SettingsPatchDto) {
    const entries = Object.entries(dto).filter(([, value]) => value !== undefined) as [string, number][];
    if (!entries.length) throw new BadRequestException('No settings provided');

    for (const [key, value] of entries) {
      if (!SETTING_KEYS.includes(key as (typeof SETTING_KEYS)[number])) {
        throw new BadRequestException(`Unknown setting: ${key}`);
      }
      this.validateValue(key, value);
    }
    await withCommerceTransaction(this.connection, async (session) => {
      for (const [key, value] of entries) {
        await this.settings.findOneAndUpdate({ key },
          { $set: { value, updatedBy: actorId }, $inc: { version: 1 } },
          { upsert: true, new: true, setDefaultsOnInsert: false, session }).exec();
      }
      await this.audit.record('admin.settings_updated', 'system_setting', 'bundle', actorId,
        { keys: entries.map(([key]) => key) }, session);
    });
    return this.getSettings();
  }

  async getAiQuota() {
    const row = await this.settings.findOne({ key: 'aiDailyJobs' }).lean().exec();
    const dailyJobs = this.readNumber(row ?? undefined, DEFAULTS.aiDailyJobs);
    return {
      dailyJobs,
      effectiveAt: this.settingUpdatedAt(row as unknown as { get?: (key: string) => unknown; updatedAt?: Date }) ?? new Date(0).toISOString(),
      updatedAt: this.settingUpdatedAt(row as unknown as { get?: (key: string) => unknown; updatedAt?: Date }) ?? new Date(0).toISOString(),
    };
  }

  async updateAiQuota(actorId: string, dto: AiQuotaPatchDto) {
    this.validateValue('aiDailyJobs', dto.dailyJobs);
    const row = await withCommerceTransaction(this.connection, async (session) => {
      const updated = await this.settings.findOneAndUpdate({ key: 'aiDailyJobs' },
        { $set: { value: dto.dailyJobs, updatedBy: actorId }, $inc: { version: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: false, session }).exec();
      await this.audit.record('admin.ai_quota_updated', 'system_setting', 'aiDailyJobs', actorId,
        { dailyJobs: dto.dailyJobs }, session);
      return updated;
    });
    return {
      dailyJobs: Number(row.value),
      effectiveAt: this.settingUpdatedAt(row as unknown as { get?: (key: string) => unknown; updatedAt?: Date }) ?? new Date().toISOString(),
      updatedAt: this.settingUpdatedAt(row as unknown as { get?: (key: string) => unknown; updatedAt?: Date }) ?? new Date().toISOString(),
    };
  }

  private settingUpdatedAt(row: { get?: (key: string) => unknown; updatedAt?: Date } | null | undefined) {
    if (!row) return null;
    const fromGetter = typeof row.get === 'function' ? row.get('updatedAt') : undefined;
    const value = (fromGetter ?? row.updatedAt) as Date | undefined;
    return value?.toISOString() ?? null;
  }

  private validateValue(key: string, value: number) {
    if (!Number.isInteger(value) || value < 0) throw new BadRequestException(`${key} must be a non-negative integer`);
    if (key === 'lowStockThreshold' && value > 9999) throw new BadRequestException('lowStockThreshold must be at most 9999');
    if (key === 'aiDailyJobs' && value > 100) throw new BadRequestException('aiDailyJobs must be at most 100');
  }

  private readNumber(row: { value?: unknown } | undefined, fallback: number): number {
    const value = Number(row?.value ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  private latestUpdatedAt(rows: Array<{ updatedAt?: Date }>) {
    const timestamps = rows.map((row) => row.updatedAt?.getTime() ?? 0);
    const max = Math.max(0, ...timestamps);
    return max ? new Date(max).toISOString() : null;
  }
}
