/** Local QA provider. Returns a fixed fixture image; never performs inference or fetches input URLs. */
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const MOCK_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64',
);

export function createMockAiProvider(options: {
  apiKey?: string; mode?: 'success' | 'failure'; delayMs?: number;
} = {}) {
  const key = options.apiKey ?? 'local-ai-mock';
  const jobs = new Map<string, { readyAt: number; expiresAt: number }>();
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    const now = Date.now();
    for (const [id, job] of jobs) if (job.expiresAt < now) jobs.delete(id);
    if (req.method === 'GET' && path === '/health') return json(res, 200, { mock: true, mode: options.mode ?? 'success' });
    if (req.headers.authorization !== `Bearer ${key}`) return json(res, 401, { message: 'Invalid mock API key' });
    if (req.method === 'POST' && path === '/v1/images/edits') {
      if (!req.headers['content-type']?.includes('application/json')) {
        return json(res, 400, { message: 'JSON inputUrl, productImageUrls and jobId are required' });
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 64 * 1024) {
          if (!res.writableEnded) json(res, 413, { message: 'Mock request too large' });
        } else chunks.push(chunk);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return json(res, 400, { message: 'Invalid JSON' }); }
        if (!body || typeof body.jobId !== 'string' || !['TRY_ON', 'MIX_MATCH'].includes(body.type)
          || typeof body.inputUrl !== 'string' || !Array.isArray(body.productImageUrls)) {
          return json(res, 400, { message: 'inputUrl, productImageUrls, jobId and type are required' });
        }
        if (jobs.size >= 1000) return json(res, 429, { message: 'Mock job limit reached' });
        const id = randomUUID();
        jobs.set(id, { readyAt: now + (options.delayMs ?? 1000), expiresAt: now + 10 * 60_000 });
        res.setHeader('Location', `/v1/images/edits/${id}`);
        json(res, 202, { id, status: 'processing', mock: true });
      });
      return;
    }
    if (req.method === 'GET' && path.startsWith('/v1/images/edits/')) {
      const job = jobs.get(path.slice('/v1/images/edits/'.length));
      if (!job) return json(res, 404, { message: 'Mock job not found' });
      if (now < job.readyAt) return json(res, 200, { status: 'processing', mock: true });
      if (options.mode === 'failure') return json(res, 200, { status: 'failed', mock: true });
      return json(res, 200, { status: 'completed', mock: true, data: [{ b64_json: MOCK_IMAGE.toString('base64') }] });
    }
    json(res, 404, { message: 'Mock endpoint not found' });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === 'production') throw new Error('AI mock is only available for local QA');
  const port = Number(process.env.AI_MOCK_PORT ?? 3669);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid AI_MOCK_PORT');
  const mode = process.env.AI_MOCK_MODE ?? 'success';
  if (!['success', 'failure'].includes(mode)) throw new Error('AI_MOCK_MODE must be success or failure');
  const server = createMockAiProvider({ mode: mode as 'success' | 'failure', apiKey: process.env.AI_MOCK_API_KEY });
  server.listen(port, '127.0.0.1', () => console.log(`QA mock AI provider: http://127.0.0.1:${port}/v1 (${mode}; fixed fixture image)`));
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  const stop = () => server.close(() => process.exit());
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
