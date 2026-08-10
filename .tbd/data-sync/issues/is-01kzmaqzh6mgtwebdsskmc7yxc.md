---
type: is
id: is-01kzmaqzh6mgtwebdsskmc7yxc
title: Enforce maintained-document checks in pull-request CI
kind: bug
status: closed
priority: 1
version: 5
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:36:53.669Z
updated_at: 2026-08-10T01:12:40.157Z
closed_at: 2026-08-10T00:34:09.118Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
ci:quality includes docs:check, but .github/workflows/ci.yml still invokes format:check and lint:check separately, omitting documentation validation. Run the shared quality gate in CI so H1/footer/local-link regressions block merge.
