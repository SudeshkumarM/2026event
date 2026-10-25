import os
import uuid
import json
import time
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify, Response, current_app
import psycopg
from werkzeug.security import check_password_hash, generate_password_hash
import jwt
from app.utils.sqlite_db import get_db_connection, UPLOAD_FOLDER
from app.services.queue_manager import QueueManager
from app.services.anti_cheat import AntiCheatEngine

api_bp = Blueprint('api', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

# In-memory rate limiter for password attempts: {ip: [timestamps]}
rate_limits = {}

def is_rate_limited(ip, max_attempts=5, window_seconds=60):
    now = time.time()
    attempts = [t for t in rate_limits.get(ip, []) if now - t < window_seconds]
    rate_limits[ip] = attempts
    if len(attempts) >= max_attempts:
        return True
    attempts.append(now)
    rate_limits[ip] = attempts
    return False

# In-memory SSE subscribers
sse_subscribers = []

def notify_clients(event_type, data):
    """Notify all connected SSE clients of a state change"""
    payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    for queue in list(sse_subscribers):
        try:
            queue.append(payload)
        except Exception:
            if queue in sse_subscribers:
                sse_subscribers.remove(queue)

def verify_image_bytes(raw_bytes):
    """Verify raw file bytes match valid image magic signatures (JPEG, PNG, WEBP)"""
    if len(raw_bytes) < 12:
        return False, "File is too small to be a valid image."
    # JPEG magic: \xff\xd8\xff
    if raw_bytes[:3] == b'\xff\xd8\xff':
        return True, 'jpg'
    # PNG magic: \x89PNG\r\n\x1a\n
    if raw_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return True, 'png'
    # WEBP magic: RIFF....WEBP
    if raw_bytes[:4] == b'RIFF' and raw_bytes[8:12] == b'WEBP':
        return True, 'webp'
    return False, "File format not supported. Only JPEG, PNG, and WebP images are allowed."

def generate_access_code():
    """Generate cryptographically secure 8-character access code: ATS-XXXX-XXXX"""
    charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # Omits 0, 1, O, I for clarity
    p1 = ''.join(secrets.choice(charset) for _ in range(4))
    p2 = ''.join(secrets.choice(charset) for _ in range(4))
    return f"ATS-{p1}-{p2}"

def hash_access_code(code):
    """Cryptographic SHA-256 hash of access code for storage"""
    normalized = code.strip().upper()
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


# -------------------------------------------------------------
# 0. EVENT PASSWORD GATE
# -------------------------------------------------------------
@api_bp.route('/event-auth/status', methods=['GET'])
def get_event_auth_status():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT event_name, event_password_enabled, registration_open, event_active, 
               game_duration, difficulty, difficulty_mode, operating_mode
        FROM system_config WHERE id = 1;
    """)
    cfg = cursor.fetchone()
    conn.close()

    if not cfg:
        return jsonify({"success": False, "error": "System configuration not found."}), 500

    return jsonify({
        "success": True,
        "event_name": cfg['event_name'],
        "password_required": bool(cfg['event_password_enabled']),
        "registration_open": bool(cfg['registration_open']),
        "event_active": bool(cfg['event_active']),
        "game_duration": cfg['game_duration'],
        "difficulty": cfg['difficulty'],
        "difficulty_mode": cfg['difficulty_mode'],
        "operating_mode": cfg['operating_mode']
    })

@api_bp.route('/event-auth/verify', methods=['POST'])
def verify_event_password():
    client_ip = request.remote_addr or 'unknown'
    if is_rate_limited(client_ip, max_attempts=5, window_seconds=60):
        return jsonify({"success": False, "error": "Too many failed attempts. Please wait 1 minute."}), 429

    data = request.get_json(silent=True) or {}
    password = data.get('password', '').strip()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT event_password_hash, event_password_enabled FROM system_config WHERE id = 1;")
    row = cursor.fetchone()
    conn.close()

    if not row or not row['event_password_enabled']:
        # If no password enabled, grant immediate event pass
        token = jwt.encode({"scope": "event_access", "exp": datetime.now(timezone.utc) + timedelta(hours=12)},
                           current_app.config['JWT_EVENT_SECRET'], algorithm="HS256")
        return jsonify({"success": True, "token": token})

    cfg = dict(row)
    valid = False
    if cfg.get('event_password_hash') and check_password_hash(cfg['event_password_hash'], password):
        valid = True
    elif (
        current_app.config['REGISTRATION_GATE_PASSWORD']
        and password == current_app.config['REGISTRATION_GATE_PASSWORD']
    ):
        valid = True

    if not valid:
        return jsonify({"success": False, "error": "Invalid registration access password. Please try again."}), 401

    token = jwt.encode({"scope": "registration_access", "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
                       current_app.config['JWT_EVENT_SECRET'], algorithm="HS256")
    return jsonify({"success": True, "token": token})


# -------------------------------------------------------------
# 1. PUBLIC TEAM REGISTRATION
# -------------------------------------------------------------
@api_bp.route('/register', methods=['POST'])
def register_team():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Event Active & Registration Check
    cursor.execute("SELECT registration_open, event_active, event_password_enabled FROM system_config WHERE id = 1;")
    cfg = cursor.fetchone()
    if cfg and (not cfg['registration_open'] or not cfg['event_active']):
        conn.close()
        return jsonify({"success": False, "error": "Team registration is currently closed by event organizers."}), 403

    # Event password gate token enforcement
    if cfg and cfg['event_password_enabled']:
        token_str = (
            request.headers.get('X-Event-Pass', '').strip()
            or request.headers.get('Authorization', '').strip()
        )
        token = token_str.replace('Bearer ', '').strip()
        if not token:
            conn.close()
            return jsonify({"success": False, "error": "Event access authentication required. Please unlock the gate."}), 401
        try:
            secret = current_app.config.get('JWT_EVENT_SECRET') or current_app.config.get('SECRET_KEY')
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            if payload.get('scope') not in ('event_access', 'registration_access'):
                conn.close()
                return jsonify({"success": False, "error": "Invalid gate access token scope."}), 403
        except Exception:
            conn.close()
            return jsonify({"success": False, "error": "Invalid or expired event access token."}), 401

    # Extract inputs (Form-Data or JSON)
    p1_file_bytes = None
    p2_file_bytes = None
    p1_data_url = None
    p2_data_url = None
    p1_mime = 'image/jpeg'
    p2_mime = 'image/jpeg'

    if request.content_type and 'multipart/form-data' in request.content_type:
        team_name = request.form.get('team_name', '').strip()
        college_name = request.form.get('college_name', '').strip()

        p1_name = request.form.get('p1_name', '').strip()
        p1_college = request.form.get('p1_college', college_name).strip()
        p1_phone = request.form.get('p1_phone', '').strip()
        p1_roll = request.form.get('p1_roll', '').strip()

        p2_name = request.form.get('p2_name', '').strip()
        p2_college = request.form.get('p2_college', college_name).strip()
        p2_phone = request.form.get('p2_phone', '').strip()
        p2_roll = request.form.get('p2_roll', '').strip()

        p1_file = request.files.get('p1_id_card')
        p2_file = request.files.get('p2_id_card')
        if p1_file:
            p1_file_bytes = p1_file.read()
            p1_mime = p1_file.mimetype or 'image/jpeg'
        if p2_file:
            p2_file_bytes = p2_file.read()
            p2_mime = p2_file.mimetype or 'image/jpeg'

        # Also support base64 strings passed via form if camera capture was used
        raw_p1 = request.form.get('p1_id_card_data')
        raw_p2 = request.form.get('p2_id_card_data')
        if not p1_file_bytes and raw_p1:
            try:
                parts = raw_p1.split(',', 1) if ',' in raw_p1 else ('', raw_p1)
                header, encoded = parts
                p1_file_bytes = base64.b64decode(encoded)
                p1_data_url = raw_p1
                if 'image/png' in header: p1_mime = 'image/png'
                elif 'image/webp' in header: p1_mime = 'image/webp'
            except Exception:
                p1_file_bytes = None

        if not p2_file_bytes and raw_p2:
            try:
                parts = raw_p2.split(',', 1) if ',' in raw_p2 else ('', raw_p2)
                header, encoded = parts
                p2_file_bytes = base64.b64decode(encoded)
                p2_data_url = raw_p2
                if 'image/png' in header: p2_mime = 'image/png'
                elif 'image/webp' in header: p2_mime = 'image/webp'
            except Exception:
                p2_file_bytes = None

    else:
        data = request.get_json(silent=True) or {}
        team_name = data.get('team_name', '').strip()
        college_name = data.get('college_name', '').strip()

        p1_name = data.get('p1_name', '').strip()
        p1_college = data.get('p1_college', college_name).strip()
        p1_phone = data.get('p1_phone', '').strip()
        p1_roll = data.get('p1_roll', '').strip()

        p2_name = data.get('p2_name', '').strip()
        p2_college = data.get('p2_college', college_name).strip()
        p2_phone = data.get('p2_phone', '').strip()
        p2_roll = data.get('p2_roll', '').strip()

        p1_data_url = data.get('p1_id_card_data') or data.get('p1_id_card')
        p2_data_url = data.get('p2_id_card_data') or data.get('p2_id_card')

        if p1_data_url and isinstance(p1_data_url, str):
            try:
                parts = p1_data_url.split(',', 1) if ',' in p1_data_url else ('', p1_data_url)
                header, encoded = parts
                p1_file_bytes = base64.b64decode(encoded)
                if 'image/png' in header: p1_mime = 'image/png'
                elif 'image/webp' in header: p1_mime = 'image/webp'
            except Exception:
                p1_file_bytes = None
                p1_data_url = None

        if p2_data_url and isinstance(p2_data_url, str):
            try:
                parts = p2_data_url.split(',', 1) if ',' in p2_data_url else ('', p2_data_url)
                header, encoded = parts
                p2_file_bytes = base64.b64decode(encoded)
                if 'image/png' in header: p2_mime = 'image/png'
                elif 'image/webp' in header: p2_mime = 'image/webp'
            except Exception:
                p2_file_bytes = None
                p2_data_url = None

    # Mandatory text validations (Roll number is optional)
    if not team_name:
        conn.close()
        return jsonify({"success": False, "error": "Team Name is required."}), 400

    if not all([p1_name, p1_college, p1_phone]):
        conn.close()
        return jsonify({"success": False, "error": "Player 1 (Aim) Name, College, and Mobile Number are required."}), 400

    if not all([p2_name, p2_college, p2_phone]):
        conn.close()
        return jsonify({"success": False, "error": "Player 2 (Shoot) Name, College, and Mobile Number are required."}), 400

    # Phone numbers normalization & validation (10 digits)
    clean_p1_phone = ''.join(filter(str.isdigit, p1_phone))
    clean_p2_phone = ''.join(filter(str.isdigit, p2_phone))
    if len(clean_p1_phone) > 10 and clean_p1_phone.startswith('91'):
        clean_p1_phone = clean_p1_phone[-10:]
    elif clean_p1_phone.startswith('0') and len(clean_p1_phone) > 10:
        clean_p1_phone = clean_p1_phone[-10:]

    if len(clean_p2_phone) > 10 and clean_p2_phone.startswith('91'):
        clean_p2_phone = clean_p2_phone[-10:]
    elif clean_p2_phone.startswith('0') and len(clean_p2_phone) > 10:
        clean_p2_phone = clean_p2_phone[-10:]

    if len(clean_p1_phone) != 10 or len(clean_p2_phone) != 10:
        conn.close()
        return jsonify({"success": False, "error": "Please provide valid 10-digit mobile numbers for both players."}), 400

    if clean_p1_phone == clean_p2_phone:
        conn.close()
        return jsonify({"success": False, "error": "Player 1 and Player 2 cannot share the same mobile number."}), 400

    # Duplicate check for phone or optional roll number
    dup_conditions = ["phone IN (?, ?)"]
    dup_params = [clean_p1_phone, clean_p2_phone]
    non_empty_rolls = [r for r in [p1_roll, p2_roll] if r]
    if non_empty_rolls:
        placeholders = ', '.join(['?'] * len(non_empty_rolls))
        dup_conditions.append(f"roll_number IN ({placeholders})")
        dup_params.extend(non_empty_rolls)

    cursor.execute(f"""
        SELECT COUNT(*) FROM participants 
        WHERE {' OR '.join(dup_conditions)}
    """, dup_params)
    if cursor.fetchone()[0] > 0:
        conn.close()
        return jsonify({"success": False, "error": "One or both players have already registered for this event."}), 409

    # Mandatory College ID Verification
    if not p1_file_bytes:
        conn.close()
        return jsonify({"success": False, "error": "Player 1 College ID card image/capture is mandatory."}), 400

    if not p2_file_bytes:
        conn.close()
        return jsonify({"success": False, "error": "Player 2 College ID card image/capture is mandatory."}), 400

    # File size limits (5MB max)
    if len(p1_file_bytes) > MAX_FILE_SIZE or len(p2_file_bytes) > MAX_FILE_SIZE:
        conn.close()
        return jsonify({"success": False, "error": "ID card image exceeds 5MB size limit."}), 400

    # Magic byte verification (JPEG, PNG, WEBP)
    p1_valid, p1_ext_or_err = verify_image_bytes(p1_file_bytes)
    if not p1_valid:
        conn.close()
        return jsonify({"success": False, "error": f"Player 1 ID card error: {p1_ext_or_err}"}), 400

    p2_valid, p2_ext_or_err = verify_image_bytes(p2_file_bytes)
    if not p2_valid:
        conn.close()
        return jsonify({"success": False, "error": f"Player 2 ID card error: {p2_ext_or_err}"}), 400

    # Save to private upload folder
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    p1_storage_key = f"id_p1_{uuid.uuid4().hex}.{p1_ext_or_err}"
    p2_storage_key = f"id_p2_{uuid.uuid4().hex}.{p2_ext_or_err}"
    p1_path = os.path.join(UPLOAD_FOLDER, p1_storage_key)
    p2_path = os.path.join(UPLOAD_FOLDER, p2_storage_key)

    with open(p1_path, 'wb') as f:
        f.write(p1_file_bytes)

    with open(p2_path, 'wb') as f:
        f.write(p2_file_bytes)

    # Cryptographically Secure Game Access Code (e.g. ATS-K7M9-P2QX)
    raw_access_code = generate_access_code()
    access_code_hash = hash_access_code(raw_access_code)

    # Concurrency-safe Team Insertion with Retry on queue_number conflict
    max_retries = 5
    team_code = None
    next_queue_num = None

    for attempt in range(max_retries):
        try:
            cursor.execute("SELECT COALESCE(MAX(queue_number), 0) + 1 FROM teams;")
            next_queue_num = cursor.fetchone()[0]
            team_code = f"ATS-{next_queue_num:04d}"

            # Insert Team
            cursor.execute("""
                INSERT INTO teams (team_code, team_name, college_name, queue_number, status)
                VALUES (?, ?, ?, ?, 'WAITING')
                RETURNING id
            """, (team_code, team_name, college_name or p1_college, next_queue_num))
            team_id = cursor.fetchone()["id"]

            # Insert Player 1 (Aim) — store image data URL and blob for DB-backed verification
            cursor.execute("""
                INSERT INTO participants (team_id, player_role, name, college, phone, roll_number, id_card_filename, id_card_blob, id_card_data, id_card_mime)
                VALUES (?, 'PLAYER_1_AIM', ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            """, (team_id, p1_name, p1_college, clean_p1_phone, p1_roll, p1_storage_key,
                  p1_file_bytes, p1_data_url, p1_mime))
            p1_id = cursor.fetchone()["id"]

            # Insert Player 2 (Shoot) — store image data URL and blob for DB-backed verification
            cursor.execute("""
                INSERT INTO participants (team_id, player_role, name, college, phone, roll_number, id_card_filename, id_card_blob, id_card_data, id_card_mime)
                VALUES (?, 'PLAYER_2_SHOOT', ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            """, (team_id, p2_name, p2_college, clean_p2_phone, p2_roll, p2_storage_key,
                  p2_file_bytes, p2_data_url, p2_mime))
            p2_id = cursor.fetchone()["id"]

            # Insert Private Documents Metadata (with image blob for DB-backed retrieval)
            cursor.execute("""
                INSERT INTO private_documents (participant_id, private_storage_key, verification_status, image_blob, image_data, mime_type)
                VALUES (?, ?, 'PENDING', ?, ?, ?), (?, ?, 'PENDING', ?, ?, ?)
            """, (p1_id, p1_storage_key, p1_file_bytes, p1_data_url, p1_mime,
                  p2_id, p2_storage_key, p2_file_bytes, p2_data_url, p2_mime))

            # Insert Hashed Access Credential
            cursor.execute("""
                INSERT INTO access_credentials (team_id, credential_hash)
                VALUES (?, ?)
            """, (team_id, access_code_hash))

            # Log queue event
            cursor.execute("""
                INSERT INTO queue_events (team_id, event_type, details, triggered_by)
                VALUES (?, 'REGISTERED', 'Team registered successfully with camera/file ID verification', 'PUBLIC_PORTAL')
            """, (team_id,))

            conn.commit()
            break

        except (sqlite3.IntegrityError, psycopg.IntegrityError):
            conn.rollback()
            if attempt == max_retries - 1:
                if os.path.exists(p1_path): os.remove(p1_path)
                if os.path.exists(p2_path): os.remove(p2_path)
                conn.close()
                return jsonify({"success": False, "error": "System was busy allocating queue slots. Please try again."}), 500
            time.sleep(0.04 * (attempt + 1))
        except Exception as ex:
            conn.rollback()
            if os.path.exists(p1_path): os.remove(p1_path)
            if os.path.exists(p2_path): os.remove(p2_path)
            conn.close()
            return jsonify({"success": False, "error": f"Registration failed: {str(ex)}"}), 500

    # Emit real-time queue update
    public_queue = QueueManager.get_public_queue(conn)
    notify_clients('QUEUE_UPDATE', public_queue)
    conn.close()

    return jsonify({
        "success": True,
        "message": "Team registration confirmed!",
        "team_code": team_code,
        "access_code": raw_access_code,  # Displayed once to user!
        "queue_number": next_queue_num,
        "team_name": team_name,
        "college_name": college_name or p1_college,
        "status": "WAITING"
    }), 201
# -------------------------------------------------------------
# 2. GAME ACCESS & VERIFICATION HANDSHAKE
# -------------------------------------------------------------
@api_bp.route('/game-access/verify', methods=['POST'])
def verify_game_access():
    data = request.get_json(silent=True) or {}
    team_code = data.get('team_code', '').strip().upper()
    access_code = data.get('access_code', '').strip().upper()
    requested_difficulty = data.get('difficulty', '').strip().upper()

    if not access_code:
        return jsonify({"success": False, "error": "Game Access Code is required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    code_hash = hash_access_code(access_code)

    # 1. Lookup team: by access code directly or combined with team_code if provided
    if not team_code:
        cursor.execute("""
            SELECT t.id, t.team_code, t.team_name, t.status, t.college_name, c.revoked_at
            FROM access_credentials c
            JOIN teams t ON c.team_id = t.id
            WHERE c.credential_hash = ?
            ORDER BY c.issued_at DESC LIMIT 1
        """, (code_hash,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({"success": False, "error": "Invalid access code. Please check your code and try again."}), 401
        if row['revoked_at']:
            conn.close()
            return jsonify({"success": False, "error": "This game access code has been revoked by administrators."}), 403
        team = row
    else:
        cursor.execute("""
            SELECT id, team_code, team_name, status, college_name
            FROM teams WHERE team_code = ?
        """, (team_code,))
        team = cursor.fetchone()

        if not team:
            conn.close()
            return jsonify({"success": False, "error": "Team ID not found. Please check and re-enter."}), 404

        cursor.execute("""
            SELECT id, revoked_at FROM access_credentials
            WHERE team_id = ? AND credential_hash = ?
        """, (team['id'], code_hash))
        cred = cursor.fetchone()

        if not cred:
            conn.close()
            return jsonify({"success": False, "error": "Invalid access code. Please check your code and try again."}), 401

        if cred['revoked_at']:
            conn.close()
            return jsonify({"success": False, "error": "This game access code has been revoked by administrators."}), 403

    # 2. Check team eligibility
    if team['status'] == 'COMPLETED':
        conn.close()
        return jsonify({"success": False, "error": "This team has already completed its official competition attempt."}), 403

    if team['status'] == 'CANCELLED':
        conn.close()
        return jsonify({"success": False, "error": "This team's registration was cancelled by event administrators."}), 403

    # 4. Check system configuration
    cursor.execute("SELECT * FROM system_config WHERE id = 1;")
    config = dict(cursor.fetchone())

    if not config.get('event_active'):
        conn.close()
        return jsonify({"success": False, "error": "Competition event is currently paused or closed."}), 403

    # Check for existing active session
    cursor.execute("""
        SELECT id, session_token, status, started_at, scheduled_end_at, difficulty, total_score, total_hits, total_misses
        FROM game_sessions 
        WHERE team_id = ? AND status IN ('INITIATED', 'COUNTDOWN', 'PLAYING')
        ORDER BY created_at DESC LIMIT 1
    """, (team['id'],))
    existing_session = cursor.fetchone()

    # Determine difficulty level
    diff_mode = config.get('difficulty_mode', 'EVENT_LOCKED')
    if diff_mode == 'TEAM_SELECTS' and requested_difficulty in ['EASY', 'MEDIUM', 'HARD']:
        selected_difficulty = requested_difficulty
    else:
        selected_difficulty = config.get('difficulty', 'MEDIUM')

    duration_seconds = config.get('game_duration', 420)

    now = datetime.now(timezone.utc)

    if existing_session:
        # Reconnection / Browser Refresh recovery
        sched_end = datetime.fromisoformat(existing_session['scheduled_end_at']) if existing_session['scheduled_end_at'] else (now + timedelta(seconds=duration_seconds))
        remaining = max(0, int((sched_end - now).total_seconds()))

        conn.close()
        return jsonify({
            "success": True,
            "session_id": existing_session['id'],
            "session_token": existing_session['session_token'],
            "session_status": existing_session['status'],
            "team_code": team['team_code'],
            "team_name": team['team_name'],
            "difficulty": existing_session['difficulty'],
            "duration_seconds": duration_seconds,
            "remaining_seconds": remaining if existing_session['scheduled_end_at'] else duration_seconds,
            "story_enabled": bool(config.get('story_enabled', 1)),
            "resumed": True,
            "current_score": existing_session['total_score'],
            "current_hits": existing_session['total_hits'],
            "current_misses": existing_session['total_misses']
        })

    # Create new authoritative game session
    session_id = str(uuid.uuid4())
    session_token = f"ATS-TKN-{uuid.uuid4().hex[:16].upper()}"
    cursor.execute("""
        INSERT INTO game_sessions (
            id, team_id, status, session_token, mode, difficulty,
            config_snapshot, started_at, scheduled_end_at
        ) VALUES (?, ?, 'INITIATED', ?, 'MODE_TIME', ?, ?, NULL, NULL)
    """, (
        session_id, team['id'], session_token, selected_difficulty, json.dumps(config)
    ))

    cursor.execute("""
        INSERT INTO queue_events (team_id, event_type, details, triggered_by)
        VALUES (?, 'GAME_AUTHORIZED', 'Game access code verified; session is awaiting player start.', 'GAME_ACCESS_PORTAL')
    """, (team['id'],))

    conn.commit()

    # Emit real-time queue update
    public_queue = QueueManager.get_public_queue(conn)
    notify_clients('QUEUE_UPDATE', public_queue)
    conn.close()

    return jsonify({
        "success": True,
        "session_id": session_id,
        "session_token": session_token,
        "session_status": "INITIATED",
        "team_code": team['team_code'],
        "team_name": team['team_name'],
        "difficulty": selected_difficulty,
        "duration_seconds": duration_seconds,
        "remaining_seconds": duration_seconds,
        "story_enabled": bool(config.get('story_enabled', 1)),
        "resumed": False
    })


@api_bp.route('/game/session/start', methods=['POST'])
def start_game_session():
    data = request.get_json(silent=True) or {}
    session_token = data.get('session_token')
    if not session_token:
        return jsonify({"success": False, "error": "Session token required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, team_id, status, config_snapshot, scheduled_end_at
        FROM game_sessions
        WHERE session_token = ?
    """, (session_token,))
    session = cursor.fetchone()

    if not session:
        conn.close()
        return jsonify({"success": False, "error": "Game session not found."}), 404

    try:
        config = json.loads(session['config_snapshot'])
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"success": False, "error": "Game session configuration is invalid."}), 500

    try:
        duration_seconds = int(config.get('game_duration', 420))
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"success": False, "error": "Game duration configuration is invalid."}), 500
    if duration_seconds <= 0:
        conn.close()
        return jsonify({"success": False, "error": "Game duration must be greater than zero."}), 500

    if session['status'] in ('INITIATED', 'COUNTDOWN'):
        now = datetime.now(timezone.utc)
        scheduled_end = now + timedelta(seconds=duration_seconds)
        cursor.execute("""
            UPDATE game_sessions
            SET status = 'PLAYING', started_at = ?, scheduled_end_at = ?
            WHERE id = ? AND status IN ('INITIATED', 'COUNTDOWN')
        """, (now.isoformat(), scheduled_end.isoformat(), session['id']))
        cursor.execute("""
            UPDATE teams
            SET status = 'PLAYING', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (session['team_id'],))
        cursor.execute("""
            INSERT INTO queue_events (team_id, event_type, details, triggered_by)
            VALUES (?, 'GAME_STARTED', 'Official game timer started.', 'GAME_STATION')
        """, (session['team_id'],))
        conn.commit()
        public_queue = QueueManager.get_public_queue(conn)
        notify_clients('QUEUE_UPDATE', public_queue)
        remaining_seconds = duration_seconds
    elif session['status'] == 'PLAYING':
        try:
            scheduled_end = datetime.fromisoformat(session['scheduled_end_at'])
            remaining_seconds = max(
                0,
                int((scheduled_end - datetime.now(timezone.utc)).total_seconds())
            )
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"success": False, "error": "Game session end time is invalid."}), 500
    else:
        conn.close()
        return jsonify({"success": False, "error": "This game session can no longer be started."}), 409

    conn.close()
    return jsonify({
        "success": True,
        "status": "PLAYING",
        "duration_seconds": duration_seconds,
        "remaining_seconds": remaining_seconds
    })


# -------------------------------------------------------------
# 3. GAME SESSION STATUS & RECOVERY (Browser Refresh Guard)
# -------------------------------------------------------------
@api_bp.route('/game/session/status', methods=['GET'])
def get_game_session_status():
    token = request.args.get('session_token')
    if not token:
        return jsonify({"success": False, "error": "Session token required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.*, t.team_code, t.team_name, t.college_name
        FROM game_sessions s
        JOIN teams t ON s.team_id = t.id
        WHERE s.session_token = ?
    """, (token,))
    sess = cursor.fetchone()
    conn.close()

    if not sess:
        return jsonify({"success": False, "error": "Active game session not found."}), 404

    try:
        config = json.loads(sess['config_snapshot'])
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Game session configuration is invalid."}), 500

    try:
        duration_seconds = int(config.get('game_duration', 420))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Game duration configuration is invalid."}), 500
    now = datetime.now(timezone.utc)
    remaining = duration_seconds if not sess['scheduled_end_at'] else 0
    if sess['scheduled_end_at']:
        try:
            sched = datetime.fromisoformat(sess['scheduled_end_at'])
            remaining = max(0, int((sched - now).total_seconds()))
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Game session end time is invalid."}), 500

    return jsonify({
        "success": True,
        "session_id": sess['id'],
        "team_code": sess['team_code'],
        "team_name": sess['team_name'],
        "status": sess['status'],
        "difficulty": sess['difficulty'],
        "duration_seconds": duration_seconds,
        "remaining_seconds": remaining,
        "total_score": sess['total_score'],
        "total_hits": sess['total_hits'],
        "total_misses": sess['total_misses']
    })


