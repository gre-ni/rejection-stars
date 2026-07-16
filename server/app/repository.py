"""Data access for stars. The only module that writes SQL against `stars`."""
import sqlite3
from typing import List, Optional

from .models import Star, StarCreate, StarUpdate


def _row_to_star(row: sqlite3.Row) -> Star:
    return Star(
        id=row["id"],
        slot=row["slot"],
        name=row["name"],
        date=row["date"],
        description=row["description"],
    )


def list_stars(conn: sqlite3.Connection) -> List[Star]:
    rows = conn.execute(
        "SELECT id, slot, name, date, description FROM stars ORDER BY slot"
    ).fetchall()
    return [_row_to_star(r) for r in rows]


def get_by_slot(conn: sqlite3.Connection, slot: int) -> Optional[Star]:
    row = conn.execute(
        "SELECT id, slot, name, date, description FROM stars WHERE slot = ?",
        (slot,),
    ).fetchone()
    return _row_to_star(row) if row else None


def get_by_id(conn: sqlite3.Connection, star_id: int) -> Optional[Star]:
    row = conn.execute(
        "SELECT id, slot, name, date, description FROM stars WHERE id = ?",
        (star_id,),
    ).fetchone()
    return _row_to_star(row) if row else None


def update_star(
    conn: sqlite3.Connection, star_id: int, payload: StarUpdate
) -> Optional[Star]:
    """Update a star's info (never its slot). Returns None if it doesn't exist."""
    cur = conn.execute(
        "UPDATE stars SET name = ?, date = ?, description = ? WHERE id = ?",
        (payload.name, payload.date.isoformat(), payload.description, star_id),
    )
    if cur.rowcount == 0:
        return None
    return get_by_id(conn, star_id)


def create_star(conn: sqlite3.Connection, payload: StarCreate) -> Star:
    """Insert a star. Raises sqlite3.IntegrityError if the slot is taken."""
    cur = conn.execute(
        "INSERT INTO stars (slot, name, date, description) VALUES (?, ?, ?, ?)",
        (payload.slot, payload.name, payload.date.isoformat(), payload.description),
    )
    return Star(
        id=cur.lastrowid,
        slot=payload.slot,
        name=payload.name,
        date=payload.date,
        description=payload.description,
    )
