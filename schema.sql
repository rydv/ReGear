-- ReGear PostgreSQL schema and query work.
-- PostgreSQL is the source of truth for unique physical units, listings,
-- reservations, orders, idempotency, and operational audit history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- Types
-- ============================================================================

CREATE TYPE store_status AS ENUM (
    'active',
    'inactive',
    'closed'
);

CREATE TYPE user_role AS ENUM (
    'buyer',
    'intake_agent',
    'inspector',
    'store_manager',
    'admin'
);

CREATE TYPE user_status AS ENUM (
    'active',
    'suspended',
    'disabled'
);

CREATE TYPE unit_status AS ENUM (
    'procured',
    'inspected',
    'refurbished',
    'priced',
    'listed',
    'reserved',
    'sold',
    'returned',
    'retired'
);

CREATE TYPE inspection_outcome AS ENUM (
    'passed',
    'needs_refurbishment',
    'rejected'
);

CREATE TYPE listing_status AS ENUM (
    'draft',
    'listed',
    'reserved',
    'sold',
    'returned',
    'archived'
);

CREATE TYPE reservation_status AS ENUM (
    'active',
    'expired',
    'released',
    'converted'
);

CREATE TYPE order_status AS ENUM (
    'pending',
    'paid',
    'fulfilled',
    'cancelled',
    'refunded'
);

CREATE TYPE idempotency_status AS ENUM (
    'processing',
    'completed',
    'failed'
);

-- ============================================================================
-- Core tables
-- ============================================================================

CREATE TABLE stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    region text NOT NULL,
    status store_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- "User" from the design is stored as app_users to avoid ambiguity with
-- PostgreSQL user/session terminology.
CREATE TABLE app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext,
    role user_role NOT NULL,
    status user_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id uuid REFERENCES categories (id) ON DELETE RESTRICT,
    slug text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code text NOT NULL,
    category_id uuid NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    intake_store_id uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
    seller_reference text,
    status unit_status NOT NULL DEFAULT 'procured',
    procured_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inspections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id uuid NOT NULL REFERENCES units (id) ON DELETE RESTRICT,
    inspector_id uuid NOT NULL REFERENCES app_users (id) ON DELETE RESTRICT,
    outcome inspection_outcome NOT NULL,
    condition_summary text NOT NULL,
    findings jsonb NOT NULL DEFAULT '{}'::jsonb,
    inspected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id uuid NOT NULL REFERENCES units (id) ON DELETE RESTRICT,
    category_id uuid NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    store_id uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
    status listing_status NOT NULL DEFAULT 'draft',
    price_cents integer NOT NULL CHECK (price_cents > 0),
    currency char(3) NOT NULL DEFAULT 'USD',
    listed_at timestamptz,
    reserved_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (listed_at IS NOT NULL OR status = 'draft'),
    CHECK (reserved_until IS NULL OR reserved_until > created_at)
);

CREATE TABLE reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id uuid NOT NULL REFERENCES listings (id) ON DELETE RESTRICT,
    buyer_id uuid NOT NULL REFERENCES app_users (id) ON DELETE RESTRICT,
    status reservation_status NOT NULL DEFAULT 'active',
    reserved_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
    released_at timestamptz,
    converted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > reserved_at),
    CHECK (
        (status = 'released' AND released_at IS NOT NULL)
        OR (status <> 'released')
    ),
    CHECK (
        (status = 'converted' AND converted_at IS NOT NULL)
        OR (status <> 'converted')
    )
);

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id uuid NOT NULL REFERENCES listings (id) ON DELETE RESTRICT,
    unit_id uuid NOT NULL REFERENCES units (id) ON DELETE RESTRICT,
    buyer_id uuid NOT NULL REFERENCES app_users (id) ON DELETE RESTRICT,
    reservation_id uuid REFERENCES reservations (id) ON DELETE RESTRICT,
    status order_status NOT NULL DEFAULT 'pending',
    total_cents integer NOT NULL CHECK (total_cents > 0),
    currency char(3) NOT NULL DEFAULT 'USD',
    placed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id uuid NOT NULL REFERENCES app_users (id) ON DELETE RESTRICT,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    status idempotency_status NOT NULL DEFAULT 'processing',
    response_status integer,
    response_body jsonb,
    locked_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        status <> 'completed'
        OR (response_status IS NOT NULL AND response_body IS NOT NULL)
    )
);

