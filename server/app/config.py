"""Application configuration.

Kept intentionally tiny. Values can be overridden with environment variables
so the same code runs against SQLite locally and (later) Postgres in prod.
"""
import os
from pathlib import Path

# Total number of star slots on the grid. Fixed by product spec.
TOTAL_SLOTS = 1000

# Absolute path to the SQLite database file. Lives next to the server package.
DB_PATH = Path(os.environ.get("REJECTION_STARS_DB", Path(__file__).resolve().parent.parent / "rejection_stars.db"))

# Origins allowed to call the API during local development (Vite dev server).
CORS_ORIGINS = os.environ.get(
    "REJECTION_STARS_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
