#!/usr/bin/env python3
"""
=============================================================================
AI TARGET STRIKE — DEDICATED ADMIN TERMINAL PORTAL
Interactive command-line administrative console for event organizers.
=============================================================================
"""

import os
import sys
import time
import webbrowser
import sqlite3

# Ensure app path in PYTHONPATH
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.utils.sqlite_db import get_db_connection

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    print("\033[96m" + "=" * 76 + "\033[0m")
    print("\033[96m║\033[1;97m         AI TARGET STRIKE — DEDICATED ADMIN COMMAND CONSOLE           \033[96m║\033[0m")
    print("\033[96m║\033[90m                 2-Player Event Management & Live Queue               \033[96m║\033[0m")
    print("\033[96m" + "=" * 76 + "\033[0m")
    print()
    print("  \033[1;92m● Admin Web Portal:\033[0m  \033[4;94mhttp://localhost:5173/admin\033[0m")
    print("  \033[1;92m● Admin Setup:\033[0m       \033[1;97mSet INITIAL_ADMIN_USERNAME/PASSWORD in backend .env\033[0m")
    print("  \033[1;92m● Event Gate Setup:\033[0m  \033[1;93mSet REGISTRATION_GATE_PASSWORD in backend .env\033[0m")
    print()

def get_stats():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        total_teams = cursor.execute("SELECT COUNT(*) FROM teams;").fetchone()[0]
        total_participants = cursor.execute("SELECT COUNT(*) FROM participants;").fetchone()[0]
        total_results = cursor.execute("SELECT COUNT(*) FROM game_results;").fetchone()[0]
        waiting_teams = cursor.execute("SELECT COUNT(*) FROM teams WHERE status = 'WAITING';").fetchone()[0]
        conn.close()
        return {
            "teams": total_teams,
            "participants": total_participants,
            "results": total_results,
            "waiting": waiting_teams
        }
    except Exception as e:
        return {"teams": "?", "participants": "?", "results": "?", "waiting": "?"}

def view_teams():
    clear_screen()
    print_header()
    print("\033[1;93m[ RECENT REGISTERED TEAMS & GAME ACCESS CODES ]\033[0m\n")
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT t.id, t.team_code, t.team_name, t.college_name, t.status, ac.access_code
            FROM teams t
            LEFT JOIN access_credentials ac ON t.id = ac.team_id
            ORDER BY t.id DESC LIMIT 15;
        """).fetchall()
        conn.close()

        if not rows:
            print("  No registered teams found in database.")
        else:
            print(f"  {'TEAM ID':<12} {'QUEUE STATUS':<12} {'ACCESS CODE':<18} {'TEAM NAME':<24} {'COLLEGE'}")
            print("  " + "-" * 72)
            for r in rows:
                tid = r["team_code"] or f"ID-{r['id']}"
                status = r["status"]
                code = r["access_code"] or "ATS-2026-PLAY"
                tname = (r["team_name"][:22] + "..") if len(r["team_name"]) > 22 else r["team_name"]
                college = (r["college_name"][:20] + "..") if r["college_name"] and len(r["college_name"]) > 20 else (r["college_name"] or "-")
                print(f"  \033[1;96m{tid:<12}\033[0m \033[93m{status:<12}\033[0m \033[1;92m{code:<18}\033[0m {tname:<24} \033[90m{college}\033[0m")
    except Exception as e:
        print(f"  Error fetching teams: {e}")
    
    print()
    input("  Press ENTER to return to Admin Menu...")

def view_scoreboard():
    clear_screen()
    print_header()
    print("\033[1;93m[ OFFICIAL TOURNAMENT SCOREBOARD ]\033[0m\n")
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT r.id, t.team_code, t.team_name, r.total_score, r.targets_destroyed, r.accuracy, r.completed_at
            FROM game_results r
            JOIN teams t ON r.team_id = t.id
            ORDER BY r.targets_destroyed DESC, r.accuracy DESC, r.total_score DESC
            LIMIT 15;
        """).fetchall()
        conn.close()

        if not rows:
            print("  No finalized match results recorded yet.")
        else:
            print(f"  {'RANK':<6} {'TEAM ID':<12} {'TARGETS DESTROYED':<20} {'ACCURACY':<12} {'SCORE':<10} {'TEAM NAME'}")
            print("  " + "-" * 72)
            for rank, r in enumerate(rows, 1):
                tid = r["team_code"]
                targets = r["targets_destroyed"]
                acc = f"{r['accuracy']}%"
                score = r["total_score"]
                tname = r["team_name"]
                print(f"  \033[1;93m#{rank:<5}\033[0m \033[1;96m{tid:<12}\033[0m \033[1;92m{targets:<20}\033[0m {acc:<12} {score:<10} {tname}")
    except Exception as e:
        print(f"  Error fetching scoreboard: {e}")

    print()
    input("  Press ENTER to return to Admin Menu...")

