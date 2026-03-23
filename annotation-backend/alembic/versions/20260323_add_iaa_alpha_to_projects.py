"""Add iaa_alpha column to projects

Revision ID: 20260323_iaa_alpha
Revises: 20260320_rename_annotation_tables
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa

revision = '20260323_iaa_alpha'
down_revision = '20260320_rename_annotation_tables'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'projects',
        sa.Column('iaa_alpha', sa.Float(), nullable=False, server_default='0.8')
    )


def downgrade():
    op.drop_column('projects', 'iaa_alpha')
