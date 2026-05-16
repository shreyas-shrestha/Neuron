"""Initial schema

Revision ID: 20250326_0001
Revises:
Create Date: 2025-03-26 00:00:01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20250326_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("key_hash", sa.String(length=128), nullable=False),
        sa.Column("key_suffix", sa.String(length=8), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_api_keys_key_hash"), "api_keys", ["key_hash"], unique=True)
    op.create_index(op.f("ix_api_keys_user_id"), "api_keys", ["user_id"], unique=False)

    op.create_table(
        "model_registry",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("huggingface_id", sa.String(length=512), nullable=True),
        sa.Column("checkpoint_path", sa.Text(), nullable=True),
        sa.Column("domain", sa.String(length=64), nullable=False),
        sa.Column("layer_count", sa.Integer(), nullable=False),
        sa.Column("hidden_dim", sa.Integer(), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("overall_risk_score", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_model_registry_owner_user_id"), "model_registry", ["owner_user_id"], unique=False)

    op.create_table(
        "analyses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("model_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("analysis_type", sa.String(length=64), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("input_texts", sa.JSON(), nullable=True),
        sa.Column("trajectory_data", sa.JSON(), nullable=True),
        sa.Column("risk_flags", sa.JSON(), nullable=True),
        sa.Column("overall_risk_score", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("last_heartbeat", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("worker_id", sa.String(length=256), nullable=True),
        sa.ForeignKeyConstraint(["model_id"], ["model_registry.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "compliance_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("analysis_id", sa.String(length=36), nullable=False),
        sa.Column("framework", sa.String(length=64), nullable=False),
        sa.Column("organization", sa.String(length=255), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("report_data", sa.JSON(), nullable=True),
        sa.Column("pdf_path", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["analysis_id"], ["analyses.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("compliance_reports")
    op.drop_table("analyses")
    op.drop_index(op.f("ix_model_registry_owner_user_id"), table_name="model_registry")
    op.drop_table("model_registry")
    op.drop_index(op.f("ix_api_keys_user_id"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_key_hash"), table_name="api_keys")
    op.drop_table("api_keys")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
