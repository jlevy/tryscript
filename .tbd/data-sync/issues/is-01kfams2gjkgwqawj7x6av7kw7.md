---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:24:28.967Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:42.022Z
    original_id: tryscript-m74
id: is-01kfams2gjkgwqawj7x6av7kw7
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Update golden tests for sandbox
type: is
updated_at: 2026-01-03T06:50:53.772Z
version: 1
---
Update golden test files to use new syntax.

**Directory:** packages/tryscript/tests/golden/

**Changes:**
- Update any tests using cwd: temp to use sandbox: true
- Remove tests that rely on bin, binName, vars
- Add golden test for sandbox: true
- Add golden test for sandbox: ./fixtures
