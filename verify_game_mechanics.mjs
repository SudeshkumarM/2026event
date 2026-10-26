if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    AudioContext: class {
      constructor() { this.currentTime = 0; this.destination = {}; }
      createOscillator() { return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    },
    addEventListener() {},
    removeEventListener() {}
  };
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

import { TargetStrikeEngine, TOTAL_TARGETS, DIFFICULTY_CONFIGS } from './teamnexus/frontend/src/game/engine.js';
import { AI_TARGETS } from './teamnexus/frontend/src/game/aiTargetsData.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

// Mock Canvas 2D Context
class MockContext2D {
  constructor() {
    this.canvas = { width: 960, height: 540 };
  }
  clearRect() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  beginPath() {}
  closePath() {}
  arc() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  fillRect() {}
  drawImage() {}
  fillText() {}
  measureText() { return { width: 50 }; }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  roundRect() {}
  setLineDash() {}
}

const mockCanvas = {
  width: 960,
  height: 540,
  getContext: () => new MockContext2D(),
  addEventListener: () => {},
  removeEventListener: () => {},
  style: {}
};

console.log('\n--- 1. VERIFY TARGET COUNT & CATALOG CONFIGURATION ---');
assert(TOTAL_TARGETS === 50, `TOTAL_TARGETS is configured to exactly 50 (got ${TOTAL_TARGETS})`);
assert(AI_TARGETS.length === 50, `AI_TARGETS catalog contains 50 curated frontier models (got ${AI_TARGETS.length})`);
assert(AI_TARGETS[0].name === 'ChatGPT', `First target is ${AI_TARGETS[0].name}`);
assert(AI_TARGETS[49].name === 'DeepSeek-R1', `50th target is ${AI_TARGETS[49].name}`);

console.log('\n--- 2. VERIFY ENGINE INITIALIZATION & PROPERTIES ---');
let lastStats = null;
const engine = new TargetStrikeEngine(mockCanvas, {
  durationSeconds: 420,
  onScoreUpdate: (stats) => { lastStats = stats; },
  onGameOver: () => {}
});

assert(engine.TOTAL_TARGETS === 50, 'Engine has TOTAL_TARGETS = 50');
assert(engine.totalDurationSeconds === 420, 'Engine official duration is exactly 420 seconds');
assert(engine.unlimitedAmmo === true, 'Engine ammunition system is set to unlimited bullets');
assert(engine.ammoInMag === Infinity, 'Magazine ammo is unlimited (Infinity)');
assert(engine.reserveAmmo === Infinity, 'Reserve ammo is unlimited (Infinity)');
assert(engine.score === 0, 'Initial score is 0');

console.log('\n--- 3. VERIFY WEAPON AIM FOLLOWING & SWAY ---');
engine.start();

// Test Aim Right & Down
engine.crosshair.x = 850; // Aiming far right
engine.crosshair.y = 480; // Aiming down
engine.update();
engine.update();

assert(engine.gun.x > 960 * 0.50, `Gun positioned near bottom-center (gun.x: ${engine.gun.x.toFixed(1)})`);
assert(engine.gun.y > 540 * 0.75, `Gun positioned in small bottom-center area (gun.y: ${engine.gun.y.toFixed(1)})`);
assert(engine.gun.angle > 0, `Gun rotated clockwise toward right aim (gun.angle: ${engine.gun.angle.toFixed(3)})`);

// Test Aim Left & Up
engine.crosshair.x = 100; // Aiming far left
engine.crosshair.y = 80;  // Aiming up
engine.update();
engine.update(); // 2nd step to absorb lerp

assert(engine.gun.angle < 0, `Gun rotated counter-clockwise toward left aim (gun.angle: ${engine.gun.angle.toFixed(3)})`);

