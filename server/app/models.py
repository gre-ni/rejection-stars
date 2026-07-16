"""Pydantic request/response schemas."""
from datetime import date as date_type
from typing import Optional

from pydantic import BaseModel, Field

from . import config


class StarCreate(BaseModel):
    """Payload for placing a star on an empty slot."""

    slot: int = Field(..., ge=0, lt=config.TOTAL_SLOTS)
    name: str = Field(..., min_length=1, max_length=120)
    date: date_type
    description: Optional[str] = Field(None, max_length=1000)


class StarUpdate(BaseModel):
    """Payload for editing a placed star's info. The slot never changes."""

    name: str = Field(..., min_length=1, max_length=120)
    date: date_type
    description: Optional[str] = Field(None, max_length=1000)


class Star(BaseModel):
    """A placed star, as returned by the API."""

    id: int
    slot: int
    name: str
    date: date_type
    description: Optional[str] = None
