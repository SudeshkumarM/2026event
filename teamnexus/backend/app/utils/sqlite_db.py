import os
import sqlite3
import hashlib
from datetime import datetime
from flask import current_app, has_app_context
from config import Config

DATABASE_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aitargetstrike.db")
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), "secure_uploads")

def _database_url(config=None):
    if config is not None:
        return config.get("DATABASE_URL") if hasattr(config, "get") else config.DATABASE_URL
    if has_app_context():
        return current_app.config.get("DATABASE_URL")
    return Config.DATABASE_URL


def _postgres_row(cursor):
    columns = [column.name for column in cursor.description]

    def make_row(values):
        return PostgresRow(zip(columns, values))

    return make_row


class PostgresRow(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return tuple(self.values())[key]
        return super().__getitem__(key)


class PostgresConnection:
    def __init__(self, connection):
        self._connection = connection

    def cursor(self):
        return PostgresCursor(self._connection.cursor(row_factory=_postgres_row))

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        self._connection.close()


class PostgresCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, params=()):
        query = query.replace("?", "%s")
        self._cursor.execute(query, params)
        return self

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __getattr__(self, name):
        return getattr(self._cursor, name)


def get_db_connection():
    database_url = _database_url()
    if database_url:
        import psycopg

        return PostgresConnection(psycopg.connect(database_url))

    conn = sqlite3.connect(DATABASE_FILE, timeout=30.0)
    conn.row_factory = sqlite3.Row
    # Enforce foreign keys and WAL mode for high concurrency & reliability
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA cache_size = -64000;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    return conn

