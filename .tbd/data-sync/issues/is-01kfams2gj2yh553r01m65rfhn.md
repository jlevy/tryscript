---
close_reason: Implemented bin/binName resolution, cwd default to test file directory
closed_at: 2026-01-03T00:58:18.097Z
created_at: 2026-01-03T00:31:26.749Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.987Z
    original_id: tryscript-99
id: is-01kfams2gj2yh553r01m65rfhn
kind: feature
labels: []
parent_id: null
priority: 1
status: closed
title: Change cwd default to test file directory
type: is
updated_at: 2026-01-03T00:58:18.097Z
version: 1
---
Change default cwd from temp directory to test file directory (cwd: .). Add cwd: temp as opt-in for isolation. This matches mental model of run commands from here.
