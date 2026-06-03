from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine


class PostgresDBManager:
    def __init__(self, database_url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(
            database_url,
            pool_pre_ping=True,
        )
        self.session_factory = async_sessionmaker(
            self.engine,
            expire_on_commit=False,
        )

    async def dispose(self) -> None:
        await self.engine.dispose()

