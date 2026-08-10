from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest
from ..models import Users
from ..database import Base
from ..main import app
from ..routers.users import get_db, get_current_user
from fastapi.testclient import TestClient
from fastapi import status
from ..routers.auth import bcrypt_context

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
def test_user():
    user = Users(
        username="test",
        email="test@test.test",
        first_name="test",
        last_name="test",
        hashed_password=bcrypt_context.hash("password"),
        role="admin",
        phone_number="11111111",
    )

    db = TestingSessionLocal()
    db.add(user)
    db.commit()
    yield user
    with engine.connect() as connection:
        connection.execute(text("DELETE FROM users"))
        connection.commit()


def test_return_user(test_user):
    response = client.get("/users")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["username"] == "test"
    assert response.json()["email"] == "test@test.test"
    assert response.json()["first_name"] == "test"
    assert response.json()["last_name"] == "test"
    assert response.json()["role"] == "admin"
    assert response.json()["phone_number"] == "11111111"
    assert "hashed_password" not in response.json()


def test_change_password_success(test_user):
    response = client.put(
        "/users/password", json={"password": "password", "new_password": "newpassword"}
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT


def test_change_password_invalid_password(test_user):
    response = client.put(
        "/users/password",
        json={"password": "wrong_password", "new_password": "newpassword"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Incorrect Password"}


def test_change_phone_number_success(test_user):
    response = client.put(
        "/users/phone_number",
        json={"phone_number": "22222222"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["phone_number"] == "22222222"
