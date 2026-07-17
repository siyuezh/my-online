import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const output = 'dist';
const publicFiles = [
  'index.html',
  'archive.html',
  'works.html',
  'projects.html',
  'subpages.css',
  'original-sections.css',
  'parity.css',
  'archive-docs.json',
  'comments.json',
  'content.json',
  'media.json',
  'assets',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const source of publicFiles) {
  const target = join(output, source);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

console.log(`Static site built in ${output}/`);
