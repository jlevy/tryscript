# Plan Spec: [Feature or Task]

- **Status:** draft | active | paused | complete
- **Date:** YYYY-MM-DD
- **Owner:** [person or team]
- **Parent bead:** [ID]

## Purpose

[Explain the user or system problem, why it matters now, and the concrete outcome this plan should produce.]

> Keep this document current while planning and implementation are active.
> Move it to `specs/done/` after validation and retain it as a decision record.

## Background

[Describe the present system and link to the shortest set of architecture, research, issues, and previous specs needed to understand the work.]

## Requirements

### User and Product Requirements

- [Required behavior]
- [User-visible error or recovery behavior]

### Engineering Requirements

- [Compatibility, security, performance, or operability constraint]
- [Repository guideline or quality gate]

### Acceptance Criteria

- [ ] [Observable outcome with an objective pass condition]
- [ ] [Automated or manual validation condition]

### Non-Goals

- [Related work intentionally excluded and its tracking bead, when applicable]

## Compatibility

**Supported baseline:** [versions, file formats, APIs, or environments]

**Contract:** [behavior that must remain compatible]

**Migration:** [required migration, deprecation, or “None”]

## Current Architecture

[Identify reusable components, public boundaries, data flows, and current failure modes. Link to maintained architecture documentation instead of duplicating it.]

## Proposed Design

### Components and Data Flow

1. [Input or trigger]
2. [Validation and processing]
3. [Side effects and output]
4. [Failure handling and cleanup]

### Interfaces and Data Changes

[Describe API, type, configuration, storage, and migration changes. Include versioning and rollback requirements.]

### Alternatives Considered

| Option | Why Considered | Decision |
| --- | --- | --- |
| [Approach] | [Benefit or constraint] | [Chosen or rejected, with reason] |

## Implementation Plan

| Phase | Beads | Deliverable | Verification |
| --- | --- | --- | --- |
| 1 | [IDs] | [Small reviewable outcome] | [Focused tests] |
| 2 | [IDs] | [Next outcome] | [Focused tests] |

Use red-green-refactor within each phase.
Keep every unfinished or discovered task in a bead and record dependencies there.

## Validation Plan

- **Unit:** [logic and edge cases]
- **Integration:** [component boundaries and failures]
- **End to end:** [user workflow and supported environments]
- **Packaging or deployment:** [consumer, migration, or rollout checks]
- **Manual:** [only checks that cannot be automated]

## Risks and Open Questions

| Risk or Question | Impact | Mitigation or Owner |
| --- | --- | --- |
| [Item] | [Consequence] | [Control, experiment, or owner] |

Resolve design-changing questions before implementation.
Track non-blocking follow-up in beads rather than leaving unowned notes.

## References

- [Architecture document]
- [Research brief or primary external source]

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
