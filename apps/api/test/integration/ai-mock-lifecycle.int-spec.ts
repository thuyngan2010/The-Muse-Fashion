import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types, type Connection } from 'mongoose';
import { connectDb, uniqueDbName } from './harness.js';
import { createMockAiProvider } from '../../src/scripts/ai-mock-provider.js';
import { AiConsent, AiConsentSchema, AiJob, AiJobSchema, AiQuota, AiQuotaSchema } from '../../src/modules/ai/ai.schemas.js';
import { AiQuotaService } from '../../src/modules/ai/ai-quota.service.js';
import { AiProviderService } from '../../src/modules/ai/ai-provider.service.js';
import { AiService } from '../../src/modules/ai/ai.service.js';
import { AiWorkerService } from '../../src/modules/ai/ai-worker.service.js';
import { AiFashionPlannerService } from '../../src/modules/ai/ai-fashion-planner.service.js';
import { Product, ProductSchema } from '../../src/modules/catalog/product.schema.js';
import { MediaObject, MediaObjectSchema } from '../../src/modules/storage/media-object.schema.js';
import type { StorageService } from '../../src/modules/storage/storage.service.js';
import { SystemSetting, SystemSettingSchema } from '../../src/modules/admin/admin.schemas.js';
import { OutboxEvent, OutboxEventSchema } from '../../src/modules/operations/outbox-event.schema.js';

let db: Connection;
const servers: Server[] = [];

