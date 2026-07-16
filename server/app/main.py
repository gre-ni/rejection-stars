"""FastAPI entrypoint for Rejection Stars.

Run locally with:  uvicorn app.main:app --reload --port 8001  (from the server/ folder)
"""
import sqlite3
from contextlib import asynccontextmanager
from typing import List

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config, repository
from .db import get_conn, init_db
from .models import Star, StarCreate, StarUpdate


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Rejection Stars API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def conn_dep():
    """FastAPI dependency yielding a per-request SQLite connection."""
    with get_conn() as conn:
        yield conn


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "total_slots": config.TOTAL_SLOTS}


@app.get("/api/stars", response_model=List[Star])
def list_stars(conn: sqlite3.Connection = Depends(conn_dep)) -> List[Star]:
    return repository.list_stars(conn)


@app.post("/api/stars", response_model=Star, status_code=201)
def place_star(
    payload: StarCreate, conn: sqlite3.Connection = Depends(conn_dep)
) -> Star:
    try:
        return repository.create_star(conn, payload)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="That slot already has a star.")


@app.put("/api/stars/{star_id}", response_model=Star)
def update_star(
    star_id: int, payload: StarUpdate, conn: sqlite3.Connection = Depends(conn_dep)
) -> Star:
    star = repository.update_star(conn, star_id, payload)
    if star is None:
        raise HTTPException(status_code=404, detail="No such star.")
    return star
