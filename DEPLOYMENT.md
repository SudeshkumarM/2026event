# AI TARGET STRIKE — Production Deployment & Operator Manual

**AI TARGET STRIKE** is a 2-player competitive event system with camera college ID capture, cryptographic game access codes, authoritative 7-minute match timing, story-based multi-target combat, live leaderboard, projector queue display, and a protected admin command console.

---

## 1. System Architecture Overview

```
                          ┌───────────────────────────────┐
                          │   Public Event Password Gate  │
                          │   (Configurable by Organizer) │
                          └──────────────┬────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
       ┌─────────▼─────────┐                           ┌─────────▼─────────┐
       │ Team Registration │                           │   Game Station    │
       │  • Camera ID Card │                           │ • Team ID & Secret│
       │  • Form Validation│                           │   Game Access Code│
       │  • Cryptographic  │                           │ • 7-Min Countdown │
       │    ATS-XXXX Code  │                           │ • P1 WASD / P2 SPC│
       └─────────┬─────────┘                           └─────────┬─────────┘
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         │ REST API & Server-Sent Events
                                         │
                          ┌──────────────▼──────────────┐
                          │      Python Core Engine     │
                          │  • SHA-256 Access Hashing   │
                          │  • Anti-Cheat Telemetry     │
                          │  • Authoritative Timer Sync │
                          │  • SQLite WAL Mode Concurrency│
                          └──────────────┬──────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
       ┌─────────▼─────────┐                           ┌─────────▼─────────┐
       │  Live Scoreboard  │                           │  Admin Console    │
       │  • Sanitized Rank │                           │  • Separate Auth  │
       │  • Score / Acc %  │                           │  • ID Card Review │
       │  • Real-Time Sync │                           │  • Queue Control  │
       └───────────────────┘                           └───────────────────┘
```

---

## 2. Quick Start for Event Operators (Local Host)

### Option A: One-Click Event Launcher
Double-click `run_all.bat` in the root project folder. It launches:
- **Flask Core Server**: `http://localhost:5000`
- **React Frontend**: `http://localhost:5173`

### Option B: Terminal Launch
1. **Start Backend**:
   ```powershell
   $env:PYTHONPATH="teamnexus/backend"
   python teamnexus/backend/run.py
   ```
2. **Start Frontend**:
   ```bash
   npm --prefix teamnexus/frontend run dev
   ```

---

## 3. URLs and Port Map

| Component | Default URL | Purpose | Access Control |
|---|---|---|---|
| **Game Station** | `http://localhost:5173/game` | 2-player match arena (7 mins) | Team ID & Access Code |
| **Registration** | `http://localhost:5173/register` | Team sign-up with camera ID capture | Event Password (if enabled) |
| **Live Queue** | `http://localhost:5173/queue` | Projector & TV spectator display | Public |
| **Scoreboard** | `http://localhost:5173/leaderboard` | Live verified rankings | Public (Sanitized) |
| **Admin Console** | `http://localhost:5173/admin` | Full event operation & configuration | Admin Username & Password |

---

## 4. Initial Admin and Event Credentials

Set `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD` before the first
database initialization. The initial admin account is created only if that
username does not already exist. Set `REGISTRATION_GATE_PASSWORD` only when a
registration gate is required.

---

## 5. Production Server Deployment

### System Requirements
- OS: Ubuntu 22.04 LTS, Debian 12, or Windows Server 2022
- Python: 3.11+
- Node.js: 18+ LTS
- Reverse Proxy: Nginx or Caddy
- SSL/TLS Certificate (Required for camera `getUserMedia` outside localhost)

### Step 1: Environment Configuration
Create `teamnexus/backend/.env`:
```ini
FLASK_ENV=production
PORT=5000
SECRET_KEY=<unique-random-secret>
JWT_SECRET_KEY=<unique-random-secret>
JWT_EVENT_SECRET=<unique-random-secret>
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=<unique-admin-password>
REGISTRATION_GATE_PASSWORD=<optional-event-gate-password>
DATABASE_FILE=/var/lib/aitargetstrike/aitargetstrike.db
UPLOAD_FOLDER=/var/lib/aitargetstrike/secure_uploads
MAX_UPLOAD_SIZE_BYTES=5242880
```

