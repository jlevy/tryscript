---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:23:17.836Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:42.003Z
    original_id: tryscript-ce9
id: is-01kfams2gjmm76fcc3r0kyhsc7
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Implement sandbox logic in runner
type: is
updated_at: 2026-01-03T06:50:53.766Z
version: 1
---
Implement sandbox directory handling in createExecutionContext.

**File:** packages/tryscript/src/lib/runner.ts

**Logic:**
- `sandbox: false` (default) → cwd = testDir or config.cwd
- `sandbox: true` → cwd = empty tempDir
- `sandbox: './path'` → copy path to tempDir, cwd = tempDir

**Changes:**
- Add `sandbox: boolean` to ExecutionContext
- Update createExecutionContext() with sandbox logic
- Fixtures only copy when sandbox is enabled
