from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ReservationOutcome:
    status_code: int
    body: dict[str, Any]