Generate each signing key with a cryptographically secure random generator.
Never commit `.env` or use the same secrets across deployments. Without
explicitly configured signing keys, a random process-local key is generated;
tokens will be invalidated whenever that process restarts.

Create `teamnexus/frontend/.env.production`:
```ini
VITE_API_BASE_URL=https://event.yourdomain.com/api
```

For ESP32 firmware, define `ESP32_AP_PASSWORD` as a build flag before
compilation. The firmware intentionally fails to compile without it.

### Step 2: Database Initialization & Migrations
```bash
cd teamnexus/backend
python -c "from app.utils.sqlite_db import init_db; init_db()"
```

### Step 3: Frontend Production Build
```bash
cd teamnexus/frontend
npm install
npm run build
```
The optimized production bundle is generated in `teamnexus/frontend/dist/`.

### Step 4: Gunicorn Production WSGI Service
Create `/etc/systemd/system/aitargetstrike.service`:
```ini
[Unit]
Description=AI TARGET STRIKE Backend Engine
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/aitargetstrike/teamnexus/backend
Environment="PYTHONPATH=/opt/aitargetstrike/teamnexus/backend"
ExecStart=/opt/aitargetstrike/teamnexus/backend/venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 "run:app"
Restart=always

[Install]
WantedBy=multi-user.target
```

### Step 5: Nginx Reverse Proxy with HTTPS & Camera Support
*Browser security rules strictly require HTTPS for camera (`getUserMedia`) access on non-localhost domains.*

Create `/etc/nginx/sites-available/aitargetstrike`:
```nginx
server {
    listen 80;
    server_name event.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name event.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/event.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/event.yourdomain.com/privkey.pem;

    # Frontend Single Page App
    root /opt/aitargetstrike/teamnexus/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API & SSE streaming
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for real-time Server-Sent Events
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # Camera permissions policy header
    add_header Permissions-Policy "camera=(self)";
}
```

---

## 6. Security & Privacy Guarantees

1. **Mandatory ID Card Isolation**:
   ID card images and photos are stored in a private vault (`UPLOAD_FOLDER`) outside the web root. They are NEVER served without a valid JWT admin token.
2. **Access Code Hashing**:
   Raw game access codes (`ATS-XXXX-XXXX`) are shown to teams once upon registration. The server stores only SHA-256 hashes in `access_credentials`.
3. **Timer Authority**:
   Official 7-minute duration is enforced server-side. Browser refreshes cannot reset or manipulate the timer.
4. **Leaderboard Sanitization**:
   The public standings endpoint excludes roll numbers, phone numbers, ID cards, access credentials, and audit logs.
5. **Post-Event Compliance Purge**:
   Administrators can click "Wipe All ID Cards" in Emergency Controls to permanently delete all ID card scans while keeping competition rankings intact.

---

## 7. Automated Test Suite Execution

Run all verification tests:
```powershell
$env:PYTHONPATH="teamnexus/backend"
teamnexus\backend\venv\Scripts\python.exe -m pytest teamnexus/backend/tests/test_full_system.py teamnexus/backend/tests/test_anti_cheat_and_queue.py
```
Expected output:
```
25 passed in < 8.0s
```

---

## 8. Multi-Device Local Area Network (LAN) & Mobile Hotspot Hosting

### Overview
You can host **AI TARGET STRIKE** on a single Host Laptop and connect other laptops (e.g., Laptop 2, Laptop 3) and mobile phones (iOS/Android) over the same Wi-Fi router or mobile phone hotspot.

```
       ┌────────────────────────────────────────────────────────┐
       │                   HOST LAPTOP                          │
       │  • Flask API (0.0.0.0:5000)                            │
       │  • Vite Frontend (0.0.0.0:5173)                        │
       │  • SQLite Database (isolated sessions per team)        │
       └───────────────────────────┬────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      │                            │                            │
┌─────▼──────┐              ┌──────▼─────┐               ┌──────▼─────┐
│  Laptop 2  │              │  Laptop 3  │               │   Phone    │
│  Browser   │              │  Browser   │               │  Browser   │
└────────────┘              └────────────┘               └────────────┘
```

---

### Step 1: Start the Servers on the Host Laptop

From the root project directory:
```powershell
# Standard HTTP Mode (Recommended for ESP32 hardware trigger):
npm run dev

# OR Secure HTTPS Mode (Required for mobile camera access over LAN):
npm run dev:https
```

