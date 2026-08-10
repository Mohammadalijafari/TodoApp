from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from starlette import status

from ..database import SessionLocal
from ..models import Todos
from .auth import get_current_user

router = APIRouter(
    prefix="/todos",
    tags=["todos"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


db_dependency = Annotated[Session, Depends(get_db)]
user_dependency = Annotated[Session, Depends(get_current_user)]


class TodoRequest(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    description: str = Field(default="", max_length=500)
    category: str = Field(default="General", min_length=2, max_length=50)
    priority: int = Field(gt=0, lt=6)
    complete: bool
    due_date: datetime | None = None


class TodoToggleRequest(BaseModel):
    complete: bool


class TodoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    category: str
    priority: int
    complete: bool
    due_date: datetime | None
    created_at: datetime
    updated_at: datetime
    owner_id: int


class TodoStatsResponse(BaseModel):
    total: int
    completed: int
    active: int
    overdue: int
    high_priority: int


def get_owned_todo(db: Session, user_id: int, todo_id: int):
    return (
        db.query(Todos)
        .filter(Todos.id == todo_id)
        .filter(Todos.owner_id == user_id)
        .first()
    )


def apply_sort(query, sort: str):
    sort_map = {
        "created_desc": Todos.created_at.desc(),
        "created_asc": Todos.created_at.asc(),
        "updated_desc": Todos.updated_at.desc(),
        "updated_asc": Todos.updated_at.asc(),
        "due_asc": (Todos.due_date.is_(None), Todos.due_date.asc()),
        "due_desc": (Todos.due_date.is_(None), Todos.due_date.desc()),
        "priority_desc": Todos.priority.desc(),
        "priority_asc": Todos.priority.asc(),
        "title_asc": Todos.title.asc(),
        "title_desc": Todos.title.desc(),
    }
    sort_expression = sort_map.get(sort, Todos.updated_at.desc())
    if isinstance(sort_expression, tuple):
        return query.order_by(*sort_expression)
    return query.order_by(sort_expression)


@router.get("/", status_code=status.HTTP_200_OK, response_model=list[TodoResponse])
async def read_all(
    user: user_dependency,
    db: db_dependency,
    search: str | None = Query(default=None, min_length=1, max_length=100),
    complete: bool | None = None,
    priority: int | None = Query(default=None, gt=0, lt=6),
    category: str | None = Query(default=None, min_length=2, max_length=50),
    sort: Literal[
        "updated_desc",
        "updated_asc",
        "created_desc",
        "created_asc",
        "due_asc",
        "due_desc",
        "priority_desc",
        "priority_asc",
        "title_asc",
        "title_desc",
    ] = "updated_desc",
):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    query = db.query(Todos).filter(Todos.owner_id == user.get("id"))

    if search:
        like_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Todos.title.ilike(like_term),
                Todos.description.ilike(like_term),
                Todos.category.ilike(like_term),
            )
        )

    if complete is not None:
        query = query.filter(Todos.complete == complete)

    if priority is not None:
        query = query.filter(Todos.priority == priority)

    if category:
        query = query.filter(Todos.category == category)

    return apply_sort(query, sort).all()


@router.get("/stats", status_code=status.HTTP_200_OK, response_model=TodoStatsResponse)
async def read_todo_stats(user: user_dependency, db: db_dependency):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    base_query = db.query(Todos).filter(Todos.owner_id == user.get("id"))
    current_time = datetime.now(timezone.utc)
    total = base_query.count()
    completed = base_query.filter(Todos.complete == True).count()
    active = total - completed
    overdue = (
        base_query.filter(Todos.complete == False)
        .filter(Todos.due_date.isnot(None))
        .filter(Todos.due_date < current_time)
        .count()
    )
    high_priority = base_query.filter(Todos.priority >= 4).count()

    return {
        "total": total,
        "completed": completed,
        "active": active,
        "overdue": overdue,
        "high_priority": high_priority,
    }


@router.get("/categories", status_code=status.HTTP_200_OK, response_model=list[str])
async def read_categories(user: user_dependency, db: db_dependency):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    rows = (
        db.query(Todos.category)
        .filter(Todos.owner_id == user.get("id"))
        .filter(Todos.category.isnot(None))
        .group_by(Todos.category)
        .order_by(func.lower(Todos.category).asc())
        .all()
    )
    return [row[0] for row in rows if row[0]]


@router.get("/todo/{todo_id}", status_code=status.HTTP_200_OK, response_model=TodoResponse)
async def read_todo(
    user: user_dependency, db: db_dependency, todo_id: int = Path(gt=0)
):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    todo_model = get_owned_todo(db, user.get("id"), todo_id)
    if todo_model is not None:
        return todo_model
    raise HTTPException(status_code=404, detail="Todo not found")


@router.post("/todo", status_code=status.HTTP_201_CREATED, response_model=TodoResponse)
async def create_todo(
    user: user_dependency,
    db: db_dependency,
    todo_request: TodoRequest,
):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")
    current_time = datetime.now(timezone.utc)
    todo_model = Todos(
        **todo_request.model_dump(),
        owner_id=int(user.get("id")),
        created_at=current_time,
        updated_at=current_time,
    )

    db.add(todo_model)
    db.commit()
    db.refresh(todo_model)
    return todo_model


@router.put("/todo/{todo_id}", status_code=status.HTTP_200_OK, response_model=TodoResponse)
async def update_todo(
    user: user_dependency,
    db: db_dependency,
    todo_request: TodoRequest,
    todo_id: int = Path(gt=0),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    todo_model = get_owned_todo(db, user.get("id"), todo_id)
    if todo_model is None:
        raise HTTPException(status_code=404, detail="Todo not found")

    todo_model.title = todo_request.title
    todo_model.description = todo_request.description
    todo_model.category = todo_request.category
    todo_model.priority = todo_request.priority
    todo_model.complete = todo_request.complete
    todo_model.due_date = todo_request.due_date
    todo_model.updated_at = datetime.now(timezone.utc)

    db.add(todo_model)
    db.commit()
    db.refresh(todo_model)
    return todo_model


@router.patch(
    "/todo/{todo_id}/toggle",
    status_code=status.HTTP_200_OK,
    response_model=TodoResponse,
)
async def toggle_todo_completion(
    user: user_dependency,
    db: db_dependency,
    todo_toggle_request: TodoToggleRequest,
    todo_id: int = Path(gt=0),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    todo_model = get_owned_todo(db, user.get("id"), todo_id)
    if todo_model is None:
        raise HTTPException(status_code=404, detail="Todo not found")

    todo_model.complete = todo_toggle_request.complete
    todo_model.updated_at = datetime.now(timezone.utc)
    db.add(todo_model)
    db.commit()
    db.refresh(todo_model)
    return todo_model


@router.delete("/completed", status_code=status.HTTP_204_NO_CONTENT)
async def clear_completed_todos(user: user_dependency, db: db_dependency):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    (
        db.query(Todos)
        .filter(Todos.owner_id == user.get("id"))
        .filter(Todos.complete == True)
        .delete(synchronize_session=False)
    )
    db.commit()


@router.delete("/todo/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    user: user_dependency, db: db_dependency, todo_id: int = Path(gt=0)
):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed")

    todo_model = get_owned_todo(db, user.get("id"), todo_id)

    if todo_model is None:
        raise HTTPException(status_code=404, detail="Todo not found")

    db.delete(todo_model)
    db.commit()