CREATE TABLE unit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id uuid NOT NULL REFERENCES units (id) ON DELETE RESTRICT,
    actor_id uuid REFERENCES app_users (id) ON DELETE SET NULL,
    event_type text NOT NULL,
    from_status unit_status,
    to_status unit_status,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Day-one indexes
-- ============================================================================

CREATE UNIQUE INDEX stores_name_region_uidx
ON stores (name, region);
COMMENT ON INDEX stores_name_region_uidx IS
'Keeps store names unique within a region and supports ops lookup by physical location.';

CREATE UNIQUE INDEX app_users_email_uidx
ON app_users (email)
WHERE email IS NOT NULL;
COMMENT ON INDEX app_users_email_uidx IS
'Supports login/user lookup while allowing service or placeholder users without email.';

CREATE UNIQUE INDEX categories_slug_uidx
ON categories (slug);
COMMENT ON INDEX categories_slug_uidx IS
'Supports stable category lookup from marketplace filters and URLs.';

CREATE UNIQUE INDEX units_unit_code_uidx
ON units (unit_code);
COMMENT ON INDEX units_unit_code_uidx IS
'Fast immutable lookup by physical inventory code scanned or printed in stores.';

CREATE INDEX units_store_status_updated_idx
ON units (status, updated_at, intake_store_id);
COMMENT ON INDEX units_store_status_updated_idx IS
'Supports ops dashboards for units stuck in a lifecycle state by store and age.';

CREATE INDEX units_category_status_created_idx
ON units (category_id, status, created_at DESC);
COMMENT ON INDEX units_category_status_created_idx IS
'Supports category and lifecycle filtering for operational inventory views.';

CREATE INDEX inspections_unit_created_idx
ON inspections (unit_id, created_at DESC);
COMMENT ON INDEX inspections_unit_created_idx IS
'Fetches the latest inspection history for a unique unit without scanning all inspections.';

CREATE INDEX inspections_inspector_created_idx
ON inspections (inspector_id, created_at DESC);
COMMENT ON INDEX inspections_inspector_created_idx IS
'Supports inspector workload review and quality audit queries.';

CREATE UNIQUE INDEX listings_one_open_listing_per_unit_uidx
ON listings (unit_id)
WHERE status IN ('draft', 'listed', 'reserved');
COMMENT ON INDEX listings_one_open_listing_per_unit_uidx IS
'Prevents multiple simultaneously open marketplace listings for the same physical unit.';

CREATE INDEX listings_marketplace_search_idx
ON listings (category_id, status, price_cents, listed_at DESC, id DESC);
COMMENT ON INDEX listings_marketplace_search_idx IS
'Supports marketplace search by category, availability status, price range, and recency.';

CREATE INDEX listings_recent_available_idx
ON listings (status, listed_at DESC)
WHERE status = 'listed';
COMMENT ON INDEX listings_recent_available_idx IS
'Supports recent available listing pages and fallback browsing without category filters.';

CREATE INDEX listings_store_status_idx
ON listings (store_id, status, updated_at DESC);
COMMENT ON INDEX listings_store_status_idx IS
'Supports store-manager listing queues by store and current listing status.';

CREATE UNIQUE INDEX reservations_one_active_per_listing_uidx
ON reservations (listing_id)
WHERE status = 'active';
COMMENT ON INDEX reservations_one_active_per_listing_uidx IS
'Enforces the invariant that a listing can have only one active reservation at a time.';

CREATE INDEX reservations_active_expiry_idx
ON reservations (status, expires_at)
WHERE status = 'active';
COMMENT ON INDEX reservations_active_expiry_idx IS
'Supports reservation expiry sweeps ordered by the next active reservation to expire.';

CREATE INDEX reservations_buyer_status_expiry_idx
ON reservations (buyer_id, status, expires_at DESC);
COMMENT ON INDEX reservations_buyer_status_expiry_idx IS
'Supports buyer checkout state and active reservation lookups.';

CREATE UNIQUE INDEX orders_reservation_uidx
ON orders (reservation_id)
WHERE reservation_id IS NOT NULL;
COMMENT ON INDEX orders_reservation_uidx IS
'Prevents converting the same reservation into more than one order.';

CREATE UNIQUE INDEX orders_one_open_order_per_listing_uidx
ON orders (listing_id)
WHERE status IN ('pending', 'paid', 'fulfilled');
COMMENT ON INDEX orders_one_open_order_per_listing_uidx IS
'Prevents a listing from being sold through multiple non-cancelled orders.';

