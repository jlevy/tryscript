---
type: is
id: is-01m44er4nc8tqwpzwj1g1ffrfs
title: "Release tryscript 0.2.2: version, changelog, docs"
kind: task
status: closed
priority: 1
version: 3
labels:
  - release
dependencies: []
parent_id: is-01m44er1ynvgj6bkr7vaja524r
created_at: 2026-10-04T21:57:31.436Z
updated_at: 2026-10-04T23:25:29.459Z
closed_at: 2026-10-04T23:25:29.459Z
close_reason: "Released as v0.3.0 (renumbered from 0.2.2 per maintainer): PRs #57+#58 merged as stack #59 at a326a9f; tag v0.3.0; release.yml run 37243532589 published tryscript@0.3.0 with provenance."
resolution: null
duplicate_of: null
---
Bump packages/tryscript to 0.2.2, write ## 0.2.2 CHANGELOG section, update docs mentioning fast-glob/path semantics. Run pnpm verify, a consumer npm audit of the packed tarball, and file a PR with a validation plan. Tag v0.2.2 from main after merge.