def view_queue():
    clear_screen()
    print_header()
    print("\033[1;93m[ LIVE EVENT QUEUE STATUS ]\033[0m\n")
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        called = cursor.execute("SELECT team_code, team_name, call_deadline FROM teams WHERE status = 'CALLED' LIMIT 1;").fetchone()
        waiting = cursor.execute("SELECT team_code, team_name, queue_number FROM teams WHERE status = 'WAITING' ORDER BY queue_number ASC LIMIT 10;").fetchall()
        conn.close()

        if called:
            print(f"  \033[1;91m[CURRENTLY CALLED TO STATION]:\033[0m \033[1;97m{called['team_code']} — {called['team_name']}\033[0m (Deadline: {called['call_deadline']})")
        else:
            print("  \033[90mNo team currently called to station.\033[0m")
        print()
        print(f"  {'QUEUE #':<10} {'TEAM ID':<14} {'TEAM NAME'}")
        print("  " + "-" * 50)
        for w in waiting:
            print(f"  \033[93m#{w['queue_number']:<9}\033[0m \033[1;96m{w['team_code']:<14}\033[0m {w['team_name']}")
    except Exception as e:
        print(f"  Error reading queue: {e}")

    print()
    input("  Press ENTER to return to Admin Menu...")

def generate_auto_team():
    clear_screen()
    print_header()
    print("\033[1;93m[ GENERATE VERIFIED TEST TEAM & ACCESS CODE ]\033[0m\n")
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        t_count = cursor.execute("SELECT COUNT(*) FROM teams;").fetchone()[0] + 1
        team_code = f"ATS-{t_count:04d}"
        team_name = f"CYBER TITANS {t_count:02d}"
        college = "Autonomous Tech Institute"

        cursor.execute("""
            INSERT INTO teams (team_code, team_name, college_name, queue_number, status)
            VALUES (?, ?, ?, ?, 'WAITING')
            RETURNING id;
        """, (team_code, team_name, college, t_count))
        team_id = cursor.fetchone()["id"]

        cursor.execute("""
            INSERT INTO participants (team_id, player_role, name, college, phone, roll_number)
            VALUES (?, 'PLAYER_1_AIM', 'Test Player 1', ?, '9876543210', 'ROLL001');
        """, (team_id, college))
        cursor.execute("""
            INSERT INTO participants (team_id, player_role, name, college, phone, roll_number)
            VALUES (?, 'PLAYER_2_SHOOT', 'Test Player 2', ?, '9876543211', 'ROLL002');
        """, (team_id, college))

        access_code = "ATS-2026-PLAY"
        cursor.execute("""
            INSERT OR REPLACE INTO access_credentials (team_id, access_code, status)
            VALUES (?, ?, 'ACTIVE');
        """, (team_id, access_code))
        conn.commit()
        conn.close()

        print("  \033[1;92mSUCCESSFULLY CREATED EVENT TEAM:\033[0m")
        print(f"  • Team ID:     \033[1;96m{team_code}\033[0m")
        print(f"  • Team Name:   \033[1;97m{team_name}\033[0m")
        print(f"  • Access Code: \033[1;93m{access_code}\033[0m")
        print(f"  • Queue #:     \033[1;95m#{t_count}\033[0m")
    except Exception as e:
        print(f"  Failed to generate team: {e}")

    print()
    input("  Press ENTER to return to Admin Menu...")

def main_loop():
    while True:
        clear_screen()
        print_header()
        stats = get_stats()
        print(f"  \033[90mSystem Metrics:\033[0m \033[96m{stats['teams']} Teams\033[0m | \033[95m{stats['participants']} Players\033[0m | \033[92m{stats['results']} Finished Matches\033[0m | \033[93m{stats['waiting']} Waiting\033[0m")
        print("  " + "-" * 72)
        print()
        print("  \033[1;97mSelect Administrative Command:\033[0m")
        print("    \033[1;96m[1]\033[0m Open Admin Web Console in Browser (http://localhost:5173/admin)")
        print("    \033[1;96m[2]\033[0m View Registered Teams & Game Access Codes in this Terminal")
        print("    \033[1;96m[3]\033[0m View Official Competition Scoreboard & Standings")
        print("    \033[1;96m[4]\033[0m View Live Queue Display & Called Teams")
        print("    \033[1;96m[5]\033[0m Generate Verified Auto Test Team (Instant Team ID + Access Code)")
        print("    \033[1;96m[6]\033[0m Open Public Live Queue Screen (http://localhost:5173/queue)")
        print("    \033[1;96m[7]\033[0m Open Game Station (http://localhost:5173/game)")
        print("    \033[1;91m[0]\033[0m Exit Admin Terminal")
        print()

        choice = input("  \033[1;93mEnter choice [0-7]: \033[0m").strip()
        if choice == '1':
            print("  Opening Admin Portal in default browser...")
            webbrowser.open("http://localhost:5173/admin")
            time.sleep(1)
        elif choice == '2':
            view_teams()
        elif choice == '3':
            view_scoreboard()
        elif choice == '4':
            view_queue()
        elif choice == '5':
            generate_auto_team()
        elif choice == '6':
            webbrowser.open("http://localhost:5173/queue")
            time.sleep(1)
        elif choice == '7':
            webbrowser.open("http://localhost:5173/game")
            time.sleep(1)
        elif choice == '0':
            print("\n  Exiting Admin Terminal. Goodbye.\n")
            break
        else:
            print("  Invalid selection. Please choose 0-7.")
            time.sleep(0.8)

if __name__ == '__main__':
    main_loop()
