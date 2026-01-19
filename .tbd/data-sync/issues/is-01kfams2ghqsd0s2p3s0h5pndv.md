---
close_reason: Created package-bin.ts with findPackageJson, parsePackageBin, createBinWrappers, setupPackageBin
closed_at: 2026-01-17T00:17:02.103Z
created_at: 2026-01-16T23:45:35.938Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.861Z
    original_id: tryscript-332
id: is-01kfams2ghqsd0s2p3s0h5pndv
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: "Phase II: Create package-bin.ts utility module"
type: is
updated_at: 2026-01-17T00:17:02.103Z
version: 1
---
Create src/lib/package-bin.ts with:
- findPackageJson(): Walk up from test dir to find package.json
- parsePackageBin(): Parse bin field (string and object forms)
- createBinWrappers(): Generate wrapper scripts for bins
- setupPackageBin(): Main entry point

Wrappers should use node for .js/.mjs/.cjs, exec directly for others.
