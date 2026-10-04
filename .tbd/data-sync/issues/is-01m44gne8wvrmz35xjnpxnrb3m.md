---
type: is
id: is-01m44gne8wvrmz35xjnpxnrb3m
title: Discovery silently skips unreadable directories after tinyglobby swap
kind: bug
status: closed
priority: 0
version: 2
labels:
  - release
dependencies: []
parent_id: is-01m44er1ynvgj6bkr7vaja524r
created_at: 2026-10-04T22:31:00.123Z
updated_at: 2026-10-04T22:33:46.545Z
closed_at: 2026-10-04T22:33:46.545Z
close_reason: "Fixed on PR #57 branch; merged into stacked branch."
resolution: null
duplicate_of: null
---
fdir (under tinyglobby) suppresses readdir errors, so an EACCES directory under the search root silently drops its tests and the run can exit 0. fast-glob 3.3.3 threw EACCES (verified as an unprivileged user). Restore fail-loud behavior via tinyglobby's fs adapter: record non-ENOENT readdir errors and throw.