beforeAll(async () => {
  db = await connectDb(uniqueDbName('fc_ai_mock'));
  db.model(AiJob.name, AiJobSchema);
  db.model(AiConsent.name, AiConsentSchema);
  db.model(AiQuota.name, AiQuotaSchema);
  db.model(Product.name, ProductSchema);
  db.model(MediaObject.name, MediaObjectSchema);
  db.model(SystemSetting.name, SystemSettingSchema);
  db.model(OutboxEvent.name, OutboxEventSchema);
  await Promise.all(Object.values(db.models).map((model) => model.init()));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

afterAll(async () => {
  await db?.dropDatabase();
  await db?.close();
});

describe('AI worker lifecycle with QA mock and stubbed object storage', () => {
  it.each([
    ['TRY_ON', 'success', 'off'], ['MIX_MATCH', 'success', 'off'], ['TRY_ON', 'failure', 'off'],
    ['MIX_MATCH', 'success', 'valid'], ['TRY_ON', 'failure', 'valid'], ['TRY_ON', 'success', 'no-person'],
  ] as const)('processes %s in %s mode, planner=%s, with consent and quota accounting', async (type, mode, plannerMode) => {
    const server = createMockAiProvider({ mode, delayMs: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No mock server port');
    const base = `http://127.0.0.1:${address.port}`;
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', `${base}/v1`);
    vi.stubEnv('AI_API_KEY', 'local-ai-mock');
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    vi.stubEnv('AI_MIX_MATCH_MODEL', '');
    const jobs = db.model<AiJob>(AiJob.name);
    const quotas = db.model<AiQuota>(AiQuota.name);
    const consents = db.model<AiConsent>(AiConsent.name);
    const products = db.model<Product>(Product.name);
    const media = db.model<MediaObject>(MediaObject.name);
    const outbox = db.model<OutboxEvent>(OutboxEvent.name);
    const quota = new AiQuotaService(quotas, db.model<SystemSetting>(SystemSetting.name));
    const provider = new AiProviderService();
    const storage = { signedReadUrl: async (key: string) => `${base}/fixture/${encodeURIComponent(key)}` } as StorageService;
    const ai = new AiService(jobs, consents, products, media, quota, provider, storage, db, outbox);
    vi.stubEnv('AI_PLANNER_ENABLED', plannerMode === 'off' ? 'false' : 'true');
    const worker = new AiWorkerService(jobs, products, media, provider, ai, storage, new AiFashionPlannerService());
    // Exercise the real worker/provider and database while keeping R2 writes inside the test.
    const upload = vi.spyOn(worker as unknown as {
      uploadPrivate(key: string, bytes: Buffer, type: string): Promise<void>;
    }, 'uploadPrivate').mockResolvedValue();
    const ownerId = String(new Types.ObjectId());
    const input = await media.create({ ownerId, key: `tryon/${ownerId}/input.png`, purpose: 'tryon',
      visibility: 'PRIVATE', status: 'READY', contentType: 'image/png', sizeBytes: 68 });
    const productIds: string[] = [];
    for (let i = 0; i < (type === 'MIX_MATCH' ? 2 : 1); i++) {
      const product = await products.create({ slug: randomUUID(), name: 'QA garment', price: 100_000,
        currency: 'VND', status: 'PUBLISHED', images: [`${base}/garment.png`] });
      productIds.push(String(product._id));
    }
    let plannerRequests = 0;
    if (plannerMode !== 'off') {
      const vision = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          plannerRequests++;
          const result = plannerRequests === 1 ? {
            person: { count: plannerMode === 'no-person' ? 0 : 1, pose: 'standing', visibleRegions: ['face', 'torso', 'feet'] },
            products: productIds.map((productId, i) => ({ productId, category: i === 0 ? 'shoes' : 'top',
              confidence: 0.99, targetRegion: i === 0 ? 'feet' : 'torso', details: 'Fixture reference product.' })),
          } : { compatible: true, explanation: 'Phù hợp.', summary: 'Phối giày và trang phục.',
            items: productIds.map(productId => ({ productId, action: 'replace', notes: 'Keep design.' })) };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(result) } }] }));
        });
      });
      servers.push(vision);
      await new Promise<void>(resolve => vision.listen(0, '127.0.0.1', resolve));
      const port = (vision.address() as { port: number }).port;
      vi.stubEnv('AI_PLANNER_BASE_URL', `http://127.0.0.1:${port}/v1`);
      vi.stubEnv('AI_PLANNER_API_KEY', 'planner-fixture');
      vi.stubEnv('AI_PLANNER_MODEL', 'vision-fixture');
    }
    const dto = { inputMediaId: String(input._id), productIds, consentPolicyVersion: 'v1.0',
      style: type === 'MIX_MATCH' ? 'office' as const : undefined };
    const requestKey = randomUUID();
    const created = type === 'TRY_ON' ? await ai.createTryOn(ownerId, requestKey, dto)
      : await ai.createMixMatch(ownerId, requestKey, dto);
    if (type === 'MIX_MATCH') {
      await expect(ai.createMixMatch(ownerId, requestKey, { ...dto, style: 'streetwear' })).rejects.toThrow('different AI request');
    }
    expect(created.state).toBe('PENDING');
    expect(await consents.countDocuments({ ownerId, jobId: created.id })).toBe(1);
    const originalRunJob = provider.runJob.bind(provider);
    vi.spyOn(provider, 'runJob').mockImplementation(async (request) => {
      expect((await jobs.findById(request.jobId).lean())?.state).toBe('PROCESSING');
      if (plannerMode !== 'off') {
        expect((await jobs.findById(request.jobId).lean())?.phase).toBe('GENERATING');
        expect(request.prompt).toContain('Replace footwear only');
        expect(request.prompt).toContain(`Image 2, product ${productIds[0]}`);
      }
      return originalRunJob(request);
    });
    await worker.processPending();
    if (plannerMode === 'no-person') {
      const rejected = await jobs.findById(created.id).lean();
      expect(rejected?.state).toBe('FAILED');
      expect(rejected?.errorMessage).toContain('đúng một người');
      expect(rejected?.providerSubmitStartedAt).toBeUndefined();
      expect((await quotas.findOne({ ownerId }).lean())?.used).toBe(0);
      expect(provider.runJob).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      return;
    }
    const queued = await jobs.findById(created.id).lean();
    expect(queued?.providerJobId).toBeTruthy();
    // Drive the next polling tick without waiting for the worker's 30 second backoff.
    await jobs.updateOne({ _id: created.id }, { $set: { nextAttemptAt: new Date(0) } });
    await worker.processPending();
    const result = await ai.getJob(ownerId, created.id);
    expect(result.state).toBe(mode === 'success' ? 'COMPLETED' : 'FAILED');
    if (plannerMode !== 'off') {
      expect(plannerRequests).toBe(2);
      expect(result.detectedItems).toHaveLength(productIds.length);
      expect(result.planSummary).toBeTruthy();
      expect(JSON.stringify((await jobs.findById(created.id).lean())?.renderPlan)).not.toContain('/fixture/');
    }
    expect((await quotas.findOne({ ownerId }).lean())?.used).toBe(mode === 'success' ? 1 : 0);
    if (mode === 'success') {
      expect(result.resultUrls).toHaveLength(1);
      expect(upload).toHaveBeenCalledOnce();
      expect(await media.countDocuments({ ownerId, status: 'READY' })).toBe(2);
      expect(await outbox.countDocuments({ aggregateId: created.id, type: 'ai.job.completed' })).toBe(1);
    } else {
      expect(upload).not.toHaveBeenCalled();
      expect(result.errorMessage).toBeTruthy();
      await worker.processPending();
      expect((await quotas.findOne({ ownerId }).lean())?.used).toBe(0);
    }
  });
});
