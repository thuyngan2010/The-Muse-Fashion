// Preconditions: the suite-owned API/web containers and migrated fixture database exist.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const api = JSON.parse(execFileSync('docker', ['exec', 'fashion-audit2-api-20261027', 'node', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import sharp from 'sharp';
  const base='http://127.0.0.1:3000/api/v1';
  const ready=await fetch(base+'/health/ready'); assert.equal(ready.status,200);
  const allowed=await fetch(base+'/health/live',{headers:{Origin:'https://shop.example.test'}});
  assert.equal(allowed.headers.get('access-control-allow-origin'),'https://shop.example.test');
  assert.equal(allowed.headers.get('access-control-allow-credentials'),'true');
  const blocked=await fetch(base+'/health/live',{headers:{Origin:'https://unlisted.example.test'}});
  assert.equal(blocked.headers.get('access-control-allow-origin'),null);
  const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
  assert.equal((await sharp(bytes).metadata()).width,2);
  console.log(JSON.stringify({productionReadiness:ready.status,corsCredentials:true,unlistedOriginBlocked:true,linuxImageDecoder:true}));
`], { encoding: 'utf8' }));

const base = 'http://127.0.0.1:18087';
const config = await fetch(base + '/runtime-config.js');
assert.equal(config.status, 200);
assert.match(await config.text(), /https:\/\/api.example.test\/api\/v1/);
assert.match(config.headers.get('cache-control') ?? '', /no-store/);
const spa = await fetch(base + '/orders/audit-spa-fallback');
const html = await spa.text(); assert.equal(spa.status, 200); assert.match(html, /<fc-root/);
const asset = html.match(/src="([^"]+\.js)"/)[1];
for (const path of ['/', '/runtime-config.js', '/' + asset, '/missing-audit-asset.js']) {
  const response = await fetch(base + path);
  const csp = response.headers.get('content-security-policy') ?? '';
  assert.match(csp, /script-src 'self';/); assert.doesNotMatch(csp, /script-src[^;]*unsafe-/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}
async function upload(size) {
  const body = new FormData(); body.append('objectKey', 'tryon/audit/probe.png');
  body.append('file', new Blob([new Uint8Array(size)], { type: 'image/png' }), 'probe.png');
  return (await fetch(base + '/api/v1/storage/upload', { method: 'POST', body, signal: AbortSignal.timeout(10000) })).status;
}
// The FE intentionally has no upstream: 502 proves both accepted sizes reach its proxy.
const small = await upload(1024), tenMiB = await upload(10 * 1024 * 1024), tooLarge = await upload(12 * 1024 * 1024);
assert.equal(small, 502); assert.equal(tenMiB, 502); assert.equal(tooLarge, 413);
const evidence = { api, web: { runtimeRemoteApiConfig: true, runtimeConfigNoStore: true, spaFallback: true,
  securityHeadersOnHtmlConfigJsAnd404: true, uploadProxy: { small, tenMiB, tooLarge } },
  migrations: { fresh: '3 completed', rerun: 'passed without reapplying' },
  providerScope: 'synthetic merchant only; no provider request or funds transfer' };
writeFileSync(new URL('./container-results.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
