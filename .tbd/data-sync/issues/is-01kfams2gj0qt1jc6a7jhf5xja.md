---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:24:09.661Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:42.008Z
    original_id: tryscript-d1o
id: is-01kfams2gj0qt1jc6a7jhf5xja
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Update runner tests for sandbox
type: is
updated_at: 2026-01-03T06:50:53.768Z
version: 1
---
Update runner.test.ts for new sandbox behavior.

**File:** packages/tryscript/tests/runner.test.ts

**Changes:**
- Remove tests for expandVars(), resolveCommand()
- Remove tests using bin, binName, vars
- Add tests for sandbox: true (empty temp)
- Add tests for sandbox: './path' (copy to temp)
- Update fixture tests to require sandbox
