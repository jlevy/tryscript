---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:21:47.735Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:42.013Z
    original_id: tryscript-h9c
id: is-01kfams2gjkrk31j08pwepvge8
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Remove vars from types and config
type: is
updated_at: 2026-01-03T06:50:53.770Z
version: 1
---
Remove deprecated vars option.

**Files:**
- packages/tryscript/src/lib/types.ts: Remove vars from TestConfigSchema
- packages/tryscript/src/lib/config.ts: Remove vars from TryscriptConfig, remove vars merging in mergeConfig()

**Changes:**
- Remove `vars` field and description
- Remove `vars: { ...base.vars, ...frontmatter.vars }` from mergeConfig()
