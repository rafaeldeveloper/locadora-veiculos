from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginIn, Token, UserCreate, UserOut, UserUpdate
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "E-mail já cadastrado")
    if data.cpf and db.scalar(select(User).where(User.cpf == data.cpf)):
        raise HTTPException(status.HTTP_409_CONFLICT, "CPF já cadastrado")
    user = User(
        name=data.name,
        email=email,
        password_hash=hash_password(data.password),
        phone=data.phone,
        cpf=data.cpf,
        driver_license=data.driver_license,
    )
    db.add(user)
    db.commit()
    return user


@router.post("/login", response_model=Token)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha inválidos")
    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuário desativado")
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = data.model_dump(exclude_unset=True)
    password = changes.pop("password", None)
    if password:
        user.password_hash = hash_password(password)
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    return user
