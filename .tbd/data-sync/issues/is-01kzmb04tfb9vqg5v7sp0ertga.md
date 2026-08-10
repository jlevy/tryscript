---
type: is
id: is-01kzmb04tfb9vqg5v7sp0ertga
title: Make source-mode documentation commands work before build
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:41:21.230Z
updated_at: 2026-08-10T00:51:02.755Z
closed_at: 2026-08-10T00:34:09.137Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
docs.ts and readme.ts resolve ignored package-local copies in source mode. Because ignore-scripts=true prevents prepare and a fresh checkout has no copies, pnpm tryscript docs/readme fail until build. Resolve tracked workspace docs for source execution and packaged copies for dist execution; add path regressions.
