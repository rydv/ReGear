from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiConfiguration(BaseSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://regear:regear@localhost:5432/regear",
        alias="DATABASE_URL",
    )
    reservation_ttl_minutes: int = Field(default=30, alias="RESERVATION_TTL_MINUTES")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_config() -> ApiConfiguration:
    return ApiConfiguration()