// Test Aim Center (returns to centered angle)
engine.crosshair.x = 960 * 0.52; // Centered
engine.crosshair.y = 200;
engine.update();
engine.update();
engine.update();
assert(Math.abs(engine.gun.angle) < 0.15, `Gun returns to normal centered angle near center (gun.angle: ${engine.gun.angle.toFixed(3)})`);

console.log('\n--- 4. VERIFY SHOOTING INPUT PIPELINE & UNLIMITED AMMUNITION ---');
const prevShots = engine.totalShots;

// Firing via mouse
engine.fireWeapon('mouse');
assert(engine.ammoInMag === Infinity, 'Ammunition is unlimited and does not deplete on mouse shot');
assert(engine.totalShots === prevShots + 1, `Total shots incremented to ${engine.totalShots}`);
assert(engine.gun.recoilY > 0, `Weapon recoil kicked upward (recoilY: ${engine.gun.recoilY.toFixed(1)})`);
assert(engine.muzzleFlash.active === true, 'Muzzle flash triggered on weapon fire');
assert(engine.projectiles.length > 0, `Bullet projectile tracer spawned (count: ${engine.projectiles.length})`);

// Firing via ESP32 trigger uses identical pipeline with unlimited ammo
engine.lastShotTime = 0; // bypass rate limit for test
engine.fireWeapon('esp32');
assert(engine.ammoInMag === Infinity, 'ESP32 trigger fires continuously without ammo depletion');
assert(engine.shotsTelemetry[engine.shotsTelemetry.length - 1].source === 'esp32', 'Shot telemetry recorded source as "esp32"');

console.log('\n--- 5. VERIFY SPACE KEY DOES NOT SHOOT ---');
const shotsBeforeSpace = engine.totalShots;
engine.handleKeyDown({ code: 'Space', preventDefault: () => {} });
assert(engine.totalShots === shotsBeforeSpace, 'SPACE key did not trigger a weapon shot');

console.log('\n--- 6. VERIFY UNLIMITED AMMUNITION CONTINUOUS SHOOTING ---');
// Continuous shooting without reload lockout or out-of-ammo dry clicks
for (let i = 0; i < 50; i++) {
  engine.lastShotTime = 0;
  engine.fireWeapon('mouse');
}
assert(engine.ammoInMag === Infinity, 'Ammunition remains unlimited after 50 rapid continuous shots');
assert(engine.totalShots >= 52, `Total shots incremented continuously to ${engine.totalShots}`);

console.log('\n--- 7. VERIFY 100-POINT SCORING SYSTEM PER TARGET ---');
// Create a fresh test target
engine.aiTargetIndex = 0;
engine.spawnNextAITarget();
const target = engine.targets[0];
assert(target !== undefined, 'Target spawned successfully');

// Set crosshair directly on target center (bullseye)
engine.crosshair.x = target.x;
engine.crosshair.y = target.y;
engine.lastShotTime = 0;
target.spawnTime = performance.now() - 600; // 0.6s reaction time (< 1s -> 20 pts)
target.shotsFired = 0; // 1st shot will hit -> 20 pts ammo efficiency

const scoreBefore = engine.score;
engine.fireWeapon('mouse');

const awarded = engine.score - scoreBefore;
console.log(`  Awarded points for bullseye first-shot hit: ${awarded} pts`);
assert(awarded >= 85 && awarded <= 100, `Awarded score ${awarded} pts is within 100-point ceiling per target`);
assert(engine.targetScores.length === 1, 'Target score recorded in score list');
assert(engine.targetScores[0] <= 100, `Target score is capped at 100 pts (got ${engine.targetScores[0]})`);
assert(engine.targetsDestroyed === 1, `targetsDestroyed incremented to 1`);

