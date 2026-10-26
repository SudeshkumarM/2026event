import os
import io
import csv
import json
import secrets
import hashlib
from datetime import datetime, timezone
from functools import wraps
from flask import Blueprint, request, jsonify, send_file, Response, current_app
from werkzeug.security import check_password_hash, generate_password_hash
import jwt
from app.utils.sqlite_db import get_db_connection, UPLOAD_FOLDER
from app.services.queue_manager import QueueManager
from app.routes.api_routes import notify_clients, generate_access_code, hash_access_code

admin_bp = Blueprint('admin', __name__)

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        elif request.args.get('token'):
            token = request.args.get('token')

        if not token:
            return jsonify({"success": False, "error": "Admin authentication token required."}), 401

        try:
            payload = jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        except jwt.InvalidTokenError:
            return jsonify({"success": False, "error": "Invalid or expired admin session token."}), 401

        if payload.get('role') not in ('ADMIN', 'OPERATOR', 'VIEWER'):
            return jsonify({"success": False, "error": "Invalid or expired admin session token."}), 401

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT username, role, auth_version FROM admin_users WHERE id = ?",
                (payload.get('user_id'),),
            )
            admin = cursor.fetchone()
        finally:
            conn.close()

        if (
            not admin
            or admin['role'] != payload.get('role')
            or admin['auth_version'] != payload.get('auth_version', 0)
        ):
            return jsonify({"success": False, "error": "Admin session expired. Please sign in again."}), 401

        request.admin_user = payload
        return f(*args, **kwargs)
    return decorated


