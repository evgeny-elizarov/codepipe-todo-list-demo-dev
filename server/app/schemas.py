"""Request/response schemas.

The write side accepts ``category`` as a list of objects and reads only ``id``
from each, so the client can post a ``Task`` verbatim. The read side returns
full ``Category`` objects, matching ``Task.category?: Category[]``.

Every datetime leaves the server as an explicit ISO 8601 UTC string (``...Z``)
— see :mod:`app.datetime_utils` for why that matters.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import field_serializer, field_validator
from sqlmodel import SQLModel

from .datetime_utils import to_iso_z, to_naive_utc
from .models import CategoryBase, TaskBase


class CategoryRef(SQLModel):
    """A write-side reference to a category — only ``id`` is read."""

    id: str


class CategoryCreate(CategoryBase):
    id: str


class CategoryUpdate(SQLModel):
    """Partial update: only the fields actually sent are applied."""

    name: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    lastSave: Optional[datetime] = None

    @field_validator("lastSave", mode="before")
    @classmethod
    def _normalise_dates(cls, value):
        return to_naive_utc(value)


class CategoryRead(CategoryBase):
    id: str

    @field_serializer("lastSave")
    def _serialize_dates(self, value: Optional[datetime]) -> Optional[str]:
        return to_iso_z(value)


class TaskCreate(TaskBase):
    id: str
    category: Optional[List[CategoryRef]] = None


class TaskUpdate(SQLModel):
    """Partial update: only the fields actually sent are applied.

    ``category`` omitted leaves the links untouched; ``category`` present
    (including ``[]`` or ``null``) replaces the whole link set.
    """

    done: Optional[bool] = None
    pinned: Optional[bool] = None
    name: Optional[str] = None
    description: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    date: Optional[datetime] = None
    deadline: Optional[datetime] = None
    lastSave: Optional[datetime] = None
    position: Optional[int] = None
    category: Optional[List[CategoryRef]] = None

    @field_validator("date", "deadline", "lastSave", mode="before")
    @classmethod
    def _normalise_dates(cls, value):
        return to_naive_utc(value)


class TaskRead(TaskBase):
    id: str
    category: List[CategoryRead] = []

    @field_serializer("date", "deadline", "lastSave")
    def _serialize_dates(self, value: Optional[datetime]) -> Optional[str]:
        return to_iso_z(value)