# -------------------------------------------------------------
# 4. GAME SESSION SUBMISSION & SCORING
# -------------------------------------------------------------
@api_bp.route('/game/session/submit', methods=['POST'])
def submit_game_session():
    data = request.get_json(silent=True) or {}
    session_token = data.get('session_token')

    if not session_token:
        return jsonify({"success": False, "error": "Missing session token."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    # Find active session
    cursor.execute("""
        SELECT s.*, t.team_code, t.team_name, t.college_name, t.id as tid
        FROM game_sessions s
        JOIN teams t ON s.team_id = t.id
        WHERE s.session_token = ?
    """, (session_token,))
    session = cursor.fetchone()

    if not session:
        conn.close()
        return jsonify({"success": False, "error": "Invalid or expired game session."}), 404

    # Idempotent response: If already submitted, return recorded result without duplicate
    if session['status'] == 'COMPLETED':
        cursor.execute("SELECT * FROM game_results WHERE game_session_id = ?", (session['id'],))
        prev_result = cursor.fetchone()
        conn.close()
        return jsonify({
            "success": True,
            "message": "Game session was already submitted and verified.",
            "team_code": session['team_code'],
            "team_name": session['team_name'],
            "official_result": dict(prev_result) if prev_result else None
        })

    # Load config snapshot
    try:
        config = json.loads(session['config_snapshot'])
    except Exception:
        config = {}

    # Anti-Cheat Validation
    is_valid, validated_data, error_msg = AntiCheatEngine.validate_session_result(session, data, config)

    if not is_valid:
        cursor.execute("UPDATE game_sessions SET status = 'INVALIDATED' WHERE id = ?", (session['id'],))
        cursor.execute("""
            INSERT INTO queue_events (team_id, event_type, details, triggered_by)
            VALUES (?, 'SUBMISSION_REJECTED', ?, 'ANTI_CHEAT')
        """, (session['tid'], error_msg))
        conn.commit()
        conn.close()
        return jsonify({"success": False, "error": f"Submission rejected by server: {error_msg}"}), 422

    # Check competition mode
    is_official = 1 if config.get('competition_mode') != 'PRACTICE' else 0

    try:
        # Insert official result
        cursor.execute("""
            INSERT INTO game_results (
                game_session_id, team_id, difficulty, score, hits, misses, accuracy,
                best_combo, targets_destroyed, completion_time_ms, is_official
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session['id'], session['tid'], session['difficulty'], validated_data['score'],
            validated_data['hits'], validated_data['misses'], validated_data['accuracy'],
            validated_data['best_combo'], validated_data['targets_destroyed'],
            validated_data['duration_ms'], is_official
        ))

        # Update session
        cursor.execute("""
            UPDATE game_sessions 
            SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP, 
                duration_ms = ?, total_shots = ?, total_hits = ?, total_misses = ?, total_score = ?
            WHERE id = ?
        """, (
            validated_data['duration_ms'], validated_data['total_shots'],
            validated_data['hits'], validated_data['misses'], validated_data['score'],
            session['id']
        ))

        # Update team status to COMPLETED
        cursor.execute("""
            UPDATE teams SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        """, (session['tid'],))

        cursor.execute("""
            INSERT INTO queue_events (team_id, event_type, details, triggered_by)
            VALUES (?, 'GAME_COMPLETED', ?, 'GAME_STATION')
        """, (session['tid'], f"Score: {validated_data['score']}, Accuracy: {validated_data['accuracy']}%, Diff: {session['difficulty']}"))

        conn.commit()

        # Calculate rank among official attempts
        cursor.execute("""
            SELECT COUNT(*) + 1 as rank FROM game_results
            WHERE is_official = 1 AND (
                score > ? OR (score = ? AND accuracy > ?) OR (score = ? AND accuracy = ? AND hits > ?)
            )
        """, (validated_data['score'], validated_data['score'], validated_data['accuracy'],
              validated_data['score'], validated_data['accuracy'], validated_data['hits']))
        rank = cursor.fetchone()['rank']

        # Notify all connected clients via SSE
        public_queue = QueueManager.get_public_queue(conn)
        notify_clients('QUEUE_UPDATE', public_queue)
        notify_clients('LEADERBOARD_UPDATE', {
            "team_code": session['team_code'],
            "team_name": session['team_name'],
            "score": validated_data['score'],
            "rank": rank
        })

        conn.close()

        return jsonify({
            "success": True,
            "message": "Result successfully verified and recorded!",
            "team_code": session['team_code'],
            "team_name": session['team_name'],
            "rank": rank,
            "official_result": validated_data
        })

    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Failed to record result: {str(e)}"}), 500


# -------------------------------------------------------------
# 5. PUBLIC QUEUE STATUS (Projector Display)
# -------------------------------------------------------------
@api_bp.route('/queue/public', methods=['GET'])
def get_public_queue():
    conn = get_db_connection()
    queue_data = QueueManager.get_public_queue(conn)
    conn.close()
    return jsonify({"success": True, "data": queue_data})


# -------------------------------------------------------------
# 6. PUBLIC LEADERBOARD (Sanitized, Tie-Breaker Enforced)
# -------------------------------------------------------------
@api_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Joined query strictly avoiding private fields
    cursor.execute("""
        SELECT 
            t.team_code,
            t.team_name,
            t.college_name,
            r.difficulty,
            r.score,
            r.hits,
            r.misses,
            r.accuracy,
            r.best_combo,
            r.targets_destroyed,
            r.completion_time_ms,
            r.created_at
        FROM game_results r
        JOIN teams t ON r.team_id = t.id
        WHERE r.is_official = 1 AND t.is_test = 0
        ORDER BY r.score DESC, r.completion_time_ms ASC, r.accuracy DESC, r.hits DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    leaderboard = []
    for rank, row in enumerate(rows, start=1):
        leaderboard.append({
            "rank": rank,
            "team_code": row['team_code'],
            "team_name": row['team_name'],
            "college_name": row['college_name'] or "Verified Institution",
            "difficulty": row['difficulty'],
            "score": row['score'],
            "hits": row['hits'],
            "misses": row['misses'],
            "accuracy": row['accuracy'],
            "best_combo": row['best_combo'],
            "targets_destroyed": row['targets_destroyed'],
            "duration_seconds": round(row['completion_time_ms'] / 1000.0, 1),
            "timestamp": row['created_at']
        })

    return jsonify({"success": True, "count": len(leaderboard), "leaderboard": leaderboard})


# -------------------------------------------------------------
# 7. REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
# -------------------------------------------------------------
@api_bp.route('/events/stream', methods=['GET'])
def event_stream():
    def stream_generator():
        client_queue = []
        sse_subscribers.append(client_queue)

        try:
            conn = get_db_connection()
            initial_queue = QueueManager.get_public_queue(conn)
            conn.close()
            yield f"event: QUEUE_UPDATE\ndata: {json.dumps(initial_queue)}\n\n"
        except Exception:
            pass

        try:
            while True:
                if client_queue:
                    msg = client_queue.pop(0)
                    yield msg
                else:
                    time.sleep(4)
                    yield f"event: HEARTBEAT\ndata: {json.dumps({'time': int(time.time())})}\n\n"
        except GeneratorExit:
            if client_queue in sse_subscribers:
                sse_subscribers.remove(client_queue)

    return Response(stream_generator(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    })