def admin_only(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.admin_user.get('role') != 'ADMIN':
            return jsonify({"success": False, "error": "Administrator access is required."}), 403
        return f(*args, **kwargs)
    return decorated

def log_audit(actor, action, entity_type, entity_id=None, metadata=None):
    """Record an audit trail event for administrative accountability"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, (actor, action, entity_type, str(entity_id) if entity_id else None,
              json.dumps(metadata) if isinstance(metadata, dict) else str(metadata or '')))
        conn.commit()
    finally:
        conn.close()


# -------------------------------------------------------------
# 1. ADMIN AUTHENTICATION
# -------------------------------------------------------------
@admin_bp.route('/login', methods=['POST'])
def admin_login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "error": "Username and password are required."}), 400
    username = data.get('username', '')
    password = data.get('password', '')
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"success": False, "error": "Username and password are required."}), 400
    username = username.strip()

    if not username or not password:
        return jsonify({"success": False, "error": "Username and password required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM admin_users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if not user or not check_password_hash(user['password_hash'], password):
        log_audit(username, 'ADMIN_LOGIN_FAILED', 'AUTH', metadata={"ip": request.remote_addr})
        return jsonify({"success": False, "error": "Invalid username or password."}), 401

    token = jwt.encode({
        "user_id": user['id'],
        "username": user['username'],
        "role": user['role'],
        "auth_version": user['auth_version'],
        "exp": datetime.now(timezone.utc).timestamp() + 8 * 60 * 60
    }, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')

    log_audit(user['username'], 'ADMIN_LOGIN_SUCCESS', 'AUTH')

    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "username": user['username'],
            "role": user['role']
        }
    })


@admin_bp.route('/change-password', methods=['POST'])
@admin_required
@admin_only
def change_admin_password():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "error": "Invalid password change request."}), 400

    current_password = data.get('current_password')
    new_password = data.get('new_password')
    confirm_password = data.get('confirm_password')
    if not all(isinstance(value, str) for value in (current_password, new_password, confirm_password)):
        return jsonify({"success": False, "error": "Current password, new password, and confirmation are required."}), 400
    if len(new_password) < 12 or len(new_password) > 256:
        return jsonify({"success": False, "error": "New admin password must be between 12 and 256 characters."}), 400
    if new_password != confirm_password:
        return jsonify({"success": False, "error": "New password and confirmation do not match."}), 400
    if current_password == new_password:
        return jsonify({"success": False, "error": "Choose a new password different from the current password."}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT password_hash FROM admin_users WHERE id = ?",
            (request.admin_user['user_id'],),
        )
        admin = cursor.fetchone()
        if not admin or not check_password_hash(admin['password_hash'], current_password):
            return jsonify({"success": False, "error": "Current admin password is incorrect."}), 401

        cursor.execute(
            """
            UPDATE admin_users
            SET password_hash = ?, auth_version = auth_version + 1
            WHERE id = ?
            """,
            (generate_password_hash(new_password, method='scrypt'), request.admin_user['user_id']),
        )
        conn.commit()
    finally:
        conn.close()

    log_audit(request.admin_user.get('username'), 'CHANGE_ADMIN_PASSWORD', 'ADMIN',
              request.admin_user['user_id'])
    return jsonify({
        "success": True,
        "message": "Admin password changed. Sign in again with the new password.",
    })


# -------------------------------------------------------------
# 2. EVENT STATISTICS & DASHBOARD
# -------------------------------------------------------------
@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_admin_stats():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT status, COUNT(*) as count FROM teams GROUP BY status")
    status_counts = {row['status']: row['count'] for row in cursor.fetchall()}

    cursor.execute("""
        SELECT 
            COALESCE(MAX(score), 0) as max_score,
            COALESCE(AVG(score), 0) as avg_score,
            COALESCE(AVG(accuracy), 0) as avg_accuracy,
            COUNT(*) as completed_count
        FROM game_results
        WHERE is_official = 1
    """)
    score_stats = cursor.fetchone()

    cursor.execute("SELECT team_code, team_name FROM teams WHERE status = 'PLAYING' LIMIT 1")
    playing = cursor.fetchone()

    cursor.execute("SELECT * FROM system_config WHERE id = 1")
    cfg = dict(cursor.fetchone())

    conn.close()

    return jsonify({
        "success": True,
        "stats": {
            "total_teams": sum(status_counts.values()),
            "waiting": status_counts.get("WAITING", 0),
            "called": status_counts.get("CALLED", 0),
            "present": status_counts.get("PRESENT", 0),
            "playing": status_counts.get("PLAYING", 0),
            "completed": status_counts.get("COMPLETED", 0),
            "skipped": status_counts.get("SKIPPED", 0),
            "highest_score": score_stats['max_score'],
            "average_score": round(score_stats['avg_score'], 1),
            "average_accuracy": round(score_stats['avg_accuracy'], 1),
            "currently_playing": dict(playing) if playing else None,
            "event_active": bool(cfg.get('event_active')),
            "registration_open": bool(cfg.get('registration_open')),
            "difficulty": cfg.get('difficulty'),
            "game_duration": cfg.get('game_duration')
        }
    })


@admin_bp.route('/teams/<int:team_id>/revoke-access-code', methods=['POST'])
@admin_required
@admin_only
def revoke_team_access_code(team_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT team_code FROM teams WHERE id = ?", (team_id,))
    team = cursor.fetchone()
    if not team:
        conn.close()
        return jsonify({"success": False, "error": "Team not found."}), 404

    cursor.execute(
        """
        UPDATE access_credentials
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE team_id = ? AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        """,
        (team_id,),
    )
    revoked_count = cursor.rowcount
    if revoked_count:
        conn.commit()
    conn.close()
    if not revoked_count:
        return jsonify({"success": False, "error": "This team has no active game access code."}), 409

    log_audit(request.admin_user.get('username'), 'REVOKE_ACCESS_CODE', 'TEAM', team_id,
              {"team_code": team['team_code']})
    return jsonify({"success": True, "message": f"Game access code revoked for {team['team_code']}."})


# -------------------------------------------------------------
# 3. QUEUE CONTROLS
# -------------------------------------------------------------
@admin_bp.route('/queue/call', methods=['POST'])
@admin_required
def call_team():
    data = request.get_json() or {}
    team_id = data.get('team_id')
    timeout_sec = data.get('timeout_seconds', 30)

    if not team_id:
        return jsonify({"success": False, "error": "team_id required."}), 400

    conn = get_db_connection()
    QueueManager.call_team(conn, team_id, timeout_seconds=timeout_sec)
    
    public_queue = QueueManager.get_public_queue(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT team_code, team_name FROM teams WHERE id = ?", (team_id,))
    t = cursor.fetchone()
    conn.close()

    log_audit(request.admin_user.get('username'), 'CALL_TEAM', 'TEAM', team_id, {"team_code": t['team_code'] if t else ""})

    notify_clients('CALL_TEAM', {
        "team_code": t['team_code'] if t else "",
        "team_name": t['team_name'] if t else "",
        "timeout": timeout_sec
    })
    notify_clients('QUEUE_UPDATE', public_queue)

    return jsonify({"success": True, "message": f"Team {t['team_code'] if t else team_id} has been called!"})


@admin_bp.route('/queue/skip', methods=['POST'])
@admin_required
def skip_team():
    data = request.get_json() or {}
    team_id = data.get('team_id')
    reason = data.get('reason', 'Operator marked as absent')

    if not team_id:
        return jsonify({"success": False, "error": "team_id required."}), 400

    conn = get_db_connection()
    QueueManager.skip_team(conn, team_id, reason=reason)
    public_queue = QueueManager.get_public_queue(conn)
    conn.close()

    log_audit(request.admin_user.get('username'), 'SKIP_TEAM', 'TEAM', team_id, {"reason": reason})
    notify_clients('QUEUE_UPDATE', public_queue)
    return jsonify({"success": True, "message": "Team has been marked as skipped."})


@admin_bp.route('/queue/restore', methods=['POST'])
@admin_required
def restore_team():
    data = request.get_json() or {}
    team_id = data.get('team_id')

    if not team_id:
        return jsonify({"success": False, "error": "team_id required."}), 400

    conn = get_db_connection()
    QueueManager.restore_team(conn, team_id)
    public_queue = QueueManager.get_public_queue(conn)
    conn.close()

    log_audit(request.admin_user.get('username'), 'RESTORE_TEAM', 'TEAM', team_id)
    notify_clients('QUEUE_UPDATE', public_queue)
    return jsonify({"success": True, "message": "Team restored back to waiting queue."})


@admin_bp.route('/queue/mark-present', methods=['POST'])
@admin_required
def mark_present():
    data = request.get_json() or {}
    team_id = data.get('team_id')

    if not team_id:
        return jsonify({"success": False, "error": "team_id required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE teams SET status = 'PRESENT', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (team_id,))
    cursor.execute("""
        INSERT INTO queue_events (team_id, event_type, details, triggered_by)
        VALUES (?, 'MARKED_PRESENT', 'Team confirmed at game station', 'ADMIN')
    """, (team_id,))
    conn.commit()

    public_queue = QueueManager.get_public_queue(conn)
    conn.close()

    log_audit(request.admin_user.get('username'), 'MARK_PRESENT', 'TEAM', team_id)
    notify_clients('QUEUE_UPDATE', public_queue)
    return jsonify({"success": True, "message": "Team marked as present at game station."})


# -------------------------------------------------------------
# 4. REGISTRATION MANAGEMENT
# -------------------------------------------------------------
@admin_bp.route('/teams', methods=['GET'])
@admin_required
def get_all_teams():
    conn = get_db_connection()
    cursor = conn.cursor()

    search = request.args.get('search', '').strip()
    status_filter = request.args.get('status', '').strip()

    query = """
        SELECT
            t.id, t.team_code, t.team_name, t.college_name, t.queue_number, t.status, t.created_at,
            r.score, r.accuracy, r.hits, r.misses, r.difficulty,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM access_credentials c
                    WHERE c.team_id = t.id AND c.revoked_at IS NULL
                      AND (c.expires_at IS NULL OR c.expires_at > CURRENT_TIMESTAMP)
                ) THEN 'ACTIVE'
                WHEN EXISTS (
                    SELECT 1 FROM access_credentials c
                    WHERE c.team_id = t.id AND c.revoked_at IS NULL
                      AND c.expires_at <= CURRENT_TIMESTAMP
                ) THEN 'EXPIRED'
                WHEN EXISTS (SELECT 1 FROM access_credentials c WHERE c.team_id = t.id)
                    THEN 'REVOKED'
                ELSE 'NOT_ISSUED'
            END AS access_code_status,
            (SELECT c.access_code FROM access_credentials c WHERE c.team_id = t.id AND c.revoked_at IS NULL ORDER BY c.issued_at DESC LIMIT 1)
                AS access_code,
            (SELECT MAX(c.issued_at) FROM access_credentials c WHERE c.team_id = t.id)
                AS access_code_issued_at
        FROM teams t
        LEFT JOIN game_results r ON t.id = r.team_id
        WHERE 1=1
    """
    params = []

    if search:
        query += """
            AND (
                t.team_code LIKE ? OR t.team_name LIKE ? OR t.college_name LIKE ?
                OR EXISTS (
                    SELECT 1 FROM participants p
                    WHERE p.team_id = t.id
                      AND (p.name LIKE ? OR p.phone LIKE ? OR p.roll_number LIKE ?)
                )
            )
        """
        params.extend([f"%{search}%"] * 6)

    if status_filter:
        query += " AND t.status = ?"
        params.append(status_filter)

    query += " ORDER BY t.queue_number ASC"
    cursor.execute(query, params)
    teams_data = [dict(r) for r in cursor.fetchall()]

    # Fetch participants for each team
    for t in teams_data:
        cursor.execute("""
            SELECT id, player_role, name, college, phone, roll_number,
                   id_card_filename, created_at
            FROM participants WHERE team_id = ?
            ORDER BY player_role ASC
        """, (t['id'],))
        t['participants'] = [dict(p) for p in cursor.fetchall()]

    conn.close()
    return jsonify({"success": True, "teams": teams_data})


@admin_bp.route('/teams/<int:team_id>', methods=['DELETE'])
@admin_required
def delete_team(team_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT team_code FROM teams WHERE id = ?", (team_id,))
    team = cursor.fetchone()
    if not team:
        conn.close()
        return jsonify({"success": False, "error": "Team not found."}), 404

    cursor.execute("DELETE FROM teams WHERE id = ?", (team_id,))
    conn.commit()

    public_queue = QueueManager.get_public_queue(conn)
    conn.close()

    log_audit(request.admin_user.get('username'), 'DELETE_TEAM', 'TEAM', team_id, {"team_code": team['team_code']})
    notify_clients('QUEUE_UPDATE', public_queue)

    return jsonify({"success": True, "message": f"Team {team['team_code']} deleted successfully."})


@admin_bp.route('/teams/<int:team_id>/reset-access-code', methods=['POST'])
@admin_required
@admin_only
def reset_team_access_code(team_id):
    """Generate a new secure game access code if a team lost theirs"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT team_code FROM teams WHERE id = ?", (team_id,))
    team = cursor.fetchone()
    if not team:
        conn.close()
        return jsonify({"success": False, "error": "Team not found."}), 404

    # Revoke old credentials
    cursor.execute("UPDATE access_credentials SET revoked_at = CURRENT_TIMESTAMP WHERE team_id = ?", (team_id,))

    # Generate new access code
    new_code = generate_access_code(conn)
    new_hash = hash_access_code(new_code)

    cursor.execute("""
        INSERT INTO access_credentials (team_id, credential_hash, access_code)
        VALUES (?, ?, ?)
    """, (team_id, new_hash, new_code))

    conn.commit()
    conn.close()

    log_audit(request.admin_user.get('username'), 'RESET_ACCESS_CODE', 'TEAM', team_id, {"team_code": team['team_code']})

    return jsonify({
        "success": True,
        "message": f"New access code generated for {team['team_code']}.",
        "team_code": team['team_code'],
        "new_access_code": new_code
    })