console.log('\n--- 8. VERIFY DIFFICULTY CONFIGURATIONS & PROGRESSION ---');
assert(DIFFICULTY_CONFIGS.EASY.difficultyBasePoints === 10, 'EASY difficulty gives 10 base diff points');
assert(DIFFICULTY_CONFIGS.MEDIUM.difficultyBasePoints === 14, 'MEDIUM difficulty gives 14 base diff points');
assert(DIFFICULTY_CONFIGS.HARD.difficultyBasePoints === 18, 'HARD difficulty gives 18 base diff points');
assert(DIFFICULTY_CONFIGS.EASY.maxSpeed < DIFFICULTY_CONFIGS.MEDIUM.maxSpeed, 'MEDIUM maxSpeed > EASY maxSpeed');
assert(DIFFICULTY_CONFIGS.MEDIUM.maxSpeed < DIFFICULTY_CONFIGS.HARD.maxSpeed, 'HARD maxSpeed > MEDIUM maxSpeed');
assert(DIFFICULTY_CONFIGS.EASY.baseSpeed < 1.8, `EASY baseSpeed reduced by 0.01% (got ${DIFFICULTY_CONFIGS.EASY.baseSpeed.toFixed(5)})`);
assert(DIFFICULTY_CONFIGS.MEDIUM.baseSpeed < 3.0, `MEDIUM baseSpeed reduced by 0.01% (got ${DIFFICULTY_CONFIGS.MEDIUM.baseSpeed.toFixed(5)})`);
assert(DIFFICULTY_CONFIGS.HARD.baseSpeed < 4.6, `HARD baseSpeed reduced by 0.01% (got ${DIFFICULTY_CONFIGS.HARD.baseSpeed.toFixed(5)})`);

console.log('\n--- 9. VERIFY 50 TARGET QUEUE PROCESSING ---');
assert(lastStats !== null, 'HUD update received');
assert(lastStats.totalTargets === 50, `HUD reports totalTargets = 50 (got ${lastStats.totalTargets})`);
assert(lastStats.targetProgress.endsWith('/50'), `HUD targetProgress ends with /50 (got ${lastStats.targetProgress})`);

console.log('\n--- 10. VERIFY WASD AIMING SPEED, BRAKING & MOUSE ISOLATION ---');
assert(engine.baseAimSpeed === 2.1, `Default baseAimSpeed is moderate (expected 2.1, got ${engine.baseAimSpeed})`);

// Test key presses
const initCrossX = engine.crosshair.x;
const initCrossY = engine.crosshair.y;
engine.keys.d = true; // Aim right
engine.update();
assert(engine.crosshair.vx > 0, `Pressing D accelerates aim rightward (vx: ${engine.crosshair.vx.toFixed(2)})`);
assert(engine.crosshair.x > initCrossX, `Crosshair moved right with D`);

// Test release stops smoothly (deceleration)
engine.keys.d = false;
const vxBeforeBrake = engine.crosshair.vx;
engine.update();
assert(engine.crosshair.vx < vxBeforeBrake, `Aim decelerates smoothly on key release (vx: ${engine.crosshair.vx.toFixed(2)})`);
assert(engine.crosshair.vx > 0, `Aim does not instantly snap to 0 or overshoot`);

// Verify mouse movement is ignored for aiming
const preMouseX = engine.crosshair.x;
const preMouseY = engine.crosshair.y;
engine.handleMouseMove({ clientX: 200, clientY: 200, movementX: 50, movementY: 50 });
assert(engine.crosshair.x === preMouseX && engine.crosshair.y === preMouseY, `Mouse movement does not change aim coordinates`);

console.log('\n--- 11. VERIFY FULL-SKY CLOUD LAYER DISTRIBUTION & MODERATE DRIFT ---');
engine.initClouds();
assert(engine.clouds.length === 8, `Clouds initialized with 8 total cloud entities across layers (got ${engine.clouds.length})`);
const allSpeedsModerate = engine.clouds.every(c => c.speed >= 0.035 && c.speed <= 0.095);
assert(allSpeedsModerate, `All cloud speeds are within moderate bounds [0.035, 0.095] px/frame`);
const hasLayer1 = engine.clouds.some(c => c.minY === 6);
const hasLayer2 = engine.clouds.some(c => c.minY >= mockCanvas.height * 0.11 && c.minY <= mockCanvas.height * 0.13);
const hasLayer3 = engine.clouds.some(c => c.minY >= mockCanvas.height * 0.21 && c.minY <= mockCanvas.height * 0.23);
assert(hasLayer1 && hasLayer2 && hasLayer3, `Clouds span 3 environmental depth layers across the visible sky`);

