# 🎯 AI TARGET STRIKE (2026)
### *Next-Generation 2-Player Competitive Event Management & Hardware-Integrated Arcade System*

[![React 19](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%20%7C%20Tailwind-61dafb?style=for-the-badge&logo=react)](https://react.dev/)
[![Python Flask](https://img.shields.io/badge/Backend-Python%203.11%20%7C%20Flask%203.1-4584b6?style=for-the-badge&logo=python)](https://flask.palletsprojects.com/)
[![SQLite WAL](https://img.shields.io/badge/Database-SQLite%203%20%5BWAL%20Mode%5D-003b57?style=for-the-badge&logo=sqlite)](https://www.sqlite.org/)
[![ESP32 WebSocket](https://img.shields.io/badge/Hardware-ESP32%20IoT%20Trigger-e7352c?style=for-the-badge&logo=espressif)](https://www.espressif.com/)
[![Web Audio API](https://img.shields.io/badge/Audio-Procedural%20Web%20Audio%20API-a855f7?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Server-Sent Events](https://img.shields.io/badge/Real--Time-Server--Sent%20Events%20(SSE)-10b981?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

## 📑 Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Core Gameplay Mechanics](#2-core-gameplay-mechanics)
  - [The Asymmetric 2-Player Co-Op Rule](#the-asymmetric-2-player-co-op-rule)
  - [7-Minute Authoritative Story Progression](#7-minute-authoritative-story-progression)
  - [Dynamic Sensitivity Shifting Engine](#dynamic-sensitivity-shifting-engine)
  - [25 Frontier AI Models Catalog](#25-frontier-ai-models-catalog)
- [3. ESP32 Hardware Trigger System](#3-esp32-hardware-trigger-system)
  - [Hardware Schematic & Pinout](#hardware-schematic--pinout)
  - [Firmware Architecture & WebSocket Protocol](#firmware-architecture--websocket-protocol)
  - [Real-Time Frontend Telemetry & Diagnostics](#real-time-frontend-telemetry--diagnostics)
- [4. System Architecture & High-Level Flow](#4-system-architecture--high-level-flow)
- [5. Module Directory & Live Port Map](#5-module-directory--live-port-map)
- [6. Anti-Cheat Engine & Telemetry Verification](#6-anti-cheat-engine--telemetry-verification)
- [7. Database Architecture & Schemas](#7-database-architecture--schemas)
  - [SQLite 3 High-Concurrency WAL Engine](#sqlite-3-high-concurrency-wal-engine)
  - [PostgreSQL / Supabase Production Schema](#postgresql--supabase-production-schema)
- [8. REST API & Server-Sent Events (SSE) Reference](#8-rest-api--server-sent-events-sse-reference)
- [9. Security, Privacy & Regulatory Compliance](#9-security-privacy--regulatory-compliance)
- [10. Quick Start & Operator Guide](#10-quick-start--operator-guide)
  - [Prerequisites](#prerequisites)
  - [Option A: 1-Click Windows Launcher](#option-a-1-click-windows-launcher)
  - [Option B: Node.js Dual Dev-Runner](#option-b-nodejs-dual-dev-runner)
  - [Option C: Manual Terminal Launch](#option-c-manual-terminal-launch)
  - [Dedicated Admin CLI Terminal](#dedicated-admin-cli-terminal)
- [11. Automated Test Suites & Verification](#11-automated-test-suites--verification)
- [12. Production Deployment & Reverse Proxy](#12-production-deployment--reverse-proxy)
- [13. Repository File Structure](#13-repository-file-structure)
- [14. Operator Troubleshooting & FAQ](#14-operator-troubleshooting--faq)

---

## 1. Executive Summary

**AI TARGET STRIKE** is an all-in-one, tournament-grade event management and 2D competitive arcade esports platform purpose-built for college technical symposiums, hackathons, and gaming fests.

Traditional campus event games suffer from long spectator wait times, manual clipboard queues, disputed scoring, and vulnerable client-side timers. **AI TARGET STRIKE** solves all of these challenges with an integrated technical ecosystem:

1. **True Two-Player Co-Op**: Eliminates single-player domination by physically splitting the Aim control and the Shooting trigger.
2. **ESP32 Physical Trigger Weapon**: Connects real arcade push-buttons or modified weapon controllers over ultra-low-latency local WebSockets.
3. **Camera College ID Capture**: Live participant registration with real-time camera capture (`getUserMedia`), automatic photo cropping, and duplicate phone/roll number validation.
4. **Cryptographic Game Access Credentials**: Randomly generated `ATS-XXXX-XXXX` access codes with salted SHA-256 server-side hashing and single-use session tokens.
5. **Projector Queue Display**: High-contrast, large-screen stadium display for 1080p/4K beamers with an automatic 30-second reporting countdown and audible call chimes.
6. **Live SSE Scoreboard**: Real-time spectator leaderboard ordered by score, then fastest completion time for tied scores, with strict zero-PII sanitization.
7. **Protected Admin Command Center**: Web GUI and terminal CLI for real-time queue orchestration, encrypted ID card review, instant test team generation, and emergency compliance wipes.

---

## 2. Core Gameplay Mechanics

### The Asymmetric 2-Player Co-Op Rule
Each competing team consists of **exactly two participants** stationed together at a single gaming terminal:

| Player Role | Input Mechanism | Physical Function | Anti-Solo Enforcement |
| :--- | :--- | :--- | :--- |
| **Player 1 — AIM CONTROL** | `W`, `A`, `S`, `D` Keys | Steers the tactical cyan crosshair with 4-way and normalized diagonal vector movement, inertia, and sub-pixel fine drag. | **Mouse movement does NOT steer the crosshair.** Only keyboard WASD keys move the reticle. |
| **Player 2 — SHOOT CONTROL** | **Left Mouse Click** *OR* **ESP32 Hardware Button** | Discharges the high-energy assault rifle tracer beam down the hitscan trajectory. | **The Spacebar is deliberately decoupled from firing.** A single player cannot place one hand on WASD and another on Spacebar. |

```
                       ┌───────────────────────────────┐
                       │     2-PLAYER GAME TERMINAL    │
                       └──────────────┬────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
     ┌────────▼────────┐                             ┌────────▼────────┐
     │    PLAYER 1     │                             │    PLAYER 2     │
     │   AIM CONTROL   │                             │  SHOOT TRIGGER  │
     │   [ W A S D ]   │                             │  [ MOUSE CLICK  │
     │ Vector Crosshair│                             │  OR ESP32 IOT ] │
     └─────────────────┘                             └─────────────────┘
```

### 7-Minute Authoritative Story Progression
Every tournament match runs on an authoritative **7-minute (420 seconds)** server-synced clock. The game automatically escalates across three dynamic story chapters:

- The official clock starts after the on-screen countdown, not when the access code is verified. The game station requests fullscreen from the Start button and returns to normal view when the match ends. If the browser denies fullscreen, retry with the HUD toggle; press Esc if fullscreen does not exit at match end.
- The match clock updates continuously in the HUD. Shooting is supported by left-click/pointer input on the game canvas or the connected ESP32 trigger.

```
00:00                     02:00                     05:00                     07:00
  ├─── Chapter 1: EASY ──────┼── Chapter 2: MEDIUM ────┼──── Chapter 3: HARD ─────┤
  │    AI Awakening          │   Multimodal Resistance │    Quantum Matrix        │
  │    Speed: 1.44 - 2.56    │   Speed: 2.24 - 3.84    │    Speed: 3.2 - 5.44     │
  │    Base Score: 100 pts   │   Base Score: 130 pts   │    Base Score: 160 pts   │
  │    Combo Mult: 1.15x     │   Combo Mult: 1.25x     │    Combo Mult: 1.40x     │
```

- **Chapter 1: AI Awakening (0:00 – 2:00 | EASY)**: Autonomous reasoning models decouple from human supervision. Slow-moving baseline target drones allow teams to calibrate communication.
- **Chapter 2: Multimodal Resistance (2:00 – 5:00 | MEDIUM)**: Rogue vision and audio models execute erratic vector maneuvers and sudden speed bursts.
- **Chapter 3: Quantum Matrix Overdrive (5:00 – 7:00 | HARD)**: Frontier AI cores activate maximum evasive hyper-glitch trajectories. Demands millimeter-precision crosshair tracking.

### Dynamic Sensitivity Shifting Engine
Target movement is scaled down by 20% across all chapters. Player 1's reticle starts at maximum speed (100%) and randomly changes to a different tier after every target hit:

| Sensitivity Tier | Multiplier | Tactical Tag | On-Screen Visual Indicator |
| :--- | :--- | :--- | :--- |
| **LOW** | `50%` | `SLOW` | `#10b981` (Emerald Green Alert) |
| **MEDIUM** | `70%` | `STEADY` | `#06b6d4` (Cyan Alert) |
| **HIGH** | `85%` | `QUICK` | `#38bdf8` (Sky Blue Alert) |
| **MAX** | `100%` | `MAX` | `#f59e0b` (Amber Alert) |

### 25 Frontier AI Models Catalog
The game spawns **strictly ONE AI target at a time** into the upper combat airspace, cycling through 25 real-world AI industry models complete with brand colorways, vector glyphs, points, and speed characteristics:

| Model ID | Target Name | Organization / Lab | Brand Hex | Points | Speed Factor | Category |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `chatgpt` | **ChatGPT** | OpenAI | `#10a37f` | 120 | 1.15x | LLM & Reasoning |
| `gemini` | **Gemini** | Google | `#3b82f6` | 130 | 1.25x | Multimodal Frontier |
| `claude` | **Claude** | Anthropic | `#d97706` | 140 | 1.10x | Constitutional AI |
| `copilot` | **Microsoft Copilot** | Microsoft | `#0284c7` | 110 | 1.05x | Productivity Suite |
| `deepseek` | **DeepSeek** | DeepSeek | `#06b6d4` | 150 | 1.35x | Open-Weight Reasoning |
| `grok` | **Grok** | xAI | `#ffffff` | 135 | 1.20x | Real-Time Truth Engine |
| `llama` | **LLaMA** | Meta AI | `#0866ff` | 125 | 1.10x | Open Source Foundation |
| `mistral` | **Mistral** | Mistral AI | `#ea580c` | 130 | 1.25x | Frontier Efficient Models |
| `midjourney` | **Midjourney** | Midjourney Inc | `#ec4899` | 145 | 1.30x | Generative Aesthetics |
| `stable_diffusion` | **Stable Diffusion** | Stability AI | `#8b5cf6` | 120 | 1.15x | Latent Diffusion Core |
| `runway` | **Runway Gen-3** | Runway ML | `#14b8a6` | 140 | 1.20x | Video Synthesis |
| `sora` | **Sora** | OpenAI | `#6366f1` | 160 | 1.40x | World Simulators |
| `perplexity` | **Perplexity** | Perplexity AI | `#22c55e` | 115 | 1.05x | Real-Time Synthesis |
| `elevenlabs` | **ElevenLabs** | ElevenLabs | `#f43f5e` | 125 | 1.10x | Voice Neural Synthesis |
| `cursor` | **Cursor** | Anysphere | `#06b6d4` | 135 | 1.20x | AI-Native Development |
| `huggingface` | **Hugging Face** | Hugging Face | `#fbbf24` | 120 | 1.05x | Model Hub |
| *+ 9 more* | *Kling, Pika, Suno, Udio, Cohere, Qwen, DBRX, Falcon, Whisper* |

---

## 3. ESP32 Hardware Trigger System

The system includes native support for an **ESP32 Wi-Fi IoT Trigger Button**, giving Player 2 a physical arcade weapon button.

```
                     ┌───────────────────────────────────────┐
                     │          ESP32 NodeMCU / WROOM        │
                     │                                       │
                     │   [GPIO 4] ──────────┐                │
                     │                      │                │
                     │   [GND]    ────┐     │                │
                     └────────────────┼─────┼────────────────┘
                                      │     │
                                   ┌──┴─────┴──┐
                                   │  PHYSICAL │
                                   │  TRIGGER  │
                                   │  BUTTON   │
                                   │ (Arcade / │
                                   │  Switch)  │
                                   └───────────┘
```

### Hardware Schematic & Pinout
- **Microcontroller**: ESP32 NodeMCU / ESP-WROOM-32
- **Trigger Pin**: `GPIO 4` configured with internal pull-up (`INPUT_PULLUP`).
- **Ground Pin**: Any `GND` pin on the ESP32.
- **Button Type**: Normally-Open (NO) momentary pushbutton or microswitch arcade trigger.
- **Circuit Logic**: Pressing the button pulls `GPIO 4` to `LOW` (Active LOW).

### Firmware Architecture & WebSocket Protocol
The firmware (`firmware/esp32_trigger/esp32_trigger.ino`) operates as a self-contained Soft-AP:

1. **Standalone Wi-Fi Soft-AP**: Broadcasts SSID `ESP32-Trigger`. Game stations connect directly without needing campus Wi-Fi credentials.
2. **Dual-Server Engine**:
   - **Port 80 (HTTP)**: Serves diagnostic system health payload.
   - **Port 81 (WebSocket)**: Hosts `ws://192.168.4.1:81/`.
3. **Signal Conditioning**:
   - **Debounce Window**: `40 ms` to eliminate physical switch bounce.
   - **Shot Cooldown**: `400 ms` hardware throttle preventing spamming.
4. **Broadcast Payload**: Broadcasts UTF-8 plaintext string `"SHOOT"` to all connected clients.

```bash
# Compilation Build Flag (Arduino CLI / PlatformIO)
-DESP32_AP_PASSWORD=\"EventPassword2026\"
```

### Real-Time Frontend Telemetry & Diagnostics
The Game Station contains a live ESP32 status drawer:
- **WebSocket State**: Displays `CONNECTED`, `CONNECTING`, `DISCONNECTED`, or `ERROR` with live ping indicators.
- **Diagnostic Trigger Counter**: Increments on every physical trigger event.
- **Millisecond Timestamp**: Logs the exact arrival time of the last hardware packet.
- **Simulation Test Tool**: Built-in simulator allows organizers to test hitscan logic without physical hardware plugged in.

---

## 4. System Architecture & High-Level Flow

```
                                  ┌───────────────────────────────┐
                                  │   Public Event Password Gate  │
                                  │   (Optional Registration Gate)│
                                  └──────────────┬────────────────┘
                                                 │
                  ┌──────────────────────────────┴──────────────────────────────┐
                  │                                                             │
        ┌─────────▼─────────┐                                         ┌─────────▼─────────┐
        │ Team Registration │                                         │   Game Station    │
        │ • Camera ID Card  │                                         │ • Team ID & Secret│
        │ • Anti-Duplication│                                         │   Game Access Code│
        │ • ATS-XXXX Issuance                                         │ • 7-Min Clock Sync│
        │ • Secure Vault    │                                         │ • P1 WASD / P2 Clk│
        └─────────┬─────────┘                                         └─────────┬─────────┘
                  │                                                             │
                  │   REST /api/register                                        │   REST /api/game/session/*
                  │                                                             │   WS   ws://192.168.4.1:81/
                  └──────────────────────────────┬──────────────────────────────┘
                                                 │
                                  ┌──────────────▼──────────────┐
                                  │     Python Flask Core       │
                                  │ • Cryptographic Verification│
                                  │ • Anti-Cheat Telemetry Engine
                                  │ • Server-Sent Events (SSE)  │
                                  │ • SQLite WAL Data Layer     │
                                  └──────────────┬──────────────┘
                                                 │
                  ┌──────────────────────────────┴──────────────────────────────┐
                  │                                                             │
        ┌─────────▼─────────┐                                         ┌─────────▼─────────┐
        │ Projector Display │                                         │   Admin Console   │
        │ • High-Contrast UI│                                         │ • Queue Control   │
        │ • 30s Chime Timer │                                         │ • ID Card Review  │
        │ • Now Playing     │                                         │ • Match Rules Live│
        │ • SSE Real-Time   │                                         │ • Emergency Purge │
        └───────────────────┘                                         └───────────────────┘
```

---

## 5. Module Directory & Live Port Map

| Module Name | Access URL | Target Audience | Access Credentials | Primary Features |
| :--- | :--- | :--- | :--- | :--- |
| **Game Station** | [`http://localhost:5173/#/game`](http://localhost:5173/#/game) | Game Station Operators & Players | Team Code (`ATS-XXXX`) + Secret Code (`ATS-XXXX-XXXX`) | Authoritative 7-min match, 25 AI targets, WASD reticle, ESP32 status, anti-cheat telemetry submission. |
| **Team Registration** | [`http://localhost:5173/#/register`](http://localhost:5173/#/register) | Competing Students | Event Gate Password (if configured) | Camera live ID scan, dual participant validation, automatic queue ticket issuance. |
| **Projector Queue Display** | [`http://localhost:5173/#/queue`](http://localhost:5173/#/queue) | Auditorium Audience & Spectators | None (Public Screen) | 4K-ready spectator display, NOW PLAYING, CALLED team with 30s countdown, Web Audio chime alerts. |
| **Live Scoreboard** | [`http://localhost:5173/#/leaderboard`](http://localhost:5173/#/leaderboard) | Public Spectators | None (Public Screen) | Real-time standings via SSE, sanitized rankings, targets destroyed, official accuracy %, completion time. |
| **Admin Web Console** | [`http://localhost:5173/#/admin`](http://localhost:5173/#/admin) | Event Head & System Admins | Admin Username + Password | Real-time queue calls/skips/restores, authenticated ID card viewer, live configuration, CSV export, ID wipe. |
| **Admin CLI Terminal** | `start_admin_terminal.bat` | Server Engineers | Host Console Access | Interactive terminal for queue monitoring, instant test team generation, and scoreboard inspection. |

---

## 6. Anti-Cheat Engine & Telemetry Verification

Scores submitted by client browsers are **never trusted blindly**. The backend `AntiCheatEngine` (`teamnexus/backend/app/services/anti_cheat.py`) runs strict mathematical telemetry analysis before recording official standings:

```
                          Client Submits Match Telemetry
                                        │
                                        ▼
                   [ Rule 1: Non-Negative Values Check ]
                        score, hits, misses >= 0?
                                        │ Yes
                                        ▼
                   [ Rule 2: Conservation of Shots ]
                          hits <= total_shots?
                                        │ Yes
                                        ▼
                   [ Rule 3: Human Reaction Time Sanity ]
                  duration >= 5000ms for >5 hits/500pts?
                                        │ Yes
                                        ▼
                   [ Rule 4: Micro-Interval Bot Detection ]
                   delta between shots < 70ms anomalies <= 8?
                                        │ Yes
                                        ▼
                   [ Rule 5: Server-Side Accuracy Calculation ]
                      Accuracy = round((hits / shots) * 100, 1)
                                        │ Yes
                                        ▼
                   [ Rule 6: Theoretical Maximum Score Ceiling ]
                      score <= (hits * 800) + 1000 ceiling?
                                        │ Yes
                                        ▼
                      Official Game Result Recorded & Broadcast
```

1. **Shot Rate Anomaly Detection**: Analyzes the millisecond array (`shots_telemetry`). If more than 8 shots occur with intervals under `70 ms`, the submission is rejected as automated macro/bot tampering.
2. **Shot Conservation**: Hit count cannot exceed total shots fired.
3. **Server-Side Accuracy**: Browser-provided accuracy is discarded; the server recalculates accuracy directly from verified hits and misses.
4. **Theoretical Score Ceiling**: Dynamic formula checks that score does not exceed the mathematical maximum for base points, combo tiers, and chapter scaling.
5. **One-Time Session Tokens**: Cryptographic session tokens can only be completed once, preventing replay attacks.

---

## 7. Database Architecture & Schemas

### SQLite 3 High-Concurrency WAL Engine
The system uses SQLite 3 optimized for enterprise stability during sudden campus power fluctuations:
- **Write-Ahead Logging (WAL)**: `PRAGMA journal_mode = WAL;` allows simultaneous readers (leaderboard, projector, admin) while the game station writes results.
- **Foreign Keys**: `PRAGMA foreign_keys = ON;` ensures referential integrity across cascading deletes.
- **Relational Tables**:
  - `system_config`: Tournament parameters, active chapter duration, event passwords, tie-breaker policies.
  - `teams`: Team identifier, name, institution, queue rank, and status (`WAITING`, `CALLED`, `PRESENT`, `PLAYING`, `COMPLETED`, `SKIPPED`).
  - `participants`: Player 1 and Player 2 records, roles, phone numbers, roll numbers, and private vault image keys.
  - `access_credentials`: Hashed access codes (`credential_hash`), issuance and usage timestamps.
  - `game_sessions`: Session token, difficulty mode, config snapshot, start/end timestamps, raw shots.
  - `game_results`: Official verified scores, hits, misses, accuracy, combo stats, targets destroyed.
  - `queue_events`: Full audit trail of queue operations (`REGISTERED`, `CALLED`, `SKIPPED`, `RESTORED`).
  - `admin_users`: Scrypt-hashed admin credentials for dashboard access.
  - `audit_logs`: Detailed operational logging for security review.

### PostgreSQL / Supabase Production Schema
For Supabase setup, run the SQL Editor script in [`sql.md`](./sql.md). It defines the PostgreSQL schema, private-by-default table access, public-safe views, and ten test game access codes (`ATS-TEST-001` through `ATS-TEST-010`). Local development also seeds these codes into SQLite on backend startup. Running the Supabase script does not migrate the Flask backend: it currently connects to SQLite, so a PostgreSQL database-layer migration is still required before the live app uses Supabase.

---

## 8. REST API & Server-Sent Events (SSE) Reference

### Public & Registration Endpoints

#### `GET /api/event-auth/status`
Returns current event status, active match duration, and whether the registration gate is active.
```json
{
  "success": true,
  "event_name": "AI TARGET STRIKE 2026",
  "password_required": false,
  "registration_open": true,
  "event_active": true,
  "game_duration": 420,
  "difficulty": "MEDIUM"
}
```

#### `POST /api/register`
Registers a 2-player team with Base64 camera ID card scans.
```json
{
  "team_name": "CyberSentinels",
  "p1_name": "Sarah Connor",
  "p1_college": "Tech University",
  "p1_phone": "9876543210",
  "p1_roll": "CS-2026-001",
  "p1_id_image": "data:image/png;base64,...",
  "p2_name": "John Connor",
  "p2_college": "Tech University",
  "p2_phone": "9876543211",
  "p2_roll": "CS-2026-002",
  "p2_id_image": "data:image/png;base64,..."
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "team_code": "ATS-0042",
  "access_code": "ATS-8K9P-4X2M",
  "queue_number": 42,
  "message": "Team successfully registered."
}
```

### Game Station & Verification Endpoints

#### `POST /api/game-access/verify`
Authenticates a team at the Game Station and generates an authoritative match session token.
```json
{
  "team_code": "ATS-0042",
  "access_code": "ATS-8K9P-4X2M",
  "difficulty": "MEDIUM"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "session_token": "gs_8fa7d9e120...",
  "team_name": "CyberSentinels",
  "duration_seconds": 420
}
```

#### `POST /api/game/session/submit`
Submits final game telemetry for anti-cheat verification.
```json
{
  "session_token": "gs_8fa7d9e120...",
  "telemetry": {
    "score": 14250,
    "hits": 48,
    "misses": 8,
    "total_shots": 56,
    "best_combo": 14,
    "targets_destroyed": 48,
    "duration_ms": 420000,
    "shots_telemetry": [{"t": 1200, "x": 480, "y": 210, "hit": true, "source": "esp32"}]
  }
}
```

### Real-Time & Live Displays

#### `GET /api/queue/public`
Returns active queue state for projector screens (NOW PLAYING, CALLED, UPCOMING).

#### `GET /api/leaderboard`
Returns official sanitized tournament standings.

#### `GET /api/events/stream`
Server-Sent Events (SSE) persistent stream. Emits `queue_update` and `leaderboard_update` events immediately whenever match states transition.

---

## 9. Security, Privacy & Regulatory Compliance

1. **Zero-Knowledge Game Access Codes**: Raw access codes (`ATS-XXXX-XXXX`) are shown to teams once upon registration. The database stores only one-way cryptographic SHA-256 hashes (`credential_hash`).
2. **Private Document Vault**: Uploaded and camera-captured ID card images are placed in an isolated private vault directory (`secure_uploads/`) outside the public web root. Files cannot be accessed without an active JWT Admin session.
3. **Magic Byte File Inspection**: Reject disguised `.exe`, `.bat`, or `.sh` files by checking file header bytes (`\x89PNG`, `\xff\xd8\xff`, `RIFF....WEBP`).
4. **Public PII Sanitization**: Public queue and leaderboard endpoints strictly scrub phone numbers, roll numbers, and ID card references.
5. **Post-Event Compliance Purge**: Organizers can click **"Wipe All ID Cards"** in the Admin Console to permanently overwrite and unlink all participant ID scans while preserving the competition rankings.

---

## 10. Quick Start & Operator Guide

### Prerequisites
- **Operating System**: Windows 10/11, Ubuntu 20.04+, or macOS
- **Python**: Version `3.11+`
- **Node.js**: Version `18+` (Vite 5 / React 19)

### Configuration Setup
Copy the environment template before first startup:
```powershell
cp teamnexus/backend/.env.example teamnexus/backend/.env
```
Open `teamnexus/backend/.env` and configure your credentials:
```ini
FLASK_ENV=development
PORT=5000
SECRET_KEY=change_this_to_a_secure_random_string_in_production
JWT_SECRET_KEY=change_this_to_a_secure_jwt_key_in_production
JWT_EVENT_SECRET=change_this_to_a_secure_event_key_in_production
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=AdminSecurePassword2026!
REGISTRATION_GATE_PASSWORD=
```

---

### Option A: 1-Click Windows Launcher
Double-click `run_all.bat` in the project root:
```cmd
run_all.bat
```
*Automatically spawns both the Python Flask Backend (`:5000`) and the Vite Frontend (`:5173`) in independent terminal windows.*

---

### Option B: Node.js Dual Dev-Runner
Cross-platform single-command runner with unified colored logging:
```bash
npm run dev
# or
node dev-runner.mjs
```
*Automatically detects system Python or virtual environment and runs both servers simultaneously with graceful SIGINT shutdown handling.*

---

### Option C: Manual Terminal Launch

#### 1. Backend Terminal:
```powershell
# Set Python path to backend folder
$env:PYTHONPATH="teamnexus/backend"
python teamnexus/backend/run.py
```
*Backend runs on `http://localhost:5000`.*

#### 2. Frontend Terminal:
```bash
npm --prefix teamnexus/frontend run dev
```
*Frontend runs on `http://localhost:5173`.*

---

### Dedicated Admin CLI Terminal
Launch the lightweight interactive operator command terminal:
```cmd
start_admin_terminal.bat
# or
python teamnexus/backend/admin_terminal.py
```
Features:
- `[1]` Open Admin Web Console in default browser
- `[2]` View Registered Teams & Game Access Codes directly in console
- `[3]` View Official Tournament Scoreboard & Standings
- `[4]` View Live Event Queue & Called Teams
- `[5]` **Generate Instant Auto Test Team** (Creates a verified `ATS-XXXX` team with access code `ATS-2026-PLAY` for immediate gameplay testing)
- `[6]` Open Public Projector Queue (`/queue`)
- `[7]` Open Game Station (`/game`)

---

## 11. Automated Test Suites & Verification

### 1. ESP32 Hardware & Engine Integration Suite
Verifies WebSocket lifecycle, incoming plaintext `SHOOT` parsing, malformed message rejection, diagnostic counters, multi-source hitscan tracking (`keyboard`, `mouse`, `esp32`), and automatic difficulty progression:
```bash
node test_esp32_integration.mjs
```
*Expected result:*
```
ALL INTEGRATION & HARDWARE TESTS PASSED CLEANLY! (10/10)
```

### 2. Backend Anti-Cheat & System Unit Tests
Validates magic image byte filters, access code hashing, anti-cheat telemetry thresholds, and queue timeout auto-skipping:
```powershell
$env:PYTHONPATH="teamnexus/backend"
python -m pytest teamnexus/backend/tests/test_full_system.py teamnexus/backend/tests/test_anti_cheat_and_queue.py
```
*Expected result:*
```
12 passed in < 1.0s
```

### 3. Live Server & Reverse Proxy Integration Test
Tests end-to-end connectivity, token exchange, and CORS origin headers:
```bash
python test_live_server_integration.py
```

### 4. 100-Team Tournament Simulation
Simulates high-load registration of 100 teams, duplicate collision detection, queue dispatching, match completion, and tie-breaking:
```powershell
$env:INITIAL_ADMIN_PASSWORD="AdminSecurePassword2026!"
$env:PYTHONPATH="teamnexus/backend"
python teamnexus/backend/tests/event_simulation.py
```

---

## 12. Production Deployment & Reverse Proxy

For a complete Linux/Ubuntu production deployment using Gunicorn WSGI and Nginx reverse proxy with SSL/TLS (mandatory for WebRTC camera access outside localhost), refer to the detailed operator manual:

👉 **[DEPLOYMENT.md](file:///d:/2026event/DEPLOYMENT.md)**

Key production requirements:
- **HTTPS Certificate**: Required for browser `navigator.mediaDevices.getUserMedia` camera permissions outside `localhost`.
- **Nginx SSE Buffering**: Ensure `proxy_buffering off;` and `proxy_read_timeout 86400s;` are set on `/api/events/stream`.
- **Systemd Service**: Runs `gunicorn -w 4 -b 127.0.0.1:5000 "run:app"`.

---

## 13. Repository File Structure

```
d:/2026event/
├── .gitignore                          # Git ignore definitions
├── DEPLOYMENT.md                       # Comprehensive Linux production deployment manual
├── README.md                           # This complete documentation manual
├── create_auto_user.py                 # Standalone script to generate instant demo teams
├── dev-runner.mjs                      # Unified dual-server launcher (Flask + Vite)
├── index.html                          # Root redirector landing page for static previews
├── package.json                        # Root npm script runner definitions
├── powershell.bat                      # Convenience shortcut for PowerShell
├── run_all.bat                         # 1-Click Windows batch launcher
├── sql.md                              # Supabase / PostgreSQL enterprise database schema
├── start_admin_terminal.bat            # 1-Click Admin CLI Console launcher
├── test_esp32_integration.mjs          # 10-point automated hardware integration suite
├── test_live_server_integration.py     # Live server API integration test script
├── test_network.py                     # Network connectivity and proxy diagnostic test
│
├── firmware/                           # Embedded hardware systems
│   └── esp32_trigger/
│       └── esp32_trigger.ino           # ESP32 C++ firmware (SoftAP + WebSockets + Debounce)
│
├── img/                                # Visual assets and reference diagrams
│   ├── 49c40eb7-0a7f-4bdc-b620-540ca494397b.png
│   ├── claude.png
│   ├── deepseek.png
│   ├── gemini.jpg
│   ├── grok.jpg
│   └── meta.jpg
│
└── teamnexus/                          # Core application stack
    ├── backend/                        # Python Flask application
    │   ├── .env.example                # Template for environment secrets
    │   ├── admin_terminal.py           # Dedicated interactive CLI operator console
    │   ├── config.py                   # Central Flask configuration loader
    │   ├── requirements.txt            # Python dependencies specification
    │   ├── run.py                      # Flask entry point and runner
    │   ├── app/
    │   │   ├── __init__.py             # Flask application factory
    │   │   ├── routes/
    │   │   │   ├── admin_routes.py     # Admin authentication, queue, and config endpoints
    │   │   │   └── api_routes.py       # Public, registration, verification, SSE endpoints
    │   │   ├── services/
    │   │   │   ├── anti_cheat.py       # Telemetry anomaly & shot validation engine
    │   │   │   └── queue_manager.py    # Queue state transitions and auto-skip logic
    │   │   └── utils/
    │   │       ├── db.py               # Legacy database helpers
    │   │       ├── migrate_db.py       # Migration helper scripts
    │   │       └── sqlite_db.py        # SQLite WAL database initialization and connections
    │   └── tests/
    │       ├── event_simulation.py     # 100-team load simulation test
    │       ├── test_anti_cheat_and_queue.py # Telemetry & queue timeout unit tests
    │       └── test_full_system.py     # End-to-end integration test suite
    │
    └── frontend/                       # React 19 + Vite frontend
        ├── package.json                # Frontend npm dependencies and scripts
        ├── tailwind.config.js          # Tailwind CSS theme configuration
        ├── vite.config.js              # Vite server & backend API proxy configuration
        └── src/
            ├── App.jsx                 # Route definition & layout wrapper
            ├── components/
            │   ├── CameraIdCapture.jsx # Live camera ID card capture & file upload
            │   ├── EventPasswordGate.jsx # Protected event access gate wrapper
            │   └── Navbar.jsx          # Top navigation bar with live status indicators
            ├── game/
            │   ├── aiTargetsData.js    # 25 frontier AI target definitions & brand emblems
            │   └── engine.js           # 60 FPS HTML5 Canvas engine & hitscan pipeline
            ├── pages/
            │   ├── AdminDashboard.jsx  # Full administrator command center GUI
            │   ├── GameStation.jsx     # Official 2-player match arena & ESP32 panel
            │   ├── Leaderboard.jsx     # Live real-time tournament standings display
            │   ├── QueueDisplay.jsx    # Dedicated projector & auditorium display
            │   └── Registration.jsx    # Participant registration & camera capture portal
            ├── services/
            │   ├── api.js              # Frontend REST API client
            │   └── esp32Trigger.js     # WebSocket client & diagnostics for ESP32 hardware
            └── utils/
                └── sound.js            # Zero-dependency Web Audio API procedural synthesizer
```

---

## 14. Operator Troubleshooting & FAQ

#### Q1: A team reported to the station after being auto-skipped. How do I restore them?
> Open the **Admin Console** (`/admin`) or the **Admin CLI Terminal**. Under the **Live Event Queue**, locate the team in the "Skipped" list and click **"Restore"**. The team is returned to the active queue without losing their registered data or access code.

#### Q2: The camera capture is not opening on mobile or secondary laptops.
> Web browsers (Chrome, Safari, Firefox) **block camera access** on non-secure origins. Ensure you are either accessing over `localhost` or deploying behind an HTTPS certificate as detailed in [`DEPLOYMENT.md`](file:///d:/2026event/DEPLOYMENT.md).

#### Q3: The ESP32 trigger status shows "DISCONNECTED".
> 1. Check that the gaming terminal is connected to the ESP32's Wi-Fi network (`SSID: ESP32-Trigger`).
> 2. Verify that the URL in the Game Station hardware drawer is set to `ws://192.168.4.1:81/`.
> 3. Click **"Connect / Reconnect"** in the Game Station drawer.
> 4. If hardware is temporarily unavailable, Player 2 can shoot using **Left Mouse Click** without interrupting the competition.

#### Q4: How do I test the entire game immediately without registering a real team?
> Simply run `python create_auto_user.py` or choose option `[5]` in `start_admin_terminal.bat`. This immediately generates a verified team (e.g. `ATS-0001`) with the universal test access code `ATS-2026-PLAY`.

#### Q5: Can the game be paused if an emergency occurs?
> Yes. In the **Admin Dashboard**, click **Emergency Controls $\to$ Pause Event**. This halts timer countdowns and displays a tactical pause notice across all connected game stations.

---

### 🛡️ Tournament Integrity & Fair Play
*Designed and engineered for high-stakes competitive esports, institutional transparency, and zero-compromise technical event management.*
