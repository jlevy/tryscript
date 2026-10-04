---
type: is
id: is-01m44er7acj89qhc8p32gygd18
title: "Deferred: hold eslint at 10.8.0 until file-entry-cache 11 / keyv subtree is reviewed"
kind: chore
status: open
priority: 3
version: 1
labels:
  - supply-chain
dependencies: []
created_at: 2026-10-04T21:57:34.155Z
updated_at: 2026-10-04T21:57:34.155Z
---
eslint >=10.10.0 moves file-entry-cache ^8 -> '11.1.5 || >11.1.6 <12', adding flat-cache 6 -> cacheable -> keyv (the August 2026 keyv worm family). file-entry-cache@11.1.6 is unpublished. No advisory requires the bump. Re-evaluate when there is a concrete reason; review the new subtree first.
