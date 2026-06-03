CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

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

CREATE TYPE idempotency_status AS ENUM (
    'processing',
    'completed',
    'failed'
);

CREATE TABLE stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    region text NOT NULL,
    status store_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE UNIQUE INDEX stores_name_region_uidx
ON stores (name, region);

CREATE UNIQUE INDEX app_users_email_uidx
ON app_users (email)
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX categories_slug_uidx
ON categories (slug);

CREATE UNIQUE INDEX units_unit_code_uidx
ON units (unit_code);

CREATE UNIQUE INDEX listings_one_open_listing_per_unit_uidx
ON listings (unit_id)
WHERE status IN ('draft', 'listed', 'reserved');

CREATE INDEX listings_status_idx
ON listings (status, listed_at DESC);

CREATE UNIQUE INDEX reservations_one_active_per_listing_uidx
ON reservations (listing_id)
WHERE status = 'active';

CREATE INDEX reservations_active_expiry_idx
ON reservations (status, expires_at)
WHERE status = 'active';

CREATE INDEX reservations_buyer_status_expiry_idx
ON reservations (buyer_id, status, expires_at DESC);

CREATE UNIQUE INDEX idempotency_keys_buyer_key_uidx
ON idempotency_keys (buyer_id, idempotency_key);

