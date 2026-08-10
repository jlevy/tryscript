---
type: is
id: is-01kzmbye8mff0rnxnt8mgxdf66
title: Copy package documentation portably
kind: bug
status: closed
priority: 2
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:53.939Z
updated_at: 2026-08-10T00:34:09.427Z
closed_at: 2026-08-10T00:34:09.427Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The package build uses POSIX cp and mkdir commands even though the CLI supports Windows.
Replace them with a checked cross-platform Node script and atomic destination writes.
