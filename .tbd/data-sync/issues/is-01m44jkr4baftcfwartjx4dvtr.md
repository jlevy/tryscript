---
type: is
id: is-01m44jkr4baftcfwartjx4dvtr
title: Derive requires validation from one definition
kind: chore
status: open
priority: 4
version: 1
labels: []
dependencies: []
created_at: 2026-10-04T23:05:01.835Z
updated_at: 2026-10-04T23:05:01.835Z
---
Review finding 7 (Low, preference): the bare-name rule lives in the zod schema (types.ts), requiresProblem/isBareCommandName (requires.ts), and Array.isArray guards in mergeConfig. Consider deriving requiresProblem from TestConfigSchema.shape.requires.
