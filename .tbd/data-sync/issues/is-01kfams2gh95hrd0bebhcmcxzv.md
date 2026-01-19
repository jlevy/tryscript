---
close_reason: Closed
closed_at: 2026-01-16T23:56:46.246Z
created_at: 2026-01-16T23:53:07.902Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.885Z
    original_id: tryscript-337
id: is-01kfams2gh95hrd0bebhcmcxzv
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Create test fixtures for path option (bin directory with scripts)
type: is
updated_at: 2026-01-16T23:56:46.246Z
version: 1
---
Create cli-fixtures/bin/ directory with test scripts:
- hello-world: simple executable that echoes a message
- version-check: script that prints a version

These will be used by golden tests to verify path option works.
