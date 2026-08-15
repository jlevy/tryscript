import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TBD_CONFIG = join(REPOSITORY_ROOT, '.tbd', 'config.yml');
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

  it('keeps the exact tbd fallback version in config', async () => {
    const config = await readFile(TBD_CONFIG, 'utf-8');
    const currentVersion = /^tbd_version:\s*(\S+)\s*$/m.exec(config)?.[1];
    const fallbackVersion = /^tbd_fallback_version:\s*(\S+)\s*$/m.exec(config)?.[1];

    expect(currentVersion).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
    expect(fallbackVersion).toBe(currentVersion);
  });

  it.each(TBD_EXECUTABLE_SCRIPTS)('uses the config-pinned tbd fallback: %s', async (path) => {
    const script = await readFile(path, 'utf-8');

    expect(script).toContain('tbd_fallback_version');
    expect(script).toContain('get-tbd@$configured_fallback_version');
    expect(script).not.toMatch(/get-tbd@(latest|\d+\.\d+\.\d+)/);
  });
});
