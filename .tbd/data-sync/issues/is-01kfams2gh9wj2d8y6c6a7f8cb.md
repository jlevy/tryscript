---
close_reason: null
closed_at: 2026-01-03T06:49:04.528Z
created_at: 2026-01-03T06:22:58.894Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.961Z
    original_id: tryscript-8rl
id: is-01kfams2gh9wj2d8y6c6a7f8cb
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: Add sandbox option to types and config
type: is
updated_at: 2026-01-03T06:50:53.763Z
version: 1
---
Add new sandbox option for explicit isolation.

**Files:**
- packages/tryscript/src/lib/types.ts: Add sandbox to TestConfigSchema
- packages/tryscript/src/lib/config.ts: Add sandbox to TryscriptConfig interface

**Schema:**
```typescript
sandbox: z.union([z.boolean(), z.string()]).optional()
  .describe('Run in isolated sandbox: true = empty temp, path = copy to temp')
```
