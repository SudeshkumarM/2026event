import json
import base64
import uuid
import random
import pytest
from app import create_app
from app.routes import api_routes
from app.routes.api_routes import generate_access_code, hash_access_code, verify_image_bytes
from app.utils.sqlite_db import PostgresCursor, PostgresRow, get_db_connection, init_db

TINY_PNG_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
TEST_ADMIN_USERNAME = "test-admin"
TEST_ADMIN_PASSWORD = "test-only-password"

def test_postgres_cursor_uses_named_driver_placeholders():
    class CursorStub:
        def execute(self, query, params):
            self.query = query
            self.params = params

    cursor_stub = CursorStub()
    PostgresCursor(cursor_stub).execute("SELECT ? AS value", (42,))

    assert cursor_stub.query == "SELECT %s AS value"
    assert cursor_stub.params == (42,)

def test_postgres_row_supports_named_and_positional_access():
    row = PostgresRow([("id", 42), ("name", "team")])

    assert row["name"] == "team"
    assert row[0] == 42

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

def test_image_magic_bytes_validator():
    # Valid PNG
    png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
    valid, ext = verify_image_bytes(png_bytes)
    assert valid and ext == 'png'

    # Valid JPEG
    jpg_bytes = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01'
    valid, ext = verify_image_bytes(jpg_bytes)
    assert valid and ext == 'jpg'

    # Invalid arbitrary executable/script
    fake_exe = b'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00'
    valid, err = verify_image_bytes(fake_exe)
    assert not valid
    assert "not supported" in err

def test_access_code_generator_and_hasher():
    code = generate_access_code()
    assert code.startswith("TECH-")
    assert len(code) == 12  # TECH-XXX-XXX
    h1 = hash_access_code(code)
    h2 = hash_access_code(code.lower())
    assert h1 == h2  # Case-insensitive normalization
    assert len(h1) == 64  # SHA-256 hex string

def test_database_does_not_seed_credentials_without_configuration(tmp_path, monkeypatch):
    from app.utils import sqlite_db

    monkeypatch.setattr(sqlite_db, "DATABASE_FILE", str(tmp_path / "test.sqlite"))
    monkeypatch.setattr(sqlite_db, "UPLOAD_FOLDER", str(tmp_path / "uploads"))
    init_db({})

    conn = get_db_connection()
    admin_count = conn.execute("SELECT COUNT(*) FROM admin_users").fetchone()[0]
    event_config = conn.execute(
        "SELECT event_password_hash, event_password_enabled FROM system_config WHERE id = 1"
    ).fetchone()
    conn.close()

    assert admin_count == 0
    assert event_config["event_password_hash"] is None
    assert event_config["event_password_enabled"] == 0

def test_registration_gate_password_is_separate_from_admin_password(tmp_path, monkeypatch):
    from app.utils import sqlite_db

    monkeypatch.setattr(sqlite_db, "DATABASE_FILE", str(tmp_path / "registration-gate.sqlite"))
    monkeypatch.setattr(sqlite_db, "UPLOAD_FOLDER", str(tmp_path / "uploads"))
    app = create_app({
        "REGISTRATION_GATE_PASSWORD": "reg@2026",
        "INITIAL_ADMIN_USERNAME": TEST_ADMIN_USERNAME,
        "INITIAL_ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
        "JWT_SECRET_KEY": "test-jwt-secret-with-at-least-32-bytes",
        "JWT_EVENT_SECRET": "test-event-jwt-secret-with-at-least-32-bytes",
    })
    app.config["TESTING"] = True

    with app.test_client() as client:
        status = client.get("/api/event-auth/status")
        assert status.status_code == 200
        assert status.get_json()["password_required"]

        invalid_gate = client.post("/api/event-auth/verify", json={"password": "wrong"})
        assert invalid_gate.status_code == 401

        valid_gate = client.post("/api/event-auth/verify", json={"password": "reg@2026"})
        assert valid_gate.status_code == 200
        registration_token = valid_gate.get_json()["token"]

        protected_registration = client.post("/api/register", json={})
        assert protected_registration.status_code == 401

        authenticated_registration = client.post(
            "/api/register",
            json={},
            headers={"X-Event-Pass": registration_token},
        )
        assert authenticated_registration.status_code == 400
        assert "team name" in authenticated_registration.get_json()["error"].lower()

        registration_password_admin_login = client.post("/api/admin/login", json={
            "username": TEST_ADMIN_USERNAME,
            "password": "reg@2026",
        })
        assert registration_password_admin_login.status_code == 401

        admin_login = client.post("/api/admin/login", json={
            "username": TEST_ADMIN_USERNAME,
            "password": TEST_ADMIN_PASSWORD,
        })
        assert admin_login.status_code == 200

