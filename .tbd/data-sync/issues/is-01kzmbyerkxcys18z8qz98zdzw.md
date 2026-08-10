---
type: is
id: is-01kzmbyerkxcys18z8qz98zdzw
title: Ignore executable-looking examples inside opaque Markdown fences
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:54.450Z
updated_at: 2026-08-10T00:51:02.816Z
closed_at: 2026-08-10T00:34:09.177Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The parser scans console and bash fences nested inside non-executable Markdown examples, so documented snippets can execute as tests. Treat outer non-executable fences as opaque until their matching close.
