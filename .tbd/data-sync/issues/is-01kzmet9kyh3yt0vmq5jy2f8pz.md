---
type: is
id: is-01kzmet9kyh3yt0vmq5jy2f8pz
title: Strip CRLF carriage returns from parsed command lines
kind: bug
status: closed
priority: 1
version: 6
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:48:03.837Z
updated_at: 2026-08-10T01:12:51.286Z
closed_at: 2026-08-10T00:34:09.256Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Executable fence parsing recognizes CRLF fences but leaves carriage returns inside continuation command lines. A Windows-formatted multi-line command can therefore execute different shell text. Normalize the block body lines before token parsing and add a source-level regression.
