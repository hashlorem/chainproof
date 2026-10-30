"""Evidence perceptual hash, for finding re-saved or edited copies of evidence images.

Revision ID: 0002
Revises: 0001
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('evidence', schema=None) as batch_op:
        batch_op.add_column(sa.Column('phash', sa.String(length=16), nullable=True))
        batch_op.create_index(batch_op.f('ix_evidence_phash'), ['phash'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('evidence', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_evidence_phash'))
        batch_op.drop_column('phash')
