import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function jobBlock(workflow: string, job: string, nextJob?: string): string {
  const startMarker = `  ${job}:\n`;
  const start = workflow.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Workflow is missing the ${job} job`);
  }

  const end = nextJob === undefined ? workflow.length : workflow.indexOf(`  ${nextJob}:\n`, start);
  if (end === -1) {
    throw new Error(`Workflow is missing the ${nextJob} job after ${job}`);
  }
  return workflow.slice(start, end);
}

describe('privileged workflow isolation', () => {
  it('pins the Markdown formatter runtime in every quality-gated workflow', async () => {
    const [ciWorkflow, releaseWorkflow] = await Promise.all([
      readFile(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8'),
      readFile(join(repositoryRoot, '.github', 'workflows', 'release.yml'), 'utf8'),
    ]);

    for (const workflow of [ciWorkflow, releaseWorkflow]) {
      expect(workflow).toContain(
        'astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9 # v9.0.0',
      );
      expect(workflow).toContain("version: '0.11.28'");
    }
    expect(ciWorkflow).toContain('pnpm ci:quality');
    expect(releaseWorkflow).toContain('pnpm verify');
  });

  it('keeps pull-request code execution out of the write-authorized coverage job', async () => {
    const workflow = await readFile(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    const testJob = jobBlock(workflow, 'test', 'coverage');
    const coverageJob = jobBlock(workflow, 'coverage', 'badges');

    expect(testJob).not.toContain('pull-requests: write');
    expect(testJob).toContain('actions/upload-artifact@');
    expect(coverageJob).toContain('pull-requests: write');
    expect(coverageJob).toContain('actions/download-artifact@');
    expect(coverageJob).toContain('davelosert/vitest-coverage-report-action@');
  });

  it('checks out the tagged compatibility baseline in the test job', async () => {
    const workflow = await readFile(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    const testJob = jobBlock(workflow, 'test', 'coverage');

    expect(testJob).toContain('fetch-depth: 0');
    expect(testJob).toContain('pnpm --filter tryscript test:package');
  });

  it('keeps GitHub release creation out of the npm OIDC job', async () => {
    const workflow = await readFile(
      join(repositoryRoot, '.github', 'workflows', 'release.yml'),
      'utf8',
    );
    const publishJob = jobBlock(workflow, 'publish', 'release');
    const verifyJob = jobBlock(workflow, 'verify', 'publish');
    const releaseJob = jobBlock(workflow, 'release');

    expect(verifyJob).toContain('npm pack');
    expect(verifyJob).not.toContain('pnpm --filter tryscript pack');
    expect(publishJob).toContain('id-token: write');
    expect(publishJob).not.toContain('contents: write');
    expect(publishJob).not.toContain('softprops/action-gh-release@');
    expect(releaseJob).toContain('contents: write');
    expect(releaseJob).not.toContain('id-token: write');
    expect(releaseJob).toContain('softprops/action-gh-release@');
  });
});
