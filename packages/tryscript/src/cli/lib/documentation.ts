import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

/** Resolve a tracked source document or its copy inside an installed package. */
export function resolveDocumentationPath(
  moduleUrl: string,
  relativePath: readonly string[],
): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  if (basename(moduleDirectory) === 'dist') {
    return join(dirname(moduleDirectory), ...relativePath);
  }

  const packageRoot = dirname(dirname(dirname(moduleDirectory)));
  const workspaceRoot = dirname(dirname(packageRoot));
  return join(workspaceRoot, ...relativePath);
}

/** Print a tracked or packaged document without changing its bytes. */
export function printDocumentation(path: string, label: string): void {
  try {
    process.stdout.write(readFileSync(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`Error: Failed to load ${label} from ${path}: ${message}`));
    process.exit(1);
  }
}
