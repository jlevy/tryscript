---
type: is
id: is-01kzmhrq0t2ky8gf1gkja046td
title: Assess v0.1.8 patch versus v0.2.0 minor release readiness
kind: task
status: closed
priority: 1
version: 4
labels: []
dependencies: []
created_at: 2026-08-10T00:39:37.753Z
updated_at: 2026-08-10T00:50:13.166Z
closed_at: 2026-08-10T00:50:13.165Z
close_reason: Release classification and backward-compatibility audit completed; findings split into release-blocker beads.
---

## Notes

Recommendation: release as v0.2.0, a minor release. Registry baseline is v0.1.7. No CLI commands, options, package export paths, or published named exports were removed; 30 published exports remain and 3 are additive. The unchanged v0.1.7 corpus replay produced 109 passes and 15 failures: 14 intentional exact-output snapshot changes and one obsolete Git-worktree assertion. Release blockers found: fresh security fixes need approval, full audit and CI are red, packed tarball omits LICENSE, one narrow CoverageContext TypeScript compatibility edge needs preservation or migration documentation, changeset still predicts v0.1.8, and PR metadata is stale.
