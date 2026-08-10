---
type: is
id: is-01kzmd4sr2p69khjspjnqf023w
title: Ignore headings and annotations inside fenced content
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
created_at: 2026-08-09T23:18:50.881Z
updated_at: 2026-08-10T01:12:46.568Z
closed_at: 2026-08-10T00:34:09.189Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The parser derives a block name and skip/only annotations by searching raw content before an executable fence. Headings or annotations inside opaque fences or prior expected-output text can therefore rename, skip, or focus the next real test. Track metadata only at top-level Markdown while scanning and add regressions.
