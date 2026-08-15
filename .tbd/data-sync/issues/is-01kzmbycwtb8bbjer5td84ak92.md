---
type: is
id: is-01kzmbycwtb8bbjer5td84ak92
title: Warn about unknown wildcards in expected stderr
kind: bug
status: closed
priority: 2
version: 5
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:52.536Z
updated_at: 2026-08-10T01:12:35.203Z
closed_at: 2026-08-10T00:34:09.419Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The run command counts unknown wildcard tokens only in expected stdout, so stderr-only patterns are silently omitted from the user-facing warning even though stderr expansion is supported.
