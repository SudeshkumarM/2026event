function resolveInitialBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    const { port, hostname } = window.location;
    // Use same-origin requests in development and when Flask serves the frontend.
    // Vite forwards /api requests to Flask, including when accessed over a LAN.
    if (port === '5173' || port === '5000') {
      return '/api';
    }
    // When running on Live Server (port 5500, 5501), static server (8000, 8080, 3000), or file preview
    // Route directly to the Flask backend server on port 5000
    const host = (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname) ? '127.0.0.1' : hostname;
    return `http://${host}:5000/api`;
  }
  return '/api';
}

let BASE_URL = resolveInitialBaseUrl();

class ApiService {
  getBaseUrl() {
    return BASE_URL;
  }

  setBaseUrl(newUrl) {
    BASE_URL = newUrl;
  }

  getAuthHeaders() {
    const headers = {};
    const adminToken = localStorage.getItem('aitarget_admin_token');
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }
    const eventPass = localStorage.getItem('aitarget_event_pass');
    if (eventPass) {
      headers['X-Event-Pass'] = eventPass;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    let url = `${BASE_URL}${endpoint}`;
    const headers = {
      ...this.getAuthHeaders(),
      ...(options.headers || {})
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (netErr) {
      // Live Server has no /api proxy; retry against the backend on this device.
      if (url.startsWith('/api') && typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        const fallbackUrl = `http://${window.location.hostname}:5000/api${endpoint}`;
        console.warn(`[API] Connection to ${url} failed. Retrying direct to backend ${fallbackUrl}`);
        BASE_URL = `http://${window.location.hostname}:5000/api`;
        response = await fetch(fallbackUrl, { ...options, headers });
      } else {
        throw netErr;
      }
    }

    // If server returned 404 HTML (e.g. static live server serving 404 HTML page for /api)
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok && (!contentType.includes('application/json') || response.status === 404)) {
      if (url.startsWith('/api') && typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        const fallbackUrl = `http://${window.location.hostname}:5000/api${endpoint}`;
        console.warn(`[API] Received non-JSON or 404 from ${url}. Retrying direct to backend ${fallbackUrl}`);
        BASE_URL = `http://${window.location.hostname}:5000/api`;
        response = await fetch(fallbackUrl, { ...options, headers });
      }
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}. Please ensure the backend service is running.`);
      }
      throw parseErr;
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`);
    }
    return data;
  }

  // --- EVENT PASSWORD GATE ---

  async getEventAuthStatus() {
    return this.request('/event-auth/status');
  }

  async verifyEventPassword(password) {
    const res = await this.request('/event-auth/verify', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    if (res.token) {
      localStorage.setItem('aitarget_event_pass', res.token);
    }
    return res;
  }

  hasEventPass() {
    return !!localStorage.getItem('aitarget_event_pass');
  }

  clearEventPass() {
    localStorage.removeItem('aitarget_event_pass');
  }

  // --- PUBLIC REGISTRATION & ACCESS ---

  async registerTeam(payload) {
    // payload can be FormData or JSON object
    const isFormData = payload instanceof FormData;
    return this.request('/register', {
      method: 'POST',
      body: isFormData ? payload : JSON.stringify(payload)
    });
  }

  async createAutoUser() {
    return this.request('/auto-user/create', {
      method: 'POST'
    });
  }

  async verifyGameAccess(teamCode, accessCode, difficulty = null) {
    return this.request('/game-access/verify', {
      method: 'POST',
      body: JSON.stringify({
        team_code: teamCode,
        access_code: accessCode,
        difficulty: difficulty
      })
    });
  }

  async getGameSessionStatus(sessionToken) {
    return this.request(`/game/session/status?session_token=${encodeURIComponent(sessionToken)}`);
  }

  async startGameSession(sessionToken) {
    return this.request('/game/session/start', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken })
    });
  }

  async getPublicQueue() {
    return this.request('/queue/public');
  }

  async getLeaderboard() {
    return this.request('/leaderboard');
  }

  async submitGameSession(telemetry) {
    try {
      const res = await this.request('/game/session/submit', {
        method: 'POST',
        body: JSON.stringify(telemetry)
      });
      return res;
    } catch (err) {
      console.warn("Network error during submission. Caching in offline retry queue...");
      const unsent = JSON.parse(localStorage.getItem('unsent_game_results') || '[]');
      unsent.push({ telemetry, timestamp: Date.now() });
      localStorage.setItem('unsent_game_results', JSON.stringify(unsent));
      throw err;
    }
  }

  async retryUnsentResults() {
    const unsent = JSON.parse(localStorage.getItem('unsent_game_results') || '[]');
    if (!unsent.length) return;

    const remaining = [];
    for (const item of unsent) {
      try {
        await this.request('/game/session/submit', {
          method: 'POST',
          body: JSON.stringify(item.telemetry)
        });
      } catch (err) {
        remaining.push(item);
      }
    }
    localStorage.setItem('unsent_game_results', JSON.stringify(remaining));
  }

  // --- ADMIN ENDPOINTS ---

  async adminLogin(username, password) {
    const res = await this.request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (res.token) {
      localStorage.setItem('aitarget_admin_token', res.token);
      localStorage.setItem('aitarget_admin_user', JSON.stringify(res.user));
    }
    return res;
  }

  adminLogout() {
    localStorage.removeItem('aitarget_admin_token');
    localStorage.removeItem('aitarget_admin_user');
  }

  isAdminLoggedIn() {
    return !!localStorage.getItem('aitarget_admin_token');
  }

  async getAdminStats() {
    return this.request('/admin/stats');
  }

  async callTeam(teamId, timeoutSeconds = 30) {
    return this.request('/admin/queue/call', {
      method: 'POST',
      body: JSON.stringify({ team_id: teamId, timeout_seconds: timeoutSeconds })
    });
  }

  async skipTeam(teamId, reason = 'Operator skip') {
    return this.request('/admin/queue/skip', {
      method: 'POST',
      body: JSON.stringify({ team_id: teamId, reason })
    });
  }

  async restoreTeam(teamId) {
    return this.request('/admin/queue/restore', {
      method: 'POST',
      body: JSON.stringify({ team_id: teamId })
    });
  }

  async markPresent(teamId) {
    return this.request('/admin/queue/mark-present', {
      method: 'POST',
      body: JSON.stringify({ team_id: teamId })
    });
  }

  async getAllTeams(search = '', status = '') {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    return this.request(`/admin/teams?${params.toString()}`);
  }

  async deleteTeam(teamId) {
    return this.request(`/admin/teams/${teamId}`, {
      method: 'DELETE'
    });
  }

  async resetTeamAccessCode(teamId) {
    return this.request(`/admin/teams/${teamId}/reset-access-code`, {
      method: 'POST'
    });
  }

  async revokeTeamAccessCode(teamId) {
    return this.request(`/admin/teams/${teamId}/revoke-access-code`, {
      method: 'POST'
    });
  }

  async changeAdminPassword(currentPassword, newPassword, confirmPassword) {
    return this.request('/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
    });
  }

  getIdCardUrl(filename) {
    const token = localStorage.getItem('aitarget_admin_token');
    return `${BASE_URL}/admin/id-card/${filename}?token=${token}`;
  }

  async purgeAllIdCards() {
    return this.request('/admin/id-card/purge-all', {
      method: 'POST'
    });
  }

  async getAdminConfig() {
    return this.request('/admin/config');
  }

  async updateAdminConfig(config) {
    return this.request('/admin/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  }

  async emergencyAction(action, payload = {}) {
    return this.request(`/admin/emergency/${action}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  getExportCsvUrl() {
    const token = localStorage.getItem('aitarget_admin_token');
    return `${BASE_URL}/admin/export/csv?token=${token}`;
  }

  getStreamUrl() {
    return `${BASE_URL}/events/stream`;
  }
}

export const api = new ApiService();
