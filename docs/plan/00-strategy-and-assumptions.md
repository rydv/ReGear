# 00 - Strategy and Assumptions

## Navigation

- Index: [README](README.md)
- Previous: [README](README.md)
- Next: [01 - System Design Plan](01-system-design-plan.md)

## Purpose

This stage turns the problem statement into operating assumptions and design principles. The final solution should show senior judgment: reliable enough for real inventory and reservations, but not bloated beyond the assignment scope.

## Problem Summary

ReGear is a pre-owned marketplace where every physical item is unique. Items are acquired through stores, inspected and refurbished internally, priced, listed online, reserved during checkout, and eventually sold or returned.

The key technical tension is that operational systems and customer marketplace APIs share the same underlying inventory truth:

- Store teams need reliable tooling for intake, inspection, lifecycle changes, and stuck-work dashboards.
- Customers need fast listing search/detail pages and accurate availability.
- Checkout needs a reservation flow that prevents double booking under concurrency.
- Leadership wants growth from about 30,000 units/month to 200,000 units/month within 18 months.

## Non-Goals

The assignment does not ask us to build every marketplace capability. We should avoid spending time on:

- Full auth, user management, or identity provider integration.
- Payment processing.
- Shipping, tax, returns automation, or fraud systems.
- Complete product image pipeline.
- Full search relevance tuning.
- A polished design system.
- Microservices implementation.

We can mention these in design deferrals, but the deliverable focus stays on inventory/listings, PostgreSQL depth, one backend reservation endpoint, and one frontend listings page.

## Baseline Assumptions

These assumptions should be stated clearly in `design.md` so the scale plan has a measurable basis.

| Area | Assumption | Why It Matters |
| --- | --- | --- |
| Intake scale | 200,000 units/month is about 6,700 units/day at target scale. | Write volume is meaningful but not extreme for PostgreSQL. |
| Physical footprint | About 150 intake centers. | Store-level dashboards and operational filtering need good indexes. |
| Unit uniqueness | One physical item equals one inventory row. | Availability must be tracked at unit/listing level, not SKU aggregate level. |
| Marketplace read load | Reads are likely 10x-100x higher than writes, with bursty browse/search traffic. | Read path needs caching and replicas earlier than write sharding. |
| Reservation duration | 30 minutes from reservation creation. | Expiry logic must use database time and cannot rely only on the browser. |
| Reservation correctness | Exactly one active buyer reservation per listing. | This is a data integrity problem, not only a UI problem. |
| Production migration | The assignment explicitly references a 50M-row `units` table. | Migration strategy must avoid table rewrites and long locks. |
| Category example | Use a category like musical instruments or cameras in examples, but keep the schema category-agnostic. | The model should support many verticals without premature category-specific columns. |

## Target Reliability Bar

The solution should be judged as "production-shaped" even though it is a take-home slice.

| Capability | Target |
| --- | --- |
| Reservation correctness | No double booking under concurrent requests. |
| Idempotency | Same buyer and idempotency key returns the same stored outcome. |
| Availability | Expired reservations do not block new reservations. |
| Database integrity | Constraints protect invariants if application logic has a bug. |
| Observability | Important state transitions emit structured logs and metrics. |
| Failure handling | Network retries and partial failures do not create duplicate reservations. |
| Frontend UX | Optimistic updates roll back safely and retry with the same idempotency key. |

## Rough Scale Model

The design document should include rough numbers, not pretend precision.

| Metric | Current | Target | Planning Note |
| --- | ---: | ---: | --- |
| Units/month | 30,000 | 200,000 | 6.7x growth. |
| Units/day | ~1,000 | ~6,700 | Average writes stay modest. |
| Units/year at target | ~360,000 | ~2,400,000 | Historical tables can reach millions quickly. |
| 50M unit table scenario | N/A | Explicit migration scenario | Plan for very large table migrations even if growth estimate is lower. |
| Reservation write QPS | Unknown | Likely low average, bursty peaks | Concurrency correctness matters more than raw write throughput. |
| Marketplace read QPS | Unknown | Potentially hundreds to thousands at peak | Cache, index, and replica strategy matters. |

## Design Principles

1. Put correctness at the data boundary.
   - Use PostgreSQL constraints, transactions, row locks, and idempotency tables for reservations.

2. Keep the initial architecture cohesive.
   - Start with a modular service or modular monolith for inventory/listings/reservations.
   - Split services only when ownership, scale, or failure isolation justifies it.

3. Make read paths scale independently.
   - Use read replicas and cacheable APIs for marketplace listing/search/detail reads.
   - Keep checkout/reservation writes on the primary database.

4. Use async processing for side effects.
   - Search indexing, notifications, audit events, pricing jobs, and image processing should not block core writes.

5. Preserve operational auditability.
   - Unique physical inventory needs a clear trail for lifecycle transitions and human actions.

6. Keep frontend state honest.
   - Optimistic UI is useful, but the server remains authoritative.
   - Rollback and retry behavior must be explicit.

## Main Risks To Address

| Risk | Plan Response |
| --- | --- |
| Double booking a unique item | Transactional reservation algorithm, listing row lock, active reservation constraint, idempotency record. |
| Expired reservations blocking buyers | Expire stale active reservations in the same transaction before checking availability. |
| Search/listing pages becoming slow | Composite and partial indexes, read replicas, caching, eventual OpenSearch path. |
| Store dashboards scanning huge tables | Store/status/timestamp indexes and possibly materialized operational views later. |
| Large table migrations causing downtime | Nullable add, no default rewrite, batched backfill, concurrent indexes, validated constraints. |
| Idempotency key reuse with different payload | Store request hash and reject mismatches. |
| UI retry causing duplicate booking | Stable per-attempt idempotency key reused across retries. |

## Stage Acceptance Criteria

This stage is complete when the final solution can answer:

- What are we optimizing for first: correctness, performance, simplicity, or delivery speed?
- What scale are we assuming?
- What do we intentionally defer?
- Which risks must be proven by tests rather than explained only in prose?