CREATE UNIQUE INDEX idempotency_keys_buyer_key_uidx
ON idempotency_keys (buyer_id, idempotency_key);
COMMENT ON INDEX idempotency_keys_buyer_key_uidx IS
'Provides fast idempotent replay lookup and prevents duplicate processing per buyer key.';

CREATE INDEX unit_events_unit_created_idx
ON unit_events (unit_id, created_at DESC);
COMMENT ON INDEX unit_events_unit_created_idx IS
'Supports append-only audit history reads for a physical unit.';

CREATE INDEX unit_events_type_created_idx
ON unit_events (event_type, created_at DESC);
COMMENT ON INDEX unit_events_type_created_idx IS
'Supports operational audit searches by event type and recency.';

-- ============================================================================
-- Migration strategy note: add condition_grade ENUM to 50M-row units table
-- ============================================================================

-- 1. Create condition_grade as an enum in a short transaction.
-- 2. Add units.condition_grade as nullable with no default; this is metadata-only.
-- 3. Deploy app code that tolerates NULL and writes condition_grade for new/changed units.
-- 4. Backfill old rows in small primary-key batches, committing between batches.
-- 5. Throttle the backfill and monitor lock waits, replica lag, I/O, and autovacuum.
-- 6. Create any supporting index with CREATE INDEX CONCURRENTLY after the column exists.
-- 7. If non-null is required, add CHECK (condition_grade IS NOT NULL) NOT VALID.
-- 8. Validate the check constraint later with VALIDATE CONSTRAINT during normal traffic.
-- 9. Add a default only after the backfill so Postgres does not rewrite existing rows.
-- 10. Set NOT NULL only in a controlled window if validation proves it is safe; otherwise keep the validated check.

-- Example migration commands:
-- CREATE TYPE condition_grade AS ENUM ('poor', 'fair', 'good', 'very_good', 'excellent');
-- ALTER TABLE units ADD COLUMN condition_grade condition_grade;
-- CREATE INDEX CONCURRENTLY units_condition_grade_idx ON units (condition_grade) WHERE condition_grade IS NOT NULL;

-- ============================================================================
-- Required queries
-- ============================================================================

-- 1. Marketplace search:
-- Show available listings for category X, price range Y-Z, sorted by recency, page N.
-- Uses listings_marketplace_search_idx for category/status/price filtering and recency,
-- plus reservations_one_active_per_listing_uidx to exclude live active reservations.
-- Bind parameters:
--   $1 = category_id
--   $2 = min_price_cents
--   $3 = max_price_cents
--   $4 = page_size
--   $5 = page_number, e.g. 3
SELECT
    l.id,
    l.unit_id,
    l.category_id,
    l.store_id,
    l.price_cents,
    l.currency,
    l.listed_at
FROM listings AS l
WHERE l.status = 'listed'
  AND l.category_id = $1
  AND l.price_cents BETWEEN $2 AND $3
  AND NOT EXISTS (
      SELECT 1
      FROM reservations AS r
      WHERE r.listing_id = l.id
        AND r.status = 'active'
        AND r.expires_at > now()
  )
ORDER BY l.listed_at DESC, l.id DESC
LIMIT $4
OFFSET (($5 - 1) * $4);

-- 2. Ops dashboard:
-- Units stuck in the Inspected state for more than 48 hours, grouped by store.
-- Uses units_store_status_updated_idx for status and age filtering, with store grouping.
SELECT
    u.intake_store_id,
    s.name AS store_name,
    count(*) AS stuck_unit_count
FROM units AS u
JOIN stores AS s ON s.id = u.intake_store_id
WHERE u.status = 'inspected'
  AND u.updated_at < now() - interval '48 hours'
GROUP BY u.intake_store_id, s.name
ORDER BY stuck_unit_count DESC, s.name ASC;

-- 3. Reservation expiry sweep:
-- Find reservations older than 30 minutes that are still active.
-- Uses reservations_active_expiry_idx to scan active reservations by earliest expiry.
SELECT
    r.id,
    r.listing_id,
    r.buyer_id,
    r.reserved_at,
    r.expires_at
FROM reservations AS r
WHERE r.status = 'active'
  AND r.expires_at <= now()
ORDER BY r.expires_at ASC
LIMIT $1;
