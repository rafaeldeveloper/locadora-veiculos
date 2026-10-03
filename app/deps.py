from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado")
    user_id = decode_access_token(credentials.credentials)
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido ou usuário inativo")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso restrito a administradores")
    return user
