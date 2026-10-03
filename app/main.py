from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.config import ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD
from app.database import Base, SessionLocal, engine
from app.models import User
from app.routers import admin, auth, pricing, rentals, vehicles
from app.security import hash_password

STATIC_DIR = Path(__file__).parent / "static"


def ensure_admin() -> None:
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.role == "admin")):
            return
        db.add(
            User(
                name=ADMIN_NAME,
                email=ADMIN_EMAIL.lower(),
                password_hash=hash_password(ADMIN_PASSWORD),
                role="admin",
            )
        )
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    ensure_admin()
    yield


app = FastAPI(title="Locadora de Veículos", version="1.0.0", lifespan=lifespan)

for module in (auth, vehicles, pricing, rentals, admin):
    app.include_router(module.router)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")
