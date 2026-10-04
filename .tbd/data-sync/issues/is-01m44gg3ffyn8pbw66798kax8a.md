---
type: is
id: is-01m44gg3ffyn8pbw66798kax8a
title: "Report upstream: tbd sync silently skips git-ignored bead files"
kind: task
status: open
priority: 3
version: 1
labels:
  - upstream-tbd
dependencies: []
created_at: 2026-10-04T22:28:05.231Z
updated_at: 2026-10-04T22:28:05.231Z
---
tbd 0.10.0 reports 'Synced' while new bead files are git-ignored in the sync worktree (seen here via a .tbd/.gitignore copied onto tbd-sync). Suggest: fail or warn when git check-ignore matches a bead path, and guard sync commits against non-data paths.
