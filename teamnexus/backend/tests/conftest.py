import pytest
from app import create_app

TEST_ADMIN_USERNAME = "test-admin"
TEST_ADMIN_PASSWORD = "test-only-password"

@pytest.fixture
def client(tmp_path, monkeypatch):
    from app.utils import sqlite_db

    monkeypatch.setattr(sqlite_db, "DATABASE_FILE", str(tmp_path / "test.sqlite"))
    monkeypatch.setattr(sqlite_db, "UPLOAD_FOLDER", str(tmp_path / "uploads"))
    app = create_app({
        "INITIAL_ADMIN_USERNAME": TEST_ADMIN_USERNAME,
        "INITIAL_ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
        "REGISTRATION_GATE_PASSWORD": "",
        "JWT_SECRET_KEY": "test-jwt-secret-with-at-least-32-bytes",
        "JWT_EVENT_SECRET": "test-event-jwt-secret-with-at-least-32-bytes",
    })
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client
