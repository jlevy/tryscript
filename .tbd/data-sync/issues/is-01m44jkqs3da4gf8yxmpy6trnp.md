---
type: is
id: is-01m44jkqs3da4gf8yxmpy6trnp
title: pnpm verify does not run the golden tests
kind: bug
status: open
priority: 2
version: 1
labels:
  - ci
dependencies: []
created_at: 2026-10-04T23:05:01.475Z
updated_at: 2026-10-04T23:05:01.475Z
---
Found in the PR #57/#58 review: root test runs 'pnpm --filter tryscript test:self', which is 'tsx src/bin.ts' with no arguments (prints help, exits 0). Only CI's test:coverage runs the .tryscript.md files, so the local release gate cannot fail on a golden regression. Make test:self run tests/**/*.tryscript.md.
