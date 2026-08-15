---
type: is
id: is-01kzm5gm6263jn55z3mznrkp6g
title: Adopt the current strict TypeScript and ESLint quality floor
kind: task
status: closed
priority: 1
version: 7
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
  - discovered
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T21:05:29.793Z
updated_at: 2026-08-10T01:12:42.499Z
closed_at: 2026-08-10T00:34:09.040Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Discovered while comparing PR #48 to the current tbd TypeScript guidelines. Replace recommendedTypeChecked with strictTypeChecked, remove deprecated brace-style, cover every owned TS/JS extension, enable the required strict compiler flags, and resolve resulting diagnostics without broad suppressions.

## Notes

Extend the strict typed TypeScript/ESLint floor to maintained JavaScript and MJS scripts, including tsc checkJs validation.
