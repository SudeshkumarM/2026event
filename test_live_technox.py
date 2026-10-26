import urllib.request
import json

base_url = "http://localhost:5173"
tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

print("1. Unlocking Event Gate (POST /api/event-auth/verify)...")
gate_payload = {"password": "Event@2026"}
gate_req = urllib.request.Request(
    f"{base_url}/api/event-auth/verify",
    data=json.dumps(gate_payload).encode('utf-8'),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(gate_req) as g_resp:
    g_data = json.loads(g_resp.read().decode('utf-8'))
    event_token = g_data.get("token")
    print("   [OK] Gate unlocked, event token obtained.")

print("2. Registering Team via Live Vite Proxy...")
import time
ts = str(int(time.time()))[-4:]
reg_payload = {
    "team_name": f"Live Strike {ts}",
    "college_name": "MIT World Peace University",
    "p1_name": f"Player {ts}A",
    "p1_college": "MIT WPU",
    "p1_phone": f"981122{ts}",
    "p1_roll": f"ROLL-{ts}A",
    "p1_id_card_data": tiny_png,
    "p2_name": f"Player {ts}B",
    "p2_college": "MIT WPU",
    "p2_phone": f"981133{ts}",
    "p2_roll": f"ROLL-{ts}B",
    "p2_id_card_data": tiny_png
}

req = urllib.request.Request(
    f"{base_url}/api/register",
    data=json.dumps(reg_payload).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "X-Event-Pass": event_token,
        "Authorization": f"Bearer {event_token}"
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        res_data = json.loads(resp.read().decode('utf-8'))
        print("   [OK] Registration successful (201):")
        print("        Official Team ID :", res_data.get("team_code"))
        print("        Secret Code      :", res_data.get("access_code"))
        print("        Team Name        :", res_data.get("team_name"))
        print("        Queue Number     :", res_data.get("queue_number"))

        team_code = res_data.get("team_code")
        access_code = res_data.get("access_code")

        assert team_code.startswith("TECH-"), f"Team code must start with TECH-, got {team_code}"
        assert access_code.startswith("TECH-"), f"Access code must start with TECH-, got {access_code}"

        print("2. Verifying Game Station Access with new Credentials...")
        verify_payload = {
            "team_code": team_code,
            "access_code": access_code,
            "difficulty": "MEDIUM"
        }
        v_req = urllib.request.Request(
            f"{base_url}/api/game-access/verify",
            data=json.dumps(verify_payload).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(v_req) as v_resp:
            v_data = json.loads(v_resp.read().decode('utf-8'))
            print("   [OK] Game Access Verified (200):")
            print("        Success      :", v_data.get("success"))
            print("        Session Token:", v_data.get("session_token"))
            print("        Team Code    :", v_data.get("team_code"))
            assert v_data.get("success") is True
            print("\n>>> LIVE REGISTRATION AND ACCESS VERIFICATION TEST PASSED CLEANLY! <<<")

except urllib.error.HTTPError as e:
    print("   [FAIL] HTTP Error:", e.code, e.read().decode('utf-8'))
except Exception as e:
    print("   [FAIL] Exception:", e)
