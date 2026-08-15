---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:22:06.587Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.796Z
    original_id: tryscript-318
id: is-01kfams2ggg16y68kbw1f1jb2q
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Remove expandVars and resolveCommand from runner
type: is
updated_at: 2026-01-03T06:50:53.754Z
version: 1
---
Remove variable expansion and binName command resolution from runner.

**File:** packages/tryscript/src/lib/runner.ts

**Changes:**
- Remove `expandVars()` function
- Remove `resolveCommand()` function  
- Remove `binPath`, `binName`, `vars` from ExecutionContext
- Remove expandVars calls in runBlock() and hooks
- Remove resolveCommand call in executeCommand()
