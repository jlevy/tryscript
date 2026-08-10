# [Component or Feature] Architecture

- **Status:** draft | current | superseded
- **Last reviewed:** YYYY-MM-DD
- **Owners:** [team or people]

[Explain what this system does, why it exists, and which reader decisions this document supports. Link to the user-facing reference instead of repeating it.]

## Scope and Design Goals

**In scope:** [components, workflows, and contracts described here]

**Out of scope:** [nearby concerns documented elsewhere]

The design must preserve these properties:

- [Invariant or compatibility requirement]
- [Security, reliability, or performance requirement]
- [Maintainability requirement]

## Context and Terminology

[Define only terms needed to understand the design. Link to shared definitions where possible.]

## Components

| Component | Source | Responsibility |
| --- | --- | --- |
| [Name] | `path/to/source` | [Single responsibility and boundary] |

## Runtime or Data Flow

1. [Input enters the system]
2. [Validation and transformation]
3. [Side effect or downstream call]
4. [Result, error, and cleanup behavior]

[Add the smallest useful diagram when prose does not show the relationships clearly.]

## Interfaces and Configuration

[Describe public types, APIs, configuration precedence, persistence formats, and compatibility guarantees. Keep implementation detail close to the relevant component.]

## Failure and Safety Model

- **Invalid input:** [handling and user-visible result]
- **Dependency failure:** [retry, propagation, or fallback behavior]
- **Partial work:** [atomicity, cleanup, or recovery behavior]
- **Security boundary:** [trust assumptions and validation]

## Verification Boundaries

| Risk | Verification |
| --- | --- |
| [Key failure mode] | [Unit, integration, end-to-end, or operational check] |

State which changes require compatibility, package-consumer, migration, or performance
tests.

## Future Considerations

### Open Questions

- [Question that blocks or could change the current design, with an owner]

### Potential Improvements

- [Tracked non-blocking improvement and bead or issue ID]

Do not list speculative work without a tracking record.

## References

- [User or API reference]
- [Governing specification]
- [External primary source]

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
