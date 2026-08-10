"""Expand todos for React frontend

Revision ID: 9f1b0b8f6c2a
Revises: 5258385e5d2b
Create Date: 2026-08-10 13:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "9f1b0b8f6c2a"
down_revision: Union[str, Sequence[str], None] = "5258385e5d2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "todos",
        sa.Column("category", sa.String(length=50), nullable=True, server_default="General"),
    )
    op.add_column("todos", sa.Column("due_date", sa.DateTime(), nullable=True))
    op.add_column(
        "todos",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "todos",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("todos", "updated_at")
    op.drop_column("todos", "created_at")
    op.drop_column("todos", "due_date")
    op.drop_column("todos", "category")
