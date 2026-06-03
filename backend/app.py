from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.api_core.controllers.reservation_controller import router as reservation_router
from src.api_core.models.error_models import ReservationAPIError
from src.configs.service_config import ApiConfiguration, get_config
from src.db.postgres_db_manager import PostgresDBManager
from src.utils.request_response_util import build_error_body


def _validation_error_response(exc: RequestValidationError) -> JSONResponse:
    details = [
        {"loc": list(error.get("loc", [])), "message": error.get("msg", "")}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=build_error_body(
            code="validation_error",
            message="Request validation failed.",
            details={"errors": details},
        ),
    )


def create_app(
    settings: ApiConfiguration | None = None,
    db_manager: PostgresDBManager | None = None,
) -> FastAPI:
    settings = settings or get_config()
    owns_db_manager = db_manager is None
    db_manager = db_manager or PostgresDBManager(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            if owns_db_manager:
                await app.state.db_manager.dispose()

    app = FastAPI(title="ReGear Reservation API", lifespan=lifespan)
    app.state.settings = settings
    app.state.db_manager = db_manager

    app.include_router(reservation_router)

    @app.get("/health-check")
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(ReservationAPIError)
    async def reservation_error_handler(_, exc: ReservationAPIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_body(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_, exc: RequestValidationError) -> JSONResponse:
        return _validation_error_response(exc)

    return app


app = create_app()

