# npm Development Guide Template

> Copy this template into an npm-based project and replace every bracketed field.
> Delete commands and sections that the project does not implement.

## Prerequisites

- **Node.js:** `[supported version range]`
- **npm:** `[pinned or minimum version]`
- **uv:** `[pinned version used to run the exact flowmark-rs release]`
- **Platform tools:** `[compiler, database, container runtime, or none]`

Explain why the selected runtime is required and link its support policy.

## Setup

```bash
npm ci
cp .env.example .env
npm run hooks:install
```

Document each step that is not self-explanatory.
State where non-secret example values come from and how a contributor obtains required
secrets; never place credentials in this file.

## Project Structure

```text
[project]/
  src/       # [owned source]
  test/      # [unit and integration tests]
  docs/      # [maintained documentation]
```

Keep this tree short.
Link a maintained architecture document when component ownership or runtime boundaries
need more detail.

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build production artifacts |
| `npm run format` | Format code, data files, and maintained Markdown |
| `npm run format:check` | Verify Prettier and Flowmark formatting without changes |
| `npm run format:docs` | Format maintained Markdown with the pinned Flowmark release |
| `npm run lint` | Check source without changing it |
| `npm run typecheck` | Check static types |
| `npm test` | Run the default test suite |
| `npm run test:coverage` | Run tests and write coverage reports |
| `npm run verify` | Run the release-quality gate |

Use the actual script names from `package.json`. If a command changes files, say so in
its description.

## Development Workflow

1. Start from a clean branch based on the current default branch.
2. Make one scoped change and add regression coverage.
3. Run the focused tests while iterating.
4. Run `npm run verify` before committing.
5. Review generated files and the complete diff before pushing.

## Continuous Integration

List the CI gates in execution order and explain any check that cannot run locally.
The local verification command should cover the same release blockers whenever
practical.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