def test_local_test_access_codes_are_seeded_and_hidden_from_public_queue(client):
    conn = get_db_connection()
    test_team_count = conn.execute(
        "SELECT COUNT(*) FROM teams WHERE is_test = 1"
    ).fetchone()[0]
    credential_count = conn.execute("""
        SELECT COUNT(*)
        FROM access_credentials c
        JOIN teams t ON t.id = c.team_id
        WHERE t.is_test = 1
    """).fetchone()[0]
    conn.close()

    assert test_team_count == 10
    assert credential_count == 10

    for number in range(1, 11):
        access_code = f"ATS-TEST-{number:03d}"
        response = client.post("/api/game-access/verify", json={
            "access_code": access_code
        })
        assert response.status_code == 200, access_code
        assert response.get_json()["team_code"] == access_code

    queue_response = client.get("/api/queue/public")
    queue_data = queue_response.get_json()["data"]
    assert queue_data["stats"]["total"] == 0
    assert all(not team["team_code"].startswith("ATS-TEST-")
               for team in queue_data["upcoming"])

def test_registration_rejects_missing_mandatory_id(client):
    uid = uuid.uuid4().hex[:6]
    rand_phone1 = f"98765{random.randint(10000, 99999)}"
    rand_phone2 = f"98766{random.randint(10000, 99999)}"

    res = client.post('/api/register', json={
        "team_name": f"Incomplete Team {uid}",
        "college_name": "Tech College",
        "p1_name": "Player One",
        "p1_roll": f"R1_{uid}",
        "p1_phone": rand_phone1,
        "p2_name": "Player Two",
        "p2_roll": f"R2_{uid}",
        "p2_phone": rand_phone2
        # No ID cards provided
    })
    assert res.status_code == 400
    assert "mandatory" in res.get_json()["error"].lower()

