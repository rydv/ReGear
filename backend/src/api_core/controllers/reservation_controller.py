from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.api_core.models.request_models import ReserveListingRequest
from src.api_core.repositories.reservation_repository import ReservationRepository
from src.api_core.services.reservation_service import ReservationService
from src.utils.request_response_util import send_response

router = APIRouter(prefix="/listings", tags=["reservation"])


async def get_db_session(request: Request):
    session_factory = request.app.state.db_manager.session_factory
    async with session_factory() as session:
        yield session


def get_reservation_repository() -> ReservationRepository:
    return ReservationRepository()


def get_reservation_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    repository: ReservationRepository = Depends(get_reservation_repository),
) -> ReservationService:
    return ReservationService(
        session=session,
        repository=repository,
        reservation_ttl_minutes=request.app.state.settings.reservation_ttl_minutes,
    )


@router.post("/{listing_id}/reserve")
async def reserve_listing_controller(
    listing_id: UUID,
    payload: ReserveListingRequest,
    reservation_service: ReservationService = Depends(get_reservation_service),
) -> JSONResponse:
    outcome = await reservation_service.reserve_listing(
        listing_id=listing_id,
        buyer_id=payload.buyer_id,
        idempotency_key=payload.idempotency_key,
    )
    return send_response(outcome.status_code, outcome.body)

