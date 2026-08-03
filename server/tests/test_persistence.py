"""Data must survive a server restart, and TODO_DB_PATH must be honoured."""

from __future__ import annotations

import importlib
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

import app.db as app_db
from app.db import get_session
from app.main import app as fastapi_app
from tests.conftest import make_category, make_task


@pytest.fixture
def db_module(tmp_path, monkeypatch):
    """Reload `app.db` against a file-backed database in `tmp_path`."""
    monkeypatch.setenv("TODO_DB_PATH", str(tmp_path / "todo.db"))
    yield importlib.reload(app_db)
    monkeypatch.delenv("TODO_DB_PATH", raising=False)
    importlib.reload(app_db)


@contextmanager
def running_server(db_module):
    """A TestClient talking to the file-backed engine, torn down like a restart."""
    db_module.init_db()

    def session_override():
        with Session(db_module.engine) as session:
            yield session

    fastapi_app.dependency_overrides[get_session] = session_override
    try:
        with TestClient(fastapi_app) as client:
            yield client
    finally:
        fastapi_app.dependency_overrides.clear()
        db_module.engine.dispose()


def test_todo_db_path_is_honoured(db_module, tmp_path):
    assert db_module.DB_PATH == tmp_path / "todo.db"


def test_data_survives_a_restart(db_module, tmp_path):
    category = make_category()
    task = make_task(category=[{"id": category["id"]}])

    with running_server(db_module) as client:
        assert client.post("/api/categories", json=category).status_code == 201
        assert client.post("/api/tasks", json=task).status_code == 201

    assert (tmp_path / "todo.db").exists()

    # A brand new process: fresh module, fresh engine, same file on disk.
    reopened = importlib.reload(app_db)
    with running_server(reopened) as client:
        assert [c["id"] for c in client.get("/api/categories").json()] == [category["id"]]

        stored = client.get("/api/tasks").json()
        assert [t["id"] for t in stored] == [task["id"]]
        assert [c["id"] for c in stored[0]["category"]] == [category["id"]]
        assert stored[0]["lastSave"] == "2026-01-01T10:00:00Z"
