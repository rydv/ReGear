# 02 - Data and PostgreSQL Plan

## Navigation

- Index: [README](README.md)
- Previous: [01 - System Design Plan](01-system-design-plan.md)
- Next: [03 - Backend Reservation Plan](03-backend-reservation-plan.md)

## Purpose

This stage guides `schema.sql`. The schema should make the access patterns obvious, protect core invariants, and include migration/query notes that show PostgreSQL depth.

## Schema Principles

1. Model one physical unit explicitly.
   - Never treat available inventory as a SKU count.

2. Keep lifecycle state constrained.
   - Use enums or check constraints for finite states.
   - Enforce allowed transitions in application/service logic and audit them.

3. Make reservation correctness database-backed.
   - Application checks are necessary but insufficient.
   - Use row locks and unique constraints as the final guardrail.

4. Separate idempotency from reservation rows.
   - Idempotent retries must return the same result even if the original result was an error.

5. Index for the required queries.
   - Every query requested in the prompt should name the index it uses.

6. Avoid downtime migrations.
   - Large table changes must be nullable-first, backfilled in batches, and validated later.

## Proposed Tables

| Table | Purpose | Key Fields |
| --- | --- | --- |
| `stores` | Physical intake centers. | `id`, `name`, `region`, `status`, `created_at`. |
| `users` | Buyers and internal staff. | `id`, `email`, `role`, `status`, `created_at`. |
| `categories` | Category hierarchy for listings. | `id`, `parent_id`, `slug`, `name`. |
| `units` | One physical item. | `id`, `unit_code`, `category_id`, `intake_store_id`, `status`, `procured_at`, `created_at`, `updated_at`. |
| `inspections` | Inspection/refurbishment assessment. | `id`, `unit_id`, `inspector_id`, `condition_summary`, `outcome`, `created_at`. |
| `listings` | Marketplace sale listing for a unit. | `id`, `unit_id`, `store_id`, `status`, `price_cents`, `currency`, `listed_at`, `reserved_until`, `created_at`, `updated_at`. |
| `reservations` | Temporary buyer hold. | `id`, `listing_id`, `buyer_id`, `status`, `reserved_at`, `expires_at`, `created_at`. |
| `orders` | Completed purchase. | `id`, `listing_id`, `unit_id`, `buyer_id`, `reservation_id`, `status`, `placed_at`. |
| `idempotency_keys` | Canonical response for safe retries. | `id`, `buyer_id`, `idempotency_key`, `request_hash`, `status`, `response_status`, `response_body`, `locked_at`, `created_at`. |
| `unit_events` | Auditable lifecycle events. | `id`, `unit_id`, `actor_id`, `event_type`, `from_status`, `to_status`, `metadata`, `created_at`. |

## Key Invariants

| Invariant | Enforcement |
| --- | --- |
| One physical item maps to one unit. | `units.id` primary key and immutable `unit_code` unique key. |
| A listing belongs to one unit. | `listings.unit_id` foreign key. |
| A listing cannot have two active reservations. | Partial unique index on `reservations(listing_id)` where `status = 'active'`. |
| Expired active reservations do not block new holds. | Reservation transaction first marks stale active reservation as `expired`. |
| Same buyer/idempotency key replays same outcome. | Unique key on `idempotency_keys(buyer_id, idempotency_key)`. |
| Idempotency key cannot be reused for a different request. | Store `request_hash`; reject mismatch. |
| Sold listings cannot be reserved. | Listing status validation under row lock. |
| Lifecycle transitions are auditable. | Insert `unit_events` on state-changing operations. |

## Reservation Constraint Detail

The best database backstop is:

```sql
CREATE UNIQUE INDEX reservations_one_active_per_listing_idx
ON reservations (listing_id)
WHERE status = 'active';
```

PostgreSQL partial indexes cannot safely express "active and not expired" using `now()` because `now()` is not immutable. Therefore the endpoint must expire stale reservations inside the transaction before inserting a new active reservation.

The partial unique index still matters. If two code paths race or a future endpoint forgets to lock correctly, the database rejects the second active reservation.

## Day-One Index Plan

