"""SQLite access layer.

All raw SQL lives in the repository module; this file only owns connection
creation and schema setup. Isolating the driver here keeps the eventual
Postgres migration contained to two files (this one + repository.py).
"""
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from . import config


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """Yield a connection, committing on success and always closing.

    Used as a FastAPI dependency (one connection per request). SQLite handles
    this fine at the concurrency levels this app will see.
    """
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create tables if they do not exist. Safe to call on every startup."""
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stars (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                slot        INTEGER NOT NULL UNIQUE,
                name        TEXT    NOT NULL,
                date        TEXT    NOT NULL,
                description TEXT,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