# -------------------------------------------------------------
# 5. SECURE ID CARD ACCESS & PURGE VAULT
# -------------------------------------------------------------
@admin_bp.route('/id-card/<filename>', methods=['GET'])
@admin_required
def view_id_card(filename):
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if os.path.exists(filepath):
        return send_file(filepath)

    # Fallback: serve from DB blob (for camera-captured images)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id_card_blob, id_card_data, id_card_mime
        FROM participants WHERE id_card_filename = ? LIMIT 1
    """, (safe_filename,))
    row = cursor.fetchone()
    conn.close()

    if row:
        blob = row['id_card_blob']
        data_url = row['id_card_data']
        mime = row['id_card_mime'] or 'image/jpeg'
        if blob:
            from flask import Response
            return Response(blob, mimetype=mime)
        if data_url and ',' in data_url:
            import base64
            _, encoded = data_url.split(',', 1)
            img_bytes = base64.b64decode(encoded)
            from flask import Response
            return Response(img_bytes, mimetype=mime)

    return jsonify({"success": False, "error": "ID card file not found."}), 404


@admin_bp.route('/id-card/purge-all', methods=['POST'])
@admin_required
def purge_all_id_cards():
    """Event privacy compliance: Permanently wipe all uploaded ID card images."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id_card_filename FROM participants WHERE id_card_filename IS NOT NULL")
    rows = cursor.fetchall()

    deleted_count = 0
    for r in rows:
        fn = r['id_card_filename']
        fp = os.path.join(UPLOAD_FOLDER, fn)
        if os.path.exists(fp):
            try:
                os.remove(fp)
                deleted_count += 1
            except Exception:
                pass

    cursor.execute("UPDATE participants SET id_card_filename = NULL")
    conn.commit()
    conn.close()

    log_audit(request.admin_user.get('username'), 'PURGE_ALL_ID_CARDS', 'SYSTEM', metadata={"count": deleted_count})

    return jsonify({
        "success": True,
        "message": f"Privacy compliance purge complete. {deleted_count} ID card scans permanently wiped."
    })


