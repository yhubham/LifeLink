"""Shared pytest fixtures.

The suite runs against in-memory SQLite, so no Postgres/PostGIS server is
required. `DATABASE_URL` is overridden before the app is imported.
"""

import os
import uuid

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.database.session import Base, SessionLocal, engine
from app.main import app
from app.models import User, UserRole

PASSWORD = "Demo@1234"

DEMO_USERS = [
    ("Control Room Admin", "admin@lifelink.demo", UserRole.ADMIN),
    ("Ambulance Crew 1", "crew1@lifelink.demo", UserRole.AMBULANCE),
    ("City Hospital Desk", "hospital@lifelink.demo", UserRole.HOSPITAL),
    ("Police Control", "police@lifelink.demo", UserRole.POLICE),
]


@pytest.fixture(scope="session")
def password_hash():
    return hash_password(PASSWORD)


@pytest.fixture()
def db(password_hash):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        for full_name, email, role in DEMO_USERS:
            session.add(
                User(
                    id=uuid.uuid4(),
                    full_name=full_name,
                    email=email,
                    password_hash=password_hash,
                    role=role,
                )
            )
        session.commit()
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    with TestClient(app) as test_client:
        yield test_client


def login_headers(client: TestClient, email: str) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def admin_headers(client):
    return login_headers(client, "admin@lifelink.demo")


@pytest.fixture()
def ambulance_headers(client):
    return login_headers(client, "crew1@lifelink.demo")


@pytest.fixture()
def hospital_headers(client):
    return login_headers(client, "hospital@lifelink.demo")
