from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.db as app_db
from app.db import get_session
from app.main import app


@pytest.fixture(name="engine")
def engine_fixture(monkeypatch):
    # StaticPool is required: FastAPI runs sync endpoints in a threadpool, and
    # each new connection to `sqlite://` would otherwise get its own empty
    # in-memory database ("no such table: category").
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    # The app's lifespan calls init_db() on the module-level engine; point it at
    # the in-memory one so a test run never touches server/todo.db.
    monkeypatch.setattr(app_db, "engine", engine)
    yield engine
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(name="session")
def session_fixture(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def make_category(**overrides) -> dict:
    payload = {
        "id": "857f0db6-43b2-43eb-8143-ec4e26472516",
        "name": "Home",
        "emoji": "1f3e0",
        "color": "#53e45d",
        "lastSave": "2026-01-01T10:00:00Z",
    }
    payload.update(overrides)
    return payload


def make_task(**overrides) -> dict:
    payload = {
        "id": "11111111-1111-4111-8111-111111111111",
        "done": False,
        "pinned": False,
        "name": "Buy milk",
        "description": "2 litres",
        "emoji": "1f95b",
        "color": "#248eff",
        "date": "2026-01-01T09:00:00Z",
        "deadline": "2026-01-05T18:00:00Z",
        "lastSave": "2026-01-01T10:00:00Z",
        "position": 0,
    }
    payload.update(overrides)
    return payload
