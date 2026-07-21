"""
0002_persona_system.py — Phase 1: Companion/Persona system

Adds:
  - personas table (all companion definitions)
  - users.gender column (for The Guide's gender adaptation)
  - conversations.persona_id FK to personas

Removes:
  - users.persona_name (replaced by per-conversation persona_id)

Run with: alembic upgrade head
Rollback: alembic downgrade 0001
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create personas table ────────────────────────────────────────────────
    op.create_table(
        "personas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("slug", sa.String(50), unique=True, nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("tagline", sa.String(250), nullable=True),
        sa.Column("archetype", sa.String(50), nullable=False),
        sa.Column("avatar_emoji", sa.String(10), server_default="💙"),
        sa.Column("speaking_style", sa.Text(), nullable=False),
        sa.Column("example_responses", sa.JSON(), nullable=True),
        sa.Column("is_gender_adaptive", sa.Boolean(), server_default="false"),
        sa.Column("is_premium", sa.Boolean(), server_default="false"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # ── Add gender & drop persona_name on users ──────────────────────────────
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("gender", sa.String(30), server_default="prefer_not_to_say", nullable=True)
        )
        batch_op.drop_column("persona_name")

    # ── Add persona_id to conversations ──────────────────────────────────────
    with op.batch_alter_table("conversations") as batch_op:
        batch_op.add_column(sa.Column("persona_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_conversations_persona_id",
            "personas",
            ["persona_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    # Reverse in dependency order
    with op.batch_alter_table("conversations") as batch_op:
        batch_op.drop_constraint("fk_conversations_persona_id", type_="foreignkey")
        batch_op.drop_column("persona_id")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("gender")
        batch_op.add_column(
            sa.Column("persona_name", sa.String(50), nullable=True, server_default="Riya")
        )

    op.drop_table("personas")
