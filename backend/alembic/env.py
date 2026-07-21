"""
Alembic environment configuration.
Loads DATABASE_URL from app settings so there's a single source of truth.
Supports both online (live DB) and offline (SQL script generation) modes.
"""
import sys
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ─── Path setup ─────────────────────────────────────────────────────────────
# Add backend root to sys.path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ─── Alembic config object ──────────────────────────────────────────────────
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ─── Import app settings and models ─────────────────────────────────────────
from core.config import settings
from core.database import Base

# Import all models so their tables are registered on Base.metadata
import models.db_models  # noqa: F401 — side-effect import

# Override sqlalchemy.url from alembic.ini with our app settings value
# Escape % to %% to prevent configparser interpolation errors (common for URL-encoded passwords)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

target_metadata = Base.metadata


# ─── Offline migrations (generate SQL without connecting to DB) ──────────────
def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.
    Generates SQL statements without needing a live DB connection.
    Useful for reviewing migrations before applying.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ─── Online migrations (connect to real DB and apply) ───────────────────────
def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.
    Connects to the database and applies migrations directly.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