def init_db(config=None):
    config = Config if config is None else config
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    database_url = _database_url(config)
    if database_url:
        _init_postgres_db(config, database_url)
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. System Config
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        event_name TEXT NOT NULL DEFAULT 'TECNOX — AI DOWNFALL',
        game_mode TEXT NOT NULL DEFAULT 'MODE_TARGETS' CHECK (game_mode IN ('MODE_TARGETS', 'MODE_TIME')),
        target_count INTEGER NOT NULL DEFAULT 20,
        game_duration INTEGER NOT NULL DEFAULT 420,
        base_target_speed REAL NOT NULL DEFAULT 3.2,
        max_target_speed REAL NOT NULL DEFAULT 7.5,
        min_target_size INTEGER NOT NULL DEFAULT 38,
        max_target_size INTEGER NOT NULL DEFAULT 64,
        score_per_hit INTEGER NOT NULL DEFAULT 100,
        combo_enabled INTEGER NOT NULL DEFAULT 1,
        queue_timeout_seconds INTEGER NOT NULL DEFAULT 30,
        competition_mode TEXT NOT NULL DEFAULT 'COMPETITION' CHECK (competition_mode IN ('PRACTICE', 'COMPETITION', 'TEST')),
        difficulty TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
        difficulty_mode TEXT NOT NULL DEFAULT 'EVENT_LOCKED' CHECK (difficulty_mode IN ('EVENT_LOCKED', 'TEAM_SELECTS', 'ADMIN_ASSIGNS')),
        operating_mode TEXT NOT NULL DEFAULT 'OPERATOR_CONTROLLED' CHECK (operating_mode IN ('OPERATOR_CONTROLLED', 'SELF_SERVICE')),
        story_enabled INTEGER NOT NULL DEFAULT 1,
        registration_open INTEGER NOT NULL DEFAULT 1,
        event_active INTEGER NOT NULL DEFAULT 1,
        event_password_hash TEXT NULL,
        event_password_enabled INTEGER NOT NULL DEFAULT 0,
        event_password_version INTEGER NOT NULL DEFAULT 0,
        tie_breaker_rule TEXT NOT NULL DEFAULT 'ACCURACY_THEN_TIME',
        target_configs_json TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("PRAGMA table_info(system_config);")
    system_config_columns = {row[1] for row in cursor.fetchall()}
    if "event_password_version" not in system_config_columns:
        cursor.execute(
            "ALTER TABLE system_config ADD COLUMN event_password_version INTEGER NOT NULL DEFAULT 0;"
        )
    if "target_configs_json" not in system_config_columns:
        cursor.execute(
            "ALTER TABLE system_config ADD COLUMN target_configs_json TEXT NULL;"
        )

    cursor.execute("UPDATE system_config SET event_name = 'TECNOX — AI DOWNFALL' WHERE event_name = 'AI TARGET STRIKE 2026';")

    from werkzeug.security import generate_password_hash
    event_password = config.get("REGISTRATION_GATE_PASSWORD") if hasattr(config, "get") else config.REGISTRATION_GATE_PASSWORD
    initial_event_pw_hash = (
        generate_password_hash(event_password, method="scrypt")
        if event_password
        else None
    )

    cursor.execute("SELECT COUNT(*) FROM system_config WHERE id = 1;")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO system_config (id, event_name, game_duration, event_password_hash, event_password_enabled)
        VALUES (1, 'TECNOX — AI DOWNFALL', 420, ?, ?);
        """, (initial_event_pw_hash, int(initial_event_pw_hash is not None)))
    else:
        cursor.execute("SELECT event_password_hash FROM system_config WHERE id = 1;")
        row = cursor.fetchone()
        if initial_event_pw_hash and (not row or not row[0]):
            cursor.execute("""
            UPDATE system_config
            SET event_password_hash = ?, event_password_enabled = 1
                WHERE id = 1;
            """, (initial_event_pw_hash,))

    # 2. Teams Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_code TEXT UNIQUE NOT NULL,
        team_name TEXT NOT NULL,
        college_name TEXT NULL,
        queue_number INTEGER UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'WAITING' 
            CHECK (status IN ('WAITING', 'CALLED', 'PRESENT', 'PLAYING', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
        called_at TIMESTAMP NULL,
        call_deadline TIMESTAMP NULL,
        is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("PRAGMA table_info(teams);")
    team_columns = {row[1] for row in cursor.fetchall()}
    if "is_test" not in team_columns:
        cursor.execute(
            "ALTER TABLE teams ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 "
            "CHECK (is_test IN (0, 1));"
        )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_teams_is_test_status ON teams(is_test, status);")

    # 3. Participants Table (Exactly 2 players per team)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        player_role TEXT NOT NULL CHECK (player_role IN ('PLAYER_1_AIM', 'PLAYER_2_SHOOT')),
        name TEXT NOT NULL,
        college TEXT NOT NULL,
        phone TEXT NOT NULL,
        roll_number TEXT NOT NULL,
        id_card_filename TEXT NULL,
        id_card_blob BLOB NULL,
        id_card_data TEXT NULL,
        id_card_mime TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 4. Access Credentials Table (Hashed access codes + authorized admin access_code)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS access_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        credential_hash TEXT NOT NULL,
        access_code TEXT NULL,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        revoked_at TIMESTAMP NULL,
        used_at TIMESTAMP NULL
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_access_credentials_team ON access_credentials(team_id);")

    cursor.execute("PRAGMA table_info(access_credentials);")
    access_cred_cols = {row[1] for row in cursor.fetchall()}
    if "access_code" not in access_cred_cols:
        cursor.execute("ALTER TABLE access_credentials ADD COLUMN access_code TEXT NULL;")

    # Local dev uses SQLite, so create the same ten test credentials as sql.md.
    # Negative queue numbers keep the fixtures behind normal registrations.
    cursor.execute("SELECT COALESCE(MIN(queue_number), 0) FROM teams WHERE is_test = 0;")
    first_test_queue = cursor.fetchone()[0]
    for number in range(1, 11):
        test_code = f"ATS-TEST-{number:03d}"
        cursor.execute("""
            INSERT OR IGNORE INTO teams (
                team_code, team_name, college_name, queue_number, status, is_test
            ) VALUES (?, ?, 'TEST ONLY', ?, 'WAITING', 1)
        """, (test_code, f"Test Team {number:03d}", first_test_queue - number))
        cursor.execute("SELECT id FROM teams WHERE team_code = ?;", (test_code,))
        test_team_id = cursor.fetchone()["id"]
        code_hash = hashlib.sha256(test_code.encode("utf-8")).hexdigest()
        cursor.execute("""
            INSERT INTO access_credentials (team_id, credential_hash, access_code)
            SELECT ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1 FROM access_credentials
                WHERE team_id = ? AND credential_hash = ?
            )
        """, (test_team_id, code_hash, test_code, test_team_id, code_hash))

    # 5. Private Documents Table (Secure ID Storage Metadata)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS private_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
        private_storage_key TEXT NOT NULL,
        verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
        image_blob BLOB NULL,
        image_data TEXT NULL,
        mime_type TEXT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        retention_until TIMESTAMP NULL
    );
    """)

    # 6. Game Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'INITIATED' 
            CHECK (status IN ('INITIATED', 'COUNTDOWN', 'PLAYING', 'COMPLETED', 'ABORTED', 'INVALIDATED')),
        session_token TEXT NOT NULL UNIQUE,
        mode TEXT NOT NULL,
        difficulty TEXT NOT NULL DEFAULT 'MEDIUM',
        config_snapshot TEXT NOT NULL,
        started_at TIMESTAMP NULL,
        scheduled_end_at TIMESTAMP NULL,
        ended_at TIMESTAMP NULL,
        duration_ms INTEGER NULL,
        total_shots INTEGER DEFAULT 0,
        total_hits INTEGER DEFAULT 0,
        total_misses INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 7. Game Results Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS game_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_session_id TEXT UNIQUE NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        difficulty TEXT NOT NULL DEFAULT 'MEDIUM',
        score INTEGER NOT NULL CHECK (score >= 0),
        hits INTEGER NOT NULL CHECK (hits >= 0),
        misses INTEGER NOT NULL CHECK (misses >= 0),
        accuracy REAL NOT NULL CHECK (accuracy >= 0.0 AND accuracy <= 100.0),
        best_combo INTEGER NOT NULL DEFAULT 0,
        targets_destroyed INTEGER NOT NULL DEFAULT 0,
        completion_time_ms INTEGER NOT NULL,
        is_official INTEGER NOT NULL DEFAULT 1,
        verified_by_server INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_game_results_leaderboard ON game_results(is_official, score DESC, completion_time_ms ASC);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_game_results_team ON game_results(team_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_game_sessions_token ON game_sessions(session_token);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_game_sessions_team ON game_sessions(team_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);")

    # 8. Queue Event Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        details TEXT NULL,
        triggered_by TEXT DEFAULT 'SYSTEM',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 9. Admin Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'ADMIN',
        auth_version INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("PRAGMA table_info(admin_users);")
    admin_columns = {row[1] for row in cursor.fetchall()}
    if "auth_version" not in admin_columns:
        cursor.execute(
            "ALTER TABLE admin_users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;"
        )

    # 10. Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL DEFAULT 'SYSTEM',
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NULL,
        metadata TEXT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    admin_username = config.get("INITIAL_ADMIN_USERNAME", "admin") if hasattr(config, "get") else config.INITIAL_ADMIN_USERNAME
    admin_password = config.get("INITIAL_ADMIN_PASSWORD") if hasattr(config, "get") else config.INITIAL_ADMIN_PASSWORD
    if admin_password:
        cursor.execute("SELECT COUNT(*) FROM admin_users WHERE username = ?;", (admin_username,))
        if cursor.fetchone()[0] == 0:
            pwd_hash = generate_password_hash(admin_password, method="scrypt")
            cursor.execute("INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?);",
                           (admin_username, pwd_hash, 'ADMIN'))

    # Ensure dynamic column migrations for ID card images
    def add_col_if_missing(table, col, col_def):
        cursor.execute(f"PRAGMA table_info({table});")
        cols = [r[1] for r in cursor.fetchall()]
        if col not in cols:
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_def};")
            except Exception as e:
                print(f"Notice: {table}.{col} column check: {e}")

    add_col_if_missing("access_credentials", "access_code", "TEXT NULL")
    add_col_if_missing("participants", "id_card_blob", "BLOB NULL")
    add_col_if_missing("participants", "id_card_data", "TEXT NULL")
    add_col_if_missing("participants", "id_card_mime", "TEXT NULL")
    add_col_if_missing("private_documents", "image_blob", "BLOB NULL")
    add_col_if_missing("private_documents", "image_data", "TEXT NULL")
    add_col_if_missing("private_documents", "mime_type", "TEXT NULL")

    conn.commit()
    conn.close()
    print("Database schema successfully verified with WAL mode and initial seed.")


