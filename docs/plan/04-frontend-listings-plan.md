# 04 - Frontend Listings Plan

## Navigation

- Index: [README](README.md)
- Previous: [03 - Backend Reservation Plan](03-backend-reservation-plan.md)
- Next: [05 - Quality Gates](05-quality-gates.md)

## Purpose

This stage guides the React + TypeScript reservable listings page. The UI does not need styling polish, but it should prove careful async handling, type safety, accessibility, and optimistic reservation behavior.

## Recommended Stack

Use:

- Vite.
- React.
- TypeScript.
- TanStack Query for fetching, caching, request deduplication, mutations, and invalidation.
- React Testing Library for component tests.
- MSW or a lightweight test server mock for API behavior.

Why TanStack Query:

- The assignment explicitly values caching, loading/error/empty states, stale data handling, and mutation discipline.
- It gives a small app production-shaped data handling without writing a custom cache.

## Proposed Frontend Layout

```text
frontend/
  README.md
  package.json
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx
    api/
      client.ts
      listings.ts
      types.ts
    components/
      ErrorBanner.tsx
      FilterBar.tsx
      ListingRow.tsx
      ListingsTable.tsx
      Pagination.tsx
      ReservationCountdown.tsx
    hooks/
      useListings.ts
      useReserveListing.ts
      useReservationCountdown.ts
      useStableIdempotencyKey.ts
    test/
      server.ts
      fixtures.ts
    __tests__/
      ReservableListingsPage.test.tsx
```

## API Contract Types

Keep user-written TypeScript free of `any`. Define shared frontend API types:

```ts
export type ListingStatus = "listed" | "reserved" | "sold" | "returned" | "draft";

export interface Listing {
  id: string;
  status: ListingStatus;
  priceCents: number;
  currency: "USD";
  category: string;
  store: {
    id: string;
    name: string;
  };
  reservedByBuyerId?: string;
  reservationExpiresAt?: string;
}

export interface ReserveListingRequest {
  buyerId: string;
  idempotencyKey: string;
}

export interface ReserveListingSuccess {
  reservationId: string;
  listingId: string;
  buyerId: string;
  status: "active";
  expiresAt: string;
  idempotentReplay: boolean;
}

export type ApiErrorCode =
  | "already_reserved"
  | "listing_not_found"
  | "listing_not_reservable"
  | "idempotency_key_conflict"
  | "network_error"
  | "server_error";
```

## Page Behavior

The page must support:

- Paginated list of listings.
- Filters:
  - Category.
  - Minimum price.
  - Maximum price.
  - Status.
- Listing row fields:
  - Price.
  - Category.
  - Store.
  - Status.
  - Reserve button.
- Optimistic reserve action.
- Rollback on failure.
- Countdown for current user's active reservations.
- Keyboard access for reserve and error dismissal.

## Component Boundaries

| Component/Hook | Responsibility |
| --- | --- |
| `App` or `ReservableListingsPage` | Owns current filters/page and current user id fixture. |
| `FilterBar` | Controlled filter inputs. |
| `ListingsTable` | Renders table structure, loading, empty, and rows. |
| `ListingRow` | Renders one listing and reserve button state. |
| `ReservationCountdown` | Displays remaining time for current user's reservation. |
| `ErrorBanner` | Announces and dismisses action-level errors. |
| `Pagination` | Page navigation. |
| `useListings` | Query listings with filters and page. |
| `useReserveListing` | Mutation, optimistic update, rollback, retry behavior. |
| `useStableIdempotencyKey` | Generates and preserves idempotency key per reserve attempt. |
| `useReservationCountdown` | Local timer based on `expiresAt`. |

## Data Fetching Plan

`useListings`:

- Query key includes filters and page.
- Show loading state on first load.
- Show stale data while refetching.
- Show empty state when no listings match.
- Use server pagination in the request shape, even if the stub is in-memory.

`useReserveListing`:

