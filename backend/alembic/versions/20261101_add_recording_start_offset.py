"""add recording start offset

Revision ID: 20261101_add_recording_start_offset
Revises: 2360156ebd08
Create Date: 2026-11-01

Subtitle timestamps are relative to the lecture start, while the recorded video
starts when the teacher presses Record. Persisting the offset lets the player
keep captions, translations and sign replay synchronised with the video.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261101_add_recording_start_offset"
down_revision: Union[str, None] = "2360156ebd08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("recordings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "start_offset_ms",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("recordings", schema=None) as batch_op:
        batch_op.drop_column("start_offset_ms")
