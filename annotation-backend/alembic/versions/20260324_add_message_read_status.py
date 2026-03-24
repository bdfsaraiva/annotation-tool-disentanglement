"""Add message read status table for adj_pairs per-turn read tracking

Revision ID: 20260324_message_read_status
Revises: 20260323_iaa_alpha
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa

revision = "20260324_message_read_status"
down_revision = "20260323_iaa_alpha"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_read_status",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("annotator_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("message_id", "annotator_id", name="uix_message_read_status"),
    )
    op.create_index("ix_message_read_status_message", "message_read_status", ["message_id"])
    op.create_index("ix_message_read_status_annotator", "message_read_status", ["annotator_id"])


def downgrade() -> None:
    op.drop_index("ix_message_read_status_annotator", table_name="message_read_status")
    op.drop_index("ix_message_read_status_message", table_name="message_read_status")
    op.drop_table("message_read_status")