// ============================================================================
// TECNOX — AI DOWNFALL — ESP32 Hardware Trigger Integration Service
// WebSocket Client Bridge connecting ESP32 physical trigger to browser game
// ============================================================================

export const TRIGGER_STATUS = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR'
};

const DEFAULT_ESP32_WS_URL = 'ws://192.168.4.1:81/';
const STORAGE_KEY_URL = 'aitarget_esp32_ws_url';

class ESP32TriggerService {
  constructor() {
    this.socket = null;
    this.status = TRIGGER_STATUS.DISCONNECTED;
    this.url = this.getStoredUrl();
    this.isExplicitlyDisconnected = false;

    // Retry backoff state
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimeoutId = null;

    // Subscribers
    this.triggerSubscribers = new Set();
    this.statusSubscribers = new Set();
    this.lastReceivedAt = null;
    this.triggerCount = 0;
  }

  getStoredUrl() {
    try {
      return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_ESP32_WS_URL;
    } catch {
      return DEFAULT_ESP32_WS_URL;
    }
  }

  setCustomUrl(newUrl) {
    if (!newUrl || typeof newUrl !== 'string') return;
    let formatted = newUrl.trim();
    if (!formatted.startsWith('ws://') && !formatted.startsWith('wss://')) {
      formatted = `ws://${formatted}`;
    }
    // Remove trailing slash temporarily for port inspection
    if (formatted.endsWith('/')) {
      formatted = formatted.slice(0, -1);
    }
    // Check if port is specified after the host
    const urlWithoutProtocol = formatted.replace(/^wss?:\/\//, '');
    if (!urlWithoutProtocol.includes(':')) {
      // Auto-attach default ESP32 WebSocket port 81
      formatted = `${formatted}:81`;
    }
    formatted = `${formatted}/`;

    this.url = formatted;
    try {
      localStorage.setItem(STORAGE_KEY_URL, formatted);
    } catch {}

    // If currently connected or connecting or reconnecting, connect with new address
    this.connectESP32(this.url);
  }

  getUrl() {
    return this.url;
  }

  getESP32Status() {
    return this.status;
  }

  subscribeToTrigger(callback) {
    if (typeof callback !== 'function') return () => {};
    this.triggerSubscribers.add(callback);
    return () => {
      this.triggerSubscribers.delete(callback);
    };
  }

  subscribeToStatus(callback) {
    if (typeof callback !== 'function') return () => {};
    this.statusSubscribers.add(callback);
    // Immediately inform subscriber of current state
    try {
      callback({
        status: this.status,
        url: this.url,
        lastReceivedAt: this.lastReceivedAt,
        triggerCount: this.triggerCount
      });
    } catch (e) {
      console.warn('Status callback error:', e);
    }
    return () => {
      this.statusSubscribers.delete(callback);
    };
  }

  notifyStatus() {
    const payload = {
      status: this.status,
      url: this.url,
      lastReceivedAt: this.lastReceivedAt,
      triggerCount: this.triggerCount
    };
    for (const cb of this.statusSubscribers) {
      try {
        cb(payload);
      } catch (e) {
        console.warn('Status subscriber notification error:', e);
      }
    }
  }

  connectESP32(targetUrl = null) {
    if (targetUrl) {
      this.url = targetUrl;
      try {
        localStorage.setItem(STORAGE_KEY_URL, targetUrl);
      } catch {}
    }

    // Clear any pending reconnect timer
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.isExplicitlyDisconnected = false;

    // Prevent duplicate connections if already open or opening to same URL
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      if (this.socket.url === this.url) {
        return;
      }
      // If changing URL, close previous socket cleanly
      try {
        this.socket.close();
      } catch {}
    }

    this.status = TRIGGER_STATUS.CONNECTING;
    this.notifyStatus();

    try {
      const ws = new WebSocket(this.url);
      this.socket = ws;

      ws.onopen = () => {
        if (this.socket !== ws) return;
        this.status = TRIGGER_STATUS.CONNECTED;
        this.reconnectAttempts = 0; // Reset backoff on success
        this.notifyStatus();
        console.log(`[ESP32 Trigger] Connected successfully to ${this.url}`);
      };

      ws.onmessage = (event) => {
        if (this.socket !== ws) return;
        this.handleMessage(event);
      };

      ws.onerror = (err) => {
        if (this.socket !== ws) return;
        console.warn(`[ESP32 Trigger] Connection error on ${this.url}`);
        this.status = TRIGGER_STATUS.ERROR;
        this.notifyStatus();
      };

      ws.onclose = (event) => {
        if (this.socket !== ws) return;
        this.status = TRIGGER_STATUS.DISCONNECTED;
        this.notifyStatus();
        console.log(`[ESP32 Trigger] Socket closed (code: ${event.code})`);

        // Schedule reconnection with exponential backoff if not closed on purpose
        if (!this.isExplicitlyDisconnected) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.warn(`[ESP32 Trigger] Failed to construct WebSocket for ${this.url}:`, err);
      this.status = TRIGGER_STATUS.ERROR;
      this.notifyStatus();
      if (!this.isExplicitlyDisconnected) {
        this.scheduleReconnect();
      }
    }
  }

  handleMessage(event) {
    if (typeof event.data !== 'string') {
      return;
    }

    const command = event.data.trim();
    if (command === 'SHOOT') {
      const now = Date.now();
      this.lastReceivedAt = now;
      this.triggerCount++;

      const triggerEvent = {
        type: 'shoot',
        source: 'esp32',
        receivedAt: now
      };

      // Notify all trigger subscribers
      for (const cb of this.triggerSubscribers) {
        try {
          cb(triggerEvent);
        } catch (e) {
          console.warn('[ESP32 Trigger] Error in trigger subscriber:', e);
        }
      }

      this.notifyStatus();
    }
  }

  scheduleReconnect() {
    if (this.isExplicitlyDisconnected) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[ESP32 Trigger] Max reconnection attempts reached. Pausing retries.');
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff with jitter: min 1000ms, max 10000ms + 500ms random jitter
    const delay = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempts)) + Math.random() * 500;
    console.log(`[ESP32 Trigger] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      if (!this.isExplicitlyDisconnected) {
        this.connectESP32();
      }
    }, delay);
  }

  disconnectESP32() {
    this.isExplicitlyDisconnected = true;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }

    this.status = TRIGGER_STATUS.DISCONNECTED;
    this.notifyStatus();
    console.log('[ESP32 Trigger] Disconnected explicitly by operator.');
  }

  resetDiagnostics() {
    this.triggerCount = 0;
    this.lastReceivedAt = null;
    this.notifyStatus();
  }

  simulateTrigger() {
    this.handleMessage({ data: 'SHOOT' });
  }
}

// Singleton instance shared across components
export const esp32Service = new ESP32TriggerService();
