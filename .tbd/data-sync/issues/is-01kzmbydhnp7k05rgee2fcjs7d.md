---
type: is
id: is-01kzmbydhnp7k05rgee2fcjs7d
title: Reject malformed or unclosed YAML frontmatter
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:53.204Z
updated_at: 2026-08-10T00:51:02.778Z
closed_at: 2026-08-10T00:34:09.159Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Malformed YAML escapes TestParseError handling and unclosed frontmatter is silently ignored. Report file and line context and preserve the parsing cause.
