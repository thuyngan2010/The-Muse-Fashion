import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'fashion-web-config-'));
const envFile = join(root, 'apps/web/.env');
const output = join(root, 'apps/web/public/runtime-config.js');
before(() => {
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'apps/web/public'), { recursive: true });
  copyFileSync(new URL('./write-web-runtime-config.mjs', import.meta.url), join(root, 'scripts/config.mjs'));
});
after(() => {
  assert.equal(dirname(root), resolve(tmpdir()));
  rmSync(root, { recursive: true, force: true });
});

function run(value, args = []) {
  const env = { ...process.env };
  delete env.PUBLIC_API_BASE_URL;
  if (value !== undefined) env.PUBLIC_API_BASE_URL = value;
  return spawnSync(process.execPath, [join(root, 'scripts/config.mjs'), ...args], { env, encoding: 'utf8' });
}

test('defaults to the same-origin API without a local env file', () => {
  assert.equal(run().status, 0);
  assert.match(readFileSync(output, 'utf8'), /"apiBaseUrl":"\/api\/v1"/);
});

test('requires explicit configuration for static deployment with --require', () => {
  const result = run(undefined, ['--require']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PUBLIC_API_BASE_URL is required/);
});

test('loads apps/web/.env independently of the working directory', () => {
  writeFileSync(envFile, 'PUBLIC_API_BASE_URL=https://api.example.com/api/v1///\n');
  assert.equal(run().status, 0);
  assert.match(readFileSync(output, 'utf8'), /"apiBaseUrl":"https:\/\/api.example.com\/api\/v1"/);
});

test('prefers hosting environment variables over the local env file', () => {
  assert.equal(run('http://192.0.2.10:3000/api/v1').status, 0);
  assert.match(readFileSync(output, 'utf8'), /"apiBaseUrl":"http:\/\/192.0.2.10:3000\/api\/v1"/);
});

test('rejects protocol-relative URLs, credentials and query/fragment values', () => {
  for (const value of ['//evil.example/api', 'https://user:pass@api.example.com/api/v1',
    'https://api.example.com/api/v1?token=secret', 'https://api.example.com/api/v1#fragment']) {
    assert.notEqual(run(value).status, 0, value);
  }
});
