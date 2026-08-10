import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

export interface MarkdownDisplayOptions {
  raw?: boolean;
  color?: boolean;
}

interface MarkdownFence {
  character: string;
  length: number;
}

/** Resolve a tracked source document or its copy inside an installed package. */
export function resolveMarkdownDocumentPath(
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

function openingFence(line: string): MarkdownFence | undefined {
  const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
  return marker === undefined ? undefined : { character: marker[0]!, length: marker.length };
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const marker = /^ {0,3}(`{3,}|~{3,})\s*$/u.exec(line)?.[1];
  if (!marker?.startsWith(fence.character)) {
    return false;
  }
  return marker.length >= fence.length;
}

/** Apply lightweight terminal styling without misreading nested Markdown fences. */
export function formatMarkdown(content: string, useColors: boolean): string {
  if (!useColors) {
    return content;
  }

  const colors = pc.createColors(true);
  const formatted: string[] = [];
  let fence: MarkdownFence | undefined;

  for (const line of content.split('\n')) {
    if (fence !== undefined) {
      formatted.push(colors.dim(line));
      if (closesFence(line, fence)) {
        fence = undefined;
      }
      continue;
    }

    const nextFence = openingFence(line);
    if (nextFence !== undefined) {
      fence = nextFence;
      formatted.push(colors.dim(line));
      continue;
    }

    if (line.startsWith('# ')) {
      formatted.push(colors.bold(colors.cyan(line)));
      continue;
    }
    if (line.startsWith('## ')) {
      formatted.push(colors.bold(colors.blue(line)));
      continue;
    }
    if (line.startsWith('### ')) {
      formatted.push(colors.bold(line));
      continue;
    }

    let formattedLine = line.replace(/`([^`]+)`/gu, (_match, code: string) => {
      return colors.yellow(code);
    });
    formattedLine = formattedLine.replace(/\*\*([^*]+)\*\*/gu, (_match, text: string) => {
      return colors.bold(text);
    });
    formattedLine = formattedLine.replace(
      /\[([^\]]+)\]\(([^)]+)\)/gu,
      (_match, text: string, url: string) => {
        return `${colors.cyan(text)} ${colors.dim(`(${url})`)}`;
      },
    );
    formatted.push(formattedLine);
  }

  return formatted.join('\n');
}

/** Raw output always wins; otherwise an explicit color choice overrides TTY detection. */
export function shouldColorizeMarkdown(
  options: MarkdownDisplayOptions,
  interactive: boolean = process.stdout.isTTY,
): boolean {
  return options.raw !== true && (options.color ?? interactive);
}

/** Read, render, and print a Markdown document with consistent CLI failures. */
export function showMarkdownDocument(
  path: string,
  label: string,
  options: MarkdownDisplayOptions,
): void {
  try {
    const content = readFileSync(path, 'utf8');
    process.stdout.write(formatMarkdown(content, shouldColorizeMarkdown(options)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`Error: Failed to load ${label} from ${path}: ${message}`));
    process.exit(1);
  }
}
