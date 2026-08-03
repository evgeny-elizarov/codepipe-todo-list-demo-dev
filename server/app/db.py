"""Engine and session wiring.

The database path defaults to ``server/todo.db``, resolved relative to this
package rather than the process CWD, so ``uvicorn app.main:app`` behaves the
same whether it is launched from ``server/`` or from the repo root. Override it
with the ``TODO_DB_PATH`` environment variable.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "todo.db"
DB_PATH = Path(os.environ.get("TODO_DB_PATH") or DEFAULT_DB_PATH)

# check_same_thread=False: FastAPI runs sync endpoints in a threadpool.
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def init_db() -> None:
    """Create any missing tables. No migration system, by design."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