| Index | Purpose |
| --- | --- |
| `units(unit_code)` unique | Fast lookup by physical inventory code. |
| `units(intake_store_id, status, updated_at)` | Ops dashboard for stuck units by store/status/time. |
| `units(category_id, status, created_at)` | Category and lifecycle filtering. |
| `listings(category_id, status, price_cents, listed_at DESC)` | Marketplace search by category/status/price sorted by recency. |
| `listings(status, listed_at DESC)` | Recent available listings and fallback list pages. |
| `listings(unit_id)` unique or filtered unique | Prevent accidental duplicate active listing for a unit. |
| `reservations(listing_id) WHERE status = 'active'` unique | Enforce one active reservation per listing. |
| `reservations(status, expires_at)` | Reservation expiry sweep. |
| `reservations(buyer_id, status, expires_at)` | Buyer reservation lookups and checkout state. |
| `idempotency_keys(buyer_id, idempotency_key)` unique | Fast idempotent replay lookup. |
| `unit_events(unit_id, created_at DESC)` | Audit history for a unit. |

## Required Query Plans

### Marketplace Search

Requirement:

```text
show available listings for category X, price range Y-Z, sorted by recency, page 3
```

Planned SQL shape:

```sql
SELECT id, unit_id, category_id, store_id, price_cents, currency, listed_at
FROM listings
WHERE status = 'listed'
  AND category_id = $1
  AND price_cents BETWEEN $2 AND $3
ORDER BY listed_at DESC
LIMIT $4 OFFSET $5;
```

Index:

```sql
CREATE INDEX listings_marketplace_search_idx
ON listings (category_id, status, price_cents, listed_at DESC);
```

Note:

- For deep pagination, prefer cursor pagination later using `(listed_at, id)` instead of large offsets.
- At high search complexity, move marketplace search to OpenSearch while PostgreSQL remains source of truth.

### Ops Dashboard

Requirement:

```text
units stuck in the Inspected state for more than 48 hours, grouped by store
```

Planned SQL shape:

```sql
SELECT intake_store_id, count(*) AS stuck_count
FROM units
WHERE status = 'inspected'
  AND updated_at < now() - interval '48 hours'
GROUP BY intake_store_id
ORDER BY stuck_count DESC;
```

Index:

```sql
CREATE INDEX units_store_status_updated_idx
ON units (status, updated_at, intake_store_id);
```

Note:

- If dashboards become hot, introduce a periodically refreshed operational summary table.

### Reservation Expiry Sweep

Requirement:

```text
find reservations older than 30 minutes that are still active
```

Planned SQL shape:

```sql
SELECT id, listing_id, buyer_id, expires_at
FROM reservations
WHERE status = 'active'
  AND expires_at <= now()
ORDER BY expires_at
LIMIT $1;
```

Index:

```sql
CREATE INDEX reservations_active_expiry_idx
ON reservations (status, expires_at);
```

Note:

- The endpoint expires stale reservations opportunistically.
- A sweep worker cleans up stale rows for operational hygiene.

## 50M-Row `condition_grade ENUM` Migration Plan

The assignment asks for about 10 lines. The final `schema.sql` note should include this sequence:

1. Create the enum type in a short transaction.
2. Add `condition_grade` as a nullable column with no default.
3. Deploy application code that can read null and write the new column for new/updated rows.
4. Backfill existing rows in small primary-key ranges or `SKIP LOCKED` batches.
5. Sleep between batches and monitor lock waits, replica lag, I/O, and autovacuum.
6. Create any needed indexes with `CREATE INDEX CONCURRENTLY`.
7. Add a `CHECK (condition_grade IS NOT NULL) NOT VALID` constraint if non-null is required.
8. Validate the constraint later with `VALIDATE CONSTRAINT`.
9. Set a default only after backfill if needed.
10. Finally set `NOT NULL` only during a controlled window if validation shows it is safe, or keep the validated check constraint.

## Data Integrity Checklist

Before implementing backend logic, confirm `schema.sql` includes:

- Primary keys for all core tables.
- Foreign keys for unit/listing/reservation/order relationships.
- Status constraints or enum types.
- Partial unique active-reservation index.
- Idempotency unique key and request hash.
- Created/updated timestamps.
- Index comments explaining why each index exists.
- Required three SQL queries with notes on indexes used.

## Stage Acceptance Criteria

This stage is complete when `schema.sql` can be implemented directly from this plan and each required query has a named index.

