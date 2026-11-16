import 'reflect-metadata';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { RequestMethod } from '@nestjs/common';

const root = path.resolve('apps/api/dist/modules');
const files = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(absolute);
    else if (entry.name.endsWith('.controller.js')) files.push(absolute);
  }
}
await visit(root);

function parts(value) {
  return Array.isArray(value) ? value : [value ?? ''];
}
function routePath(controllerPath, methodPath) {
  return ('/' + [controllerPath, methodPath].filter(Boolean).join('/'))
    .replace(/\/+/g, '/').replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/$/, '') || '/';
}
const methodNames = new Map([
  [RequestMethod.GET, 'get'], [RequestMethod.POST, 'post'], [RequestMethod.PUT, 'put'],
  [RequestMethod.PATCH, 'patch'], [RequestMethod.DELETE, 'delete'],
]);
const codeRoutes = new Set();
const duplicates = [];
for (const file of files) {
  const exports = await import(pathToFileURL(file).href);
  for (const value of Object.values(exports)) {
    if (typeof value !== 'function') continue;
    const controllerPaths = Reflect.getMetadata('path', value);
    if (controllerPaths === undefined) continue;
    for (const name of Object.getOwnPropertyNames(value.prototype)) {
      if (name === 'constructor') continue;
      const handler = value.prototype[name];
      const verb = methodNames.get(Reflect.getMetadata('method', handler));
      if (!verb) continue;
      for (const controllerPath of parts(controllerPaths)) for (const methodPath of parts(Reflect.getMetadata('path', handler))) {
        const key = `${verb.toUpperCase()} ${routePath(controllerPath, methodPath)}`;
        if (codeRoutes.has(key)) duplicates.push(key);
        codeRoutes.add(key);
      }
    }
  }
}

const yaml = await readFile('docs/openapi.yaml', 'utf8');
const specRoutes = new Set();
let currentPath;
for (const line of yaml.split(/\r?\n/)) {
  const pathMatch = /^  (\/[^:]*):\s*$/.exec(line);
  if (pathMatch) { currentPath = pathMatch[1]; continue; }
  const methodMatch = /^    (get|post|put|patch|delete):\s*$/.exec(line);
  if (currentPath && methodMatch) specRoutes.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
}
const missing = [...codeRoutes].filter((route) => !specRoutes.has(route));
const stale = [...specRoutes].filter((route) => !codeRoutes.has(route));
if (missing.length || stale.length || duplicates.length) {
  if (missing.length) process.stderr.write(`Missing from OpenAPI:\n${missing.sort().join('\n')}\n`);
  if (stale.length) process.stderr.write(`No controller route:\n${stale.sort().join('\n')}\n`);
  if (duplicates.length) process.stderr.write(`Duplicate controller routes:\n${duplicates.sort().join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`OpenAPI coverage verified: ${codeRoutes.size} controller routes.\n`);
}