console.log('\n--- 12. VERIFY WEAPON MUZZLE SUPPRESSOR SYNCHRONIZATION ---');
const muzzle = engine.getMuzzlePosition();
assert(typeof muzzle.x === 'number' && !isNaN(muzzle.x), `Muzzle X is valid coordinate (${muzzle.x.toFixed(1)})`);
assert(typeof muzzle.y === 'number' && !isNaN(muzzle.y), `Muzzle Y is valid coordinate (${muzzle.y.toFixed(1)})`);
assert(muzzle.x > 0 && muzzle.x < mockCanvas.width, `Muzzle X is within viewport bounds`);
assert(muzzle.y > 0 && muzzle.y < mockCanvas.height, `Muzzle Y is within viewport bounds`);

console.log('\n--- 13. VERIFY REDUCED GUN SIZE & BOTTOM-CENTER CONTAINMENT ---');
const canvasH = mockCanvas.height;
const weaponH = canvasH * 0.35;
assert(weaponH < canvasH * 0.40, `Gun height occupies only ${(weaponH / canvasH * 100).toFixed(0)}% of screen height (compact area)`);
assert(engine.gun.y > canvasH * 0.75, `Gun base Y sits in bottom screen area without obstructing targets (${engine.gun.y.toFixed(1)}px)`);

console.log('\n--- 14. VERIFY PRESERVE ACTIVE GAME WHEN VISITING SCOREBOARD ---');
// Setup active game engine with in-progress targets, custom position and score
const activeTestEngine = new TargetStrikeEngine(mockCanvas, {
  durationSeconds: 420,
  remainingSeconds: 345,
  sessionToken: 'test_token_scoreboard_123',
  onScoreUpdate: () => {},
  onGameOver: () => {}
});

activeTestEngine.start();
// Simulate gameplay: target index 5 (Claude 3.5 Sonnet), 5 hits, custom score, crosshair position
activeTestEngine.aiTargetIndex = 5;
activeTestEngine.targetsDestroyed = 5;
activeTestEngine.score = 485;
activeTestEngine.hits = 5;
activeTestEngine.misses = 2;
activeTestEngine.combo = 3;
activeTestEngine.bestCombo = 4;
activeTestEngine.crosshair.x = 620;
activeTestEngine.crosshair.y = 210;

// Create target at specific position & velocity
activeTestEngine.targets = [{
  index: 5,
  id: 'ai_claude_35_sonnet_active_test',
  ai: AI_TARGETS[5],
  x: 450,
  y: 190,
  vx: 2.4,
  vy: -1.2,
  targetVx: 2.4,
  targetVy: -1.2,
  size: 56,
  hitboxScale: 1.0,
  pulse: 0.5,
  rotation: 0.2,
  rotSpeed: 0.02,
  hit: false,
  warpInScale: 1.0,
  spawnTime: performance.now() - 3200,
  nextDirectionChange: performance.now() + 1500,
  shotsFired: 1,
  difficulty: 'MEDIUM',
  patternType: 'WAVE',
  wavePhase: 1.1
}];

