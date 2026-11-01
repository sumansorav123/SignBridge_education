"""add classroom join approval requests

Revision ID: 20261101_join_requests
Revises: 20261101_add_recording_start_offset
Create Date: 2026-11-01
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261101_join_requests"
down_revision: Union[str, None] = "20261101_add_recording_start_offset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "classroom_join_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("classroom_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("pending_slot", sa.String(length=20), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="status_valid",
        ),
        sa.CheckConstraint(
            "(status = 'pending' AND pending_slot = 'pending') "
            "OR (status != 'pending' AND pending_slot IS NULL)",
            name="pending_slot_matches_status",
        ),
        sa.ForeignKeyConstraint(
            ["classroom_id"], ["classrooms.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "classroom_id",
            "student_id",
            "pending_slot",
            name="uq_join_request_pending_student_classroom",
        ),
    )
    op.create_index(
        "ix_join_request_classroom_status",
        "classroom_join_requests",
        ["classroom_id", "status"],
    )
    op.create_index(
        "ix_join_request_student_status",
        "classroom_join_requests",
        ["student_id", "status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_join_request_student_status", table_name="classroom_join_requests"
    )
    op.drop_index(
        "ix_join_request_classroom_status", table_name="classroom_join_requests"
    )
    op.drop_table("classroom_join_requests")
