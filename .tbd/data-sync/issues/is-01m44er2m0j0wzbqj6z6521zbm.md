---
type: is
id: is-01m44er2m0j0wzbqj6z6521zbm
title: "Drop path: entries that expand to empty instead of putting cwd on PATH (gh#55)"
kind: bug
status: closed
priority: 1
version: 4
labels:
  - release
dependencies:
  - type: blocks
    target: is-01m44er4nc8tqwpzwj1g1ffrfs
parent_id: is-01m44er1ynvgj6bkr7vaja524r
created_at: 2026-10-04T21:57:29.343Z
updated_at: 2026-10-04T22:00:07.875Z
closed_at: 2026-10-04T22:00:07.875Z
close_reason: "Empty path: expansions dropped; missing inherited PATH no longer appends an empty element. Unit + golden regressions fail on old code, pass now."
---
Runtime. An unset $VAR in path: expands to '' and an empty PATH element means cwd on POSIX. Drop entries that expand to empty. Add regression test asserting a bare unset $VAR does not put the working directory on PATH.
