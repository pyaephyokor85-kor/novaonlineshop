import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This Expo static deployment uses one Vercel Function per API entry file.
const root = fileURLToPath(new URL('../', import.meta.url));
function entries(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.')) return [];
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return entries(filename);
    return /\.(?:[cm]?js|[cm]?ts|py|go|rb)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path.relative(root, filename)] : [];
  });
}
const functions = entries(path.join(root, 'api'));
console.log(`Vercel Hobby function check: ${functions.length}/12`);
if (functions.length > 12) {
  console.error(`Too many API functions for Hobby. Consolidate entrypoints before deploying:\n${functions.join('\n')}`);
  process.exitCode = 1;
}
