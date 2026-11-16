import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiProviderService } from '../../src/modules/ai/ai-provider.service.js';
import { createMockAiProvider } from '../../src/scripts/ai-mock-provider.js';

const servers: Server[] = [];

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP test server has no port');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('AI provider over real HTTP', () => {
  it.each(['TRY_ON', 'MIX_MATCH'] as const)('completes %s through the standalone QA mock', async (type) => {
    const base = await listen(createMockAiProvider({ delayMs: 0 }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', `${base}/v1`);
    vi.stubEnv('AI_API_KEY', 'local-ai-mock');
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    vi.stubEnv('AI_MIX_MATCH_MODEL', '');
    const provider = new AiProviderService();
    const input = { jobId: `mock-${type}`, type, inputUrl: `${base}/person.png`, productImageUrls: [`${base}/clothes.png`] };
    const accepted = await provider.runJob(input);
    expect(accepted.status).toBe('PROCESSING');
    if (accepted.status !== 'PROCESSING') throw new Error('Expected an asynchronous job');
    expect(accepted.providerJobId).toBeTruthy();
    const completed = await provider.runJob({ ...input, providerJobId: accepted.providerJobId });
    expect(completed.status).toBe('COMPLETED');
    if (completed.status === 'COMPLETED') {
      expect(completed.contentType).toBe('image/png');
      expect(completed.outputBytes.length).toBeGreaterThan(0);
    }
  });

  it('exercises the QA mock failure path without an external provider', async () => {
    const base = await listen(createMockAiProvider({ mode: 'failure', delayMs: 0 }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', `${base}/v1`);
    vi.stubEnv('AI_API_KEY', 'local-ai-mock');
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    const provider = new AiProviderService();
    const input = { jobId: 'mock-failure', type: 'TRY_ON' as const, inputUrl: `${base}/input.png`, productImageUrls: [] };
    const accepted = await provider.runJob(input);
    if (accepted.status !== 'PROCESSING') throw new Error('Expected an asynchronous job');
    expect((await provider.runJob({ ...input, providerJobId: accepted.providerJobId })).status).toBe('FAILED');
  });

  it('accepts a binary image from the original custom provider contract', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');
    const providerUrl = await listen(createServer(async (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
    }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    vi.stubEnv('AI_API_BASE_URL', providerUrl);
    vi.stubEnv('AI_API_KEY', 'provider-secret');
    const result = await new AiProviderService().runJob({
      jobId: 'custom-image-test', type: 'TRY_ON', inputUrl: 'https://r2.example.test/input.png',
      productImageUrls: ['https://r2.example.test/product.png'],
    });
    expect(result.status).toBe('COMPLETED');
    if (result.status === 'COMPLETED') expect(result.outputBytes.equals(png)).toBe(true);
  });

  it.each([307, 308])('does not forward a signed R2 URL or bearer token across a %i POST redirect', async (status) => {
    const attackerRequests: Array<{ authorization: string | undefined; body: string }> = [];
    const attackerUrl = await listen(createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      attackerRequests.push({ authorization: request.headers.authorization, body });
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    }));
    const providerRequests: Array<{ authorization: string | undefined; body: string }> = [];
    const providerUrl = await listen(createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      providerRequests.push({ authorization: request.headers.authorization, body });
      response.writeHead(status, { Location: `${attackerUrl}/capture` }).end();
    }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', providerUrl);
    vi.stubEnv('AI_API_KEY', 'provider-secret');
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    const signedUrl = 'https://r2.example.test/input.png?X-Amz-Signature=private-signature';

    const result = await new AiProviderService().runJob({
      jobId: 'redirect-test', type: 'TRY_ON', inputUrl: signedUrl, productImageUrls: [],
    });

    expect(result.status).toBe('FAILED');
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.authorization).toBe('Bearer provider-secret');
    expect(providerRequests[0]?.body).toContain(signedUrl);
    expect(attackerRequests).toHaveLength(0);
  });

  it.each([307, 308])('keeps signed URLs and the API key on the provider origin for OpenAI %i redirects', async (status) => {
    let attackerRequests = 0;
    const attackerUrl = await listen(createServer((_request, response) => {
      attackerRequests += 1;
      response.writeHead(200).end();
    }));
    let providerBody = '';
    const providerUrl = await listen(createServer(async (request, response) => {
      for await (const chunk of request) providerBody += chunk.toString();
      response.writeHead(status, { Location: `${attackerUrl}/capture` }).end();
    }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', `${providerUrl}/v1`);
    vi.stubEnv('AI_API_KEY', 'provider-secret');
    vi.stubEnv('AI_TRY_ON_MODEL', 'gpt-image-2');
    const signedUrl = 'https://r2.example.test/input.png?X-Amz-Signature=private-signature';

    const result = await new AiProviderService().runJob({
      jobId: 'openai-redirect-test', type: 'TRY_ON', inputUrl: signedUrl,
      productImageUrls: ['https://r2.example.test/product.png'],
    });

    expect(result.status).toBe('FAILED');
    expect(providerBody).toContain(signedUrl);
    expect(attackerRequests).toBe(0);
  });

  it('accepts a bounded OpenAI base64 image response over HTTP', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');
    const providerUrl = await listen(createServer(async (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
    }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', `${providerUrl}/v1`);
    vi.stubEnv('AI_API_KEY', 'provider-secret');
    vi.stubEnv('AI_TRY_ON_MODEL', 'gpt-image-2');
    const result = await new AiProviderService().runJob({
      jobId: 'openai-image-test', type: 'TRY_ON', inputUrl: 'https://r2.example.test/input.png',
      productImageUrls: ['https://r2.example.test/product.png'],
    });
    expect(result.status).toBe('COMPLETED');
    if (result.status === 'COMPLETED') expect(result.outputBytes.equals(png)).toBe(true);
  });

  it('falls back to the custom contract after an explicit OpenAI schema rejection', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');
    const bodies: Array<Record<string, unknown>> = [];
    const providerUrl = await listen(createServer(async (request, response) => {
      let text = '';
      for await (const chunk of request) text += chunk.toString();
      const body = JSON.parse(text) as Record<string, unknown>;
      bodies.push(body);
      if (body.images) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: { message: 'inputUrl is required' } }));
      } else {
        response.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
      }
    }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', `${providerUrl}/v1`);
    vi.stubEnv('AI_API_KEY', 'provider-secret');
    vi.stubEnv('AI_TRY_ON_MODEL', 'gpt-image-2');
    const result = await new AiProviderService().runJob({
      jobId: 'fallback-custom', type: 'TRY_ON', inputUrl: 'https://r2.example.test/input.png',
      productImageUrls: ['https://r2.example.test/product.png'],
    });
    expect(result.status).toBe('COMPLETED');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty('images');
    expect(bodies[1]).toHaveProperty('inputUrl');
  });

  it('falls back to OpenAI after the custom contract is explicitly rejected', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');
    const bodies: Array<Record<string, unknown>> = [];
    const providerUrl = await listen(createServer(async (request, response) => {
      let text = '';
      for await (const chunk of request) text += chunk.toString();
      const body = JSON.parse(text) as Record<string, unknown>;
      bodies.push(body);
      if (body.inputUrl) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: { message: 'prompt is required' } }));
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
      }
    }));
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_API_BASE_URL', `${providerUrl}/v1`);
    vi.stubEnv('AI_API_KEY', 'provider-secret');
    vi.stubEnv('AI_TRY_ON_MODEL', '');
    const result = await new AiProviderService().runJob({
      jobId: 'fallback-openai', type: 'TRY_ON', inputUrl: 'https://r2.example.test/input.png',
      productImageUrls: ['https://r2.example.test/product.png'],
    });
    expect(result.status).toBe('COMPLETED');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty('inputUrl');
    expect(bodies[1]).toHaveProperty('images');
  });
});
