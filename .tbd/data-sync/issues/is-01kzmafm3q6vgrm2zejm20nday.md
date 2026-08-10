---
type: is
id: is-01kzmafm3q6vgrm2zejm20nday
title: Stop coverage options from consuming test-file arguments
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
created_at: 2026-08-09T22:32:19.830Z
updated_at: 2026-08-10T00:51:02.713Z
closed_at: 2026-08-10T00:34:09.113Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Commander variadic options --coverage-reporter <reporter...> and --coverage-exclude <pattern...> greedily consume the following file path. Documented commands therefore ignore their requested test file and run default discovery. Use repeatable single-value collectors and add an end-to-end argument parsing regression.
