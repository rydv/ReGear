from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def build_error_body(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
        }
    }


def send_response(status_code: int, body: dict[str, Any]) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=jsonable_encoder(body))

