from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_fts(conn) -> None:
    conn.execute(
        text(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                doc_id UNINDEXED,
                chunk_key UNINDEXED,
                fts_text,
                tokenize='unicode61'
            )
            """
        )
    )


def init_db() -> None:
    from app import models  # noqa: F401

    with engine.begin() as conn:
        Base.metadata.create_all(conn)
        init_fts(conn)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
