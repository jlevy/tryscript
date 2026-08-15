---
type: is
id: is-01kzmd4sz9jxw4j56e7dgmh207
title: Reject stale explicit block offsets before rewriting
kind: bug
status: closed
priority: 1
version: 5
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:18:51.112Z
updated_at: 2026-08-10T01:12:44.155Z
closed_at: 2026-08-10T00:34:09.197Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
spliceBlocks trusts optional exported TestBlock offsets without validating bounds or matching rawContent. Programmatic consumers can supply stale positions and overwrite unrelated Markdown. Validate complete, integral, in-range offsets and source identity before every rewrite, with compatibility regressions.
