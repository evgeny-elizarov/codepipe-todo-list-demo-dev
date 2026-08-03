"""SQLModel tables mirroring the client domain model.

Field names are deliberately **camelCase** (``lastSave``, not ``last_save``) so
that the JSON emitted here matches ``src/types/user.ts`` one-to-one. That
deviates from PEP 8, but it removes the whole alias/``populate_by_name`` layer
between the two type systems. Link-table columns stay snake_case — they are
never exposed in JSON.

Single-user mode: there is no ``user_id`` column and no authorization anywhere.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import field_validator
from sqlmodel import Field, Relationship, SQLModel

from .datetime_utils import to_naive_utc


class TaskCategoryLink(SQLModel, table=True):
    """Many-to-many join between a task and its categories."""

    __tablename__ = "task_category"

    task_id: str = Field(foreign_key="task.id", primary_key=True)
    category_id: str = Field(foreign_key="category.id", primary_key=True)


class CategoryBase(SQLModel):
    name: str
    emoji: Optional[str] = None
    color: str
    lastSave: Optional[datetime] = None

    @field_validator("lastSave", mode="before")
    @classmethod
    def _normalise_dates(cls, value):
        return to_naive_utc(value)


class Category(CategoryBase, table=True):
    __tablename__ = "category"

    id: str = Field(primary_key=True)

    tasks: List["Task"] = Relationship(back_populates="category", link_model=TaskCategoryLink)


class TaskBase(SQLModel):
    done: bool = False
    pinned: bool = False
    name: str
    description: Optional[str] = None
    emoji: Optional[str] = None
    color: str
    #: created at date
    date: datetime
    deadline: Optional[datetime] = None
    lastSave: Optional[datetime] = None
    #: optional numeric position for drag-and-drop ordering
    position: Optional[int] = None

    @field_validator("date", "deadline", "lastSave", mode="before")
    @classmethod
    def _normalise_dates(cls, value):
        return to_naive_utc(value)


class Task(TaskBase, table=True):
    __tablename__ = "task"

    id: str = Field(primary_key=True)

    category: List[Category] = Relationship(back_populates="tasks", link_model=TaskCategoryLink)
