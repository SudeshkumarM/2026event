import pytest
import re
from app import create_app
from app.utils.sqlite_db import init_db, get_db_connection
from app.routes.api_routes import generate_access_code, hash_access_code

TINY_PNG_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def test_technox_branding_and_code_generation(client):
    # 1. Branding check on /api/event-auth/status
    res = client.get('/api/event-auth/status')
    assert res.status_code == 200
    data = res.get_json()
    assert "TECNOX" in data["event_name"]
    assert "AI DOWNFALL" in data["event_name"]

    # 2. Secret Team Access Code Format check
    # Prefix TECH- with two alphanumeric 3-character segments (e.g. TECH-A7B-24A)
    for _ in range(50):
        code = generate_access_code()
        assert code.startswith("TECH-"), f"Code {code} must start with TECH-"
        match = re.match(r"^TECH-[0-9A-Z]{3}-[0-9A-Z]{3}$", code)
        assert match is not None, f"Code {code} does not match TECH-XXX-XXX format"

    # 3. Registration sequence starting from TECH-2400
    # Clean any prior TECH- teams in test db
    conn = get_db_connection()
    conn.execute("DELETE FROM teams WHERE team_code LIKE 'TECH-%';")
    conn.commit()
    conn.close()

    # Register first team
    reg1 = client.post('/api/register', json={
        "team_name": "TECNOX Alpha",
        "college_name": "Tech Institute",
        "p1_name": "Player One",
        "p1_college": "Tech Institute",
        "p1_phone": "9998887701",
        "p1_roll": "R001",
        "p1_id_card_data": TINY_PNG_B64,
        "p2_name": "Player Two",
        "p2_college": "Tech Institute",
        "p2_phone": "9998887702",
        "p2_roll": "R002",
        "p2_id_card_data": TINY_PNG_B64
    })
    assert reg1.status_code == 201
    d1 = reg1.get_json()
    assert d1["team_code"] == "TECH-2400", f"First team must be TECH-2400, got {d1['team_code']}"
    assert d1["access_code"].startswith("TECH-")
    assert re.match(r"^TECH-[0-9A-Z]{3}-[0-9A-Z]{3}$", d1["access_code"])

    # Register second team
    reg2 = client.post('/api/register', json={
        "team_name": "TECNOX Beta",
        "college_name": "Tech Institute",
        "p1_name": "Player Three",
        "p1_college": "Tech Institute",
        "p1_phone": "9998887703",
        "p1_roll": "R003",
        "p1_id_card_data": TINY_PNG_B64,
        "p2_name": "Player Four",
        "p2_college": "Tech Institute",
        "p2_phone": "9998887704",
        "p2_roll": "R004",
        "p2_id_card_data": TINY_PNG_B64
    })
    assert reg2.status_code == 201
    d2 = reg2.get_json()
    assert d2["team_code"] == "TECH-2401", f"Second team must be TECH-2401, got {d2['team_code']}"
    assert d2["access_code"] != d1["access_code"], "Secret access codes must be unique"

    # Register third team
    reg3 = client.post('/api/register', json={
        "team_name": "TECNOX Gamma",
        "college_name": "Tech Institute",
        "p1_name": "Player Five",
        "p1_college": "Tech Institute",
        "p1_phone": "9998887705",
        "p1_roll": "R005",
        "p1_id_card_data": TINY_PNG_B64,
        "p2_name": "Player Six",
        "p2_college": "Tech Institute",
        "p2_phone": "9998887706",
        "p2_roll": "R006",
        "p2_id_card_data": TINY_PNG_B64
    })
    assert reg3.status_code == 201
    d3 = reg3.get_json()
    assert d3["team_code"] == "TECH-2402", f"Third team must be TECH-2402, got {d3['team_code']}"

    # 4. Verify game access using the newly registered TECH-2400 and its secret code
    auth_res = client.post('/api/game-access/verify', json={
        "team_code": "TECH-2400",
        "access_code": d1["access_code"],
        "difficulty": "MEDIUM"
    })
    assert auth_res.status_code == 200
    assert auth_res.get_json()["success"] is True

    # 5. Public queue must NOT expose secret access code
    q_res = client.get('/api/queue/public')
    assert q_res.status_code == 200
    q_str = str(q_res.get_json())
    assert d1["access_code"] not in q_str
    assert d2["access_code"] not in q_str
    assert d3["access_code"] not in q_str

    # 6. Admin endpoint MUST display secret access code to authorized admin
    login_res = client.post('/api/admin/login', json={
        "username": "test-admin",
        "password": "test-only-password"
    })
    assert login_res.status_code == 200
    token = login_res.get_json()["token"]

    admin_teams_res = client.get('/api/admin/teams?search=TECH-2400', headers={
        "Authorization": f"Bearer {token}"
    })
    assert admin_teams_res.status_code == 200
    admin_teams = admin_teams_res.get_json()["teams"]
    assert len(admin_teams) >= 1
    t2400 = next(t for t in admin_teams if t["team_code"] == "TECH-2400")
    assert t2400["access_code"] == d1["access_code"], "Admin must be able to view Secret Team Access Code"
