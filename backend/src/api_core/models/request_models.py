from uuid import UUID

from pydantic import BaseModel, Field


class ReserveListingRequest(BaseModel):
    buyer_id: UUID
    idempotency_key: str = Field(min_length=1, max_length=128)

