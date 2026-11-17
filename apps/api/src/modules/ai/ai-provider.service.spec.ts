import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderService } from './ai-provider.service.js';

const input = {
  jobId: 'local-job',
  type: 'TRY_ON' as const,
  inputUrl: 'https://example.com/input',
  productImageUrls: ['https://example.com/product'],
};

describe('AI provider response handling', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', 'https://provider.example');
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    vi.stubEnv('R2_UPLOAD_MAX_BYTES', '32');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('fails an accepted job without a polling ID instead of making it retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 202, headers: { 'content-type': 'application/json' },
    })));
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
  });

  it('disables redirects when posting signed image URLs to the provider', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('redirect mode is error'));
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
    expect(fetch).toHaveBeenCalledWith('https://provider.example/images/edits',
      expect.objectContaining({ method: 'POST', redirect: 'error' }));
  });

  it('keeps the provider ID from a processing JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"status":"PROCESSING","jobId":"remote-job"}', {
      headers: { 'content-type': 'application/json' },
    })));
    expect(await new AiProviderService().runJob(input)).toEqual({ status: 'PROCESSING', providerJobId: 'remote-job' });
  });

  it('rejects an oversized image even when no Content-Length is supplied', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(40)); controller.close(); },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'content-type': 'image/png' },
    })));
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
  });

  it('rejects bytes that do not match the declared image format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not a png', {
      headers: { 'content-type': 'image/png' },
    })));
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
  });

  it.each(['//attacker.example/job', 'https://attacker.example/job',
    '///attacker.example/job', '/\\attacker.example/job'])
  ('rejects polling URL %s before sending the Bearer token', async (providerJobId) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob({ ...input, providerJobId }))
      .toMatchObject({ status: 'FAILED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows a root-relative polling URL on the provider origin', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', {
      status: 202, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetch);
    await new AiProviderService().runJob({ ...input, providerJobId: '/jobs/remote-job' });
    expect(fetch).toHaveBeenCalledWith('https://provider.example/jobs/remote-job',
      expect.objectContaining({ method: 'GET', redirect: 'error' }));
  });
});

describe('OpenAI-compatible image edits', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');

  beforeEach(() => {
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', 'https://provider.example/v1');
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubEnv('AI_TRY_ON_MODEL', 'gpt-image-2');
    vi.stubEnv('AI_MIX_MATCH_MODEL', 'gpt-image-2');
    vi.stubEnv('R2_UPLOAD_MAX_BYTES', '1024');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('uses SDK authentication with the OpenAI JSON image edit schema and decodes b64_json', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetch);
    const result = await new AiProviderService().runJob(input);
    expect(result).toMatchObject({ status: 'COMPLETED', contentType: 'image/png' });
    if (result.status === 'COMPLETED') expect(await sharp(result.outputBytes).raw().toBuffer()).toEqual(await sharp(png).raw().toBuffer());
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://provider.example/v1/images/edits');
    expect(options.redirect).toBe('error');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer test-key');
    expect(new Headers(options.headers).get('idempotency-key')).toBe(input.jobId);
    expect(JSON.parse(String(options.body))).toMatchObject({
      model: 'gpt-image-2', n: 1, output_format: 'png',
      images: [{ image_url: input.inputUrl }, { image_url: input.productImageUrls[0] }],
    });
  });

  it.each(['openai', 'custom'])('passes the validated fashion prompt to the %s image contract', async protocol => {
    if (protocol === 'custom') vi.stubEnv('AI_TRY_ON_MODEL', '');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await new AiProviderService().runJob({ ...input, prompt: 'Fit the referenced glasses to the face; preserve the person.' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).prompt).toBe('Fit the referenced glasses to the face; preserve the person.');
  });

  it('appends the body measurement line to the default prompt only when measurements exist', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await new AiProviderService().runJob({ ...input, body: { heightCm: 165, weightKg: 52 } });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).prompt).toContain('height is 165 cm and weight is 52 kg');
    await new AiProviderService().runJob({ ...input });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).prompt).not.toContain('stated');
  });

  it('does not retry a failed POST inside the SDK', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":{"message":"unavailable"}}', {
      status: 502, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('falls back from OpenAI to custom only after a schema rejection, then remembers custom', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"inputUrl is required"}}', {
        status: 400, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    const provider = new AiProviderService();
    expect(await provider.runJob(input)).toMatchObject({ status: 'COMPLETED' });
    expect(JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body))).toHaveProperty('images');
    expect(JSON.parse(String((fetch.mock.calls[1]?.[1] as RequestInit).body))).toHaveProperty('inputUrl');
    expect(await provider.runJob({ ...input, jobId: 'next-job' })).toMatchObject({ status: 'COMPLETED' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String((fetch.mock.calls[2]?.[1] as RequestInit).body))).toHaveProperty('inputUrl');
  });

  it('falls back from custom to OpenAI when prompt is explicitly required', async () => {
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"prompt is required"}}', {
        status: 400, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'COMPLETED' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body))).toHaveProperty('inputUrl');
    expect(JSON.parse(String((fetch.mock.calls[1]?.[1] as RequestInit).body))).toHaveProperty('images');
  });

  it('does not fall back for a rejected model', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":{"message":"model is invalid"}}', {
      status: 400, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('preserves an async provider job ID and polls only on its original origin', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 202, headers: { Location: '/jobs/remote-1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob(input)).toEqual({ status: 'PROCESSING', providerJobId: '/jobs/remote-1' });
    expect(await new AiProviderService().runJob({ ...input, providerJobId: '/jobs/remote-1' }))
      .toMatchObject({ status: 'COMPLETED', contentType: 'image/png' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe('https://provider.example/jobs/remote-1');
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'GET', redirect: 'error' });
  });

  it('uses the mix-and-match model and prompt for MIX_MATCH jobs', async () => {
    vi.stubEnv('AI_MIX_MATCH_MODEL', 'mix-image-model');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob({ ...input, type: 'MIX_MATCH' })).toMatchObject({ status: 'COMPLETED' });
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.model).toBe('mix-image-model');
    expect(body.prompt).toContain('coordinated outfit');
  });

  it('rejects oversized or invalid base64 image output', async () => {
    vi.stubEnv('R2_UPLOAD_MAX_BYTES', '32');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      headers: { 'content-type': 'application/json' },
    })));
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
    vi.stubEnv('R2_UPLOAD_MAX_BYTES', '1024');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":[{"b64_json":"not-an-image"}]}', {
      headers: { 'content-type': 'application/json' },
    })));
    expect(await new AiProviderService().runJob(input)).toMatchObject({ status: 'FAILED' });
  });

  it('requires a product reference before sending an OpenAI image edit', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await new AiProviderService().runJob({ ...input, productImageUrls: [] })).toMatchObject({ status: 'FAILED' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
