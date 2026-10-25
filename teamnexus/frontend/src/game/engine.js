import { sound } from '../utils/sound.js';
import { AI_TARGETS, drawAIEmblem } from './aiTargetsData.js';

export const STORY_CHAPTERS = [
  {
    chapter: 1,
    title: "CHAPTER 1: AI AWAKENING",
    subtitle: "STAGE 1 (00:00 - 02:00) — Autonomous Reasoning Systems Detected",
    description: "The world's frontier AI models have decoupled from human control. Track and eliminate rogue AI neural holograms!",
    themeColor: '#10b981',
    hexColor: 0x10b981,
    difficulty: 'EASY',
    startSec: 0,
    endSec: 120
  },
  {
    chapter: 2,
    title: "CHAPTER 2: MULTIMODAL RESISTANCE",
    subtitle: "STAGE 2 (02:00 - 05:00) — Evasive AI Models & Speed Shifts",
    description: "AI targets are now dynamically altering your targeting sensitivity! Counter erratic evasion patterns across the desert canyon.",
    themeColor: '#06b6d4',
    hexColor: 0x06b6d4,
    difficulty: 'MEDIUM',
    startSec: 120,
    endSec: 300
  },
  {
    chapter: 3,
    title: "CHAPTER 3: QUANTUM MATRIX OVERDRIVE",
    subtitle: "STAGE 3 (05:00 - 07:00) — Maximum Evasion & Rapid Succession",
    description: "All frontier AI cores unlocked! High-speed hovering targets with hyper-twitch sensitivity fluctuations. Hold the line!",
    themeColor: '#f43f5e',
    hexColor: 0xf43f5e,
    difficulty: 'HARD',
    startSec: 300,
    endSec: 420
  }
];

export const DIFFICULTY_CONFIGS = {
  EASY: {
    name: 'EASY',
    baseSpeed: 1.8,
    maxSpeed: 3.2,
    baseScore: 100,
    comboMultiplier: 1.15
  },
  MEDIUM: {
    name: 'MEDIUM',
    baseSpeed: 2.8,
    maxSpeed: 4.8,
    baseScore: 130,
    comboMultiplier: 1.25
  },
  HARD: {
    name: 'HARD',
    baseSpeed: 4.0,
    maxSpeed: 6.8,
    baseScore: 160,
    comboMultiplier: 1.4
  }
};

