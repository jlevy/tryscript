---
type: is
id: is-01kzm51rhms10ysys54pzr5fxq
title: Remediate known dependency vulnerabilities in the release lockfile
kind: bug
status: in_progress
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
  - discovered
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T20:57:22.739Z
updated_at: 2026-08-10T00:51:02.546Z
---
Discovered while following the required frozen-install audit for PR #48: pnpm audit reports 30 vulnerabilities (22 high, 7 moderate, 1 low), including minimatch, Vite, picomatch, flatted, js-yaml, nanoid, and brace-expansion paths. Upgrade or override only cool-off-eligible patched versions, review the lockfile, and require a clean moderate-level audit.
