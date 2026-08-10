---
type: is
id: is-01kzm625fvjernyrktdk55dv8e
title: Make project-root golden assertion work in Git worktrees
kind: bug
status: closed
priority: 2
version: 6
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T21:15:04.571Z
updated_at: 2026-08-10T01:12:47.055Z
closed_at: 2026-08-10T00:34:09.317Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Full coverage fails in an isolated Git worktree because .git is a file rather than a directory. Make the project-root environment golden test accept both ordinary checkouts and worktrees, then rerun the full golden suite.
