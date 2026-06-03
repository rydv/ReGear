import copy
import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.api_core.models.response_models import ReservationOutcome
from src.api_core.repositories.reservation_repository import ReservationRepository
from src.utils.request_response_util import build_error_body


class ReservationService:
    def __init__(
        self,
        *,
        session: AsyncSession,
        repository: ReservationRepository,
        reservation_ttl_minutes: int,
    ) -> None:
        self.session = session
        self.repository = repository
        self.reservation_ttl_minutes = reservation_ttl_minutes

    async def reserve_listing(
        self,
        *,
        listing_id: UUID,
        buyer_id: UUID,
        idempotency_key: str,
    ) -> ReservationOutcome:
        request_hash = self._build_request_hash(
            listing_id=listing_id,
            buyer_id=buyer_id,
            idempotency_key=idempotency_key,
        )

        async with self.session.begin():
            await self.repository.insert_idempotency_key_if_absent(
                self.session,
                buyer_id=buyer_id,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
            )
            idempotency_row = await self.repository.lock_idempotency_key(
                self.session,
                buyer_id=buyer_id,
                idempotency_key=idempotency_key,
            )

            if idempotency_row["request_hash"] != request_hash:
                return self._error_outcome(
                    status_code=409,
                    code="idempotency_key_conflict",
                    message="Idempotency key was already used for a different request.",
                    details={"idempotency_key": idempotency_key},
                )

            if idempotency_row["status"] == "completed":
                return self._replay_outcome(idempotency_row)

            listing = await self.repository.lock_listing(self.session, listing_id=listing_id)
            if listing is None:
                return await self._complete_and_return(
                    idempotency_row_id=idempotency_row["id"],
                    outcome=self._error_outcome(
                        status_code=404,
                        code="listing_not_found",
                        message="Listing not found.",
                        details={"listing_id": str(listing_id)},
                    ),
                )

            database_now = await self.repository.get_database_now(self.session)
            expired_count = await self.repository.expire_stale_reservations(
                self.session,
                listing_id=listing_id,
            )

            listing_status = listing["status"]
            reserved_until = listing["reserved_until"]
            hold_marker_expired = (
                listing_status == "reserved"
                and reserved_until is not None
                and reserved_until <= database_now
            )
            if expired_count > 0 or hold_marker_expired:
                await self.repository.clear_listing_hold(self.session, listing_id=listing_id)
                listing_status = "listed"

            active_reservation = await self.repository.find_active_reservation(
                self.session,
                listing_id=listing_id,
            )
            if active_reservation is not None:
                return await self._complete_and_return(
                    idempotency_row_id=idempotency_row["id"],
                    outcome=self._error_outcome(
                        status_code=409,
                        code="already_reserved",
                        message="Listing is already reserved.",
                        details={
                            "listing_id": str(listing_id),
                            "reserved_until": self._format_datetime(
                                active_reservation["expires_at"]
                            ),
                        },
                    ),
                )

            if listing_status != "listed":
                return await self._complete_and_return(
                    idempotency_row_id=idempotency_row["id"],
                    outcome=self._error_outcome(
                        status_code=409,
                        code="listing_not_reservable",
                        message="Listing is not in a reservable state.",
                        details={"listing_id": str(listing_id), "status": listing_status},
                    ),
                )

            reservation = await self.repository.create_reservation(
                self.session,
                listing_id=listing_id,
                buyer_id=buyer_id,
                ttl_minutes=self.reservation_ttl_minutes,
            )
            await self.repository.mark_listing_reserved(
                self.session,
                listing_id=listing_id,
                reserved_until=reservation["expires_at"],
            )

            return await self._complete_and_return(
                idempotency_row_id=idempotency_row["id"],
                outcome=ReservationOutcome(
                    status_code=201,
                    body={
                        "reservation_id": str(reservation["id"]),
                        "listing_id": str(listing_id),
                        "buyer_id": str(buyer_id),
                        "status": "active",
                        "expires_at": self._format_datetime(reservation["expires_at"]),
                        "idempotent_replay": False,
                    },
                ),
            )

    async def _complete_and_return(
        self,
        *,
        idempotency_row_id: UUID,
        outcome: ReservationOutcome,
    ) -> ReservationOutcome:
        await self.repository.complete_idempotency_key(
            self.session,
            idempotency_row_id=idempotency_row_id,
            response_status=outcome.status_code,
            response_body_json=json.dumps(outcome.body, sort_keys=True),
        )
        return outcome

    def _replay_outcome(self, idempotency_row: dict[str, Any]) -> ReservationOutcome:
        status_code = int(idempotency_row["response_status"])
        body = copy.deepcopy(idempotency_row["response_body"])
        if 200 <= status_code < 300:
            status_code = 200
            body["idempotent_replay"] = True
        return ReservationOutcome(status_code=status_code, body=body)

    def _error_outcome(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any],
    ) -> ReservationOutcome:
        return ReservationOutcome(
            status_code=status_code,
            body=build_error_body(code=code, message=message, details=details),
        )

    @staticmethod
    def _build_request_hash(
        *,
        listing_id: UUID,
        buyer_id: UUID,
        idempotency_key: str,
    ) -> str:
        request_fingerprint = {
            "method": "POST",
            "path": f"/listings/{listing_id}/reserve",
            "listing_id": str(listing_id),
            "buyer_id": str(buyer_id),
            "idempotency_key": idempotency_key,
        }
        canonical = json.dumps(
            request_fingerprint,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _format_datetime(value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
