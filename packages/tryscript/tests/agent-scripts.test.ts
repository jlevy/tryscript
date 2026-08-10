import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GH_BOOTSTRAP_SCRIPTS = [
  join(REPOSITORY_ROOT, '.claude', 'scripts', 'ensure-gh-cli.sh'),
  join(REPOSITORY_ROOT, '.codex', 'ensure-gh-cli.sh'),
];
const TBD_EXECUTABLE_SCRIPTS = [
  join(REPOSITORY_ROOT, '.claude', 'scripts', 'tbd-session.sh'),
  join(REPOSITORY_ROOT, '.claude', 'hooks', 'tbd-closing-reminder.sh'),
  join(REPOSITORY_ROOT, '.codex', 'tbd-session.sh'),
  join(REPOSITORY_ROOT, '.codex', 'tbd-closing-reminder.sh'),
];

describe('agent bootstrap scripts', () => {
  it.each(GH_BOOTSTRAP_SCRIPTS)(
    'uses private temporary storage and atomic install: %s',
    async (path) => {
      const script = await readFile(path, 'utf-8');

      expect(script).toContain('mktemp -d');
      expect(script).toContain('trap cleanup EXIT');
      expect(script).not.toMatch(/\/tmp\/gh_/);
      expect(script).toMatch(/mv .*gh/);
    },
  );

  it.each(TBD_EXECUTABLE_SCRIPTS)(
    'uses the reviewed cool-off-eligible tbd pin: %s',
    async (path) => {
      const script = await readFile(path, 'utf-8');

      expect(script).toContain('get-tbd@0.4.1');
      expect(script).not.toMatch(/get-tbd@(latest|0\.4\.2)/);
    },
  );
});