def test_successful_registration_and_code_generation(client):
    uid = uuid.uuid4().hex[:6]
    rand_phone1 = f"91234{random.randint(10000, 99999)}"
    rand_phone2 = f"91235{random.randint(10000, 99999)}"

    res = client.post('/api/register', json={
        "team_name": f"CYBER APEX {uid}",
        "college_name": "Apex Engineering Institute",
        "p1_name": "Alex Mercer",
        "p1_roll": f"APEX-P1-{uid}",
        "p1_phone": rand_phone1,
        "p1_id_card_data": TINY_PNG_B64,
        "p2_name": "Sarah Connor",
        "p2_roll": f"APEX-P2-{uid}",
        "p2_phone": rand_phone2,
        "p2_id_card_data": TINY_PNG_B64
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"]
    assert "team_code" in data
    assert "access_code" in data
    assert data["team_code"].startswith("TECH-")
    assert data["access_code"].startswith("TECH-")

    team_code = data["team_code"]
    access_code = data["access_code"]

    # Verify game access with correct code
    auth_res = client.post('/api/game-access/verify', json={
        "team_code": team_code,
        "access_code": access_code,
        "difficulty": "HARD"
    })
    assert auth_res.status_code == 200
    auth_data = auth_res.get_json()
    assert auth_data["success"]
    assert auth_data["duration_seconds"] == 420
    assert "session_token" in auth_data

    conn = get_db_connection()
    session_before_start = conn.execute(
        "SELECT status, started_at, scheduled_end_at FROM game_sessions WHERE id = ?",
        (auth_data["session_id"],)
    ).fetchone()
    conn.close()
    assert session_before_start["status"] == "INITIATED"
    assert session_before_start["started_at"] is None
    assert session_before_start["scheduled_end_at"] is None

    start_res = client.post("/api/game/session/start", json={
        "session_token": auth_data["session_token"]
    })
    assert start_res.status_code == 200
    start_data = start_res.get_json()
    assert start_data["status"] == "PLAYING"
    assert start_data["duration_seconds"] == 420
    assert start_data["remaining_seconds"] == 420

    status_res = client.get(
        f"/api/game/session/status?session_token={auth_data['session_token']}"
    )
    assert status_res.status_code == 200
    assert status_res.get_json()["status"] == "PLAYING"
    assert status_res.get_json()["remaining_seconds"] <= 420

    # Verify that wrong code is rejected
    wrong_res = client.post('/api/game-access/verify', json={
        "team_code": team_code,
        "access_code": "ATS-WRONG-CODE"
    })
    assert wrong_res.status_code == 401
    assert "invalid" in wrong_res.get_json()["error"].lower()

def test_public_leaderboard_sanitization(client):
    res = client.get('/api/leaderboard')
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"]
    for row in data["leaderboard"]:
        # Verify no sensitive data is leaked
        assert "phone" not in row
        assert "roll_number" not in row
        assert "id_card_filename" not in row
        assert "access_code" not in row

def test_leaderboard_breaks_equal_scores_by_fastest_completion_time(client):
    conn = get_db_connection()
    slower_team_id = conn.execute("""
        INSERT INTO teams (team_code, team_name, queue_number, status)
        VALUES ('TIE-SLOW', 'Slower Team', 991, 'COMPLETED')
    """).lastrowid
    faster_team_id = conn.execute("""
        INSERT INTO teams (team_code, team_name, queue_number, status)
        VALUES ('TIE-FAST', 'Faster Team', 992, 'COMPLETED')
    """).lastrowid

    for team_id, session_id in (
        (slower_team_id, "tie-slow-session"),
        (faster_team_id, "tie-fast-session"),
    ):
        conn.execute("""
            INSERT INTO game_sessions (
                id, team_id, session_token, mode, config_snapshot, status
            ) VALUES (?, ?, ?, 'MODE_TIME', '{}', 'COMPLETED')
        """, (session_id, team_id, f"{session_id}-token"))

    conn.execute("""
        INSERT INTO game_results (
            game_session_id, team_id, difficulty, score, hits, misses,
            accuracy, completion_time_ms
        ) VALUES
            ('tie-slow-session', ?, 'MEDIUM', 500, 9, 1, 90.0, 12000),
            ('tie-fast-session', ?, 'MEDIUM', 500, 6, 4, 60.0, 9000)
    """, (slower_team_id, faster_team_id))
    conn.commit()
    conn.close()

    response = client.get("/api/leaderboard")
    assert response.status_code == 200
    leaderboard = response.get_json()["leaderboard"]
    tied_results = [row for row in leaderboard if row["score"] == 500]
    assert [row["team_code"] for row in tied_results] == ["TIE-FAST", "TIE-SLOW"]

def test_admin_auth_and_security(client):
    # Unauthenticated access rejected
    unauth_res = client.get('/api/admin/stats')
    assert unauth_res.status_code == 401

    # Valid admin login
    login_res = client.post('/api/admin/login', json={
        "username": TEST_ADMIN_USERNAME,
        "password": TEST_ADMIN_PASSWORD
    })
    assert login_res.status_code == 200
    token = login_res.get_json()["token"]

    # Authenticated access succeeds
    auth_res = client.get('/api/admin/stats', headers={"Authorization": f"Bearer {token}"})
    assert auth_res.status_code == 200
    assert auth_res.get_json()["success"]


def test_admin_can_change_event_password_without_logging_secret(client):
    login_response = client.post("/api/admin/login", json={
        "username": TEST_ADMIN_USERNAME,
        "password": TEST_ADMIN_PASSWORD,
    })
    token = login_response.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    response = client.put("/api/admin/config", json={
        "event_password": "event-password-new",
        "confirm_event_password": "event-password-new",
        "event_password_enabled": 1,
    }, headers=headers)
    assert response.status_code == 200
    config = response.get_json()["config"]
    assert config["event_password_configured"] is True
    assert "event_password_hash" not in config

    api_routes.rate_limits.clear()
    valid = client.post("/api/event-auth/verify", json={"password": "event-password-new"})
    assert valid.status_code == 200
    assert valid.get_json()["success"]
    stale_registration_token = valid.get_json()["token"]

    client.application.config["REGISTRATION_GATE_PASSWORD"] = "event-password-legacy"
    api_routes.rate_limits.clear()
    invalid = client.post("/api/event-auth/verify", json={"password": "event-password-legacy"})
    assert invalid.status_code == 401

    changed = client.put("/api/admin/config", json={
        "event_password": "event-password-next",
        "confirm_event_password": "event-password-next",
        "event_password_enabled": 1,
    }, headers=headers)
    assert changed.status_code == 200
    stale_token_response = client.post(
        "/api/register",
        json={},
        headers={"X-Event-Pass": stale_registration_token},
    )
    assert stale_token_response.status_code == 401
    assert "settings changed" in stale_token_response.get_json()["error"].lower()

    conn = get_db_connection()
    audit = conn.execute(
        "SELECT metadata FROM audit_logs WHERE action = 'UPDATE_CONFIG' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    assert "event-password-new" not in audit["metadata"]
    assert "event-password-next" not in audit["metadata"]

    mismatch = client.put("/api/admin/config", json={
        "event_password": "event-password-next",
        "confirm_event_password": "not-the-same",
        "event_password_enabled": 1,
    }, headers=headers)
    assert mismatch.status_code == 400

    unauthenticated = client.put("/api/admin/config", json={
        "event_password": "event-password-unauthorized",
        "confirm_event_password": "event-password-unauthorized",
    })
    assert unauthenticated.status_code == 401


def test_admin_can_change_password_and_invalidates_existing_tokens(client):
    login_response = client.post("/api/admin/login", json={
        "username": TEST_ADMIN_USERNAME,
        "password": TEST_ADMIN_PASSWORD,
    })
    token = login_response.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    unauthenticated = client.post("/api/admin/change-password", json={
        "current_password": TEST_ADMIN_PASSWORD,
        "new_password": "new-admin-password-2026",
        "confirm_password": "new-admin-password-2026",
    })
    assert unauthenticated.status_code == 401

    response = client.post("/api/admin/change-password", json={
        "current_password": TEST_ADMIN_PASSWORD,
        "new_password": "new-admin-password-2026",
        "confirm_password": "new-admin-password-2026",
    }, headers=headers)
    assert response.status_code == 200

    expired_session = client.get("/api/admin/config", headers=headers)
    assert expired_session.status_code == 401

    old_login = client.post("/api/admin/login", json={
        "username": TEST_ADMIN_USERNAME,
        "password": TEST_ADMIN_PASSWORD,
    })
    assert old_login.status_code == 401

    new_login = client.post("/api/admin/login", json={
        "username": TEST_ADMIN_USERNAME,
        "password": "new-admin-password-2026",
    })
    assert new_login.status_code == 200
    assert new_login.get_json()["success"]


def test_admin_can_search_reset_revoke_team_access_code(client):
    conn = get_db_connection()
    team_id = conn.execute("""
        INSERT INTO teams (team_code, team_name, queue_number, status)
        VALUES ('ACCESS-001', 'Recovery Team', 995, 'WAITING')
    """).lastrowid
    conn.execute("""
        INSERT INTO participants (team_id, player_role, name, college, phone, roll_number)
        VALUES (?, 'PLAYER_1_AIM', 'Recovery Player', 'Recovery College', '9876501234', 'REC-001')
    """, (team_id,))
    conn.execute(
        "INSERT INTO access_credentials (team_id, credential_hash) VALUES (?, ?)",
        (team_id, hash_access_code("ATS-OLD1-CODE")),
    )
    conn.commit()
    conn.close()

    unauthorized = client.post(f"/api/admin/teams/{team_id}/reset-access-code")
    assert unauthorized.status_code == 401

    login_response = client.post("/api/admin/login", json={
        "username": TEST_ADMIN_USERNAME,
        "password": TEST_ADMIN_PASSWORD,
    })
    headers = {"Authorization": f"Bearer {login_response.get_json()['token']}"}

    search_response = client.get("/api/admin/teams?search=9876501234", headers=headers)
    assert search_response.status_code == 200
    team = next(team for team in search_response.get_json()["teams"] if team["id"] == team_id)
    assert team["team_code"] == "ACCESS-001"
    assert team["access_code_status"] == "ACTIVE"
    assert team["participants"][0]["name"] == "Recovery Player"

    reset_response = client.post(
        f"/api/admin/teams/{team_id}/reset-access-code",
        headers=headers,
    )
    assert reset_response.status_code == 200
    new_code = reset_response.get_json()["new_access_code"]
    assert new_code.startswith("TECH-")

    old_code_response = client.post("/api/game-access/verify", json={
        "team_code": "ACCESS-001",
        "access_code": "ATS-OLD1-CODE",
    })
    assert old_code_response.status_code == 401
    assert "invalid or inactive" in old_code_response.get_json()["error"].lower()

    new_code_response = client.post("/api/game-access/verify", json={
        "team_code": "ACCESS-001",
        "access_code": new_code,
    })
    assert new_code_response.status_code == 200

    revoke_response = client.post(
        f"/api/admin/teams/{team_id}/revoke-access-code",
        headers=headers,
    )
    assert revoke_response.status_code == 200

    revoked_code_response = client.post("/api/game-access/verify", json={
        "team_code": "ACCESS-001",
        "access_code": new_code,
    })
    assert revoked_code_response.status_code == 401

    status_response = client.get("/api/admin/teams?search=Recovery%20Player", headers=headers)
    refreshed_team = next(team for team in status_response.get_json()["teams"] if team["id"] == team_id)
    assert refreshed_team["access_code_status"] == "REVOKED"


def test_game_access_attempts_are_rate_limited_without_revealing_team_existence(client):
    client_ip = "192.0.2.44"
    api_routes.game_access_rate_limits.pop(client_ip, None)
    try:
        for _ in range(10):
            response = client.post(
                "/api/game-access/verify",
                json={"team_code": "DOES-NOT-EXIST", "access_code": "ATS-INVALID"},
                environ_base={"REMOTE_ADDR": client_ip},
            )
            assert response.status_code == 401
            assert "invalid or inactive" in response.get_json()["error"].lower()

        limited = client.post(
            "/api/game-access/verify",
            json={"team_code": "DOES-NOT-EXIST", "access_code": "ATS-INVALID"},
            environ_base={"REMOTE_ADDR": client_ip},
        )
        assert limited.status_code == 429
    finally:
        api_routes.game_access_rate_limits.pop(client_ip, None)


def test_admin_team_details_include_player_registration_data_without_secrets(client):
    conn = get_db_connection()
    team_id = conn.execute("""
        INSERT INTO teams (team_code, team_name, college_name, queue_number, status)
        VALUES ('DETAIL-001', 'Details Team', 'Example College', 993, 'WAITING')
    """).lastrowid
    conn.execute("""
        INSERT INTO participants (
            team_id, player_role, name, college, phone, roll_number, id_card_filename
        ) VALUES (?, 'PLAYER_1_AIM', 'Test Player', 'Example College',
                  '9876543210', 'EX-001', 'test-id.png')
    """, (team_id,))
    conn.commit()
    conn.close()

    login_response = client.post("/api/admin/login", json={
        "username": TEST_ADMIN_USERNAME,
        "password": TEST_ADMIN_PASSWORD,
    })
    assert login_response.status_code == 200
    token = login_response.get_json()["token"]

    response = client.get(
        "/api/admin/teams?search=DETAIL-001",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    team = response.get_json()["teams"][0]
    player = team["participants"][0]
    assert player["name"] == "Test Player"
    assert player["college"] == "Example College"
    assert player["phone"] == "9876543210"
    assert player["roll_number"] == "EX-001"
    assert player["id_card_filename"] == "test-id.png"
    assert "password" not in player
    assert "credential_hash" not in player

def test_registration_with_optional_blank_roll_numbers_and_access_code_alone(client):
    uid = uuid.uuid4().hex[:6]
    rand_phone1 = f"95555{random.randint(10000, 99999)}"
    rand_phone2 = f"96666{random.randint(10000, 99999)}"

    # Registration with empty roll numbers (roll numbers optional)
    res = client.post('/api/register', json={
        "team_name": f"STRIKE FORCE {uid}",
        "college_name": "Autonomous Tech Campus",
        "p1_name": "Maya Lin",
        "p1_roll": "", # Blank optional roll
        "p1_phone": rand_phone1,
        "p1_id_card_data": TINY_PNG_B64,
        "p2_name": "Devin Vance",
        "p2_roll": "", # Blank optional roll
        "p2_phone": rand_phone2,
        "p2_id_card_data": TINY_PNG_B64
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"]
    access_code = data["access_code"]
    team_code = data["team_code"]

    # Verify game access using ACCESS CODE ALONE (without providing team_code)
    auth_res = client.post('/api/game-access/verify', json={
        "access_code": access_code
    })
    assert auth_res.status_code == 200
    auth_data = auth_res.get_json()
    assert auth_data["success"]
    assert auth_data["team_code"] == team_code
    assert auth_data["duration_seconds"] == 420
    assert "session_token" in auth_data

    # Verify invalid code error message matches requirement
    wrong_res = client.post('/api/game-access/verify', json={
        "access_code": "ATS-INVALID-CODE"
    })
    assert wrong_res.status_code == 401
    assert "invalid or inactive" in wrong_res.get_json()["error"].lower()

def test_admin_target_configs_persistence_and_game_access(client):
    login_res = client.post('/api/admin/login', json={
        "username": TEST_ADMIN_USERNAME,
        "password": TEST_ADMIN_PASSWORD
    })
    assert login_res.status_code == 200
    token = login_res.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    custom_cfg = {
        "difficulties": {
            "EASY": {"baseSpeed": 2.2, "maxSpeed": 3.2},
            "MEDIUM": {"baseSpeed": 3.6, "maxSpeed": 5.0},
            "HARD": {"baseSpeed": 5.2, "maxSpeed": 7.0}
        },
        "hitboxScale": 1.15,
        "targetSize": 62
    }

    # 1. Update config with target_configs
    put_res = client.put('/api/admin/config', headers=headers, json={
        "target_configs": custom_cfg
    })
    assert put_res.status_code == 200
    put_data = put_res.get_json()
    assert put_data["success"]
    assert put_data["config"]["target_configs"]["hitboxScale"] == 1.15
    assert put_data["config"]["target_configs"]["targetSize"] == 62

    # 2. Retrieve config via GET
    get_res = client.get('/api/admin/config', headers=headers)
    assert get_res.status_code == 200
    get_data = get_res.get_json()
    assert get_data["config"]["target_configs"]["difficulties"]["EASY"]["baseSpeed"] == 2.2

    # 3. Register a team and verify session gets target_configs
    reg_res = client.post('/api/register', json={
        "team_name": "Target Config Testers",
        "college_name": "Tech Institute",
        "p1_name": "Alice",
        "p1_phone": "9811122334",
        "p1_id_card_data": TINY_PNG_B64,
        "p2_name": "Bob",
        "p2_phone": "9822233445",
        "p2_id_card_data": TINY_PNG_B64
    })
    assert reg_res.status_code == 201
    access_code = reg_res.get_json()["access_code"]

    verify_res = client.post('/api/game-access/verify', json={
        "access_code": access_code
    })
    assert verify_res.status_code == 200
    v_data = verify_res.get_json()
    assert "target_configs" in v_data
    assert v_data["target_configs"]["hitboxScale"] == 1.15
    assert v_data["target_configs"]["targetSize"] == 62

