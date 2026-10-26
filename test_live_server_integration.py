import urllib.request
import json
import sys

def run_tests():
    print("==================================================")
    print("LIVE SERVER & GAME ACCESS BACKEND INTEGRATION TEST")
    print("==================================================")

    # 1. Test backend event-auth status from Live Server Origin
    try:
        req = urllib.request.Request(
            'http://127.0.0.1:5000/api/event-auth/status',
            headers={'Origin': 'http://127.0.0.1:5500'}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            assert data.get('success') is True
            print(f"[OK] 1. Backend Auth Status Check: Event '{data.get('event_name')}'")
    except Exception as e:
        print(f"[FAIL] 1. Backend Auth Status Check: {e}")
        sys.exit(1)

    # 2. Test Game Access Verification for ATS-0104 with ATS-2026-PLAY
    try:
        verify_payload = json.dumps({
            'team_code': 'ATS-0104',
            'access_code': 'ATS-2026-PLAY',
            'difficulty': 'MEDIUM'
        }).encode('utf-8')

        req = urllib.request.Request(
            'http://127.0.0.1:5000/api/game-access/verify',
            data=verify_payload,
            headers={
                'Content-Type': 'application/json',
                'Origin': 'http://127.0.0.1:5500'
            }
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            v_data = json.loads(resp.read().decode())
            assert v_data.get('success') is True
            session_token = v_data.get('session_token')
            print(f"[OK] 2. Team Verification Check: Team {v_data.get('team_code')}, Session Token: {session_token[:18]}...")
    except Exception as e:
        print(f"[FAIL] 2. Team Verification Check: {e}")
        sys.exit(1)

    # 3. Test Session Status check with the received token
    try:
        status_url = f"http://127.0.0.1:5000/api/game/session/status?session_token={session_token}"
        req = urllib.request.Request(status_url, headers={'Origin': 'http://127.0.0.1:5500'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            s_data = json.loads(resp.read().decode())
            assert s_data.get('success') is True
            print(f"[OK] 3. Session Status Check: Status={s_data.get('status')}, Remaining={s_data.get('remaining_seconds')}s")
    except Exception as e:
        print(f"[FAIL] 3. Session Status Check: {e}")
        sys.exit(1)

    # 4. Verify Root index.html redirect to dist
    try:
        with open('index.html', 'r', encoding='utf-8') as f:
            html = f.read()
            assert 'teamnexus/frontend/dist/index.html#/game' in html
            print("[OK] 4. Root index.html redirects to Game Station (#/game)")
    except Exception as e:
        print(f"[FAIL] 4. Root index.html check: {e}")
        sys.exit(1)

    # 5. Verify built dist/index.html has relative asset paths
    try:
        with open('teamnexus/frontend/dist/index.html', 'r', encoding='utf-8') as f:
            dist_html = f.read()
            assert './assets/' in dist_html
            print("[OK] 5. Dist index.html uses relative paths (./assets/)")
    except Exception as e:
        print(f"[FAIL] 5. Dist index.html check: {e}")
        sys.exit(1)

    print("==================================================")
    print("ALL TESTS PASSED: Live Server & Backend Ready!")
    print("==================================================")

if __name__ == '__main__':
    run_tests()
