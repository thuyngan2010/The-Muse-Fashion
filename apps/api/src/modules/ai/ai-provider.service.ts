import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfig } from '../../common/app-config.js';
import { describeBody, type BodyMeasurements } from './fashion-plan.js';
import { sanitizeImage } from '../storage/image-sanitize.util.js';

const JSON_RESPONSE_MAX_BYTES = 64 * 1024;
const HARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_JSON_OVERHEAD_BYTES = 128 * 1024;
type ProviderProtocol = 'openai' | 'custom';

const OPENAI_PROMPTS: Record<AiProviderSubmitInput['type'], string> = {
  TRY_ON: 'Use the first image as the person and the remaining images as clothing references. Edit the person to wear the referenced clothing. Preserve their face, body proportions, pose, background, garment colors, patterns, and details. Produce one realistic fashion image.',
  MIX_MATCH: 'Use the first image as the person and the remaining images as clothing references. Create one coordinated outfit using the referenced garments. Preserve the person’s identity, body proportions, and the garments’ distinctive colors and details. Produce one realistic fashion image.',
};

export type AiProviderSubmitInput = {
  jobId: string;
  type: 'TRY_ON' | 'MIX_MATCH';
  inputUrl: string;
  productImageUrls: string[];
  providerJobId?: string;
  prompt?: string;
  body?: BodyMeasurements;
};

