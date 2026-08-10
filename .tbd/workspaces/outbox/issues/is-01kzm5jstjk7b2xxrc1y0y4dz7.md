---
type: is
id: is-01kzm5jstjk7b2xxrc1y0y4dz7
title: Remove download-capable runtime fallbacks from coverage execution
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
  - discovered
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T21:06:41.105Z
updated_at: 2026-08-10T00:34:09.051Z
closed_at: 2026-08-10T00:34:09.051Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The strict supply-chain pass found packages/tryscript/src/lib/coverage.ts falling back
to unpinned npx c8 at runtime.
Require an installed local c8 binary and fail with an actionable message rather than
downloading code during a test run.