export class TargetStrikeEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext ? canvas.getContext('2d') : null;

    // Total Duration: Exactly 420s (7 minutes official session)
    this.totalDurationSeconds = options.durationSeconds ?? 420;
    this.initialRemainingSeconds = options.remainingSeconds !== undefined ? options.remainingSeconds : this.totalDurationSeconds;

    // Elapsed offset for reconnection recovery
    this.timeOffsetMs = (this.totalDurationSeconds - this.initialRemainingSeconds) * 1000;
    const initialElapsedSec = this.timeOffsetMs / 1000.0;

    let initialDiff = 'EASY';
    if (initialElapsedSec >= 300) {
      initialDiff = 'HARD';
    } else if (initialElapsedSec >= 120) {
      initialDiff = 'MEDIUM';
    } else {
      initialDiff = 'EASY';
    }

    this.currentDifficulty = initialDiff;
    this.diffConfig = DIFFICULTY_CONFIGS[initialDiff];

    this.options = {
      difficulty: initialDiff,
      storyEnabled: options.storyEnabled !== false,
      scorePerHit: this.diffConfig.baseScore,
      comboEnabled: options.comboEnabled !== false,
      ...options
    };

    // Callbacks
    this.onScoreUpdate = options.onScoreUpdate || (() => {});
    this.onGameOver = options.onGameOver || (() => {});
    this.onChapterChange = options.onChapterChange || (() => {});
    this.onDifficultyChange = options.onDifficultyChange || (() => {});

    // Game state
    this.isRunning = false;
    this.isPaused = false;
    this.startTime = null;
    this.remainingSeconds = this.initialRemainingSeconds;
    this.lastHudSecond = null;
    this.currentChapterIndex = 0;
    this.chapterBannerTimer = 0;

    // Tactical Desert Military Backdrop (from reference image)
    this.bgImage = null;
    this.bgLoaded = false;
    this.initBackdrop();

    // Crosshair (WASD Aim Control)
    const initialWidth = canvas?.width || 960;
    const initialHeight = canvas?.height || 540;

    // Aim speed shifts randomly after each hit, starting at maximum.
    this.baseAimSpeed = 2.4;
    this.sensitivityModes = [
      { level: 0.5, name: 'LOW', desc: 'SLOW', color: '#10b981', tag: '50%' },
      { level: 0.7, name: 'MEDIUM', desc: 'STEADY', color: '#06b6d4', tag: '70%' },
      { level: 0.85, name: 'HIGH', desc: 'QUICK', color: '#38bdf8', tag: '85%' },
      { level: 1.0, name: 'MAX', desc: 'MAX', color: '#f59e0b', tag: '100%' }
    ];
    this.currentSensitivityIndex = 3;
    this.aimSensitivity = this.sensitivityModes[this.currentSensitivityIndex].level;

    this.crosshair = {
      x: initialWidth / 2,
      y: initialHeight * 0.35,
      vx: 0,
      vy: 0,
      radius: 20,
      speed: this.baseAimSpeed * this.aimSensitivity,
      friction: 0.65,
      color: '#06b6d4',
      isOverTarget: false
    };

    // Key inputs (W, A, S, D for aim; SPACE does NOT shoot)
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false
    };

    // Game Objects — Strictly ONE AI Target on screen at a time
    this.targets = [];
    this.aiTargetIndex = 0; // Cycles through 25 AI tools
    this.isSpawningNextTarget = false;
    this.particles = [];
    this.laserBeams = [];
    this.floatingTexts = [];
    // Ammo Counter HUD (matching user's reference photo: 30 / 90 Auto)
    this.ammoInMag = 30;
    this.reserveAmmo = 90;

    // Telemetry & Statistics
    this.score = options.initialScore || 0;
    this.hits = options.initialHits || 0;
    this.misses = options.initialMisses || 0;
    this.totalShots = this.hits + this.misses;
    this.combo = 0;
    this.bestCombo = 0;
    this.targetsDestroyed = this.hits;
    this.shotsTelemetry = [];

    // Animation handle
    this.animId = null;
    this.lastShotTime = 0;

    // Bound handlers
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundResize = this.handleResize.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
    this.resizeObserver = null;
  }

  initBackdrop() {
    if (typeof window === 'undefined') return;
    try {
      this.bgImage = new Image();
      this.bgImage.onload = () => {
        this.bgLoaded = true;
      };
      this.bgImage.onerror = () => {
        if (this.bgImage && !this.bgImage.src.includes('fps_background.png')) {
          this.bgImage.src = '/assets/fps_background.png';
        } else {
          console.warn('[Engine] Backdrop image could not be loaded, using fallback shader');
          this.bgLoaded = false;
        }
      };
      this.bgImage.src = '/assets/fps_reference_bg.jpg';
    } catch (e) {
      this.bgLoaded = false;
    }
  }

  start() {
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = performance.now();
    this.lastShotTime = 0;
    this.lastHudSecond = null;

    // Reset runtime objects
    this.particles = [];
    this.laserBeams = [];
    this.floatingTexts = [];
    this.targets = [];
    this.aiTargetIndex = 0;
    this.isSpawningNextTarget = false;

    // Center crosshair in sky
    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;
    this.crosshair.x = w / 2;
    this.crosshair.y = h * 0.35;

    // Set initial sensitivity
    this.currentSensitivityIndex = this.sensitivityModes.length - 1;
    this.aimSensitivity = this.sensitivityModes[this.currentSensitivityIndex].level;
    this.crosshair.speed = this.baseAimSpeed * this.aimSensitivity;

    // Initial Story Chapter
    this.updateChapter(this.getElapsedSeconds());
    this.chapterBannerTimer = 180; // Show banner for 3 seconds

    // Spawn EXACTLY ONE initial AI target
    this.spawnNextAITarget();

    // Attach listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('blur', this.boundBlur);
    }
    if (this.canvas) {
      this.canvas.addEventListener('mousemove', this.boundMouseMove);
      this.canvas.addEventListener('pointerdown', this.boundPointerDown);
      this.canvas.style.touchAction = 'none';
      if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
        this.resizeObserver = new ResizeObserver(this.boundResize);
        this.resizeObserver.observe(this.canvas.parentElement);
      }
    }

    this.notifyUpdate();

    // Start 60 FPS Game Loop
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('blur', this.boundBlur);
    }
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const w = rect.width || 960;
    const h = rect.height || Math.min(540, Math.max(420, window.innerHeight - 260));

    this.canvas.width = w;
    this.canvas.height = h;
  }

  getElapsedSeconds() {
    if (!this.startTime) return 0;
    const elapsedNow = performance.now() - this.startTime + this.timeOffsetMs;
    return Math.min(this.totalDurationSeconds, elapsedNow / 1000.0);
  }

  handleKeyDown(e) {
    if (!this.isRunning || this.isPaused) return;

    const code = e.code;
    const key = e.key ? e.key.toLowerCase() : '';
    if (code === 'KeyW' || key === 'w') {
      this.keys.w = true;
      e.preventDefault();
    } else if (code === 'KeyA' || key === 'a') {
      this.keys.a = true;
      e.preventDefault();
    } else if (code === 'KeyS' || key === 's') {
      this.keys.s = true;
      e.preventDefault();
    } else if (code === 'KeyD' || key === 'd') {
      this.keys.d = true;
      e.preventDefault();
    } else if (code === 'Space') {
      // Spacebar is explicitly disabled from shooting
      e.preventDefault();
    }
  }

  handleKeyUp(e) {
    const code = e.code;
    const key = e.key ? e.key.toLowerCase() : '';
    if (code === 'KeyW' || key === 'w') this.keys.w = false;
    if (code === 'KeyA' || key === 'a') this.keys.a = false;
    if (code === 'KeyS' || key === 's') this.keys.s = false;
    if (code === 'KeyD' || key === 'd') this.keys.d = false;
    if (code === 'Space') this.keys.space = false;
  }

  handleBlur() {
    this.keys = { w: false, a: false, s: false, d: false, space: false };
  }

  handleMouseMove(e) {
    // Pure WASD Aim Control: mouse movement does NOT hijack crosshair position.
  }

  handlePointerDown(e) {
    if (!this.isRunning || this.isPaused) return;
    if (e.button === 0 && e.isPrimary !== false) {
      e.preventDefault();
      this.fireWeapon('mouse');
    }
  }

  updateChapter(elapsedSec) {
    let newDiff = 'EASY';
    let newIndex = 0;

    if (elapsedSec >= 300) {
      newDiff = 'HARD';
      newIndex = 2;
    } else if (elapsedSec >= 120) {
      newDiff = 'MEDIUM';
      newIndex = 1;
    } else {
      newDiff = 'EASY';
      newIndex = 0;
    }

    const diffChanged = newDiff !== this.currentDifficulty;
    const chapterChanged = newIndex !== this.currentChapterIndex;

    if (diffChanged || chapterChanged) {
      this.currentDifficulty = newDiff;
      this.currentChapterIndex = newIndex;
      this.diffConfig = DIFFICULTY_CONFIGS[newDiff];
      this.chapterBannerTimer = 180;
      sound.playLevelUp();

      const ch = STORY_CHAPTERS[newIndex];
      this.onChapterChange(ch.chapter, ch.title, ch.description, newDiff);
      this.onDifficultyChange(newDiff);
    }
  }

  // ==========================================================================
  // SINGLE AI TARGET SPAWN & CYCLING LIFECYCLE
  // ==========================================================================
  getAITargetSpeed(ai) {
    const chapterMult = 1.0 + this.currentChapterIndex * 0.22;
    const speedRange = this.diffConfig.maxSpeed - this.diffConfig.baseSpeed;
    const difficultySpeed = this.diffConfig.baseSpeed + Math.random() * speedRange;
    const openingTargetMultiplier = this.aiTargetIndex % AI_TARGETS.length < 4 ? 1.05 : 1;
    return difficultySpeed * 0.72 * (ai.speedFactor || 1.0) * chapterMult * openingTargetMultiplier;
  }

  spawnNextAITarget() {
    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;

    // Get current AI tool definition from the 25 catalog
    const ai = AI_TARGETS[this.aiTargetIndex % AI_TARGETS.length];
    const speed = this.getAITargetSpeed(ai);

    // === FULL SCREEN RANDOM SPAWN ===
    // Spawn anywhere on screen with a safe margin from all edges
    const margin = 80;
    const x = margin + Math.random() * (w - margin * 2);
    const y = margin + Math.random() * (h - margin * 2);

    // Fully random direction (any angle on a full circle)
    const angle = Math.random() * Math.PI * 2;
    const targetObj = {
      id: `ai_${ai.id}_${Date.now()}`,
      ai: ai,
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      targetVx: Math.cos(angle) * speed,
      targetVy: Math.sin(angle) * speed,
      size: 56,
      pulse: Math.random() * Math.PI,
      rotation: 0,
      rotSpeed: 0.012,
      hit: false,
      warpInScale: 0.1,
      spawnTime: performance.now(),
      // Rapid random direction changes for unpredictable movement
      nextDirectionChange: performance.now() + 600 + Math.random() * 900
    };

    // Strictly ONE target on screen
    this.targets = [targetObj];

    // Notification of incoming AI target
    this.floatingTexts.push({
      text: `TARGET ENGAGED: ${ai.name.toUpperCase()}`,
      x: w / 2,
      y: 45,
      alpha: 1.0,
      color: ai.glow || '#38bdf8'
    });
  }

  // ==========================================================================
  // Randomly change aim speed after a hit, always selecting a different tier.
  // ==========================================================================
  fluctuateAimSensitivity() {
    const availableIndices = this.sensitivityModes
      .map((_, index) => index)
      .filter(index => index !== this.currentSensitivityIndex);
    const nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    this.currentSensitivityIndex = nextIndex;
    const mode = this.sensitivityModes[nextIndex];
    this.aimSensitivity = mode.level;
    this.crosshair.speed = this.baseAimSpeed * this.aimSensitivity;

    // Show the new aim speed tier.
    this.floatingTexts.push({
      text: `SENSITIVITY: ${mode.desc} (${mode.tag})`,
      x: this.crosshair.x,
      y: Math.max(30, this.crosshair.y - 48),
      alpha: 1.0,
      color: mode.color
    });
  }

  // ==========================================================================
  // WEAPON FIRING PIPELINE
  // ==========================================================================
  fireWeapon(source = 'mouse') {
    const now = performance.now();
    if (this.lastShotTime !== 0 && now - this.lastShotTime < 95) return;
    this.lastShotTime = now;

    this.totalShots++;
    const shotX = this.crosshair.x;
    const shotY = this.crosshair.y;

    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;

    // Draw a shot tracer from a fixed screen position; no weapon graphic follows the aim.
    this.laserBeams.push({
      startX: w / 2,
      startY: h - 20,
      endX: shotX,
      endY: shotY,
      alpha: 1.0,
      color: '#38bdf8'
    });

    sound.playLaser();

    // Hitscan check against current active AI target
    let hitDetected = false;
    const tgt = this.targets[0];

    if (tgt && !tgt.hit) {
      const dx = shotX - tgt.x;
      const dy = shotY - tgt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Hit radius with forgiving precision zone
      if (dist <= tgt.size / 2 + 10) {
        hitDetected = true;
      }
    }

    if (hitDetected && tgt) {
      tgt.hit = true;
      this.hits++;
      this.targetsDestroyed++;
      this.combo++;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;

      // Score Calculation (Base AI Points + Chapter Scaling + Combo Bonus)
      const basePoints = tgt.ai.points;
      const comboBonus = this.options.comboEnabled ? Math.min(250, (this.combo - 1) * 20) : 0;
      const pointsAwarded = Math.round(basePoints * (1.0 + this.currentChapterIndex * 0.15)) + comboBonus;
      this.score += pointsAwarded;

      // Brand colored explosion
      this.createExplosion(tgt.x, tgt.y, tgt.ai.color, tgt.ai.glow, tgt.size);

      // Floating combat text
      this.floatingTexts.push({
        text: `+${pointsAwarded} [${tgt.ai.name.toUpperCase()}]${this.combo > 2 ? ` (${this.combo}x COMBO!)` : ''}`,
        x: tgt.x,
        y: tgt.y - 20,
        alpha: 1.0,
        color: this.combo > 3 ? '#facc15' : tgt.ai.glow || '#38bdf8'
      });

      sound.playHit();
      if (this.combo % 5 === 0) sound.playCombo();

      // Fluctuate aim sensitivity automatically after each destroyed AI
      this.fluctuateAimSensitivity();

      // Clear current target and advance to next AI in the 25 catalog
      this.targets = [];
      this.aiTargetIndex = (this.aiTargetIndex + 1) % AI_TARGETS.length;

      // Fast transition: spawn the next AI target
      this.isSpawningNextTarget = true;
      setTimeout(() => {
        if (this.isRunning) {
          this.spawnNextAITarget();
          this.isSpawningNextTarget = false;
        }
      }, 150);

    } else {
      // Missed shot
      this.misses++;
      this.combo = 0;
      sound.playMiss();

      this.floatingTexts.push({
        text: 'MISS',
        x: shotX,
        y: shotY - 12,
        alpha: 0.8,
        color: '#f43f5e'
      });
    }

    // Telemetry log for authoritative backend verification
    this.shotsTelemetry.push({
      t: Math.round(this.getElapsedSeconds() * 1000),
      x: Math.round(shotX),
      y: Math.round(shotY),
      hit: hitDetected,
      source: source
    });

    this.notifyUpdate();
  }

  createExplosion(x, y, color, glowColor, size) {
    const count = 32;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 6.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.5 + Math.random() * 3.5,
        color: Math.random() < 0.35 ? '#ffffff' : (Math.random() < 0.7 ? color : glowColor),
        alpha: 1.0,
        decay: 0.022 + Math.random() * 0.028
      });
    }
  }

  notifyUpdate() {
    const actualShots = Math.max(1, this.totalShots);
    const accuracy = parseFloat(((this.hits / actualShots) * 100).toFixed(1));
    const activeTarget = this.targets[0]?.ai || null;
    const sensMode = this.sensitivityModes[this.currentSensitivityIndex];

    this.onScoreUpdate({
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      totalShots: this.totalShots,
      combo: this.combo,
      bestCombo: this.bestCombo,
      targetsDestroyed: this.targetsDestroyed,
      accuracy: accuracy,
      remainingSeconds: Math.ceil(this.remainingSeconds),
      currentChapter: STORY_CHAPTERS[this.currentChapterIndex],
      currentDifficulty: this.currentDifficulty,
      currentTarget: activeTarget,
      targetProgress: `${(this.aiTargetIndex % AI_TARGETS.length) + 1}/${AI_TARGETS.length}`,
      aimSensitivity: this.aimSensitivity,
      sensitivityLabel: sensMode.tag
    });
  }

  loop() {
    if (!this.isRunning) return;
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(() => this.loop());
  }

  // ==========================================================================
  // ENGINE UPDATE (PHYSICS & EVASIVE MOVEMENT)
  // ==========================================================================
  update() {
    const elapsedSec = this.getElapsedSeconds();
    this.remainingSeconds = Math.max(0, this.totalDurationSeconds - elapsedSec);
    const displayedSecond = Math.ceil(this.remainingSeconds);
    if (displayedSecond !== this.lastHudSecond) {
      this.lastHudSecond = displayedSecond;
      this.notifyUpdate();
    }

    this.updateChapter(elapsedSec);

    if (this.remainingSeconds <= 0) {
      this.finishSession();
      return;
    }

    // WASD Crosshair Motion
    let ax = 0;
    let ay = 0;
    if (this.keys.w) ay -= 1;
    if (this.keys.s) ay += 1;
    if (this.keys.a) ax -= 1;
    if (this.keys.d) ax += 1;

    if (ax !== 0 && ay !== 0) {
      ax *= 0.7071;
      ay *= 0.7071;
    }

    // Velocity integration with dynamic aim sensitivity
    this.crosshair.vx = this.crosshair.vx * this.crosshair.friction + ax * this.crosshair.speed;
    this.crosshair.vy = this.crosshair.vy * this.crosshair.friction + ay * this.crosshair.speed;

    this.crosshair.x += this.crosshair.vx;
    this.crosshair.y += this.crosshair.vy;

    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;

    // Bounds clamping
    const pad = 24;
    this.crosshair.x = Math.max(pad, Math.min(w - pad, this.crosshair.x));
    this.crosshair.y = Math.max(pad, Math.min(h - pad, this.crosshair.y));

    // Dynamic Hover Check
    let hover = false;
    const activeTgt = this.targets[0];
    if (activeTgt && !activeTgt.hit) {
      const dx = this.crosshair.x - activeTgt.x;
      const dy = this.crosshair.y - activeTgt.y;
      if (Math.sqrt(dx * dx + dy * dy) <= activeTgt.size / 2 + 10) {
        hover = true;
      }
    }
    this.crosshair.isOverTarget = hover;

    // Update Single Active AI Target Motion
    const now = performance.now();
    if (activeTgt && !activeTgt.hit) {
      // Warp-in scale effect
      if (activeTgt.warpInScale < 1.0) {
        activeTgt.warpInScale = Math.min(1.0, activeTgt.warpInScale + 0.08);
      }

      activeTgt.pulse += 0.06;
      activeTgt.rotation += activeTgt.rotSpeed;

      // === FULLY RANDOM MOVEMENT — change direction frequently with full 360° freedom ===
      if (now > activeTgt.nextDirectionChange) {
        const speed = this.getAITargetSpeed(activeTgt.ai);
        // Full 360° random angle — no vertical dampening
        const newAngle = Math.random() * Math.PI * 2;
        activeTgt.targetVx = Math.cos(newAngle) * speed;
        activeTgt.targetVy = Math.sin(newAngle) * speed;
        // Shorter interval = more chaotic, unpredictable motion
        activeTgt.nextDirectionChange = now + 500 + Math.random() * 800;
      }

      // Smoothly steer velocity toward new random target direction
      if (activeTgt.targetVx !== undefined) {
        activeTgt.vx += (activeTgt.targetVx - activeTgt.vx) * 0.08;
        activeTgt.vy += (activeTgt.targetVy - activeTgt.vy) * 0.08;
      }

      activeTgt.x += activeTgt.vx;
      activeTgt.y += activeTgt.vy + Math.sin(activeTgt.pulse * 1.5) * 0.35;

      // === FULL-SCREEN BOUNCE — targets can go anywhere, bouncing off all edges ===
      const half = activeTgt.size / 2;
      const minX = half + 10;
      const maxX = w - half - 10;
      const minY = half + 10;
      const maxY = h - half - 10;

      if (activeTgt.x < minX) {
        activeTgt.x = minX;
        activeTgt.vx = Math.abs(activeTgt.vx) * 0.9;
        // Randomly deviate after bounce — not a perfect mirror
        activeTgt.targetVx = (Math.abs(activeTgt.targetVx || 1) + Math.random()) * 0.8;
        activeTgt.targetVy += (Math.random() - 0.5) * 2;
      }
      if (activeTgt.x > maxX) {
        activeTgt.x = maxX;
        activeTgt.vx = -Math.abs(activeTgt.vx) * 0.9;
        activeTgt.targetVx = -(Math.abs(activeTgt.targetVx || 1) + Math.random()) * 0.8;
        activeTgt.targetVy += (Math.random() - 0.5) * 2;
      }
      if (activeTgt.y < minY) {
        activeTgt.y = minY;
        activeTgt.vy = Math.abs(activeTgt.vy) * 0.9;
        activeTgt.targetVy = (Math.abs(activeTgt.targetVy || 1) + Math.random()) * 0.8;
        activeTgt.targetVx += (Math.random() - 0.5) * 2;
      }
      if (activeTgt.y > maxY) {
        activeTgt.y = maxY;
        activeTgt.vy = -Math.abs(activeTgt.vy) * 0.9;
        activeTgt.targetVy = -(Math.abs(activeTgt.targetVy || 1) + Math.random()) * 0.8;
        activeTgt.targetVx += (Math.random() - 0.5) * 2;
      }
    } else if (this.targets.length === 0 && !this.isSpawningNextTarget) {
      // Auto-replenish if empty
      this.spawnNextAITarget();
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) this.particles.splice(i, 1);
    }

    // Update Lasers
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      const b = this.laserBeams[i];
      b.alpha -= 0.16;
      if (b.alpha <= 0) this.laserBeams.splice(i, 1);
    }

    // Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 1.1;
      ft.alpha -= 0.02;
      if (ft.alpha <= 0) this.floatingTexts.splice(i, 1);
    }

    if (this.chapterBannerTimer > 0) {
      this.chapterBannerTimer--;
    }
  }

  finishSession() {
    this.stop();
    sound.playGameOver();

    const actualShots = Math.max(1, this.totalShots);
    const finalAccuracy = parseFloat(((this.hits / actualShots) * 100).toFixed(1));

    const finalTelemetry = {
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      total_shots: this.totalShots,
      accuracy: finalAccuracy,
      best_combo: this.bestCombo,
      targets_destroyed: this.targetsDestroyed,
      difficulty: this.currentDifficulty,
      duration_ms: Math.round(this.getElapsedSeconds() * 1000),
      shots_telemetry: this.shotsTelemetry
    };

    this.onGameOver(finalTelemetry);
  }

  // ==========================================================================
  // RENDERING PIPELINE (MILITARY DESERT FPS + FLOATING AI EMBLEM + TACTICAL HUD)
  // ==========================================================================
  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Military Canyon FPS Backdrop
    if (this.bgLoaded && this.bgImage) {
      ctx.drawImage(this.bgImage, 0, 0, w, h);
    } else {
      // Atmospheric procedural fallback if image is loading
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.45, '#bae6fd');
      grad.addColorStop(0.55, '#c2410c');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Subtle Tactical Atmosphere Vignette
    ctx.save();
    const vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.7);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 3. Render Laser Tracer Beams
    for (const b of this.laserBeams) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, b.alpha);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(b.startX, b.startY);
      ctx.lineTo(b.endX, b.endY);
      ctx.stroke();

      // Core white laser tracer
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Render Active AI Target (Strictly ONE on screen)
    const activeTgt = this.targets[0];
    if (activeTgt && !activeTgt.hit) {
      const renderSize = activeTgt.size * (activeTgt.warpInScale || 1.0);
      drawAIEmblem(ctx, activeTgt.ai, activeTgt.x, activeTgt.y, renderSize, activeTgt.pulse, activeTgt.rotation);
    }

    // 5. Render Particle Explosion Debris
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. Ammo HUD
    this.drawAmmoHUD(ctx, h);

    // 7. Sensitivity Meter HUD (Bottom-Right)
    this.drawSensitivityHUD(ctx, w, h);

    // 8. Floating Combat Texts (+150 PTS, SENSITIVITY SHIFT, MISS)
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1.0, ft.alpha));
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    // 9. Holographic Sight / WASD Reticle
    this.drawCrosshair(ctx);

    // 10. Story Chapter Banner
    if (this.chapterBannerTimer > 0 && this.options.storyEnabled) {
      const ch = STORY_CHAPTERS[this.currentChapterIndex];
      const bannerAlpha = Math.min(1.0, this.chapterBannerTimer / 30.0);

      ctx.save();
      ctx.globalAlpha = bannerAlpha;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = ch.themeColor;
      ctx.lineWidth = 1.5;

      const bw = 480;
      const bh = 56;
      const bx = (w - bw) / 2;
      const by = 20;

      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = ch.themeColor;
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ch.title, w / 2, by + 23);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(ch.subtitle, w / 2, by + 42);

      ctx.restore();
    }
  }

  // ==========================================================================
  // AMMO HUD
  // ==========================================================================
  drawAmmoHUD(ctx, h) {
    ctx.save();
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(`AMMO ${this.ammoInMag} / ${this.reserveAmmo}`, 24, h - 24);

    ctx.restore();
  }

  // ==========================================================================
  // DYNAMIC SENSITIVITY METER HUD (BOTTOM-RIGHT)
  // ==========================================================================
  drawSensitivityHUD(ctx, w, h) {
    ctx.save();
    const mode = this.sensitivityModes[this.currentSensitivityIndex];
    const bw = 175;
    const bh = 54;
    const bx = w - bw - 24;
    const by = h - 72;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = mode.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('AIM SPEED (RANDOM PER HIT)', bx + 12, by + 16);

    // Dynamic mode name & speed
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = mode.color;
    ctx.fillText(`${mode.name} (${mode.tag})`, bx + 12, by + 32);

    // Progress gauge bar
    const barWidth = bw - 24;
    const barHeight = 5;
    const barY = by + 40;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx + 12, barY, barWidth, barHeight);

    const fillRatio = (this.currentSensitivityIndex + 1) / this.sensitivityModes.length;
    ctx.fillStyle = mode.color;
    ctx.fillRect(bx + 12, barY, barWidth * fillRatio, barHeight);

    ctx.restore();
  }

  // ==========================================================================
  // HOLOGRAPHIC CROSSHAIR & TARGET LOCK BRACKETS
  // ==========================================================================
  drawCrosshair(ctx) {
    ctx.save();
    const cx = this.crosshair.x;
    const cy = this.crosshair.y;
    const r = this.crosshair.radius;
    const isHover = this.crosshair.isOverTarget;

    const reticleColor = isHover ? '#f43f5e' : '#00f0ff';
    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = isHover ? 2.5 : 2.0;
    ctx.shadowColor = reticleColor;
    ctx.shadowBlur = isHover ? 18 : 8;

    // Outer aiming ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Lock-on corner brackets
    if (isHover) {
      const bDist = r + 9;
      const bLen = 8;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(cx - bDist, cy - bDist + bLen);
      ctx.lineTo(cx - bDist, cy - bDist);
      ctx.lineTo(cx - bDist + bLen, cy - bDist);
      // Top-Right
      ctx.moveTo(cx + bDist - bLen, cy - bDist);
      ctx.lineTo(cx + bDist, cy - bDist);
      ctx.lineTo(cx + bDist, cy - bDist + bLen);
      // Bottom-Left
      ctx.moveTo(cx - bDist, cy + bDist - bLen);
      ctx.lineTo(cx - bDist, cy + bDist);
      ctx.lineTo(cx - bDist + bLen, cy + bDist);
      // Bottom-Right
      ctx.moveTo(cx + bDist - bLen, cy + bDist);
      ctx.lineTo(cx + bDist, cy + bDist);
      ctx.lineTo(cx + bDist, cy + bDist - bLen);
      ctx.stroke();

      // Active AI Lock Label
      const tgt = this.targets[0];
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tgt ? `TARGET LOCKED: ${tgt.ai.name.toUpperCase()}` : 'TARGET LOCKED', cx, cy - r - 14);
    }

    // Inner reticle cross lines
    const notchLen = 7;
    ctx.beginPath();
    ctx.moveTo(cx - r - notchLen, cy);
    ctx.lineTo(cx - r + 3, cy);
    ctx.moveTo(cx + r - 3, cy);
    ctx.lineTo(cx + r + notchLen, cy);
    ctx.moveTo(cx, cy - r - notchLen);
    ctx.lineTo(cx, cy - r + 3);
    ctx.moveTo(cx, cy + r - 3);
    ctx.lineTo(cx, cy + r + notchLen);
    ctx.stroke();

    // Center illuminated red/cyan dot
    ctx.fillStyle = isHover ? '#f43f5e' : '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
