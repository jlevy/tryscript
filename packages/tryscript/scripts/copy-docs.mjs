import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'atomically';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const copies = [
  {
    source: join(repositoryRoot, 'README.md'),
    destination: join(packageRoot, 'README.md'),
  },
  {
    source: join(repositoryRoot, 'docs', 'tryscript-reference.md'),
    destination: join(packageRoot, 'docs', 'tryscript-reference.md'),
  },
];

for (const copy of copies) {
  await mkdir(dirname(copy.destination), { recursive: true });
  await writeFile(copy.destination, await readFile(copy.source));
}
