import os

os.environ["DATABASE_URL"] = "sqlite:///./test_locadora.db"
os.environ["ADMIN_EMAIL"] = "admin@test.com"
os.environ["ADMIN_PASSWORD"] = "admin123"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(engine)


def auth_header(client, email, password):
    token = client.post("/api/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin(client):
    return auth_header(client, "admin@test.com", "admin123")


@pytest.fixture()
def customer(client):
    client.post(
        "/api/auth/register",
        json={"name": "Maria", "email": "maria@test.com", "password": "senha123", "driver_license": "12345678900"},
    )
    return auth_header(client, "maria@test.com", "senha123")
