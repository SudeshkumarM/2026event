import os
import sqlite3

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aitargetstrike.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(game_results);")
cols = [r[1] for r in cursor.fetchall()]
if "difficulty" not in cols:
    cursor.execute("ALTER TABLE game_results ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'MEDIUM';")
    conn.commit()
    print("Added difficulty column to game_results")
else:
    print("difficulty already exists in game_results")

conn.close()
