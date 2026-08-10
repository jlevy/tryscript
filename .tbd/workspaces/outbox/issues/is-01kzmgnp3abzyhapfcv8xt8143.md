---
type: is
id: is-01kzmgnp3abzyhapfcv8xt8143
title: Enforce the Flowmark Markdown formatting floor
kind: task
status: closed
priority: 1
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-10T00:20:29.929Z
updated_at: 2026-08-10T00:34:09.281Z
closed_at: 2026-08-10T00:34:09.281Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The current tbd TypeScript lint/format guideline requires Flowmark as the Markdown
formatter and a verify-only Flowmark gate.
Add a cool-off-eligible exact Flowmark version, secure checksum-verified CI setup,
repository exclusions for generated/historical/executable Markdown, local hook
integration, maintained-doc formatting, and regression checks without letting Prettier
and Flowmark fight over Markdown.
