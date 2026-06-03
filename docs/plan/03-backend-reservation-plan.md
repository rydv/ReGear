# 03 - Backend Reservation Plan

## Navigation

- Index: [README](README.md)
- Previous: [02 - Data and PostgreSQL Plan](02-data-and-postgres-plan.md)
- Next: [04 - Frontend Listings Plan](04-frontend-listings-plan.md)

## Purpose

This stage guides the backend code slice for:

```http
POST /listings/{listing_id}/reserve
```

The endpoint should be small, but it must prove the hardest part of the domain: only one buyer can hold a unique listing, expired reservations must not block new buyers, and retries must be idempotent.

## Recommended Stack

Use:

- FastAPI for the HTTP layer.
- SQLAlchemy 2.x or SQLModel for database access.
- PostgreSQL as the real database.
- `pytest` for tests.
- `testcontainers` for real PostgreSQL concurrency tests, unless local Docker is unavailable and the README documents the limitation.

Keep the slice focused. Do not build auth, payment, full catalog service, or a complete production deployment.

## Proposed Backend Layout

```text
backend/
  README.md
  pyproject.toml
  app/
    __init__.py
    main.py
    db.py
    models.py
    schemas.py
    errors.py
    reservations.py
    settings.py
  migrations/
    001_core_schema.sql
  tests/
    conftest.py
    test_reservations.py
```

## Endpoint Contract

Request:

```http
POST /listings/{listing_id}/reserve
```

```json
{
  "buyer_id": "buyer-123",
  "idempotency_key": "uuid-or-client-generated-key"
}
```

Successful new reservation:

```http
201 Created
```

```json
{
  "reservation_id": "res-123",
  "listing_id": "listing-123",
  "buyer_id": "buyer-123",
  "status": "active",
  "expires_at": "2026-06-02T10:30:00Z",
  "idempotent_replay": false
}
```

Idempotent replay:

```http
200 OK
```

```json
{
  "reservation_id": "res-123",
  "listing_id": "listing-123",
  "buyer_id": "buyer-123",
  "status": "active",
  "expires_at": "2026-06-02T10:30:00Z",
  "idempotent_replay": true
}
```

Error shape:

```json
{
  "error": {
    "code": "already_reserved",
    "message": "Listing is already reserved.",
    "details": {
      "listing_id": "listing-123"
    }
  }
}
```

Recommended status codes:

| Outcome | HTTP Status | Error Code |
| --- | ---: | --- |
| New reservation created | `201` | N/A |
| Idempotent replay of success | `200` | N/A |
| Listing not found | `404` | `listing_not_found` |
| Listing is sold, returned, draft, or otherwise not reservable | `409` | `listing_not_reservable` |
| Listing has an active non-expired reservation from another buyer | `409` | `already_reserved` |
| Idempotency key reused for different payload | `409` | `idempotency_key_conflict` |
| Invalid request body | `422` | Framework validation error |

## Transaction Algorithm

All reservation decisions should happen in one database transaction on the primary.

High-level algorithm:

```text
1. Start transaction.
2. Insert or lock idempotency record for (buyer_id, idempotency_key).
3. If idempotency record is completed:
   - Verify request hash matches.
   - Return stored response and status as replay.
4. If idempotency record exists but request hash differs:
   - Return idempotency_key_conflict.
5. Lock listing row with SELECT ... FOR UPDATE.
6. If listing is missing:
   - Store 404 outcome in idempotency table.
   - Commit and return 404.
7. If listing status is not reservable:
   - Store 409 outcome.
   - Commit and return 409.
8. Expire any active reservation for the listing where expires_at <= database now().
9. Check for remaining active reservation for the listing.
10. If another active reservation exists:
    - Store 409 already_reserved outcome.
    - Commit and return 409.
11. Insert new active reservation with expires_at = database now() + interval '30 minutes'.
12. Update listing status/reserved_until if the schema stores a denormalized availability marker.
13. Store 201 success outcome in idempotency table.
14. Commit and return response.
```

Important details:

- Use database `now()` rather than application clock for expiry decisions.
- Lock the listing row before checking active reservations.
- The partial unique index on active reservations is a backstop, not the only protection.
- Keep the transaction short. No network calls, emails, search indexing, or external services inside it.
- Emit async events after commit if needed.

## Idempotency Model

Use a separate `idempotency_keys` table because idempotent replay must work for both success and error outcomes.

Minimum fields:

| Field | Purpose |
| --- | --- |
| `buyer_id` | Idempotency scope. |
| `idempotency_key` | Client-generated stable retry key. |
| `request_hash` | Detect same key used with different listing/body. |
| `status` | `processing`, `completed`, or `failed`. |
| `response_status` | HTTP status from original completed attempt. |
| `response_body` | Canonical JSON response. |
| `created_at`, `updated_at` | Audit and troubleshooting. |

Recommended unique index:

```sql
CREATE UNIQUE INDEX idempotency_keys_buyer_key_idx
ON idempotency_keys (buyer_id, idempotency_key);
```

Request hash should include:

- HTTP method.
- Route path with listing id.
- Buyer id.
- Idempotency key.
- Relevant body fields.

## Concurrency Tests

Tests should demonstrate behavior, not only implementation details.

Required tests:

| Test | Expected Result |
| --- | --- |
| Reserve available listing | Returns `201`, creates one active reservation. |
| Listing not found | Returns `404`, stores replayable idempotency result. |
| Listing not reservable | Returns `409`, no reservation created. |
| Already reserved | Returns `409` for second buyer while first reservation is active. |
| Expired reservation allows new buyer | Old reservation becomes expired, new active reservation is created. |
| Concurrent buyers | Two simultaneous requests for same listing result in exactly one success and one conflict. |
| Idempotent success replay | Same buyer/key/listing returns original success, no duplicate reservation. |
| Idempotent error replay | Same buyer/key/listing returns original error response. |
| Same key different payload | Returns `409 idempotency_key_conflict`. |

For the concurrent buyers test:

- Use a real PostgreSQL container.
- Use two separate database sessions/connections.
- Trigger both requests as close together as possible with `ThreadPoolExecutor`, `anyio`, or `asyncio.gather`.
- Assert database state, not just HTTP responses.

## Observability Plan

Even in a slice, include production-shaped hooks:

| Signal | Why |
| --- | --- |
| Structured log for reservation attempts | Debug buyer/listing/idempotency behavior. |
| Counter: reservation success/conflict/replay/error | See contention and retry rates. |
| Histogram: reservation transaction duration | Catch lock contention. |
| Log field: idempotency replay | Understand retry behavior. |
| Log field: listing id and buyer id | Trace disputes, with privacy-safe identifiers. |

## Backend README Plan

`backend/README.md` should include:

- Stack choice.
- How to install dependencies.
- How to run the API.
- How to run tests.
- How the reservation transaction works in 1-2 paragraphs.
- Why testcontainers or mocks were used.
- What would be added with more time.

## Implementation Order

1. Create backend project files and dependency config.
2. Add schema migration used by tests.
3. Implement models and DB session handling.
4. Implement error response helpers.
5. Implement reservation transaction service.
6. Wire FastAPI endpoint.
7. Add tests from easiest to hardest.
8. Run tests and tighten edge cases.
9. Update backend README.

## Stage Acceptance Criteria

This stage is complete when the backend plan can be converted into code that proves:

- No double booking under concurrency.
- Expired reservations do not block.
- Idempotent retries return stored outcomes.
- The database enforces critical invariants.

