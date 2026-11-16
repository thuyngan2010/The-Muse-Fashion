import { existsSync, readFileSync } from 'node:fs';

const apiRoot = new URL('../apps/api/', import.meta.url);
const { scripts } = JSON.parse(readFileSync(new URL('package.json', apiRoot), 'utf8'));
const missing = [];

for (const [name, command] of Object.entries(scripts)) {
  for (const target of command.matchAll(/\bsrc\/scripts\/[\w-]+\.ts\b/g)) {
    if (!existsSync(new URL(target[0], apiRoot))) missing.push(`${name}: ${target[0]}`);
  }
}

if (missing.length) {
  console.error(`API script target files are missing:\n${missing.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('API script targets exist.');
}
