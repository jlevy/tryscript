---
type: is
id: is-01m44fm850cde4g0rfnk1capwr
title: Add Windows to CI to exercise discovery and PATH handling
kind: task
status: open
priority: 2
version: 1
labels:
  - ci
dependencies: []
created_at: 2026-10-04T22:12:52.512Z
updated_at: 2026-10-04T22:12:52.512Z
---
CI runs ubuntu-latest only. src/lib/discovery.ts has win32 branches (drive roots, UNC, forward-slash absolute patterns) and runner PATH handling uses ';' that are only reasoned about, not executed. gh#56 called out Windows absolute patterns as unverified. Add a windows-latest job running vitest (discovery.test.ts, runner.test.ts) at minimum.
