import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session
from starlette import status

from ..database import SessionLocal
from ..models import Users

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "5ee10c7158a8329782df3ac63d1997170e4d8e360fb664a2a7020bfbda308972",
)
ALGORITHM = "HS256"

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_bearer = OAuth2PasswordBearer(tokenUrl="auth/token")


class SafeUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    username: str
    first_name: str
    last_name: str
    is_active: bool
    role: str
    phone_number: str


class UserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr
    first_name: str = Field(min_length=3, max_length=100)
    last_name: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=6, max_length=100)
    phone_number: str = Field(min_length=6, max_length=100)


class Token(BaseModel):
    access_token: str
    token_type: str
    user: SafeUserResponse


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


db_dependency = Annotated[Session, Depends(get_db)]


### Endpoints ###
def authenticate_user(username: str, password: str, db):
    user = db.query(Users).filter(Users.username == username).first()
    if not user:
        return False
    if not bcrypt_context.verify(password, user.hashed_password):
        return False
    return user


def create_access_token(
    username: str, user_id: int, role: str, expires_delta: timedelta
):
    encode = {"sub": username, "id": user_id, "role": role}
    expires = datetime.now(timezone.utc) + expires_delta
    encode.update({"exp": expires})
    return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: Annotated[str, Depends(oauth2_bearer)]):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("id")
        user_role: str = payload.get("role")
        if username is None or user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate User",
            )
        return {"username": username, "id": user_id, "user_role": user_role}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate User",
        )


def get_user_by_id(db: Session, user_id: int):
    return db.query(Users).filter(Users.id == user_id).first()


def ensure_unique_user_fields(db: Session, username: str, email: str):
    existing_username = db.query(Users).filter(Users.username == username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    existing_email = db.query(Users).filter(Users.email == email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already exists",
        )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SafeUserResponse)
async def create_user(db: db_dependency, create_user_request: UserRequest):
    ensure_unique_user_fields(
        db,
        username=create_user_request.username,
        email=create_user_request.email,
    )

    create_user_model = Users(
        email=create_user_request.email,
        username=create_user_request.username,
        first_name=create_user_request.first_name,
        last_name=create_user_request.last_name,
        role="user",
        hashed_password=bcrypt_context.hash(create_user_request.password),
        is_active=True,
        phone_number=create_user_request.phone_number,
    )

    db.add(create_user_model)
    db.commit()
    db.refresh(create_user_model)
    return create_user_model


@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: db_dependency
):
    user = authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate User"
        )
    token = create_access_token(
        user.username, user.id, user.role, timedelta(minutes=20)
    )

    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=SafeUserResponse)
async def read_current_user(
    user: Annotated[dict, Depends(get_current_user)],
    db: db_dependency,
):
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Failed",
        )

    user_model = get_user_by_id(db, user.get("id"))
    if user_model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user_model
