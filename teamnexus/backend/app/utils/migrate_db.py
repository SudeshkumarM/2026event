import os
import sqlite3

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aitargetstrike.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [r[0] for r in cursor.fetchall()]
print("Current tables:", tables)

# Helper to check if column exists
def column_exists(table, col):
    cursor.execute(f"PRAGMA table_info({table});")
    cols = [r["name"] for r in cursor.fetchall()]
    return col in cols

# 1. Update system_config columns
sys_cols = [
    ("event_password_hash", "TEXT NULL"),
    ("event_password_enabled", "INTEGER NOT NULL DEFAULT 0"),
    ("difficulty", "TEXT NOT NULL DEFAULT 'MEDIUM'"),
    ("difficulty_mode", "TEXT NOT NULL DEFAULT 'EVENT_LOCKED'"),
    ("operating_mode", "TEXT NOT NULL DEFAULT 'OPERATOR_CONTROLLED'"),
    ("story_enabled", "INTEGER NOT NULL DEFAULT 1")
]
for col, col_def in sys_cols:
    if not column_exists("system_config", col):
        cursor.execute(f"ALTER TABLE system_config ADD COLUMN {col} {col_def};")
        print(f"Added column {col} to system_config")

# Update game_duration default to 420 (7 minutes)
cursor.execute("UPDATE system_config SET game_duration = 420 WHERE id = 1 AND (game_duration = 60 OR game_duration IS NULL);")

# 2. Update teams columns
team_cols = [
    ("college_name", "TEXT NULL")
]
for col, col_def in team_cols:
    if not column_exists("teams", col):
        cursor.execute(f"ALTER TABLE teams ADD COLUMN {col} {col_def};")
        print(f"Added column {col} to teams")

# 3. Update game_sessions columns
sess_cols = [
    ("difficulty", "TEXT NOT NULL DEFAULT 'MEDIUM'"),
    ("scheduled_end_at", "TIMESTAMP NULL"),
    ("total_score", "INTEGER DEFAULT 0"),
    ("total_hits", "INTEGER DEFAULT 0"),
    ("total_misses", "INTEGER DEFAULT 0")
]
for col, col_def in sess_cols:
    if not column_exists("game_sessions", col):
        cursor.execute(f"ALTER TABLE game_sessions ADD COLUMN {col} {col_def};")
        print(f"Added column {col} to game_sessions")

# 4. Create access_credentials table
cursor.execute("""
CREATE TABLE IF NOT EXISTS access_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    credential_hash TEXT NOT NULL,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    used_at TIMESTAMP NULL
);
""")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_access_credentials_team ON access_credentials(team_id);")

# 5. Create audit_logs table
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

# 6. Create private_documents table
cursor.execute("""
CREATE TABLE IF NOT EXISTS private_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    private_storage_key TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retention_until TIMESTAMP NULL
);
""")

conn.commit()
print("Migration completed successfully!")
conn.close()
