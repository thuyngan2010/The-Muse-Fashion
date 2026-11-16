import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const docsRoot = join(root, 'docs');
const errors = [];
const markdownFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.md')) markdownFiles.push(path);
  }
}

walk(docsRoot);
for (const rootFile of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
  markdownFiles.push(join(root, rootFile));
}

for (const artifact of ['package-lock.json', 'Dockerfile.api', 'Dockerfile.web', 'compose.deploy.yaml', 'vercel.json', '.dockerignore', '.gitattributes']) {
  if (!existsSync(join(root, artifact))) errors.push(`Missing portable deployment artifact: ${artifact}`);
}
for (const artifact of ['deploy/nginx/default.conf.template', 'deploy/nginx/40-runtime-config.sh', 'deploy/.env.example']) {
  if (!existsSync(join(root, artifact))) errors.push(`Missing deployment adapter: ${artifact}`);
}

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8');
  const links = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
  for (const match of links) {
    const rawTarget = match[1].trim();
    if (/^(https?:|mailto:|#)/i.test(rawTarget)) continue;
    const target = decodeURIComponent(rawTarget.split('#')[0]);
    if (!target) continue;
    const absolute = resolve(dirname(file), target);
    if (!existsSync(absolute)) errors.push(`${file}: missing local link ${rawTarget}`);
  }
}

const ucDirectory = join(docsRoot, 'use-cases');
const ucFiles = readdirSync(ucDirectory).filter((name) => /^UC\d{2}\.md$/.test(name)).sort();
if (ucFiles.length !== 37) errors.push(`Expected 37 UC files, found ${ucFiles.length}`);

const srs = readFileSync(join(docsRoot, '01-SRS.md'), 'utf8');
const ucIndex = readFileSync(join(ucDirectory, 'README.md'), 'utf8');
const docsIndex = readFileSync(join(docsRoot, '00-INDEX.md'), 'utf8');
for (const artifact of [
  '20-UI-FLOWS.md',
  '21-DATABASE-MIGRATIONS.md',
  '22-EVENT-CONTRACTS.md',
  '23-DATA-PRIVACY.md',
  '24-OPERATIONS-RUNBOOK.md',
  'openapi.yaml',
  'test-cases/README.md',
]) {
  if (!existsSync(join(docsRoot, artifact))) errors.push(`Missing required documentation artifact: ${artifact}`);
  if (!docsIndex.includes(`(${artifact})`)) errors.push(`Docs index: missing ${artifact}`);
}
for (const name of readdirSync(docsRoot).filter((entry) => /^\d{2}-.+\.md$/.test(entry) && entry !== '00-INDEX.md')) {
  if (!docsIndex.includes(`(${name})`)) errors.push(`Docs index: missing ${name}`);
}
const frRows = [...srs.matchAll(/\| FR-(\d{2}) \|/g)];
if (frRows.length !== 37) errors.push(`Expected 37 FR rows in SRS, found ${frRows.length}`);
for (let number = 1; number <= 37; number += 1) {
  const id = String(number).padStart(2, '0');
  const uc = `UC${id}`;
  const fr = `FR-${id}`;
  const file = join(ucDirectory, `${uc}.md`);
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  if (!content.includes(`| Mã UC | **${uc}** |`)) errors.push(`${file}: missing canonical UC id`);
  if (!content.includes(fr)) errors.push(`${file}: missing ${fr}`);
  if (!content.includes(`AC-${uc}-04`)) errors.push(`${file}: missing business acceptance criterion`);
  if (!srs.includes(`| ${fr} | [${uc}](use-cases/${uc}.md)`)) errors.push(`SRS: missing ${fr} -> ${uc}`);
  if (!ucIndex.includes(`| [${uc}](${uc}.md)`)) errors.push(`UC index: missing ${uc}`);
}

const decisionLog = readFileSync(join(docsRoot, '11-DECISION-LOG.md'), 'utf8');
if (/\|\s*(OPEN|PARTIAL)\s*(?:·[^|]*)?\|/.test(decisionLog)) {
  errors.push('Decision Log: baseline contains OPEN or PARTIAL policy');
}
for (let number = 1; number <= 12; number += 1) {
  const id = `DEC-${String(number).padStart(2, '0')}`;
  if (!decisionLog.includes(`| ${id} |`)) errors.push(`Decision Log: missing ${id}`);
}

const openapi = readFileSync(join(docsRoot, 'openapi.yaml'), 'utf8');
for (const marker of ['openapi: 3.1.0', '/auth/refresh:', '/orders:', '/webhooks/payment/gpmpay:', 'Idempotency-Key']) {
  if (!openapi.includes(marker)) errors.push(`OpenAPI: missing marker ${marker}`);
}
for (const placeholder of ['GenericObject', 'GenericList', 'GenericWrite']) {
  if (openapi.includes(placeholder)) errors.push(`OpenAPI: unresolved placeholder ${placeholder}`);
}
const operationIds = [...openapi.matchAll(/^\s+operationId:\s+([A-Za-z0-9_]+)\s*$/gm)].map((match) => match[1]);
if (operationIds.length < 60) errors.push(`OpenAPI: expected at least 60 operations, found ${operationIds.length}`);
if (new Set(operationIds).size !== operationIds.length) errors.push('OpenAPI: duplicate operationId');
if (openapi.includes('x-implementation-status: target')) errors.push('OpenAPI: target route exists without a backend scaffold');

const apiModulesRoot = join(root, 'apps', 'api', 'src', 'modules');
for (const moduleName of ['admin', 'ai', 'auth', 'catalog', 'commerce', 'community', 'health', 'lookbooks', 'mail', 'notifications', 'operations', 'payments', 'storage', 'users']) {
  if (!existsSync(join(apiModulesRoot, moduleName))) errors.push(`Backend scaffold: missing module ${moduleName}`);
}
for (const artifact of [
  'common/api-exception.filter.ts', 'common/request-id.middleware.ts',
  'modules/commerce/commerce.schemas.ts', 'modules/payments/payment.schemas.ts',
  'modules/operations/outbox-event.schema.ts',
]) {
  if (!existsSync(join(root, 'apps', 'api', 'src', artifact))) errors.push(`Backend scaffold: missing ${artifact}`);
}

const executableTests = readFileSync(join(docsRoot, 'test-cases', 'README.md'), 'utf8');
const testCaseIds = [...executableTests.matchAll(/\| (TC-[A-Z0-9-]+) \|/g)].map((match) => match[1]);
if (testCaseIds.length < 35) errors.push(`Executable test catalog: expected at least 35 cases, found ${testCaseIds.length}`);
if (new Set(testCaseIds).size !== testCaseIds.length) errors.push('Executable test catalog: duplicate test case ID');

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (packageJson.scripts?.['check:docs'] !== 'node scripts/check-docs.mjs') {
  errors.push('package.json: check:docs must run scripts/check-docs.mjs');
}
if (!packageJson.scripts?.['build:web:prod'] || !packageJson.scripts?.['build:web:vercel']) {
  errors.push('package.json: missing portable frontend build scripts');
}
const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
if (!ci.includes('npm run check:docs')) errors.push('CI: missing npm run check:docs');

const envExample = readFileSync(join(root, 'apps', 'api', '.env.example'), 'utf8');
for (const variable of [
  'MONGODB_URI',
  'JWT_SECRET',
  'SENDGRID_API_KEY',
  'R2_ACCOUNT_ID',
  'GPMPAY_WEBHOOK_SECRET',
  'GPMPAY_BANK_BIN',
  'GPMPAY_ACCOUNT_NUMBER',
  'GPMPAY_ACCOUNT_NAME',
]) {
  if (!envExample.includes(`${variable}=`)) errors.push(`.env.example: missing ${variable}`);
}

const staleTerms = [
  'Payment Sandbox',
  '/webhooks/payment/:provider',
  'npm run export:docs',
  'scripts/check_docs.py',
  'PENDING -> PROCESSING -> SUCCEEDED',
];
for (const term of staleTerms) {
  for (const file of markdownFiles) {
    if (readFileSync(file, 'utf8').includes(term)) errors.push(`${file}: stale term "${term}"`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Documentation checks passed: ${markdownFiles.length} Markdown files, 37 UC files.`);
}
