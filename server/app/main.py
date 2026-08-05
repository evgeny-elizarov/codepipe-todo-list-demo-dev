"""FastAPI application entry point.

Run it with::

    uvicorn app.main:app --reload --port 8000

Swagger UI is at http://localhost:8000/docs (FastAPI's default).
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import categories, tasks

# `https://localhost:5173` covers `npm run dev:host`, which enables basicSsl.
DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,https://localhost:5173"


def _cors_origins() -> list[str]:
    raw = os.environ.get("TODO_CORS_ORIGINS") or DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Tables are created on startup; there is no migration system by design.
    init_db()
    yield


app = FastAPI(
    title="Todo App API",
    description="Single-user backend persisting tasks and categories in SQLite.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router)
app.include_router(tasks.router)
