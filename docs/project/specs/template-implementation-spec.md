# Implementation Spec: [Feature or Task]

- **Status:** draft | active | complete
- **Plan spec:** [plan filename]
- **Parent bead:** [ID]

## Intended Outcome

[Summarize the accepted design, compatibility contract, and measurable completion criteria. Link to the plan for product context and alternatives.]

## Constraints

- [Repository and language guidelines]
- [Compatibility or migration boundary]
- [Security, performance, or operational boundary]

## Implementation Phases

| Phase | Beads | Deliverable | Test First |
| --- | --- | --- | --- |
| 1 | [IDs] | [Small independently reviewable outcome] | [Failing regression or contract test] |
| 2 | [IDs] | [Next outcome] | [Focused failing test] |

Each phase follows red-green-refactor and ends in a state that builds and can be
reviewed.

## Phase 1: [Outcome]

### Files and Boundaries

- `path/to/file`: [reason it changes]
- [Public API, storage, or configuration boundary]

### Test-Driven Sequence

1. Add [specific failing test and expected failure].
2. Implement [minimum behavior needed to pass].
3. Refactor [duplication or boundary cleanup] while tests stay green.
4. Run [focused quality gates].

### Decisions and Risks

- **Decision:** [choice and evidence]
- **Risk:** [failure mode and mitigation]

## Phase 2: [Outcome]

[Repeat the phase structure only when another phase is needed.]

## Final Verification

- [ ] Acceptance criteria map to passing tests
- [ ] Formatting, linting, strict type checking, build, and tests pass
- [ ] Package, migration, security, or browser checks pass when applicable
- [ ] User-facing behavior and documentation agree
- [ ] All worked beads are closed or updated and synchronized
- [ ] Changes are committed, pushed, and CI is green

## Open Questions and Follow-Up

[List only unresolved items with owners or bead IDs. Remove this section when empty.]

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
