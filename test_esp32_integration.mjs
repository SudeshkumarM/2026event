// ============================================================================
// Automated Unit & Integration Tests for ESP32 Hardware Trigger Service & Engine
// ============================================================================

import assert from 'node:assert';
import { TRIGGER_STATUS } from './teamnexus/frontend/src/services/esp32Trigger.js';

console.log('--- TEST SUITE: ESP32 Hardware Trigger Integration ---');

// Mock localStorage for Node environment
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

// Mock window for Node environment
global.window = {
  AudioContext: class {
    createOscillator() {
      return {
        type: '',
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
          linearRampToValueAtTime: () => {}
        },
        connect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {}
      };
    }
    get destination() { return {}; }
    get currentTime() { return 0; }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Mock WebSocket
class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    MockWebSocket.instances.push(this);
  }
  open() {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen();
  }
  sendServerMessage(data) {
    if (this.onmessage) this.onmessage({ data });
  }
  close(code = 1000) {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ code });
  }
  triggerError(err) {
    if (this.onerror) this.onerror(err);
  }
}
global.WebSocket = MockWebSocket;

// Import the service dynamically after mocking globals
const { esp32Service } = await import('./teamnexus/frontend/src/services/esp32Trigger.js');

// ----------------------------------------------------------------------------
// TEST 1: Initial state & Default URL
// ----------------------------------------------------------------------------
console.log('1. Testing Initial State & URL Configuration...');
assert.strictEqual(esp32Service.getUrl(), 'ws://192.168.4.1:81/');
assert.strictEqual(esp32Service.getESP32Status(), TRIGGER_STATUS.DISCONNECTED);
console.log('   ✓ Default URL is ws://192.168.4.1:81/ and status is DISCONNECTED');

// ----------------------------------------------------------------------------
// TEST 2: URL Normalization and LocalStorage Persistence
// ----------------------------------------------------------------------------
console.log('2. Testing URL Customization and Storage...');
esp32Service.setCustomUrl('192.168.1.100:81');
assert.strictEqual(esp32Service.getUrl(), 'ws://192.168.1.100:81/');
assert.strictEqual(global.localStorage.getItem('aitarget_esp32_ws_url'), 'ws://192.168.1.100:81/');

// Reset back to default
esp32Service.setCustomUrl('ws://192.168.4.1:81/');
assert.strictEqual(esp32Service.getUrl(), 'ws://192.168.4.1:81/');
console.log('   ✓ Custom URL formatted, persisted in localStorage, and retrievable');

// ----------------------------------------------------------------------------
// TEST 3: Connection Lifecycle (Connecting -> Connected)
// ----------------------------------------------------------------------------
console.log('3. Testing Connection Lifecycle...');
let statusUpdates = [];
const unsubStatus = esp32Service.subscribeToStatus((info) => {
  statusUpdates.push(info.status);
});

esp32Service.connectESP32();
assert.strictEqual(esp32Service.getESP32Status(), TRIGGER_STATUS.CONNECTING);
assert.ok(MockWebSocket.instances.length >= 1);
const activeSocket = MockWebSocket.instances[MockWebSocket.instances.length - 1];

// Trigger socket open event
activeSocket.open();
assert.strictEqual(esp32Service.getESP32Status(), TRIGGER_STATUS.CONNECTED);
console.log('   ✓ WebSocket transitions from CONNECTING to CONNECTED on open event');

// ----------------------------------------------------------------------------
// TEST 4: Incoming Plaintext SHOOT Message Processing
// ----------------------------------------------------------------------------
console.log('4. Testing Incoming Plaintext SHOOT Trigger Handling...');
let triggerEvents = [];
const unsubTrigger = esp32Service.subscribeToTrigger((event) => {
  triggerEvents.push(event);
});

// Send valid SHOOT with surrounding whitespace
activeSocket.sendServerMessage('  SHOOT\r\n');
assert.strictEqual(triggerEvents.length, 1);
assert.strictEqual(triggerEvents[0].type, 'shoot');
assert.strictEqual(triggerEvents[0].source, 'esp32');
assert.ok(typeof triggerEvents[0].receivedAt === 'number');

// Send exact SHOOT
activeSocket.sendServerMessage('SHOOT');
assert.strictEqual(triggerEvents.length, 2);
console.log('   ✓ Valid "SHOOT" plain text correctly parses and emits hardware shoot event');

// ----------------------------------------------------------------------------
// TEST 5: Ignoring Arbitrary / Malformed Messages
// ----------------------------------------------------------------------------
console.log('5. Testing Malformed & Arbitrary Message Rejection...');
activeSocket.sendServerMessage('SCORE_UPDATE');
activeSocket.sendServerMessage('{"action":"shoot"}');
activeSocket.sendServerMessage('');
activeSocket.sendServerMessage('SHOOT_EXTRA');
assert.strictEqual(triggerEvents.length, 2, 'Malformed messages must NOT trigger shooting');
console.log('   ✓ Ignored arbitrary text and JSON messages without emitting false trigger events');

