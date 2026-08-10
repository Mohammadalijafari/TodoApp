from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DatabaseError
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./todos.db"
DB_PATH = Path("todos.db")


def _create_engine():
    return create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )


engine = _create_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_database():
    global engine

    try:
        Base.metadata.create_all(bind=engine)
    except DatabaseError:
        if DB_PATH.exists():
            DB_PATH.unlink()
        engine = _create_engine()
        Base.metadata.create_all(bind=engine)

    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    if not inspector.has_table("todos"):
        return

    existing_columns = {column["name"] for column in inspector.get_columns("todos")}
    statements = []

    if "category" not in existing_columns:
        statements.append(
            "ALTER TABLE todos ADD COLUMN category VARCHAR(50) DEFAULT 'General'"
        )
    if "due_date" not in existing_columns:
        statements.append("ALTER TABLE todos ADD COLUMN due_date DATETIME")
    if "created_at" not in existing_columns:
        statements.append("ALTER TABLE todos ADD COLUMN created_at DATETIME")
    if "updated_at" not in existing_columns:
        statements.append("ALTER TABLE todos ADD COLUMN updated_at DATETIME")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

        connection.execute(
            text(
                """
                UPDATE todos
                SET category = COALESCE(category, 'General'),
                    created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
                """
            )
        )
