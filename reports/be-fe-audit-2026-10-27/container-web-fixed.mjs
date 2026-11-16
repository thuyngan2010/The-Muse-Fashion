import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const base = 'http://127.0.0.1:18087';
const deadline = Date.now() + 30000;
for (;;) {
  try {
    const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) break;
  } catch { /* allow the isolated container to start */ }
  assert.ok(Date.now() < deadline, 'Audit web container did not become ready');
  await new Promise(resolve => setTimeout(resolve, 250));
}
const config = await fetch(`${base}/runtime-config.js`);
assert.equal(config.status, 200);
assert.match(await config.text(), /https:\/\/api.example.test\/api\/v1/);
assert.match(config.headers.get('cache-control') ?? '', /no-store/);
const spa = await fetch(`${base}/orders/audit-spa-fallback`);
assert.equal(spa.status, 200);
assert.match(await spa.text(), /<fc-root/);
async function upload(size) {
  const body = new FormData();
  body.append('objectKey', 'tryon/audit/probe.png');
  body.append('file', new Blob([new Uint8Array(size)], { type: 'image/png' }), 'probe.png');
  return (await fetch(`${base}/api/v1/storage/upload`, { method: 'POST', body, signal: AbortSignal.timeout(10000) })).status;
}
// This frontend container deliberately has no API upstream. The small request reaches the
// configured proxy (502); the larger accepted file size also reaches the configured proxy (502).
const smallUploadStatus = await upload(1024);
const largeUploadStatus = await upload(10 * 1024 * 1024);
const oversizedStatus = await upload(12 * 1024 * 1024);
assert.equal(oversizedStatus, 413);
assert.equal(smallUploadStatus, 502);
assert.equal(largeUploadStatus, 502);
const result = { runtimeRemoteApiConfig: 'passed', runtimeConfigNoStore: 'passed', spaFallback: 'passed',
  A19: { smallUploadBytes: 1024, smallUploadStatus, largeUploadBytes: 10 * 1024 * 1024, largeUploadStatus, oversizedStatus } };
writeFileSync(new URL('./container-web-fixed-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