// ----------------------------------------------------------------------------
// TEST 6: Diagnostic Counter and Reset Behavior
// ----------------------------------------------------------------------------
console.log('6. Testing Diagnostic Counter & Reset...');
assert.strictEqual(esp32Service.triggerCount, 2);
assert.ok(esp32Service.lastReceivedAt !== null);

esp32Service.resetDiagnostics();
assert.strictEqual(esp32Service.triggerCount, 0);
assert.strictEqual(esp32Service.lastReceivedAt, null);
console.log('   ✓ Diagnostic counter increments on event and resets without affecting game state');

// ----------------------------------------------------------------------------
// TEST 7: Simulate Hardware Trigger Method
// ----------------------------------------------------------------------------
console.log('7. Testing Simulated Trigger (Test Mode Support)...');
esp32Service.simulateTrigger();
assert.strictEqual(triggerEvents.length, 3);
assert.strictEqual(esp32Service.triggerCount, 1);
console.log('   ✓ Simulation triggers hardware callback cleanly for testing environments');

// ----------------------------------------------------------------------------
// TEST 8: Explicit Disconnect & Cleanup
// ----------------------------------------------------------------------------
console.log('8. Testing Explicit Disconnect and Subscription Unsubscribing...');
esp32Service.disconnectESP32();
assert.strictEqual(esp32Service.getESP32Status(), TRIGGER_STATUS.DISCONNECTED);
assert.strictEqual(esp32Service.isExplicitlyDisconnected, true);

unsubStatus();
unsubTrigger();
assert.strictEqual(esp32Service.triggerSubscribers.size, 0);
assert.strictEqual(esp32Service.statusSubscribers.size, 0);
console.log('   ✓ Explicit disconnect halts reconnects and unsubscribers cleanly remove listeners');

// ----------------------------------------------------------------------------
// TEST 9: Game Engine Shooting Source & Telemetry Verification
// ----------------------------------------------------------------------------
console.log('9. Testing Engine fireWeapon Integration & Source Tagging...');

// Mock Canvas and Audio
const mockCanvas = {
  width: 960,
  height: 540,
  getContext: () => ({
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fillText: () => {},
    measureText: () => ({ width: 50 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} })
  })
};

const { TargetStrikeEngine } = await import('./teamnexus/frontend/src/game/engine.js');

const engine = new TargetStrikeEngine(mockCanvas, {
  difficulty: 'MEDIUM',
  durationSeconds: 420
});
engine.isRunning = true;

// Verify initial state
assert.strictEqual(engine.totalShots, 0);
assert.strictEqual(engine.shotsTelemetry.length, 0);

// Fire via keyboard SPACE
engine.fireWeapon('keyboard');
assert.strictEqual(engine.totalShots, 1);
assert.strictEqual(engine.shotsTelemetry[0].source, 'keyboard');

// Advance time beyond 85ms debounce
engine.lastShotTime = 0;

// Fire via ESP32 Hardware Trigger
engine.fireWeapon('esp32');
assert.strictEqual(engine.totalShots, 2);
assert.strictEqual(engine.shotsTelemetry[1].source, 'esp32');

// Advance time beyond 85ms debounce
engine.lastShotTime = 0;

// Fire via Mouse Left Click (Primary Control)
engine.fireWeapon('mouse');
assert.strictEqual(engine.totalShots, 3);
assert.strictEqual(engine.shotsTelemetry[2].source, 'mouse');
console.log('   ✓ Engine records "keyboard", "esp32", and "mouse" shots through the identical single hitscan pipeline');

// ----------------------------------------------------------------------------
// TEST 10: Automatic Easy, Medium, and Hard Difficulty Schedule Progression
// ----------------------------------------------------------------------------
console.log('10. Testing Automatic Easy -> Medium -> Hard Progression Schedule...');
assert.strictEqual(engine.currentDifficulty, 'EASY');
assert.strictEqual(engine.diffConfig.name, 'EASY');

// Simulate 140s elapsed (Medium Stage: 120s - 300s)
engine.updateChapter(140);
assert.strictEqual(engine.currentDifficulty, 'MEDIUM');
assert.strictEqual(engine.diffConfig.name, 'MEDIUM');
assert.strictEqual(engine.totalShots, 3); // Shots & score preserved!

// Simulate 320s elapsed (Hard Stage: 300s - 420s)
engine.updateChapter(320);
assert.strictEqual(engine.currentDifficulty, 'HARD');
assert.strictEqual(engine.diffConfig.name, 'HARD');
assert.strictEqual(engine.totalShots, 3); // Shots & score preserved!

console.log('   ✓ Difficulty transitions automatically through Easy (0-2m), Medium (2-5m), and Hard (5-7m) preserving score and shots');

console.log('\n=======================================================');
console.log('ALL INTEGRATION & HARDWARE TESTS PASSED CLEANLY! (10/10)');
console.log('=======================================================\n');