export type AiProviderResult =
  | { status: 'COMPLETED'; outputBytes: Buffer; contentType: 'image/png' | 'image/jpeg' | 'image/webp' }
  | { status: 'FAILED'; message: string }
  | { status: 'PROCESSING'; providerJobId?: string };

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly protocolByOrigin = new Map<string, ProviderProtocol>();

  isEnabled(): boolean {
    return AppConfig.boolean('AI_ENABLED', false)
      && Boolean(AppConfig.optional('AI_API_BASE_URL'))
      && Boolean(AppConfig.optional('AI_API_KEY'));
  }

  async runJob(input: AiProviderSubmitInput): Promise<AiProviderResult> {
    if (!this.isEnabled()) {
      return { status: 'FAILED', message: 'AI provider is not configured' };
    }

    const timeoutMs = Number(AppConfig.optional('AI_REQUEST_TIMEOUT_MS') ?? '120000');
    const maxBytes = Number(AppConfig.optional('R2_UPLOAD_MAX_BYTES') ?? '5242880');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > HARD_IMAGE_MAX_BYTES) {
      return { status: 'FAILED', message: 'AI provider limits are invalid' };
    }
    const model = input.type === 'TRY_ON'
      ? AppConfig.optional('AI_TRY_ON_MODEL')
      : AppConfig.optional('AI_MIX_MATCH_MODEL');
    const baseUrl = AppConfig.require('AI_API_BASE_URL').replace(/\/$/, '');
    const authorization = `Bearer ${AppConfig.require('AI_API_KEY')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      if (input.providerJobId) {
        response = await fetch(this.pollUrl(baseUrl, input.providerJobId), {
          method: 'GET',
          headers: { Authorization: authorization },
          signal: controller.signal,
          redirect: 'error',
        });
      } else {
        const first = this.protocolByOrigin.get(baseUrl) ?? (model ? 'openai' : 'custom');
        response = await this.submit(first, baseUrl, input, model, timeoutMs, authorization, controller.signal);
        if (!response.ok) {
          const errorBytes = await this.readLimited(response, JSON_RESPONSE_MAX_BYTES).catch(() => null);
          if (!this.isSchemaRejection(response.status, errorBytes, first)) {
            this.logger.warn(`AI provider HTTP ${response.status}`);
            return { status: 'FAILED', message: 'AI provider rejected the request' };
          }
          const second: ProviderProtocol = first === 'openai' ? 'custom' : 'openai';
          response = await this.submit(second, baseUrl, input, model, timeoutMs, authorization, controller.signal);
          if (response.ok) this.protocolByOrigin.set(baseUrl, second);
        } else {
          this.protocolByOrigin.set(baseUrl, first);
        }
      }

      if (response.status === 202) {
        const providerJobId = input.providerJobId ?? await this.acceptedJobId(response);
        return providerJobId
          ? { status: 'PROCESSING', providerJobId }
          : { status: 'FAILED', message: 'AI provider accepted the request without a polling job ID' };
      }
      if (!response.ok) {
        await this.readLimited(response, JSON_RESPONSE_MAX_BYTES).catch(() => null);
        this.logger.warn(`AI provider HTTP ${response.status}`);
        return { status: 'FAILED', message: 'AI provider rejected the request' };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const jsonLimit = Math.ceil(maxBytes * 4 / 3) + IMAGE_JSON_OVERHEAD_BYTES;
        const jsonBytes = await this.readLimited(response, jsonLimit);
        if (!jsonBytes) return { status: 'FAILED', message: 'AI provider response is too large' };
        const body = this.parseJson(jsonBytes);
        const status = String(body.status ?? '').toLowerCase();
        if (['queued', 'pending', 'processing', 'running', 'in_progress'].includes(status)) {
          const providerJobId = input.providerJobId ?? this.jobIdFromBody(body);
          return providerJobId
            ? { status: 'PROCESSING', providerJobId }
            : { status: 'FAILED', message: 'AI provider is processing without a polling job ID' };
        }
        if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
          return { status: 'FAILED', message: 'AI provider failed to process the job' };
        }
        return this.openAiImage(body, maxBytes);
      }
      const normalized = contentType.split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(normalized)) {
        return { status: 'FAILED', message: 'AI provider returned unexpected payload' };
      }
      const bytes = await this.readLimited(response, maxBytes);
      if (!bytes?.length) return { status: 'FAILED', message: 'AI provider returned empty or oversized image' };
      try {
        const outputBytes = await sanitizeImage(bytes, normalized);
        if (outputBytes.length > maxBytes) return { status: 'FAILED', message: 'AI provider returned oversized image' };
        return { status: 'COMPLETED', outputBytes, contentType: normalized as 'image/png' | 'image/jpeg' | 'image/webp' };
      } catch {
        return { status: 'FAILED', message: 'AI provider returned invalid image data' };
      }
    } catch (error) {
      const message = error instanceof Error && ['AbortError', 'APIConnectionTimeoutError'].includes(error.name)
        ? 'AI provider timed out'
        : 'AI provider request failed';
      return { status: 'FAILED', message };
    } finally {
      clearTimeout(timer);
    }
  }

  private submit(
    protocol: ProviderProtocol, baseUrl: string, input: AiProviderSubmitInput, model: string | undefined,
    timeoutMs: number, authorization: string, signal: AbortSignal,
  ): Promise<Response> {
    if (protocol === 'openai') {
      if (!input.productImageUrls.length) throw new Error('Product reference image is missing');
      return this.submitOpenAi(baseUrl, input, model, timeoutMs, signal);
    }
    return fetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.jobId,
      },
      body: JSON.stringify({
        model: model ?? 'default',
        jobId: input.jobId,
        type: input.type,
        inputUrl: input.inputUrl,
        productImageUrls: input.productImageUrls,
        ...(input.prompt ? { prompt: input.prompt } : {}),
      }),
      signal,
      redirect: 'error',
    });
  }

  private isSchemaRejection(status: number, bytes: Buffer | null, protocol: ProviderProtocol): boolean {
    if (![400, 422].includes(status) || !bytes) return false;
    const body = this.parseJson(bytes);
    const error = body.error && typeof body.error === 'object' ? body.error as Record<string, unknown> : {};
    const detail = error.message ?? body.message;
    const message = (typeof detail === 'string' ? detail : bytes.toString('utf8')).toLowerCase();
    if (!/required|missing|expected/.test(message)) return false;
    return protocol === 'openai'
      ? /input.?url|product.?image.?urls|job.?id/.test(message)
      : /\bprompt\b|\bimages\b|image.?url|image\[\]/.test(message);
  }

  private async submitOpenAi(
    baseUrl: string, input: AiProviderSubmitInput, model: string | undefined, timeoutMs: number, signal: AbortSignal,
  ): Promise<Response> {
    const client = new OpenAI({
      apiKey: AppConfig.require('AI_API_KEY'), baseURL: baseUrl, timeout: timeoutMs, maxRetries: 0,
      organization: null, project: null,
      fetch: async (url, options) => {
        const response = await fetch(url, { ...options, redirect: 'error' });
        if (response.ok) return response;
        const bytes = await this.readLimited(response, JSON_RESPONSE_MAX_BYTES).catch(() => null);
        return new Response(bytes?.toString('utf8') ?? '{}', { status: response.status, statusText: response.statusText,
          headers: { 'content-type': 'application/json' } });
      },
    });
    // The Images HTTP JSON contract accepts image URLs; the SDK's typed edit helper sends multipart files.
    try {
      return await client.post('/images/edits', {
        body: {
          ...(model ? { model } : {}), prompt: input.prompt ?? [OPENAI_PROMPTS[input.type], describeBody(input.body)].filter(Boolean).join(' '),
          images: [input.inputUrl, ...input.productImageUrls].map((image_url) => ({ image_url })),
          n: 1, output_format: 'png',
        },
        headers: { 'Idempotency-Key': input.jobId }, signal, maxRetries: 0,
        fetchOptions: { redirect: 'error' },
      }).asResponse();
    } catch (error) {
      if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status <= 599) {
        return new Response(JSON.stringify({ error: error.error ?? { message: error.message } }), {
          status: error.status, headers: { 'content-type': 'application/json' },
        });
      }
      throw error;
    }
  }

  private async openAiImage(body: Record<string, unknown>, maxBytes: number): Promise<AiProviderResult> {
    const data = Array.isArray(body.data) ? body.data : [];
    const image = data[0] as { b64_json?: unknown } | undefined;
    const encoded = image?.b64_json;
    if (typeof encoded !== 'string' || !encoded.length) {
      return { status: 'FAILED', message: 'AI provider returned no image data' };
    }
    if (encoded.length > Math.ceil(maxBytes / 3) * 4 + 4) {
      return { status: 'FAILED', message: 'AI provider returned oversized image' };
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > maxBytes) {
      return { status: 'FAILED', message: 'AI provider returned empty or oversized image' };
    }
    const contentType = this.detectImageType(bytes);
    if (!contentType) return { status: 'FAILED', message: 'AI provider returned invalid image data' };
    try {
      const outputBytes = await sanitizeImage(bytes, contentType);
      if (outputBytes.length > maxBytes) return { status: 'FAILED', message: 'AI provider returned oversized image' };
      return { status: 'COMPLETED', outputBytes, contentType };
    } catch {
      return { status: 'FAILED', message: 'AI provider returned invalid image data' };
    }
  }

  private detectImageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
  }

  private async acceptedJobId(response: Response): Promise<string | undefined> {
    const location = response.headers.get('location');
    if (location) return location;
    const bytes = await this.readLimited(response, JSON_RESPONSE_MAX_BYTES);
    return bytes ? this.jobIdFromBody(this.parseJson(bytes)) : undefined;
  }

  private jobIdFromBody(body: Record<string, unknown>): string | undefined {
    const id = body.id ?? body.jobId ?? body.job_id;
    return typeof id === 'string' && id.trim() ? id.trim() : undefined;
  }

  private parseJson(bytes: Buffer): Record<string, unknown> {
    try {
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch { return {}; }
  }

  private async readLimited(response: Response, maxBytes: number): Promise<Buffer | null> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel();
      return null;
    }
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, total);
    } finally {
      reader.releaseLock();
    }
  }

  private pollUrl(baseUrl: string, providerJobId: string): string {
    const base = new URL(baseUrl);
    const url = /^https?:\/\//i.test(providerJobId) || providerJobId.startsWith('/')
      ? new URL(providerJobId, `${baseUrl}/`)
      : new URL(`images/edits/${encodeURIComponent(providerJobId)}`, `${baseUrl}/`);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin) {
      throw new Error('AI provider poll URL must stay on the provider origin');
    }
    return url.toString();
  }
}
