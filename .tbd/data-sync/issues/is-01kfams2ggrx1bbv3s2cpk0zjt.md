---
type: is
id: is-01kfams2ggrx1bbv3s2cpk0zjt
title: Parser doesn't support extended fences (4+ backticks) for nesting code blocks
kind: bug
status: closed
priority: 3
version: 3
labels: []
dependencies: []
parent_id: null
due_date: null
deferred_until: null
created_at: 2026-01-03T20:13:27.568Z
updated_at: 2026-02-22T00:21:26.055Z
closed_at: 2026-02-22T00:21:26.053Z
close_reason: "Fixed in PR #42: parser supports 4+ backtick extended fences"
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.799Z
    original_id: tryscript-319
---
The parser regex `/```(console|bash)\r?\n([\s\S]*?)```/g` matches exactly 3 backticks and doesn't support extended fences (4+ backticks like ````console).

This prevents using heredocs to create test files inline, because nested code fences are incorrectly parsed as separate test blocks.

**Current behavior:**
- Content inside heredocs containing ```console blocks is parsed as multiple tests
- Cannot nest code blocks properly

**Desired behavior:**
- Support 4+ backticks: ````console matches ````
- Inner 3-backtick fences don't close outer 4-backtick fences

**Workaround:**
- Use fixture files instead of inline heredocs

**Location:** packages/tryscript/src/lib/parser.ts:8
