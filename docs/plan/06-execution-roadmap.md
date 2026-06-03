# 06 - Execution Roadmap

## Navigation

- Index: [README](README.md)
- Previous: [05 - Quality Gates](05-quality-gates.md)
- Next: [README](README.md)

## Purpose

This stage sequences the actual work. The assignment suggests 8-10 hours total, so the roadmap protects scope while still producing an industry-standard, reliable solution.

## Recommended Work Sequence

| Stage | Time Box | Output |
| --- | ---: | --- |
| 1. Framing | 20-30 min | Final assumptions and category choice. |
| 2. System design | 2.5-3.5 hrs | `design.md` with diagram, data model, APIs, scale plan, ADRs, deferrals. |
| 3. PostgreSQL | 1-1.5 hrs | `schema.sql` with DDL, indexes, migration note, and required queries. |
| 4. Backend slice | 2-2.5 hrs | Reservation endpoint, transaction service, tests, backend README. |
| 5. Frontend slice | 2-2.5 hrs | Listings page, optimistic reserve flow, tests, frontend README. |
| 6. Final pass | 30-45 min | Root README update, quality gate pass, cleanup. |

## Implementation Dependencies

Do this order:

1. Finish the data model before backend code.
2. Finish reservation error contract before frontend mutation handling.
3. Finish backend tests before frontend retry tests.
4. Finish frontend README after implementation choices are real.
5. Finish root README last.

## File-Level Roadmap

### `design.md`

Build from:

- [00 - Strategy and Assumptions](00-strategy-and-assumptions.md)
- [01 - System Design Plan](01-system-design-plan.md)

Target sections:

```text
1. Context and assumptions
2. Architecture
3. Core data model
4. API surface
5. Scaling plan
6. ADRs
7. Deferrals
```

### `schema.sql`

Build from:

- [02 - Data and PostgreSQL Plan](02-data-and-postgres-plan.md)

Target sections:

```text
1. Extensions and types
2. Core tables
3. Constraints
4. Indexes with comments
5. Migration strategy note
6. Required queries with index notes
```

### `backend/`

Build from:

- [02 - Data and PostgreSQL Plan](02-data-and-postgres-plan.md)
- [03 - Backend Reservation Plan](03-backend-reservation-plan.md)
- [05 - Quality Gates](05-quality-gates.md)

Target work:

```text
1. FastAPI skeleton
2. DB session and schema migration
3. Reservation service
4. Endpoint route
5. Testcontainers setup
6. Concurrency and idempotency tests
7. README
```

### `frontend/`

Build from:

- [04 - Frontend Listings Plan](04-frontend-listings-plan.md)
- [05 - Quality Gates](05-quality-gates.md)

Target work:

```text
1. Vite React TypeScript app
2. API contract types
3. Listings query and reserve mutation hooks
4. Filterable/paginated table
5. Optimistic reservation behavior
6. Countdown behavior
7. Component tests
8. README
```

## Decision Log To Maintain

As implementation starts, keep a short decision log in the relevant README or final `design.md`:

| Decision | Default Direction | Revisit If |
| --- | --- | --- |
| Backend framework | FastAPI | Existing repo standards push Django. |
| Reservation concurrency | PostgreSQL transaction plus row lock | Reservation QPS becomes extreme or multi-region writes are required. |
| Search | PostgreSQL indexes first | Faceting/full-text relevance or marketplace traffic outgrows DB read path. |
| Frontend data fetching | TanStack Query | Project already standardizes on another client cache. |
| Countdown | Local timer plus refetch/invalidation | Product requires real-time cross-device accuracy. |

## What To Avoid

Avoid spending assignment time on:

- Complex deployment/IaC.
- Full authentication and authorization implementation.
- Payment provider integration.
- Pixel-perfect styling.
- Premature microservice code.
- Search engine implementation before PostgreSQL path.
- Hand-built frontend cache when TanStack Query solves the core requirement.

## Final Submission Checklist

Before calling the solution done:

- `docs/ProblemStatement.md` remains available for reference.
- `docs/plan/` remains as planning support.
- `design.md` is complete and concise.
- `schema.sql` is executable or at least internally consistent SQL.
- Backend tests cover concurrency and idempotency.
- Frontend tests cover rollback and idempotent retry.
- README files explain how to run each slice.
- Root README contains "What I'd do differently with more time".
- Git status contains only intentional project files.

## Stage Acceptance Criteria

This stage is complete when we can start implementation with a clear order, clear quality gates, and no unresolved ambiguity that would affect the core solution.

