---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:22:39.322Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.953Z
    original_id: tryscript-8oc
id: is-01kfams2ght33psw0w0b2fzk42
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: "Remove cwd: temp magic keyword"
type: is
updated_at: 2026-01-03T06:50:53.760Z
version: 1
---
Remove magic 'temp' keyword handling from resolveCwd.

**File:** packages/tryscript/src/lib/runner.ts

**Changes in resolveCwd():**
- Remove `if (cwdConfig === 'temp') { return tempDir; }`
- cwd should only handle '.' (default) or relative/absolute paths
