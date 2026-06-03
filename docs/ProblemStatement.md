# Take-Home Assignment — Tech Lead

## Context

**ReGear** is a pre-owned goods marketplace. The company sources second-hand items (think cameras, musical instruments, power tools — pick any category you like for your write-up) from individual sellers across ~150 physical intake centers, inspects and refurbishes them in-house, and resells them via a consumer website and mobile app.

Each unit is **unique** (one physical item = one inventory record) and moves through a lifecycle:

```text
Procured → Inspected → Refurbished → Priced → Listed → Reserved → Sold / Returned
```

Today ReGear processes ~30,000 units/month. Leadership wants the platform to scale to **200,000 units/month within 18 months** while keeping the customer marketplace fast and the in-store ops tooling reliable.

You are joining as the Tech Lead for the **Inventory & Listings** product area. Your team owns:

- The internal ops tools used by intake agents, inspectors, and store managers.
- The catalog APIs that power the customer marketplace, search, and detail pages.
- The reservation flow that holds a unit for a buyer for 30 minutes during checkout.

## Stack Constraints

- Python (FastAPI / Django), React, PostgreSQL, AWS.

## What We Want You To Do

Spend **8–10 hours total**. We’re explicitly looking for senior judgment, not exhaustive output. Submit four things.

## 1. System Design Document (~3–4 hrs)

A written design (Markdown/PDF, **max 6 pages including diagrams**) covering:

- **High-level architecture** — services, data stores, queues, caches, third-party integrations. One block diagram.
- **Core data model** — entities and their relationships (ER diagram + brief prose). Cover at minimum: Unit, Inspection, Listing, Reservation, Order, User, Store. Call out which fields are mutable vs. immutable and why.
- **API surface** — the 6–10 most important endpoints with method, path, purpose, and key auth/concurrency notes. Don’t write OpenAPI — keep it tight.
- **Scaling plan** — given ~7x growth in 18 months, what breaks first and what you’d change. Include rough numbers (QPS, row counts, storage growth) and where you’d introduce caching, read replicas, async processing, or service splits.
- **Three trade-offs you explicitly made**, written as mini-ADRs (~150 words each). E.g., “monolith vs. service split now,” “search in Postgres vs. OpenSearch,” “reservation via row-lock vs. Redis.”
- **What you’d defer** — one paragraph listing what you’d **not** build in the first 6 months and why.

We care more about **reasoning quality** than diagram polish.

## 2. PostgreSQL Schema + Query Work (~1.5 hrs)

In a single `.sql` file:

- DDL for the core tables from your data model (Unit, Listing, Reservation at minimum — others optional).
- Indexes you’d create on day one, with a one-line comment explaining each.
- A migration strategy note (~10 lines) for how you’d add a new `condition_grade ENUM` column to a 50M-row `units` table in production without downtime.
- Three queries, each with a brief note on the index it uses:

1. Marketplace search: “show available listings for category X, price range Y–Z, sorted by recency, page 3.”
2. Ops dashboard: “units stuck in the `Inspected` state for more than 48 hours, grouped by store.”
3. Reservation expiry sweep: “find reservations older than 30 minutes that are still active.”

## 3. Backend Code Slice — Reservation Endpoint (~2 hrs)

Implement **one** endpoint in Python (framework of your choice):

```http
POST /listings/{listing_id}/reserve
```

Body:

```json
{ "buyer_id": "...", "idempotency_key": "..." }
```

Requirements:

- A listing can only be reserved by **one** buyer at a time.
- Reservations expire after 30 minutes; an expired reservation must not block a new one.
- The endpoint must be **safe under concurrent requests** — two buyers hitting it simultaneously must result in exactly one success.
- The endpoint must be **idempotent** on `idempotency_key` — retrying the same call returns the same result without double-booking.
- Return appropriate HTTP status codes and error shapes for: already reserved, listing not found, listing not in a reservable state, idempotent replay.

Include:

- The endpoint code + any helpers.
- The relevant DB migration / DDL (can reuse from deliverable 2).
- Tests that demonstrate the concurrency and idempotency guarantees (use `pytest` + a real Postgres via `testcontainers`, or document why you mocked).
- A short **README** (≤1 page) on how to run it and what you’d add with more time.

No need to build auth, the surrounding service, or a frontend. Focus on getting this one thing genuinely production-quality.

## 4. Frontend Slice — Reservable Listings Page (~2 hrs)

Build a small **React + TypeScript** page (Vite / CRA / Next.js — your call) that consumes the backend you built in Deliverable 3:

```http
GET /listings → paginated list of listings with status, price, category, store
POST /listings/{id}/reserve
```

(You can stub `GET /listings` with a hardcoded handler or in-memory data — we won’t grade the list endpoint, only the UI on top of it.)

The page must:

- Render a **paginated, filterable list** of listings (filters: category, price range, status). Show price, category, store, current status, and a **Reserve** button per row.
- On **Reserve**, call `POST /reserve` with a generated `idempotency_key`. Handle the four backend outcomes meaningfully in the UI: success, already-reserved-by-someone-else, listing-not-reservable, network/5xx.
- Use **optimistic UI** for the reserve action, with proper rollback on failure.
- Show a 30-minute **countdown** on listings the current user has reserved; flip the row back to “available” in the UI when it expires (no need for true server-push — polling or a local timer is fine, but justify your choice).
- Be **keyboard-accessible** for the core flow (tab to a row, activate Reserve, dismiss errors).

We’re looking for:

- **Component decomposition** — where you draw boundaries, what’s a hook vs. a component, what’s local vs. shared state.
- **Data-fetching discipline** — caching, loading/error/empty states, request deduplication, handling stale data after a mutation. Pick a library (React Query, SWR, RTK Query, plain `fetch`) and justify it briefly in the README.
- **Performance hygiene** — what you’d do if this list had 50k rows (you don’t need to implement virtualization, but mention it).
- **Type safety** — shared types between API contract and components; no `any` in user-written code.

Include:

- The page + components + hooks.
- 2–3 component tests (React Testing Library) covering: optimistic-update rollback on failure, and idempotent retry behavior on a transient error.
- A short note in the README on what you’d extract into a design-system layer vs. keep page-local.

No need for routing, auth UI, or styling polish — a clean, plain layout is fine. Tailwind / CSS modules / vanilla CSS all OK.

## Submission

A single Git repo (GitHub/GitLab) or zip.

Structure:

```text
/design.md
/schema.sql
/backend/
/frontend/README.md
```

Include a **“What I’d do differently with more time”** section at the end of the README — we read this carefully.

## Evaluation Rubric

| Area | Weight | What good looks like |
| --- | ---: | --- |
| System design clarity | 20% | Crisp diagrams, identifies the real bottlenecks, no over-engineering. |
| Trade-off reasoning | 15% | ADRs show you considered alternatives and chose with conviction. |
| Postgres depth | 20% | Schema reflects access patterns; indexes match queries; migration plan is safe. |
| Backend code quality | 15% | Correct concurrency, clean structure, meaningful tests, idiomatic Python. |
| Frontend code quality | 15% | Sound component/state boundaries, careful async handling, type-safe contract with the API. |
| Communication | 15% | Doc is easy to skim, decisions are easy to find, scope is honest. |
