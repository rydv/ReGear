import asyncio
import uuid

import pytest
from sqlalchemy import text

from tests.conftest import (
    seed_active_reservation,
    seed_buyer,
    seed_expired_active_reservation,
    seed_listing,
)

pytestmark = pytest.mark.asyncio


async def count_reservations(session, listing_id: uuid.UUID, status: str | None = None) -> int:
    status_filter = "AND status = CAST(:status AS reservation_status)" if status else ""
    result = await session.execute(
        text(
            f"""
            SELECT count(*)
            FROM reservations
            WHERE listing_id = :listing_id
            {status_filter}
            """
        ),
        {"listing_id": listing_id, "status": status},
    )
    return result.scalar_one()


async def count_idempotency_rows(session, buyer_id: uuid.UUID, key: str) -> int:
    result = await session.execute(
        text(
            """
            SELECT count(*)
            FROM idempotency_keys
            WHERE buyer_id = :buyer_id
              AND idempotency_key = :key
            """
        ),
        {"buyer_id": buyer_id, "key": key},
    )
    return result.scalar_one()


async def test_reserve_available_listing(api_client, db_session):
    async with db_session.begin():
        seeded = await seed_listing(db_session)

    response = await api_client.post(
        f"/listings/{seeded['listing_id']}/reserve",
        json={
            "buyer_id": str(seeded["buyer_id"]),
            "idempotency_key": "reserve-available",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["listing_id"] == str(seeded["listing_id"])
    assert body["buyer_id"] == str(seeded["buyer_id"])
    assert body["status"] == "active"
    assert body["idempotent_replay"] is False
    assert await count_reservations(db_session, seeded["listing_id"], "active") == 1


async def test_listing_not_found_returns_replayable_error(api_client, db_session):
    listing_id = uuid.uuid4()
    buyer_id = uuid.uuid4()
    async with db_session.begin():
        await seed_buyer(db_session, buyer_id)

    payload = {"buyer_id": str(buyer_id), "idempotency_key": "missing-listing"}
    first_response = await api_client.post(f"/listings/{listing_id}/reserve", json=payload)
    replay_response = await api_client.post(f"/listings/{listing_id}/reserve", json=payload)

    assert first_response.status_code == 404
    assert replay_response.status_code == 404
    assert first_response.json() == replay_response.json()
    assert first_response.json()["error"]["code"] == "listing_not_found"
    assert await count_idempotency_rows(db_session, buyer_id, "missing-listing") == 1


@pytest.mark.parametrize("status", ["draft", "sold", "returned"])
async def test_listing_not_reservable(api_client, db_session, status):
    async with db_session.begin():
        seeded = await seed_listing(db_session, status=status)

    response = await api_client.post(
        f"/listings/{seeded['listing_id']}/reserve",
        json={
            "buyer_id": str(seeded["buyer_id"]),
            "idempotency_key": f"not-reservable-{status}",
        },
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "listing_not_reservable"
    assert body["error"]["details"]["status"] == status
    assert await count_reservations(db_session, seeded["listing_id"]) == 0


async def test_active_reservation_blocks_second_buyer(api_client, db_session):
    first_buyer_id = uuid.uuid4()
    second_buyer_id = uuid.uuid4()
    async with db_session.begin():
        seeded = await seed_listing(
            db_session,
            buyer_ids=[first_buyer_id, second_buyer_id],
        )
        await seed_active_reservation(
            db_session,
            listing_id=seeded["listing_id"],
            buyer_id=first_buyer_id,
        )

    response = await api_client.post(
        f"/listings/{seeded['listing_id']}/reserve",
        json={
            "buyer_id": str(second_buyer_id),
            "idempotency_key": "second-buyer",
        },
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_reserved"
    assert await count_reservations(db_session, seeded["listing_id"], "active") == 1


async def test_expired_reservation_allows_new_buyer(api_client, db_session):
    first_buyer_id = uuid.uuid4()
    second_buyer_id = uuid.uuid4()
    async with db_session.begin():
        seeded = await seed_listing(
            db_session,
            buyer_ids=[first_buyer_id, second_buyer_id],
        )
        await seed_expired_active_reservation(
            db_session,
            listing_id=seeded["listing_id"],
            buyer_id=first_buyer_id,
        )

    response = await api_client.post(
        f"/listings/{seeded['listing_id']}/reserve",
        json={
            "buyer_id": str(second_buyer_id),
            "idempotency_key": "expired-allows-new",
        },
    )

    assert response.status_code == 201
    assert response.json()["buyer_id"] == str(second_buyer_id)
    assert await count_reservations(db_session, seeded["listing_id"], "expired") == 1
    assert await count_reservations(db_session, seeded["listing_id"], "active") == 1


async def test_idempotent_success_replay(api_client, db_session):
    async with db_session.begin():
        seeded = await seed_listing(db_session)

    payload = {
        "buyer_id": str(seeded["buyer_id"]),
        "idempotency_key": "same-success",
    }
    first_response = await api_client.post(
        f"/listings/{seeded['listing_id']}/reserve",
        json=payload,
    )
    replay_response = await api_client.post(
        f"/listings/{seeded['listing_id']}/reserve",
        json=payload,
    )

    assert first_response.status_code == 201
    assert replay_response.status_code == 200
    first_body = first_response.json()
    replay_body = replay_response.json()
    assert replay_body["reservation_id"] == first_body["reservation_id"]
    assert replay_body["idempotent_replay"] is True
    assert await count_reservations(db_session, seeded["listing_id"], "active") == 1


async def test_same_key_different_payload_is_rejected(api_client, db_session):
    buyer_id = uuid.uuid4()
    async with db_session.begin():
        first_listing = await seed_listing(db_session, buyer_ids=[buyer_id])
        second_listing = await seed_listing(db_session, buyer_ids=[])

    payload = {"buyer_id": str(buyer_id), "idempotency_key": "key-conflict"}
    first_response = await api_client.post(
        f"/listings/{first_listing['listing_id']}/reserve",
        json=payload,
    )
    second_response = await api_client.post(
        f"/listings/{second_listing['listing_id']}/reserve",
        json=payload,
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["error"]["code"] == "idempotency_key_conflict"
    assert await count_reservations(db_session, second_listing["listing_id"]) == 0


async def test_concurrent_buyers_create_one_reservation(api_client, db_session):
    first_buyer_id = uuid.uuid4()
    second_buyer_id = uuid.uuid4()
    async with db_session.begin():
        seeded = await seed_listing(
            db_session,
            buyer_ids=[first_buyer_id, second_buyer_id],
        )

    async def reserve(buyer_id: uuid.UUID, key: str):
        return await api_client.post(
            f"/listings/{seeded['listing_id']}/reserve",
            json={"buyer_id": str(buyer_id), "idempotency_key": key},
        )

    first_response, second_response = await asyncio.gather(
        reserve(first_buyer_id, "concurrent-one"),
        reserve(second_buyer_id, "concurrent-two"),
    )

    statuses = sorted([first_response.status_code, second_response.status_code])
    assert statuses == [201, 409]
    bodies = [first_response.json(), second_response.json()]
    assert {body.get("error", {}).get("code") for body in bodies} == {
        None,
        "already_reserved",
    }
    assert await count_reservations(db_session, seeded["listing_id"], "active") == 1

