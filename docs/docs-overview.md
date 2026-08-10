# Documentation Map

Use this map to find the shortest path to the documentation for a task.
The [README](../README.md) introduces the product; this file covers contributor,
architecture, planning, and reference material.

## Product Documentation

- [tryscript reference](tryscript-reference.md): syntax, configuration, commands, and
  coverage behavior for CLI users
- [Language architecture](project/architecture/current/arch-tryscript-language.md):
  parser, execution, matching, and rewrite design for maintainers

The build copies the root README and the tryscript reference into the published package.
Edit their source files above, not the ignored copies under `packages/tryscript/`.
Flowmark owns formatting for the 18 maintained documents selected by `.flowmarkignore`;
Prettier deliberately excludes Markdown so the formatters cannot churn each other’s
output.

## Contributor Documentation

- [Development guide](development.md): prerequisites, repository commands, tests, hooks,
  and tbd issue tracking
- [Supply-chain policy](../SUPPLY-CHAIN-SECURITY.md): dependency, installer, and
  repository trust requirements
- [Commit conventions](commit-conventions.md): commit types and message format
- [Publishing runbook](publishing.md): versioning, tag creation, npm trusted publishing,
  and release verification

Start with the development guide before changing code.

## Project Records

Project-specific material follows the Speculate directory structure:

- `project/specs/active/`: work that is currently in progress
- `project/specs/done/`: completed plans and validation records retained as history
- `project/specs/future/`: accepted work that has not started
- `project/specs/paused/`: work intentionally paused
- `project/architecture/current/`: maintained descriptions of the current design
- `project/research/current/`: project-specific technical investigations

Active work is tracked in tbd beads.
Each active workstream should point to one governing spec; completed specs belong in
`done/` even when their original checklists are retained for historical context.

## Shared Reference Material

`general/` contains the cross-project rules, shortcuts, templates, and research snapshot
inherited from Speculate.
These files preserve their upstream ownership and cadence.
Repository instructions in `AGENTS.md` and guidance loaded from the installed tbd
version take precedence when a checked-in snapshot names an older tool or workflow.

The main groups are:

- `general/agent-rules/`: language and engineering rules
- `general/agent-guidelines/`: testing and release guidance
- `general/agent-shortcuts/`: reusable workflow prompts
- `general/agent-setup/`: tool setup references
- `general/research/current/`: point-in-time research briefs

## Executable Markdown

Files ending in `.tryscript.md` under `packages/tryscript/tests/` are executable tests,
not general documentation.
Their prose and expected terminal output are part of the test contract.
Run `pnpm test` after editing them.
They are excluded from Flowmark because their bytes are executable fixtures.
The example in [`examples/`](../examples/my-cli.tryscript.md) is both user documentation
and an integration-test input.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