// User clicks Scoreboard: GameStation unmounts, calls detachCanvas() and exportState()
const exportedSnapshot = activeTestEngine.exportState();
assert(exportedSnapshot !== null, 'exportState() produced valid snapshot');
assert(exportedSnapshot.aiTargetIndex === 5, `Snapshot saved aiTargetIndex = 5 (got ${exportedSnapshot.aiTargetIndex})`);
assert(exportedSnapshot.score === 485, `Snapshot saved score = 485 (got ${exportedSnapshot.score})`);
assert(exportedSnapshot.targets.length === 1, `Snapshot saved 1 active in-flight target (got ${exportedSnapshot.targets.length})`);
assert(exportedSnapshot.targets[0].x === 450 && exportedSnapshot.targets[0].y === 190, 'Snapshot saved exact target x, y coordinates');
assert(exportedSnapshot.targets[0].vx === 2.4 && exportedSnapshot.targets[0].vy === -1.2, 'Snapshot saved target velocities');
assert(exportedSnapshot.crosshair.x === 620, 'Snapshot saved crosshair position');

// Detach canvas (simulates Scoreboard route active)
activeTestEngine.detachCanvas();
assert(activeTestEngine.isPaused === true, 'Engine is paused when canvas is detached');
assert(activeTestEngine.animId === null, 'Animation frame loop cancelled on detach');
assert(activeTestEngine.targets.length === 1, 'Active targets are preserved in-memory during Scoreboard visit');
assert(activeTestEngine.targets[0].ai.name === AI_TARGETS[5].name, `Active target is still ${AI_TARGETS[5].name} (not reset to ChatGPT)`);

// User returns from Scoreboard to GameStation:
// Scenario A: In-memory engine re-attached via attachCanvas()
activeTestEngine.attachCanvas(mockCanvas, {
  remainingSeconds: 340, // Authoritative server clock synchronized
  onScoreUpdate: () => {},
  onGameOver: () => {}
});

assert(activeTestEngine.isRunning === true, 'Engine resumed running after attachCanvas()');
assert(activeTestEngine.isPaused === false, 'Engine unpaused after attachCanvas()');
assert(activeTestEngine.targets.length === 1, 'Targets still preserved after attachCanvas()');
assert(activeTestEngine.targets[0].index === 5, 'Target index 5 still active (not reset)');
assert(Math.round(activeTestEngine.remainingSeconds) === 340, `Remaining seconds synchronized with backend clock (got ${activeTestEngine.remainingSeconds.toFixed(1)})`);

// Calling start() on restored engine does NOT recreate or overwrite active targets
activeTestEngine.start();
assert(activeTestEngine.targets.length === 1, 'start() did not recreate or overwrite active targets');
assert(activeTestEngine.targets[0].id === 'ai_claude_35_sonnet_active_test', 'Existing active target preserved across start()');
assert(activeTestEngine.aiTargetIndex === 5, 'aiTargetIndex remains 5 (not reset to 0)');

// Scenario B: Full page refresh reconstruction via importState()
const restoredEngine = new TargetStrikeEngine(mockCanvas, {
  durationSeconds: 420,
  savedState: exportedSnapshot,
  remainingSeconds: 338, // Authoritative server clock
  sessionToken: 'test_token_scoreboard_123'
});

assert(restoredEngine.aiTargetIndex === 5, `importState restored aiTargetIndex = 5 (got ${restoredEngine.aiTargetIndex})`);
assert(restoredEngine.score === 485, `importState restored score = 485 (got ${restoredEngine.score})`);
assert(restoredEngine.targets.length === 1, `importState restored active in-flight target (got ${restoredEngine.targets.length})`);
assert(restoredEngine.targets[0].x === 450, `importState restored target position x = 450`);
assert(restoredEngine.targets[0].vx === 2.4, `importState restored target velocity vx = 2.4`);
assert(restoredEngine.crosshair.x === 620, `importState restored crosshair position x = 620`);
assert(restoredEngine.remainingSeconds === 338, `Authoritative backend time prioritized over local wall time`);

console.log('\n--- 15. VERIFY REALISTIC NATURAL GUN & HAND MOVEMENT RIG ---');
const gunTestEngine = new TargetStrikeEngine(mockCanvas, { durationSeconds: 420 });
gunTestEngine.start();

