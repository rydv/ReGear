# 05 - Quality Gates

## Navigation

- Index: [README](README.md)
- Previous: [04 - Frontend Listings Plan](04-frontend-listings-plan.md)
- Next: [06 - Execution Roadmap](06-execution-roadmap.md)

## Purpose

This stage defines the checks that keep the final submission reliable, resilient, scalable, and easy to review.

## Overall Submission Gate

Before final submission:

- `design.md` is concise and skimmable.
- `schema.sql` contains DDL, indexes, migration note, and three required queries.
- `backend/` contains endpoint code, migration/DDL, tests, and README.
- `frontend/` contains React page, components/hooks, tests, and README.
- Root README includes "What I'd do differently with more time".
- Every major trade-off is easy to find.

## Design Document Gate

Check `design.md` for:

| Check | Pass Criteria |
| --- | --- |
| Page discipline | Max 6 pages if exported, with diagrams included. |
| Architecture | One block diagram plus short component notes. |
| Data model | ER diagram or clear entity relationship sketch. |
| Mutability | Explicit mutable vs immutable fields and rationale. |
| API surface | 6-10 important endpoints with auth/concurrency notes. |
| Scaling | Rough numbers, bottlenecks, and staged mitigations. |
| ADRs | Three mini-ADRs around 150 words each. |
| Deferrals | One honest paragraph about what is not built in first 6 months. |

## PostgreSQL Gate

Check `schema.sql` for:

| Check | Pass Criteria |
| --- | --- |
| Core DDL | At minimum Unit, Listing, Reservation; preferably Store, User, Inspection, Order. |
| Constraints | Primary keys, foreign keys, status constraints, active reservation uniqueness. |
| Idempotency | Separate idempotency table or clearly justified equivalent. |
| Index comments | Every day-one index has a one-line reason. |
| Required queries | Three prompt queries are present. |
| Query notes | Each query names the index it uses. |
| Migration note | Safe 50M-row enum column migration in about 10 lines. |
| No downtime pattern | No table rewrite default, no blocking index creation, no long exclusive locks. |

## Backend Gate

Functional checks:

- Available listing can be reserved.
- Active reservation blocks a second buyer.
- Expired reservation does not block a new buyer.
- Listing not found returns the planned error shape.
- Non-reservable listing returns the planned error shape.
- Same idempotency key replays same success.
- Same idempotency key replays same error.
- Same key with different payload is rejected.
- Concurrent requests produce exactly one success.

Code quality checks:

- Reservation logic is in a service/helper, not buried entirely in route code.
- Transaction boundaries are visible and short.
- Database time is used for expiry.
- No external side effects inside the transaction.
- Errors have stable machine-readable codes.
- Tests assert database state after requests.
- README explains the concurrency and idempotency strategy.

Recommended commands once implemented:

```text
pytest
```

If the project later adds format/type tools:

```text
ruff check .
ruff format --check .
mypy .
```

## Frontend Gate

Functional checks:

- Listings render with price, category, store, status, and Reserve action.
- Filters work for category, price range, and status.
- Pagination exists.
- Reserve action sends a generated idempotency key.
- Optimistic state appears immediately.
- Failure rolls back state.
- Retry after transient failure reuses the same idempotency key.
- Countdown appears for current user's reservation.
- Countdown expiry flips row back to available locally.
- Loading, error, empty, and refetching states are visible.

Accessibility checks:

- Core reserve flow works with keyboard.
- Buttons are real buttons.
- Focus states are visible.
- Error messages are announced or discoverable.
- Disabled/loading states are communicated.
- Status is not color-only.

Recommended commands once implemented:

```text
npm test
npm run typecheck
npm run build
```

## Resilience Checklist

Use this checklist across design, backend, and frontend:

| Concern | Expected Handling |
| --- | --- |
| Duplicate requests | Idempotency table and stable frontend key. |
| Concurrent buyers | Listing row lock and active reservation uniqueness. |
| Clock drift | Database time for backend expiry. |
| Stale UI | Query invalidation after mutation and local countdown reconciliation. |
| Partial failure | Store canonical idempotency outcome before returning. |
| Async side effects | Events after commit; retryable workers; dead-letter queues in design. |
| Database growth | Indexes, batched migrations, read replicas, archival/partitioning later. |
| Cache correctness | Cache is read optimization only; primary DB is source of truth. |

## Security and Privacy Checks

Even though auth is out of scope, mention or preserve:

- Buyer can only reserve as themselves in a real system.
- Staff endpoints require role-based access.
- Avoid logging personal data beyond stable identifiers.
- Validate input body.
- Use parameterized SQL or ORM-bound parameters.
- Keep error messages useful but not leaking internal state.

## Communication Gate

The assignment gives communication 15 percent weight. Final docs should:

- Use headings and tables for skimmability.
- Put decisions before implementation details.
- Be honest about assumptions.
- Name trade-offs directly.
- Avoid hiding uncertainty.
- Keep "with more time" practical, not generic.

## Stage Acceptance Criteria

This stage is complete when every deliverable has a concrete checklist that can be used before final handoff.

