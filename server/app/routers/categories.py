"""CRUD for categories."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import Category
from ..schemas import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _get_or_404(session: Session, category_id: str) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Category {category_id} not found")
    return category


@router.get("", response_model=List[CategoryRead])
def list_categories(session: Session = Depends(get_session)) -> List[Category]:
    return list(session.exec(select(Category)).all())


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate, session: Session = Depends(get_session)
) -> Category:
    # The client generates the UUID; the server never regenerates ids.
    if session.get(Category, payload.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Category {payload.id} already exists")

    category = Category(**payload.model_dump())
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.get("/{category_id}", response_model=CategoryRead)
def get_category(category_id: str, session: Session = Depends(get_session)) -> Category:
    return _get_or_404(session, category_id)


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: str, payload: CategoryUpdate, session: Session = Depends(get_session)
) -> Category:
    category = _get_or_404(session, category_id)

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)

    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: str, session: Session = Depends(get_session)) -> Response:
    category = _get_or_404(session, category_id)

    # Unlink from tasks first: deleting a category must never delete its tasks.
    category.tasks.clear()
    session.delete(category)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
