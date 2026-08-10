from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from starlette import status

from ..database import SessionLocal
from ..models import Users
from .auth import SafeUserResponse, get_current_user

router = APIRouter(
    prefix="/users",
    tags=["users"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


db_dependency = Annotated[Session, Depends(get_db)]
user_dependency = Annotated[Session, Depends(get_current_user)]
bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserVerification(BaseModel):
    password: str
    new_password: str = Field(min_length=6, max_length=64)


class UserProfileUpdate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=2, max_length=100)
    last_name: str = Field(min_length=2, max_length=100)
    phone_number: str = Field(min_length=6, max_length=100)


class PhoneNumberUpdate(BaseModel):
    phone_number: str = Field(min_length=6, max_length=100)


def get_user_model(db: Session, user_id: int):
    return db.query(Users).filter(Users.id == user_id).first()


@router.get("/", status_code=status.HTTP_200_OK, response_model=SafeUserResponse)
async def get_user(user: user_dependency, db: db_dependency):
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Failed",
        )
    user_model = get_user_model(db, user.get("id"))
    if user_model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user_model


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    user: user_dependency,
    db: db_dependency,
    user_verification: UserVerification,
):
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Failed",
        )
    user_model = get_user_model(db, user.get("id"))
    if user_model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if not bcrypt_context.verify(
        user_verification.password, user_model.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Password",
        )
    user_model.hashed_password = bcrypt_context.hash(user_verification.new_password)
    db.add(user_model)
    db.commit()


@router.put("/profile", status_code=status.HTTP_200_OK, response_model=SafeUserResponse)
async def update_profile(
    user: user_dependency, db: db_dependency, profile_update: UserProfileUpdate
):
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Failed",
        )

    user_model = get_user_model(db, user.get("id"))
    existing_email = (
        db.query(Users)
        .filter(Users.email == profile_update.email)
        .filter(Users.id != user.get("id"))
        .first()
    )
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already exists",
        )

    user_model.email = profile_update.email
    user_model.first_name = profile_update.first_name
    user_model.last_name = profile_update.last_name
    user_model.phone_number = profile_update.phone_number
    db.add(user_model)
    db.commit()
    db.refresh(user_model)
    return user_model


@router.put("/phone_number", status_code=status.HTTP_200_OK, response_model=SafeUserResponse)
async def change_phone_number(
    user: user_dependency, db: db_dependency, phone_update: PhoneNumberUpdate
):
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Failed",
        )

    user_model = get_user_model(db, user.get("id"))
    user_model.phone_number = phone_update.phone_number
    db.add(user_model)
    db.commit()
    db.refresh(user_model)
    return user_model