# -------------------------------------------------------------
# 6. CONFIGURATION MANAGEMENT
# -------------------------------------------------------------
@admin_bp.route('/config', methods=['GET', 'PUT'])
@admin_required
def manage_config():
    conn = get_db_connection()
    cursor = conn.cursor()

    if request.method == 'GET':
        cursor.execute("SELECT * FROM system_config WHERE id = 1")
        cfg = dict(cursor.fetchone())
        cfg['event_password_configured'] = bool(cfg.get('event_password_hash'))
        cfg.pop('event_password_hash', None)
        cfg.pop('event_password_version', None)
        if cfg.get('target_configs_json'):
            try:
                cfg['target_configs'] = json.loads(cfg['target_configs_json'])
            except Exception:
                cfg['target_configs'] = None
        else:
            cfg['target_configs'] = None
        conn.close()
        return jsonify({"success": True, "config": cfg})

    # PUT update
    data = request.get_json() or {}
    if not isinstance(data, dict):
        conn.close()
        return jsonify({"success": False, "error": "Invalid configuration request."}), 400
    if request.admin_user.get('role') != 'ADMIN':
        conn.close()
        return jsonify({"success": False, "error": "Administrator access is required to change settings."}), 403

    fields = [
        'event_name', 'game_mode', 'target_count', 'game_duration',
        'base_target_speed', 'max_target_speed', 'min_target_size', 'max_target_size',
        'score_per_hit', 'combo_enabled', 'queue_timeout_seconds', 'competition_mode',
        'difficulty', 'difficulty_mode', 'operating_mode', 'story_enabled',
        'registration_open', 'event_active', 'tie_breaker_rule', 'event_password_enabled'
    ]
    updates = []
    values = []
    password_changed = False
    for f in fields:
        if f in data:
            if (
                f == 'event_password_enabled'
                and isinstance(data.get('event_password'), str)
                and data['event_password'].strip()
            ):
                continue
            if f == 'event_password_enabled' and data[f] not in (0, 1, False, True):
                conn.close()
                return jsonify({"success": False, "error": "Password gate setting must be enabled or disabled."}), 400
            updates.append(f"{f} = ?")
            values.append(int(data[f]) if f == 'event_password_enabled' else data[f])

    # Handle custom AI target configurations
    if 'target_configs' in data or 'target_configs_json' in data:
        raw_val = data.get('target_configs') if 'target_configs' in data else data.get('target_configs_json')
        if isinstance(raw_val, (dict, list)):
            target_json_str = json.dumps(raw_val)
        elif isinstance(raw_val, str):
            if raw_val.strip():
                try:
                    json.loads(raw_val)
                    target_json_str = raw_val.strip()
                except Exception:
                    conn.close()
                    return jsonify({"success": False, "error": "target_configs must be valid JSON."}), 400
            else:
                target_json_str = None
        elif raw_val is None:
            target_json_str = None
        else:
            conn.close()
            return jsonify({"success": False, "error": "target_configs must be a valid JSON object or string."}), 400
        updates.append("target_configs_json = ?")
        values.append(target_json_str)

    # Handle event password update
    if 'event_password' in data:
        pw = data['event_password']
        confirmation = data.get('confirm_event_password')
        if not isinstance(pw, str) or not isinstance(confirmation, str):
            conn.close()
            return jsonify({"success": False, "error": "Enter and confirm the new event access password."}), 400
        pw = pw.strip()
        if pw:
            if len(pw) < 8 or len(pw) > 256:
                conn.close()
                return jsonify({"success": False, "error": "Event access password must be between 8 and 256 characters."}), 400
            if pw != confirmation:
                conn.close()
                return jsonify({"success": False, "error": "Event password and confirmation do not match."}), 400
            pw_hash = generate_password_hash(pw, method="scrypt")
            updates.append("event_password_hash = ?")
            values.append(pw_hash)
            updates.append("event_password_enabled = 1")
            password_changed = True
        elif confirmation:
            conn.close()
            return jsonify({"success": False, "error": "Enter a new event access password or leave both password fields blank."}), 400

    cursor.execute(
        "SELECT event_password_hash, event_password_enabled, event_password_version "
        "FROM system_config WHERE id = 1"
    )
    current_config = cursor.fetchone()
    if (
        data.get('event_password_enabled') in (1, True)
        and not password_changed
        and (not current_config or not current_config['event_password_hash'])
    ):
        conn.close()
        return jsonify({"success": False, "error": "Set an event access password before enabling the password gate."}), 400
    access_policy_changed = password_changed or (
        'event_password_enabled' in data
        and current_config
        and int(data['event_password_enabled']) != int(current_config['event_password_enabled'])
    )
    if access_policy_changed:
        updates.append("event_password_version = event_password_version + 1")

    if updates:
        values.append(1) # WHERE id = 1
        cursor.execute(f"UPDATE system_config SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
        conn.commit()

    cursor.execute("SELECT * FROM system_config WHERE id = 1")
    updated_cfg = dict(cursor.fetchone())
    updated_cfg['event_password_configured'] = bool(updated_cfg.get('event_password_hash'))
    updated_cfg.pop('event_password_hash', None)
    updated_cfg.pop('event_password_version', None)
    if updated_cfg.get('target_configs_json'):
        try:
            updated_cfg['target_configs'] = json.loads(updated_cfg['target_configs_json'])
        except Exception:
            updated_cfg['target_configs'] = None
    else:
        updated_cfg['target_configs'] = None
    conn.close()

    safe_fields = [
        field for field in data
        if field not in ('event_password', 'confirm_event_password', 'password', 'current_password',
                         'new_password', 'confirm_password')
    ]
    log_audit(
        request.admin_user.get('username'),
        'UPDATE_CONFIG',
        'CONFIG',
        metadata={
            "updated_fields": safe_fields,
            "event_password_changed": password_changed,
        },
    )
    notify_clients('CONFIG_UPDATE', updated_cfg)

    return jsonify({"success": True, "message": "Event configuration updated.", "config": updated_cfg})


# -------------------------------------------------------------
# 7. EMERGENCY CONTROLS
# -------------------------------------------------------------
@admin_bp.route('/emergency/<action>', methods=['POST'])
@admin_required
def emergency_action(action):
    conn = get_db_connection()
    cursor = conn.cursor()

    if action == 'replay':
        team_id = request.get_json().get('team_id')
        cursor.execute("DELETE FROM game_results WHERE team_id = ?", (team_id,))
        cursor.execute("UPDATE game_sessions SET status = 'ABORTED' WHERE team_id = ?", (team_id,))
        cursor.execute("UPDATE teams SET status = 'PRESENT', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (team_id,))
        cursor.execute("""
            INSERT INTO queue_events (team_id, event_type, details, triggered_by)
            VALUES (?, 'REPLAY_AUTHORIZED', 'Operator authorized a replay session', 'ADMIN')
        """, (team_id,))
        conn.commit()
        msg = "Team reset to PRESENT state for game replay."
        log_audit(request.admin_user.get('username'), 'AUTHORIZE_REPLAY', 'TEAM', team_id)

    elif action == 'cancel-current':
        cursor.execute("SELECT id FROM teams WHERE status = 'PLAYING' LIMIT 1")
        row = cursor.fetchone()
        if row:
            cursor.execute("UPDATE teams SET status = 'SKIPPED' WHERE id = ?", (row['id'],))
            cursor.execute("UPDATE game_sessions SET status = 'ABORTED' WHERE team_id = ? AND status = 'PLAYING'", (row['id'],))
            conn.commit()
            msg = "Active game cancelled and team skipped."
            log_audit(request.admin_user.get('username'), 'CANCEL_CURRENT_GAME', 'TEAM', row['id'])
        else:
            msg = "No currently active game to cancel."

    elif action == 'toggle-registration':
        cursor.execute("UPDATE system_config SET registration_open = 1 - registration_open WHERE id = 1")
        conn.commit()
        cursor.execute("SELECT registration_open FROM system_config WHERE id = 1")
        is_open = cursor.fetchone()['registration_open']
        msg = f"Registration {'OPENED' if is_open else 'CLOSED'}."
        log_audit(request.admin_user.get('username'), 'TOGGLE_REGISTRATION', 'SYSTEM', metadata={"open": is_open})

    elif action == 'toggle-event':
        cursor.execute("UPDATE system_config SET event_active = 1 - event_active WHERE id = 1")
        conn.commit()
        cursor.execute("SELECT event_active FROM system_config WHERE id = 1")
        is_active = cursor.fetchone()['event_active']
        msg = f"Event {'ACTIVATED' if is_active else 'PAUSED'}."
        log_audit(request.admin_user.get('username'), 'TOGGLE_EVENT', 'SYSTEM', metadata={"active": is_active})

    else:
        conn.close()
        return jsonify({"success": False, "error": f"Unknown emergency action: {action}"}), 400

    public_queue = QueueManager.get_public_queue(conn)
    conn.close()
    notify_clients('QUEUE_UPDATE', public_queue)

    return jsonify({"success": True, "message": msg})


# -------------------------------------------------------------
# 8. CSV DATA EXPORT
# -------------------------------------------------------------
@admin_bp.route('/export/csv', methods=['GET'])
@admin_required
def export_csv():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            t.team_code, t.team_name, t.college_name, t.queue_number, t.status,
            p1.name as p1_name, p1.college as p1_college, p1.phone as p1_phone, p1.roll_number as p1_roll,
            p2.name as p2_name, p2.college as p2_college, p2.phone as p2_phone, p2.roll_number as p2_roll,
            r.difficulty, r.score, r.hits, r.misses, r.accuracy, r.best_combo, r.completion_time_ms, t.created_at
        FROM teams t
        LEFT JOIN participants p1 ON t.id = p1.team_id AND p1.player_role = 'PLAYER_1_AIM'
        LEFT JOIN participants p2 ON t.id = p2.team_id AND p2.player_role = 'PLAYER_2_SHOOT'
        LEFT JOIN game_results r ON t.id = r.team_id
        ORDER BY t.queue_number ASC
    """)
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Team Code', 'Team Name', 'College', 'Queue #', 'Status',
        'P1 Name (Aim)', 'P1 College', 'P1 Phone', 'P1 Roll No',
        'P2 Name (Shoot)', 'P2 College', 'P2 Phone', 'P2 Roll No',
        'Difficulty', 'Score', 'Hits', 'Misses', 'Accuracy (%)', 'Best Combo', 'Duration (s)', 'Registered At'
    ])

    for r in rows:
        duration_sec = round(r['completion_time_ms'] / 1000.0, 1) if r['completion_time_ms'] else ''
        writer.writerow([
            r['team_code'], r['team_name'], r['college_name'] or '', r['queue_number'], r['status'],
            r['p1_name'], r['p1_college'], r['p1_phone'], r['p1_roll'],
            r['p2_name'], r['p2_college'], r['p2_phone'], r['p2_roll'],
            r['difficulty'] or '', r['score'] or 0, r['hits'] or 0, r['misses'] or 0, r['accuracy'] or 0,
            r['best_combo'] or 0, duration_sec, r['created_at']
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=ai_target_strike_teams.csv"}
    )
