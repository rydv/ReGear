import asyncio
import pathlib
import sys
import uuid
from typing import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from src.configs.service_config import ApiConfiguration  # noqa: E402
from src.db.postgres_db_manager import PostgresDBManager  # noqa: E402


def _to_asyncpg_url(url: str) -> str:
    return (
        url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
        .replace("postgresql://", "postgresql+asyncpg://")
    )


async def _apply_migration(database_url: str) -> None:
    manager = PostgresDBManager(database_url)
    migration_path = BACKEND_DIR / "migrations" / "001_reservation_schema.sql"
    statements = [
        statement.strip()
        for statement in migration_path.read_text().split(";")
        if statement.strip()
    ]
    async with manager.engine.begin() as connection:
        for statement in statements:
            await connection.exec_driver_sql(statement)
    await manager.dispose()


@pytest.fixture(scope="session")
def postgres_url() -> str:
    postgres_module = pytest.importorskip("testcontainers.postgres")
    try:
        container = postgres_module.PostgresContainer("postgres:16-alpine")
        container.start()
    except Exception as exc:  # pragma: no cover - depends on local Docker.
        pytest.skip(f"PostgreSQL testcontainer could not start: {exc}")

    try:
        yield _to_asyncpg_url(container.get_connection_url())
    finally:
        container.stop()


@pytest.fixture(scope="session")
def migrated_postgres_url(postgres_url: str) -> str:
    asyncio.run(_apply_migration(postgres_url))
    return postgres_url


@pytest_asyncio.fixture
async def db_manager(migrated_postgres_url: str) -> AsyncIterator[PostgresDBManager]:
    manager = PostgresDBManager(migrated_postgres_url)
    async with manager.engine.begin() as connection:
        await connection.execute(
            text(
                """
                TRUNCATE idempotency_keys, reservations, listings, units,
                         categories, stores, app_users
                RESTART IDENTITY CASCADE
                """
            )
        )
    try:
        yield manager
    finally:
        await manager.dispose()


@pytest_asyncio.fixture
async def api_client(db_manager: PostgresDBManager, migrated_postgres_url: str):
    settings = ApiConfiguration(database_url=migrated_postgres_url)
    app = create_app(settings=settings, db_manager=db_manager)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        yield client


@pytest_asyncio.fixture
async def db_session(db_manager: PostgresDBManager):
    async with db_manager.session_factory() as session:
        yield session


async def seed_buyer(session, buyer_id: uuid.UUID | None = None) -> uuid.UUID:
    buyer_id = buyer_id or uuid.uuid4()
    await session.execute(
        text(
            """
            INSERT INTO app_users (id, role, status)
            VALUES (:buyer_id, 'buyer', 'active')
            """
        ),
        {"buyer_id": buyer_id},
    )
    return buyer_id


async def seed_listing(
    session,
    *,
    listing_id: uuid.UUID | None = None,
    status: str = "listed",
    buyer_ids: list[uuid.UUID] | None = None,
) -> dict[str, uuid.UUID]:
    listing_id = listing_id or uuid.uuid4()
    store_id = uuid.uuid4()
    category_id = uuid.uuid4()
    unit_id = uuid.uuid4()
    buyer_ids = buyer_ids or [uuid.uuid4()]

    for buyer_id in buyer_ids:
        await seed_buyer(session, buyer_id)

    await session.execute(
        text(
            """
            INSERT INTO stores (id, name, region)
            VALUES (:store_id, :name, 'west')
            """
        ),
        {"store_id": store_id, "name": f"store-{store_id}"},
    )
    await session.execute(
        text(
            """
            INSERT INTO categories (id, slug, name)
            VALUES (:category_id, :slug, 'Cameras')
            """
        ),
        {"category_id": category_id, "slug": f"camera-{category_id}"},
    )
    await session.execute(
        text(
            """
            INSERT INTO units (id, unit_code, category_id, intake_store_id, status)
            VALUES (:unit_id, :unit_code, :category_id, :store_id, 'listed')
            """
        ),
        {
            "unit_id": unit_id,
            "unit_code": f"unit-{unit_id}",
            "category_id": category_id,
            "store_id": store_id,
        },
    )
    await session.execute(
        text(
            """
            INSERT INTO listings (
                id, unit_id, category_id, store_id, status,
                price_cents, currency, listed_at
            )
            VALUES (
                :listing_id, :unit_id, :category_id, :store_id,
                CAST(:status AS listing_status), 12999, 'USD', now()
            )
            """
        ),
        {
            "listing_id": listing_id,
            "unit_id": unit_id,
            "category_id": category_id,
            "store_id": store_id,
            "status": status,
        },
    )
    return {
        "listing_id": listing_id,
        "buyer_id": buyer_ids[0],
        "store_id": store_id,
        "category_id": category_id,
        "unit_id": unit_id,
    }


async def seed_active_reservation(
    session,
    *,
    listing_id: uuid.UUID,
    buyer_id: uuid.UUID,
) -> uuid.UUID:
    reservation_id = uuid.uuid4()
    await session.execute(
        text(
            """
            INSERT INTO reservations (id, listing_id, buyer_id, status, reserved_at, expires_at)
            VALUES (
                :reservation_id,
                :listing_id,
                :buyer_id,
                'active',
                now(),
                now() + interval '30 minutes'
            )
            """
        ),
        {
            "reservation_id": reservation_id,
            "listing_id": listing_id,
            "buyer_id": buyer_id,
        },
    )
    await session.execute(
        text(
            """
            UPDATE listings
            SET status = 'reserved',
                reserved_until = now() + interval '30 minutes'
            WHERE id = :listing_id
            """
        ),
        {"listing_id": listing_id},
    )
    return reservation_id


async def seed_expired_active_reservation(
    session,
    *,
    listing_id: uuid.UUID,
    buyer_id: uuid.UUID,
) -> uuid.UUID:
    reservation_id = uuid.uuid4()
    await session.execute(
        text(
            """
            UPDATE listings
            SET created_at = now() - interval '2 hours',
                status = 'reserved',
                reserved_until = now() - interval '1 minute'
            WHERE id = :listing_id
            """
        ),
        {"listing_id": listing_id},
    )
    await session.execute(
        text(
            """
            INSERT INTO reservations (id, listing_id, buyer_id, status, reserved_at, expires_at)
            VALUES (
                :reservation_id,
                :listing_id,
                :buyer_id,
                'active',
                now() - interval '31 minutes',
                now() - interval '1 minute'
            )
            """
        ),
        {
            "reservation_id": reservation_id,
            "listing_id": listing_id,
            "buyer_id": buyer_id,
        },
    )
    return reservation_id