def _init_postgres_db(config, database_url):
    import psycopg

    try:
        conn = PostgresConnection(psycopg.connect(database_url))
        cursor = conn.cursor()
        cursor.execute(
            "ALTER TABLE public.admin_users "
            "ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0"
        )
        cursor.execute(
            "ALTER TABLE public.system_config "
            "ADD COLUMN IF NOT EXISTS event_password_version INTEGER NOT NULL DEFAULT 0"
        )
        cursor.execute(
            "ALTER TABLE public.system_config "
            "ADD COLUMN IF NOT EXISTS target_configs_json TEXT NULL"
        )
        cursor.execute(
            "ALTER TABLE public.access_credentials "
            "ADD COLUMN IF NOT EXISTS access_code TEXT NULL"
        )
        conn.commit()
        cursor.execute("SELECT id FROM public.system_config WHERE id = 1")
        if cursor.fetchone() is None:
            raise RuntimeError(
                "Supabase is missing the system_config seed row. Run sql.md in the Supabase SQL Editor."
            )

        admin_username = (
            config.get("INITIAL_ADMIN_USERNAME", "admin")
            if hasattr(config, "get")
            else config.INITIAL_ADMIN_USERNAME
        )
        admin_password = (
            config.get("INITIAL_ADMIN_PASSWORD")
            if hasattr(config, "get")
            else config.INITIAL_ADMIN_PASSWORD
        )
        if admin_password:
            from werkzeug.security import generate_password_hash

            cursor.execute(
                """
                INSERT INTO public.admin_users (username, password_hash, role)
                VALUES (%s, %s, 'ADMIN')
                ON CONFLICT (username) DO NOTHING
                """,
                (admin_username, generate_password_hash(admin_password, method="scrypt")),
            )
            conn.commit()
        conn.close()
    except psycopg.Error as error:
        raise RuntimeError(
            "Could not initialize Supabase PostgreSQL. Check DATABASE_URL and run sql.md "
            "in the Supabase SQL Editor."
        ) from error


if __name__ == '__main__':
    init_db()