Both the Flask backend (port 5000) and Vite frontend (port 5173) will start and listen on all network interfaces (`0.0.0.0`).

---

### Step 2: Find the Host Laptop's IPv4 Address

1. Open PowerShell or Command Prompt on the Host Laptop:
   ```powershell
   ipconfig
   ```
2. Look for the active network adapter:
   - If connected via Wi-Fi: Look under **Wireless LAN adapter Wi-Fi** -> `IPv4 Address` (e.g., `192.168.1.45` or `172.20.10.2`).
   - If hosting a Mobile Hotspot: Look under the corresponding adapter IPv4 address.
3. Note this IP: `<HOST_LAPTOP_IP>`.

---

### Step 3: Accessing from Other Devices

Ensure the other laptops and mobile phones are connected to the exact same Wi-Fi network or mobile hotspot.

#### From Laptop 2 & Laptop 3:
Open Google Chrome, Edge, or Firefox and navigate to:
```
http://<HOST_LAPTOP_IP>:5173
```
*(If running in HTTPS mode, navigate to `https://<HOST_LAPTOP_IP>:5173` and click "Advanced -> Proceed" to accept the local dev SSL certificate).*

#### From Mobile Phones (Android / iOS):
Connect the phone to the same Wi-Fi or hotspot. Open Chrome or Safari:
```
http://<HOST_LAPTOP_IP>:5173
```

All API requests are proxied seamlessly from port 5173 to backend port 5000 without requiring remote devices to access the backend directly.

---

### Step 4: Camera Access for Remote Devices (Registration Page)

Modern mobile and desktop browsers restrict `navigator.mediaDevices.getUserMedia()` to **Secure Contexts** (`localhost` or `HTTPS`).

To enable camera ID scanning from remote devices:

#### Option A: Run in HTTPS Mode (Recommended for Camera)
1. Launch the server with:
   ```powershell
   npm run dev:https
   ```
2. On connected devices, visit `https://<HOST_LAPTOP_IP>:5173`.
3. Accept the development SSL certificate prompt once.
4. The live camera feed and capture button will function normally.

> **Important ESP32 Note**: If using an ESP32 physical trigger communicating over `ws://192.168.4.1:81/`, browsers enforce mixed-content blocking on HTTPS pages. For competition matches using the physical ESP32 gun on the Host Laptop, run standard HTTP mode (`npm run dev`).

#### Option B: Enable Insecure Origin Flag in Chrome / Edge
If running over plain HTTP (`http://<HOST_LAPTOP_IP>:5173`):
1. On the client device browser, navigate to:
   ```
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
2. Enable the flag and enter: `http://<HOST_LAPTOP_IP>:5173`
3. Relaunch the browser. Camera permissions will be enabled for that origin.

#### Option C: Direct Photo Upload Fallback
The Registration page includes a direct file upload fallback: **"Upload Photo / ID Card Instead"**. Users can take a photo with their native camera app and upload it directly.

---

### Step 5: Troubleshooting Connectivity & Windows Firewall

If client devices cannot load `http://<HOST_LAPTOP_IP>:5173`:

1. **Verify Windows Network Profile**:
   Ensure your Wi-Fi network profile is set to **Private** on the Host Laptop:
   - *Windows Settings -> Network & internet -> Wi-Fi -> Manage known networks -> Select your Wi-Fi -> Network profile type -> **Private**.*

2. **Allow Ports in Windows Firewall**:
   Open PowerShell as Administrator on the Host Laptop and run:
   ```powershell
   New-NetFirewallRule -DisplayName "AI Target Strike Vite (5173)" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "AI Target Strike Flask (5000)" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -Profile Private
   ```

3. **Check Router / Hotspot Client Isolation (AP Isolation)**:
   - Some public or corporate Wi-Fi routers enable "AP Isolation" or "Guest Isolation", blocking communication between wireless clients.
   - If devices cannot ping each other, switch to a mobile phone hotspot where client-to-client traffic is permitted.

4. **Confirm the Server is Bound to 0.0.0.0**:
   ```powershell
   netstat -ano | findstr 5173
   ```
   Output should show `0.0.0.0:5173` in `LISTENING` state.

5. **Multiplayer Session Isolation**:
   - Each browser session operates with independent team access credentials, targets, and scoring.
   - One participant's actions or shots never leak into or alter another participant's game session.

