"""CRUD for tasks, including their category links."""

from __future__ import annotations

from typing import List, Optional, Sequence

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import Category, Task
from ..schemas import CategoryRef, TaskCreate, TaskRead, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _get_or_404(session: Session, task_id: str) -> Task:
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Task {task_id} not found")
    return task


def _resolve_categories(session: Session, refs: Optional[Sequence[CategoryRef]]) -> List[Category]:
    if not refs:
        return []

    ids = [ref.id for ref in refs]
    found = session.exec(select(Category).where(Category.id.in_(ids))).all()  # type: ignore[attr-defined]
    missing = set(ids) - {category.id for category in found}
    if missing:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unknown category ids: {sorted(missing)}"
        )
    return list(found)


@router.get("", response_model=List[TaskRead])
def list_tasks(session: Session = Depends(get_session)) -> List[Task]:
    return list(session.exec(select(Task)).all())


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, session: Session = Depends(get_session)) -> Task:
    # The client generates the UUID; the server never regenerates ids.
    if session.get(Task, payload.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Task {payload.id} already exists")

    categories = _resolve_categories(session, payload.category)
    task = Task(**payload.model_dump(exclude={"category"}))
    task.category = categories

    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: str, session: Session = Depends(get_session)) -> Task:
    return _get_or_404(session, task_id)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: str, payload: TaskUpdate, session: Session = Depends(get_session)
) -> Task:
    task = _get_or_404(session, task_id)
    fields = payload.model_dump(exclude_unset=True)

    # `category` omitted leaves the links untouched; `category` present (even as
    # [] or null) replaces the whole link set. `exclude_unset` is what makes
    # that distinction expressible, and the client relies on it.
    if "category" in fields:
        task.category = _resolve_categories(session, payload.category)
        fields.pop("category")

    for key, value in fields.items():
        setattr(task, key, value)

    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, session: Session = Depends(get_session)) -> Response:
    task = _get_or_404(session, task_id)

    task.category.clear()
    session.delete(task)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
