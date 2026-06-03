# ReGear Backend Reservation Slice

This backend implements:

```http
POST /listings/{listing_id}/reserve
```

It uses FastAPI, SQLAlchemy 2.x async sessions, PostgreSQL, and pytest with testcontainers. The code is intentionally small but follows the layered style from `fg-strategy-service`: controller, service, repository, shared models, DB manager, and response helpers.

## Run Locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
export DATABASE_URL="postgresql+asyncpg://regear:regear@localhost:5432/regear"
uvicorn app:app --reload
```

Apply `migrations/001_reservation_schema.sql` to the target PostgreSQL database before calling the endpoint.

## Run Tests

```bash
cd backend
pytest
```

The tests use a real PostgreSQL container through `testcontainers`. Docker must be running locally. If Docker or the PostgreSQL image is unavailable, pytest skips the container-backed tests with a message explaining the startup failure.

## Reservation Strategy

Each request first inserts or locks an idempotency row scoped by `(buyer_id, idempotency_key)`. A completed row returns its stored response; if the same key is reused for a different listing/body, the endpoint returns `409 idempotency_key_conflict`.

The reservation decision then runs in the same short database transaction. The service locks the listing row with `SELECT ... FOR UPDATE`, expires stale active reservations using PostgreSQL `now()`, checks for any remaining active hold, inserts one new active reservation, marks the listing reserved, and stores the canonical response in the idempotency table before committing. The partial unique index on active reservations is the final database backstop.

## With More Time

I would add structured logging and metrics around lock duration, replay rate, and reservation conflicts; a sweep worker for stale reservations; migration tooling such as Alembic; auth so `buyer_id` comes from the token; and a small load test that measures contention on hot listings.

