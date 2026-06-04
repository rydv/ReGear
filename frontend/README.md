# ReGear Frontend Listings Slice

This frontend implements the reservable listings page for the take-home assignment. It uses Vite, React, TypeScript, TanStack Query, MSW, Vitest, and React Testing Library.

## Run Locally

```bash
cd frontend
npm install
npm run dev
```

By default, development mode starts MSW and serves realistic mocked responses for `GET /listings` and `POST /listings/{id}/reserve`. To call a running backend instead, use:

```bash
VITE_ENABLE_MSW=false VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

The backend slice currently owns `POST /listings/{id}/reserve`; `GET /listings` is intentionally stubbed for this frontend deliverable.

## Checks

```bash
npm run typecheck
npm run build
npm run test:run
```

## Structure

- `src/api`: typed fetch client, listing query, reserve mutation, and response normalization.
- `src/hooks`: TanStack Query hooks, stable idempotency key handling, optimistic reserve flow, and countdown expiry updates.
- `src/components`: page-level filters, listing cards, pagination, countdown, and accessible error banner.
- `src/mocks`: MSW fixtures and handlers for development and component tests.

## Data Fetching

TanStack Query owns server state, cache snapshots, request deduplication, optimistic writes, rollback, and invalidation. The listings query key includes filters and page so the UI can keep stale page data while refetching.

The reserve mutation snapshots every cached listings page, marks the listing card as reserved immediately, rolls back on conflicts or transient failures, and reuses the same idempotency key when the user retries after a network or 5xx error.

## Countdown

The countdown is local and derived from `reservationExpiresAt`. When it reaches zero, the listing card flips back to available in the local cache and the listings query is invalidated so the server can reconcile the final state. This avoids server push for a slice where second-by-second cross-device accuracy is not required.

## Design-System Boundary

I would extract buttons, form fields, status pills, card primitives, pagination, and alert patterns into a design-system layer. The reserve-specific query hooks, listing card behavior, and countdown expiry logic should remain page/domain-local.

## 50k Row Path

For large result sets, keep filtering and sorting on the server, move offset pagination to cursor pagination, debounce filter inputs, and add virtualization with `@tanstack/react-virtual`. Countdown rendering should be limited to visible current-user reservations.

## What I Would Add With More Time

I would add contract tests against the real backend, auth-backed buyer identity, route-level error boundaries, analytics for reserve conflicts and retries, and visual regression coverage for dense marketplace states.