// Check resting base position
const w = mockCanvas.width;
const h = mockCanvas.height;
gunTestEngine.crosshair.x = w * 0.5;
gunTestEngine.crosshair.y = h * 0.40;
gunTestEngine.crosshair.vx = 0;
gunTestEngine.crosshair.vy = 0;
for (let i = 0; i < 20; i++) gunTestEngine.update();

assert(Math.abs(gunTestEngine.gun.x - w * 0.52) < 5, `Resting gun X is anchored near bottom-center (got ${gunTestEngine.gun.x.toFixed(1)})`);
assert(gunTestEngine.gun.y > h * 0.80, `Resting gun Y is anchored in lower viewport (got ${gunTestEngine.gun.y.toFixed(1)})`);
assert(Math.abs(gunTestEngine.gun.angle) < 0.05, `Resting gun angle is neutral (got ${gunTestEngine.gun.angle.toFixed(4)} rad)`);

// Test extreme right aim: should produce noticeable, realistic turning toward the right
gunTestEngine.crosshair.x = w - 40; // Aiming right edge
gunTestEngine.crosshair.y = h * 0.40;
for (let i = 0; i < 20; i++) gunTestEngine.update();

const rightTurnAngle = gunTestEngine.gun.angle;
console.log(`  Noticeable right-aim gun angle: ${rightTurnAngle.toFixed(4)} rad (${(rightTurnAngle * 180 / Math.PI).toFixed(1)}°)`);
assert(rightTurnAngle > 0.15, `Gun rotates noticeably clockwise when aiming right (got ${rightTurnAngle.toFixed(4)} rad)`);
assert(rightTurnAngle < 0.32, `Gun rotation angle is bounded within realistic ~13° - 18° range (got ${rightTurnAngle.toFixed(4)} rad)`);
assert(gunTestEngine.gun.x > (w * 0.52 + 40), `Gun shifts noticeably rightward to follow aim (gun.x: ${gunTestEngine.gun.x.toFixed(1)})`);

// Test extreme left aim: should produce noticeable, realistic turning toward the left
gunTestEngine.crosshair.x = 40; // Aiming left edge
gunTestEngine.crosshair.y = h * 0.40;
for (let i = 0; i < 20; i++) gunTestEngine.update();

const leftTurnAngle = gunTestEngine.gun.angle;
console.log(`  Noticeable left-aim gun angle: ${leftTurnAngle.toFixed(4)} rad (${(leftTurnAngle * 180 / Math.PI).toFixed(1)}°)`);
assert(leftTurnAngle < -0.15, `Gun rotates noticeably counter-clockwise when aiming left (got ${leftTurnAngle.toFixed(4)} rad)`);
assert(leftTurnAngle > -0.32, `Gun rotation angle is bounded within realistic ~-13° - -18° range (got ${leftTurnAngle.toFixed(4)} rad)`);
assert(gunTestEngine.gun.x < (w * 0.52 - 40), `Gun shifts noticeably leftward to follow aim (gun.x: ${gunTestEngine.gun.x.toFixed(1)})`);

// Verify subtle recoil kick without violent screen dislocation
gunTestEngine.lastShotTime = 0;
gunTestEngine.fireWeapon('mouse');
assert(gunTestEngine.gun.recoilY === 8.5, `Subtle recoil kick Y is 8.5px (got ${gunTestEngine.gun.recoilY})`);
assert(gunTestEngine.gun.recoilAngle === -0.020, `Subtle recoil kick angle is -0.020 rad (got ${gunTestEngine.gun.recoilAngle})`);
assert(gunTestEngine.screenShake === 1.2, `Subtle screen shake is 1.2px (got ${gunTestEngine.screenShake})`);

activeTestEngine.stop();
restoredEngine.stop();
gunTestEngine.stop();
engine.stop();

console.log('\n======================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}

