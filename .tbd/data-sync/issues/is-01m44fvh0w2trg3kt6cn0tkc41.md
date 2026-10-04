---
type: is
id: is-01m44fvh0w2trg3kt6cn0tkc41
title: "Repair tbd-sync branch: remove main-tree copy that ignores new beads"
kind: bug
status: closed
priority: 2
version: 2
labels:
  - upstream-tbd
dependencies: []
created_at: 2026-10-04T22:16:50.972Z
updated_at: 2026-10-04T22:28:05.011Z
closed_at: 2026-10-04T22:28:05.011Z
close_reason: "tbd-sync restored to data-only layout (commit 093a9ac on tbd-sync); new beads no longer ignored. Still present in tbd 0.10.0, so worth reporting upstream: tbd sync should fail when a bead file is git-ignored."
resolution: null
duplicate_of: null
---
Sync commit ace244c (2026-08-10, 215 files) copied the main working tree into the tbd-sync branch, including .tbd/.gitignore, whose 'data-sync/' rule makes git ignore every newly created bead in the sync worktree. tbd sync then reports success while pushing only edits to already-tracked beads. The 2026-10-04 session force-added its 16 new beads by hand. Fix: remove the non-data files (.claude, .cursor, .codex, .agents, .changeset, .tbd/.gitignore, etc.) from tbd-sync, and report upstream that tbd sync should fail loudly when a bead file is git-ignored.
