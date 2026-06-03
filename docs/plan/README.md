# ReGear Solution Plan

This folder is the navigation hub for the ReGear take-home solution plan. It breaks the assignment into staged, reviewable documents so we can build the final deliverables deliberately instead of mixing design, schema, backend, and frontend work in one pass.

## Navigation

- Start: [00 - Strategy and Assumptions](00-strategy-and-assumptions.md)
- Next: [01 - System Design Plan](01-system-design-plan.md)

## Plan Map

| Stage | File | Primary Outcome |
| --- | --- | --- |
| 00 | [Strategy and Assumptions](00-strategy-and-assumptions.md) | Shared framing, scale assumptions, constraints, risks, and success criteria. |
| 01 | [System Design Plan](01-system-design-plan.md) | Architecture, data model, API surface, scaling path, ADR candidates, and deferrals for `design.md`. |
| 02 | [Data and PostgreSQL Plan](02-data-and-postgres-plan.md) | Tables, constraints, indexes, migration strategy, and query approach for `schema.sql`. |
| 03 | [Backend Reservation Plan](03-backend-reservation-plan.md) | Production-grade reservation endpoint design, transaction algorithm, idempotency model, and tests. |
| 04 | [Frontend Listings Plan](04-frontend-listings-plan.md) | React architecture, API contract, optimistic UI, countdown behavior, accessibility, and tests. |
| 05 | [Quality Gates](05-quality-gates.md) | Verification checklist for correctness, resilience, scalability, and communication quality. |
| 06 | [Execution Roadmap](06-execution-roadmap.md) | Time-boxed implementation sequence, dependencies, and final submission checklist. |

## Core Thesis

The solution should be conservative where correctness matters and pragmatic where scale can be staged:

- PostgreSQL remains the source of truth for inventory, listings, reservations, and idempotency.
- Reservation correctness is enforced by database transactions, row locks, and unique constraints, not only application logic.
- Marketplace read scale is handled with indexes, cacheable APIs, read replicas, and an eventual path to search infrastructure.
- Operational workflows stay reliable through audit trails, lifecycle events, and async processing for non-blocking side effects.
- The frontend is small but production-shaped: typed contracts, predictable async state, stable idempotency keys, rollback, and accessibility.

## Deliverable Mapping

| Assignment Deliverable | Target File or Folder | Planning Inputs |
| --- | --- | --- |
| System design document | `design.md` | Stages 00 and 01 |
| PostgreSQL schema and queries | `schema.sql` | Stage 02 |
| Backend code slice | `backend/` | Stages 02, 03, and 05 |
| Frontend code slice | `frontend/` | Stages 04 and 05 |
| Final README notes | `README.md`, `backend/README.md`, `frontend/README.md` | Stages 05 and 06 |

## How To Use This Plan

1. Read stages 00 and 01 before writing `design.md`.
2. Build `schema.sql` from stage 02 before implementing the backend so constraints drive behavior.
3. Implement the backend reservation endpoint from stage 03 and verify it against stage 05.
4. Implement the frontend from stage 04 after the backend contract is stable.
5. Use stage 06 to keep the final submission scoped to the 8-10 hour expectation.

