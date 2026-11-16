import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const errors = [];

function keys(path) {
  const content = read(path);
  const names = [...content.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
  for (const name of names) {
    if (names.filter((item) => item === name).length > 1) errors.push(`${path}: duplicate ${name}`);
  }
  return new Set(names);
}

function requireKeys(examplePath, names) {
  const example = keys(examplePath);
  for (const name of names) {
    if (!example.has(name)) errors.push(`${examplePath}: missing ${name}`);
  }
}

function sourceFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|mjs)$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const apiNames = new Set();
for (const path of sourceFiles('apps/api/src')) {
  const content = read(path);
  for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) apiNames.add(match[1]);
  for (const match of content.matchAll(/AppConfig\.(?:require|optional|boolean|csv)\('([A-Z][A-Z0-9_]*)'/g)) apiNames.add(match[1]);
}
requireKeys('apps/api/.env.example', apiNames);

const webBuildNames = [...read('scripts/write-web-runtime-config.mjs').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)]
  .map((match) => match[1]);
requireKeys('apps/web/.env.example', webBuildNames);

const composeNames = ['compose.deploy.yaml', 'compose.web.yaml', 'compose.api.yaml'].flatMap((path) =>
  [...read(path).matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::[-?][^}]*)?\}/g)].map((match) => match[1]));
requireKeys('deploy/.env.example', composeNames);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Environment examples cover ${apiNames.size} API, ${webBuildNames.length} web build, and ${composeNames.length} Compose references.`);
}
