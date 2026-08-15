---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:21:28.987Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.940Z
    original_id: tryscript-6cu
id: is-01kfams2gh94jp47g3xprhcf9c
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Remove bin/binName from types and config
type: is
updated_at: 2026-01-03T06:50:53.756Z
version: 1
---
Remove deprecated bin and binName options.

**Files:**
- packages/tryscript/src/lib/types.ts: Remove from TestConfigSchema
- packages/tryscript/src/lib/config.ts: Remove from TryscriptConfig interface

**Changes:**
- Remove `bin` field and description
- Remove `binName` field and description
