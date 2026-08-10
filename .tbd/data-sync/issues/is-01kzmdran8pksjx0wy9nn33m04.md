---
type: is
id: is-01kzmdran8pksjx0wy9nn33m04
title: Print raw CLI documents byte-for-byte
kind: bug
status: closed
priority: 2
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:29:30.791Z
updated_at: 2026-08-10T00:51:03.004Z
closed_at: 2026-08-10T00:34:09.549Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
tryscript docs/readme render a document with console.log. Maintained files already end in a newline, so --raw adds an extra blank line and is not actually raw. Write rendered content directly to stdout and regression-test exact bytes.
