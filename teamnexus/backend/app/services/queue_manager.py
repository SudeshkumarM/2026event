import sqlite3
from datetime import datetime, timezone
import json

class QueueManager:
    @staticmethod
    def get_public_queue(conn):
        """
        Retrieves current active queue state for projector and public displays.
        Also automatically processes any timed-out called teams.
        """
        cursor = conn.cursor()
        
        # Check if currently called team has timed out
        cursor.execute("""
            SELECT id, team_code, team_name, call_deadline, status 
            FROM teams 
            WHERE status = 'CALLED' AND is_test = 0
        """)
        called_team = cursor.fetchone()
        
        if called_team and called_team['call_deadline']:
            try:
                deadline = datetime.fromisoformat(called_team['call_deadline'])
                now_utc = datetime.now(timezone.utc)
                if now_utc > deadline:
                    # Timeout exceeded -> Auto-skip!
                    cursor.execute("""
                        UPDATE teams 
                        SET status = 'SKIPPED', updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    """, (called_team['id'],))
                    
                    cursor.execute("""
                        INSERT INTO queue_events (team_id, event_type, details, triggered_by)
                        VALUES (?, 'TIMEOUT_SKIPPED', 'Call timeout exceeded without reporting', 'SYSTEM_AUTO')
                    """, (called_team['id'],))
                    conn.commit()
            except Exception as e:
                print(f"Error checking deadline: {e}")

        # 1. Now Playing
        cursor.execute("""
            SELECT id, team_code, team_name, queue_number, status
            FROM teams
            WHERE status IN ('PLAYING', 'PRESENT') AND is_test = 0
            ORDER BY updated_at DESC LIMIT 1
        """)
        now_playing = cursor.fetchone()

        # 2. Called Team (Next to play)
        cursor.execute("""
            SELECT id, team_code, team_name, queue_number, status, called_at, call_deadline
            FROM teams
            WHERE status = 'CALLED' AND is_test = 0
            ORDER BY called_at ASC LIMIT 1
        """)
        currently_called = cursor.fetchone()

        # 3. Next Waiting Team (if no team is currently called, next in line)
        cursor.execute("""
            SELECT id, team_code, team_name, queue_number, status
            FROM teams
            WHERE status = 'WAITING' AND is_test = 0
            ORDER BY queue_number ASC LIMIT 1
        """)
        next_waiting = cursor.fetchone()

        # 4. Upcoming Waiting Teams (up to 8)
        cursor.execute("""
            SELECT id, team_code, team_name, queue_number, status
            FROM teams
            WHERE status = 'WAITING' AND is_test = 0
            ORDER BY queue_number ASC LIMIT 8
        """)
        upcoming_rows = cursor.fetchall()

        # Total counts
        cursor.execute("""
            SELECT status, COUNT(*) as count
            FROM teams
            WHERE is_test = 0
            GROUP BY status
        """)
        status_counts = {row['status']: row['count'] for row in cursor.fetchall()}

        return {
            "now_playing": dict(now_playing) if now_playing else None,
            "called_team": dict(currently_called) if currently_called else None,
            "next_team": dict(next_waiting) if next_waiting else None,
            "upcoming": [dict(r) for r in upcoming_rows],
            "stats": {
                "waiting": status_counts.get("WAITING", 0),
                "called": status_counts.get("CALLED", 0),
                "playing": status_counts.get("PLAYING", 0),
                "completed": status_counts.get("COMPLETED", 0),
                "skipped": status_counts.get("SKIPPED", 0),
                "total": sum(status_counts.values())
            }
        }

    @staticmethod
    def call_team(conn, team_id, timeout_seconds=30):
        cursor = conn.cursor()
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=timeout_seconds)

        # First, if any other team is CALLED, do not leave them orphaned
        cursor.execute("SELECT id FROM teams WHERE status = 'CALLED' AND id != ?", (team_id,))
        previously_called = cursor.fetchall()
        for prev in previously_called:
            cursor.execute("UPDATE teams SET status = 'WAITING' WHERE id = ?", (prev['id'],))

        cursor.execute("""
            UPDATE teams 
            SET status = 'CALLED', called_at = ?, call_deadline = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (now.isoformat(), deadline.isoformat(), team_id))

        cursor.execute("""
            INSERT INTO queue_events (team_id, event_type, details, triggered_by)
            VALUES (?, 'CALLED', ?, 'OPERATOR')
        """, (team_id, f"Called with {timeout_seconds}s timeout"))
        
        conn.commit()
        return True

    @staticmethod
    def skip_team(conn, team_id, reason="Manual Operator Skip"):
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE teams 
            SET status = 'SKIPPED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (team_id,))

        cursor.execute("""
            INSERT INTO queue_events (team_id, event_type, details, triggered_by)
            VALUES (?, 'SKIPPED', ?, 'OPERATOR')
        """, (team_id, reason))
        
        conn.commit()
        return True

    @staticmethod
    def restore_team(conn, team_id):
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE teams 
            SET status = 'WAITING', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (team_id,))

        cursor.execute("""
            INSERT INTO queue_events (team_id, event_type, details, triggered_by)
            VALUES (?, 'RESTORED', 'Team restored to waiting queue', 'OPERATOR')
        """, (team_id,))
        
        conn.commit()
        return True
