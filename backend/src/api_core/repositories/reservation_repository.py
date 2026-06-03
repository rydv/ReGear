from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ReservationRepository:
    async def insert_idempotency_key_if_absent(
        self,
        session: AsyncSession,
        *,
        buyer_id: UUID,
        idempotency_key: str,
        request_hash: str,
    ) -> None:
        await session.execute(
            text(
                """
                INSERT INTO idempotency_keys (buyer_id, idempotency_key, request_hash, status)
                VALUES (:buyer_id, :idempotency_key, :request_hash, 'processing')
                ON CONFLICT (buyer_id, idempotency_key) DO NOTHING
                """
            ),
            {
                "buyer_id": buyer_id,
                "idempotency_key": idempotency_key,
                "request_hash": request_hash,
            },
        )

    async def lock_idempotency_key(
        self,
        session: AsyncSession,
        *,
        buyer_id: UUID,
        idempotency_key: str,
    ) -> dict[str, Any]:
        result = await session.execute(
            text(
                """
                SELECT id, request_hash, status, response_status, response_body
                FROM idempotency_keys
                WHERE buyer_id = :buyer_id
                  AND idempotency_key = :idempotency_key
                FOR UPDATE
                """
            ),
            {"buyer_id": buyer_id, "idempotency_key": idempotency_key},
        )
        row = result.mappings().one()
        return dict(row)

    async def complete_idempotency_key(
        self,
        session: AsyncSession,
        *,
        idempotency_row_id: UUID,
        response_status: int,
        response_body_json: str,
    ) -> None:
        await session.execute(
            text(
                """
                UPDATE idempotency_keys
                SET status = 'completed',
                    response_status = :response_status,
                    response_body = CAST(:response_body AS jsonb),
                    updated_at = now()
                WHERE id = :id
                """
            ),
            {
                "id": idempotency_row_id,
                "response_status": response_status,
                "response_body": response_body_json,
            },
        )

    async def get_database_now(self, session: AsyncSession):
        result = await session.execute(text("SELECT now()"))
        return result.scalar_one()

    async def lock_listing(
        self,
        session: AsyncSession,
        *,
        listing_id: UUID,
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text(
                """
                SELECT id, status, reserved_until
                FROM listings
                WHERE id = :listing_id
                FOR UPDATE
                """
            ),
            {"listing_id": listing_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def expire_stale_reservations(
        self,
        session: AsyncSession,
        *,
        listing_id: UUID,
    ) -> int:
        result = await session.execute(
            text(
                """
                UPDATE reservations
                SET status = 'expired',
                    updated_at = now()
                WHERE listing_id = :listing_id
                  AND status = 'active'
                  AND expires_at <= now()
                """
            ),
            {"listing_id": listing_id},
        )
        return result.rowcount or 0

    async def clear_listing_hold(
        self,
        session: AsyncSession,
        *,
        listing_id: UUID,
    ) -> None:
        await session.execute(
            text(
                """
                UPDATE listings
                SET status = 'listed',
                    reserved_until = NULL,
                    updated_at = now()
                WHERE id = :listing_id
                  AND status = 'reserved'
                """
            ),
            {"listing_id": listing_id},
        )

    async def find_active_reservation(
        self,
        session: AsyncSession,
        *,
        listing_id: UUID,
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text(
                """
                SELECT id, buyer_id, expires_at
                FROM reservations
                WHERE listing_id = :listing_id
                  AND status = 'active'
                  AND expires_at > now()
                ORDER BY expires_at DESC
                LIMIT 1
                FOR UPDATE
                """
            ),
            {"listing_id": listing_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def create_reservation(
        self,
        session: AsyncSession,
        *,
        listing_id: UUID,
        buyer_id: UUID,
        ttl_minutes: int,
    ) -> dict[str, Any]:
        result = await session.execute(
            text(
                """
                INSERT INTO reservations (listing_id, buyer_id, status, reserved_at, expires_at)
                VALUES (
                    :listing_id,
                    :buyer_id,
                    'active',
                    now(),
                    now() + (:ttl_minutes * interval '1 minute')
                )
                RETURNING id, listing_id, buyer_id, status, expires_at
                """
            ),
            {
                "listing_id": listing_id,
                "buyer_id": buyer_id,
                "ttl_minutes": ttl_minutes,
            },
        )
        return dict(result.mappings().one())

    async def mark_listing_reserved(
        self,
        session: AsyncSession,
        *,
        listing_id: UUID,
        reserved_until,
    ) -> None:
        await session.execute(
            text(
                """
                UPDATE listings
                SET status = 'reserved',
                    reserved_until = :reserved_until,
                    updated_at = now()
                WHERE id = :listing_id
                """
            ),
            {"listing_id": listing_id, "reserved_until": reserved_until},
        )

