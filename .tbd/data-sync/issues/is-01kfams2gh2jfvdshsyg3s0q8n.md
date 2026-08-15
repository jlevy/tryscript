---
close_reason: Added TRYSCRIPT_PACKAGE_ROOT env var with golden tests
closed_at: 2026-01-17T00:17:02.372Z
created_at: 2026-01-16T23:46:02.438Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.875Z
    original_id: tryscript-335
id: is-01kfams2gh2jfvdshsyg3s0q8n
kind: task
labels: []
parent_id: null
priority: 2
status: closed
title: "Phase III: Add TRYSCRIPT_PACKAGE_ROOT environment variable"
type: is
updated_at: 2026-01-17T00:17:02.372Z
version: 1
---
In runner.ts createExecutionContext():
- Use findPackageJson() to find nearest package.json
- Set TRYSCRIPT_PACKAGE_ROOT to directory containing package.json (if found)
- Add test to verify the variable is set correctly
