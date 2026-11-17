/**
 * The audit exceptions in pnpm-workspace.yaml cover development tooling only. These checks
 * keep every excepted package out of the published package's runtime dependency closure, so
 * an exception can never hide an advisory that reaches tryscript's users.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(packageRoot, '..', '..');

/** Each advisory `pnpm audit` ignores, with the package it was reported against. */
const DEV_ONLY_AUDIT_EXCEPTIONS: Record<string, string> = {
  'GHSA-fc5q-39xc-vjpf': 'picomatch',
};

interface Snapshot {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface Lockfile {
  importers: Record<string, { dependencies?: Record<string, { version: string }> }>;
  snapshots: Record<string, Snapshot | null>;
}

/** Names of every package the published package's dependencies install. */
function runtimeClosure(lockfile: Lockfile): Set<string> {
  const names = new Set<string>();
  const seen = new Set<string>();
  const pending = Object.entries(lockfile.importers['packages/tryscript']?.dependencies ?? {}).map(
    ([name, { version }]) => [name, version] as const,
  );
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [name, version] = next;
    const key = `${name}@${version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.add(name);
    const snapshot = lockfile.snapshots[key];
    expect(snapshot, `lockfile snapshot for ${key}`).toBeDefined();
    for (const deps of [snapshot?.dependencies, snapshot?.optionalDependencies]) {
      pending.push(...Object.entries(deps ?? {}));
    }
  }
  return names;
}

describe('runtime dependencies', () => {
  const lockfile = parse(readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')) as Lockfile;
  const workspace = parse(readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')) as {
    auditConfig?: { ignoreGhsas?: string[] };
  };
  const closure = runtimeClosure(lockfile);

  it('lists every audit exception with the package it applies to', () => {
    expect([...(workspace.auditConfig?.ignoreGhsas ?? [])].sort()).toEqual(
      Object.keys(DEV_ONLY_AUDIT_EXCEPTIONS).sort(),
    );
  });

  it('reach no package an audit exception covers', () => {
    expect(closure.has('zod')).toBe(true);
    for (const [advisory, name] of Object.entries(DEV_ONLY_AUDIT_EXCEPTIONS)) {
      expect(closure.has(name), `${name} (${advisory}) in the runtime closure`).toBe(false);
    }
  });

  it('match the published manifest', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(
      Object.keys(lockfile.importers['packages/tryscript']?.dependencies ?? {}).sort(),
    ).toEqual(Object.keys(manifest.dependencies).sort());
  });
});
