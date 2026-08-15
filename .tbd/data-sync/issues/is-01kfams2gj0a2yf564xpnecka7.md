---
close_reason: Implemented bin/binName resolution, cwd default to test file directory
closed_at: 2026-01-03T00:58:18.097Z
created_at: 2026-01-03T00:31:22.377Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.981Z
    original_id: tryscript-98
id: is-01kfams2gj0a2yf564xpnecka7
kind: feature
labels: []
parent_id: null
priority: 1
status: closed
title: Add binName option for command aliasing
type: is
updated_at: 2026-01-03T00:58:18.097Z
version: 1
---
Allow aliasing a binary path to a clean command name. Example: bin: ./dist/bin.mjs with binName: mycli lets you write mycli --help instead of full path.