- Generate a stable idempotency key for a reserve attempt.
- Optimistically mark listing as reserved by current user.
- Add a local `reservationExpiresAt` of now plus 30 minutes.
- Roll back from snapshot on `already_reserved`, `listing_not_reservable`, or network/server failure.
- On success, replace optimistic expiry with server `expiresAt`.
- Invalidate listings after success to reconcile with server truth.
- Reuse the same idempotency key for retry after transient failure.

## Optimistic UI Details

When the user clicks Reserve:

```text
1. Capture current query cache snapshot.
2. Generate stable idempotency key for listing + current buyer + action attempt.
3. Update row immediately:
   - status: reserved
   - reservedByBuyerId: current buyer
   - reservationExpiresAt: now + 30 minutes
4. Send POST /listings/{id}/reserve.
5. On success:
   - write canonical server reservation expiry
   - clear pending state
   - show success state
6. On failure:
   - restore cached snapshot
   - show meaningful error banner
7. On transient retry:
   - reuse the same idempotency key
```

## Backend Outcome Handling

| Backend Outcome | UI Behavior |
| --- | --- |
| Success | Row remains reserved, countdown starts or is corrected by server expiry. |
| Already reserved by someone else | Roll back, disable or label row as unavailable, show conflict message. |
| Listing not reservable | Roll back, update status if response includes it, show state-change message. |
| Network/5xx | Roll back visible optimistic state, offer retry that reuses idempotency key. |

## Countdown Plan

Use a local timer for countdown display:

- It is enough because the prompt does not require true server push.
- The server remains authoritative after refetch.
- The UI flips the row back to available when local countdown reaches zero.
- A background query invalidation or periodic refetch can reconcile drift.

Implementation notes:

- Calculate remaining time from `reservationExpiresAt`, not from a stored decrementing counter.
- Use `setInterval` at 1-second granularity only for rows with active current-user reservations.
- Clear interval on unmount.
- Avoid changing layout width by using a stable countdown text container.

## Accessibility Plan

Core flow must be keyboard-accessible:

- Use real `<button>` elements for Reserve and error dismissal.
- Keep table row content readable by screen readers.
- Use visible focus states.
- Error banner should use `role="alert"` or `aria-live="polite"`.
- Reserve button should expose disabled/loading states with `disabled` and `aria-busy` where useful.
- Do not rely on color alone for status.

## Performance Plan

For the slice:

- Server-side pagination and filtering in the API contract.
- Stable query keys.
- Avoid unnecessary re-renders with local component boundaries.

If the list had 50k rows:

- Keep filtering/sorting on the server.
- Use cursor pagination for large result sets.
- Add virtualization with `react-window` or `@tanstack/react-virtual`.
- Debounce numeric/text filters.
- Avoid rendering countdown timers for off-screen rows.
- Cache category/status filter metadata separately.

## Component Tests

Required tests:

| Test | Scenario | Expected Result |
| --- | --- | --- |
| Optimistic rollback | Reserve returns `already_reserved` or `listing_not_reservable`. | Row first changes optimistically, then returns to original/updated server state and shows error. |
| Transient retry idempotency | First request fails with network/5xx, retry is clicked. | Second request uses the same idempotency key. |
| Countdown expiry | Current user has reserved listing with near-future expiry. | Countdown reaches zero and row returns to available in local UI. |

Recommended additional test:

- Loading/empty state for filters.
- Keyboard activation of Reserve button.

## Frontend README Plan

`frontend/README.md` should include:

- Stack choice and why.
- How to install, run, test, and build.
- Data fetching choice and cache behavior.
- Countdown/polling justification.
- What would move to a design system.
- What would be added for 50k rows.

## Stage Acceptance Criteria

This stage is complete when the frontend plan can be converted into code that proves:

- Typed API contract.
- Meaningful handling of the four backend outcomes.
- Optimistic update with rollback.
- Stable idempotency key across retry.
- Accessible core reserve flow.

