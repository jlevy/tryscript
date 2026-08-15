---
close_reason: Implemented bin/binName resolution, cwd default to test file directory
closed_at: 2026-01-03T00:58:18.097Z
created_at: 2026-01-03T00:31:18.521Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.976Z
    original_id: tryscript-97
id: is-01kfams2gjqbqm1rbs5fswffz0
kind: bug
labels: []
parent_id: null
priority: 1
status: closed
title: Fix bin config to resolve binaries
type: is
updated_at: 2026-01-03T00:58:18.097Z
version: 1
---
Bug: binPath is computed in createExecutionContext() but executeCommand() ignores it. Fix: Use binPath to resolve commands or prepend to PATH.
