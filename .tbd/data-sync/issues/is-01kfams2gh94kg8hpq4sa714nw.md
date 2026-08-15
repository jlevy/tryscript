---
close_reason: Closed
closed_at: 2026-01-16T23:56:46.246Z
created_at: 2026-01-16T23:44:58.277Z
deferred_until: null
dependencies: []
due_date: null
extensions:
  beads:
    imported_at: 2026-01-19T08:08:41.841Z
    original_id: tryscript-328
id: is-01kfams2gh94kg8hpq4sa714nw
kind: task
labels: []
parent_id: null
priority: 1
status: closed
title: "Phase I: Add path field to TestConfigSchema (types.ts)"
type: is
updated_at: 2026-01-16T23:56:46.246Z
version: 1
---
Add path field to TestConfigSchema in types.ts:
```typescript
path: z.array(z.string()).optional(),
```
