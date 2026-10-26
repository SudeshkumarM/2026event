import sqlite3
import hashlib
import os

DATABASE_FILE = os.path.join(os.path.dirname(__file__), "teamnexus", "backend", "app", "aitargetstrike.db")

def hash_access_code(code):
    return hashlib.sha256(code.strip().upper().encode('utf-8')).hexdigest()

def create_auto_team():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get next sequential TECH- ID
    cursor.execute("SELECT team_code FROM teams WHERE team_code LIKE 'TECH-%';")
    existing_tech = cursor.fetchall()
    highest_seq = 2399
    for row in existing_tech:
        code_str = row['team_code'] if hasattr(row, 'keys') else row[0]
        try:
            val = int(code_str.replace("TECH-", "").strip())
            if val > highest_seq:
                highest_seq = val
        except (ValueError, TypeError):
            pass
    team_code = f"TECH-{highest_seq + 1}"

    # Generate secret access code in TECH-XXX-XXX format
    import random, string
    chars = string.ascii_uppercase + string.digits
    c1 = ''.join(random.choices(chars, k=3))
    c2 = ''.join(random.choices(chars, k=3))
    access_code = f"TECH-{c1}-{c2}"
    access_hash = hash_access_code(access_code)
    team_name = f"TECNOX {team_code}"
    college = "Nexus Institute of Technology"

    # Insert team
    cursor.execute("""
        INSERT INTO teams (team_code, team_name, college_name, queue_number, status)
        VALUES (?, ?, ?, ?, 'WAITING')
    """, (team_code, team_name, college, next_q))
    team_id = cursor.lastrowid

    # Insert Player 1
    cursor.execute("""
        INSERT INTO participants (team_id, player_role, name, college, phone, roll_number, id_card_filename)
        VALUES (?, 'PLAYER_1_AIM', 'Alex (Aim)', ?, '9876543210', 'ROLL-001', 'auto_id1.png')
    """, (team_id, college))
    p1_id = cursor.lastrowid

    # Insert Player 2
    cursor.execute("""
        INSERT INTO participants (team_id, player_role, name, college, phone, roll_number, id_card_filename)
        VALUES (?, 'PLAYER_2_SHOOT', 'Sam (Shoot)', ?, '9876543211', 'ROLL-002', 'auto_id2.png')
    """, (team_id, college))
    p2_id = cursor.lastrowid

    # Insert Access Credential
    cursor.execute("""
        INSERT INTO access_credentials (team_id, credential_hash, access_code)
        VALUES (?, ?, ?)
    """, (team_id, access_hash, access_code))

    # Log queue event
    cursor.execute("""
        INSERT INTO queue_events (team_id, event_type, details, triggered_by)
        VALUES (?, 'REGISTERED', 'Auto-created demo team user for immediate gameplay', 'AUTO_SYSTEM')
    """, (team_id,))

    conn.commit()
    conn.close()

    print("==================================================")
    print("      NEW AUTO USER ID & ACCESS CODE CREATED      ")
    print("==================================================")
    print(f"Official Team / User ID : {team_code}")
    print(f"Secret Game Access Code : {access_code}")
    print(f"Team Name               : {team_name}")
    print(f"Status                  : WAITING (Ready to play)")
    print(f"Queue Number            : #{next_q}")
    print("==================================================")

    return team_code, access_code

if __name__ == "__main__":
    create_auto_team()
