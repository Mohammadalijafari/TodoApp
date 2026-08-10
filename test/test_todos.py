from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest
from ..database import Base
from ..main import app
from ..routers.todos import get_db, get_current_user
from fastapi.testclient import TestClient
from fastapi import status
from ..models import Todos

SQLALCHEMY_DATABASE_URL = "sqlite:///./testdb.db"


engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def override_get_current_user():
    return {"username": "test", "id": 1, "user_role": "admin"}


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user

client = TestClient(app)


@pytest.fixture
def test_todo():
    todo = Todos(
        title="title",
        description="description",
        category="General",
        priority=5,
        complete=False,
        owner_id=1,
    )

    db = TestingSessionLocal()
    db.add(todo)
    db.commit()
    db.refresh(todo)
    yield todo
    with engine.connect() as connection:
        connection.execute(text("DELETE FROM todos;"))
        connection.commit()


def test_read_all_authenticated(test_todo):
    response = client.get("/todos")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["title"] == "title"
    assert payload[0]["description"] == "description"
    assert payload[0]["category"] == "General"
    assert payload[0]["priority"] == 5
    assert payload[0]["complete"] is False
    assert payload[0]["owner_id"] == 1


def test_read_one_authenticated(test_todo):
    response = client.get("/todos/todo/1")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["title"] == "title"
    assert payload["category"] == "General"


def test_read_one_authenticated_not_found(test_todo):
    response = client.get("/todos/todo/99")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Todo not found"}


def test_create_todo(test_todo):
    request_data = {
        "title": "new title",
        "description": "new description",
        "category": "Work",
        "priority": 4,
        "complete": False,
    }

    response = client.post("/todos/todo/", json=request_data)
    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["title"] == request_data["title"]
    assert payload["category"] == "Work"

    db = TestingSessionLocal()
    model = db.query(Todos).filter(Todos.id == payload["id"]).first()
    assert model.title == request_data.get("title")
    assert model.description == request_data.get("description")
    assert model.category == request_data.get("category")
    assert model.priority == request_data.get("priority")
    assert model.complete == request_data.get("complete")


def test_update_todo(test_todo):
    request_data = {
        "title": "changed title",
        "description": "changed description",
        "category": "Personal",
        "priority": 2,
        "complete": True,
    }

    response = client.put("/todos/todo/1", json=request_data)
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["title"] == "changed title"
    assert payload["complete"] is True


def test_toggle_todo(test_todo):
    response = client.patch("/todos/todo/1/toggle", json={"complete": True})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["complete"] is True


def test_delete_todo(test_todo):
    response = client.delete("/todos/todo/1")
    assert response.status_code == status.HTTP_204_NO_CONTENT

    db = TestingSessionLocal()
    model = db.query(Todos).filter(Todos.id == 1).first()
    assert model is None


def test_delete_todo_not_found():
    response = client.delete("/todos/todo/999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Todo not found"}
