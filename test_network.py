import urllib.request
import json

print("1. Testing Backend directly (http://127.0.0.1:5000/)...")
try:
    with urllib.request.urlopen("http://127.0.0.1:5000/") as r:
        print("   [OK] Backend status:", r.status, json.loads(r.read().decode())['system'])
except Exception as e:
    print("   [FAIL] Backend error:", e)

print("2. Testing Backend /api/event-auth/status directly...")
try:
    with urllib.request.urlopen("http://127.0.0.1:5000/api/event-auth/status") as r:
        print("   [OK] Auth status:", r.status, json.loads(r.read().decode())['event_name'])
except Exception as e:
    print("   [FAIL] Auth status error:", e)

print("3. Testing Frontend Dev Server (http://localhost:5173/)...")
try:
    with urllib.request.urlopen("http://localhost:5173/") as r:
        html = r.read().decode()
        print("   [OK] Frontend status:", r.status, f"HTML bytes: {len(html)}")
except Exception as e:
    print("   [FAIL] Frontend error:", e)

print("4. Testing Frontend -> Backend Proxy (http://localhost:5173/api/event-auth/status)...")
try:
    with urllib.request.urlopen("http://localhost:5173/api/event-auth/status") as r:
        print("   [OK] Proxied auth status:", r.status, json.loads(r.read().decode())['event_name'])
except Exception as e:
    print("   [FAIL] Proxied auth error:", e)

print("5. Testing Team Verification via Proxy (http://localhost:5173/api/game-access/verify)...")
try:
    payload = json.dumps({'team_code': 'ATS-0104', 'access_code': 'ATS-2026-PLAY', 'difficulty': 'MEDIUM'}).encode()
    req = urllib.request.Request("http://localhost:5173/api/game-access/verify", data=payload, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read().decode())
        print("   [OK] Proxied Game Verification:", r.status, f"Team: {res['team_code']}, Token: {res['session_token']}")
except Exception as e:
    print("   [FAIL] Proxied Game Verification error:", e)
