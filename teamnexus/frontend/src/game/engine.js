import { sound } from '../utils/sound.js';
import { AI_TARGETS, drawAIEmblem } from './aiTargetsData.js';

export const TOTAL_TARGETS = 50;

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
    baseSpeed: 1.8 * 0.9999, // 0.01% reduction
    maxSpeed: 2.8 * 0.9999,
    directionChangeMinMs: 2200,
    directionChangeMaxMs: 3400,
    difficultyBasePoints: 10
  },
  MEDIUM: {
    name: 'MEDIUM',
    baseSpeed: 3.0 * 0.9999, // 0.01% reduction
    maxSpeed: 4.4 * 0.9999,
    directionChangeMinMs: 1200,
    directionChangeMaxMs: 2000,
    difficultyBasePoints: 14
  },
  HARD: {
    name: 'HARD',
    baseSpeed: 4.6 * 0.9999, // 0.01% reduction
    maxSpeed: 6.2 * 0.9999,
    directionChangeMinMs: 600,
    directionChangeMaxMs: 1200,
    difficultyBasePoints: 18
  }
};

// Module-level asset caching across mounts & session resumptions
let preloadedBgImage = null;
let preloadedWeaponImg = null;
let preloadedCloudImages = [];
let preloadedBgLoaded = false;
let preloadedWeaponLoaded = false;
let preloadedCloudsLoaded = false;

export class TargetStrikeEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext ? canvas.getContext('2d') : null;

    // Total Duration: Exactly 420s (7 minutes official session)
    this.totalDurationSeconds = options.durationSeconds ?? 420;
    this.initialRemainingSeconds = options.remainingSeconds !== undefined ? options.remainingSeconds : this.totalDurationSeconds;
    this.TOTAL_TARGETS = TOTAL_TARGETS;

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
    this.diffConfig = { ...DIFFICULTY_CONFIGS[initialDiff] };

    // Admin custom target configuration overrides (if supplied)
    this.customTargetConfigs = options.targetConfigs || options.target_configs || {};

    this.options = {
      difficulty: initialDiff,
      storyEnabled: options.storyEnabled !== false,
      comboEnabled: options.comboEnabled !== false,
      ...options
    };

    // Callbacks
    this.onScoreUpdate = options.onScoreUpdate || (() => {});
    this.onGameOver = options.onGameOver || (() => {});
    this.onChapterChange = options.onChapterChange || (() => {});
    this.onDifficultyChange = options.onDifficultyChange || (() => {});

    // Game lifecycle state
    this.isRunning = false;
    this.isPaused = false;
    this.startTime = null;
    this.remainingSeconds = this.initialRemainingSeconds;
    this.lastHudSecond = null;
    this.currentChapterIndex = 0;
    this.chapterBannerTimer = 0;

    // 50 Target Queue Tracking
    this.targets = [];
    this.aiTargetIndex = 0; // 0 to 49
    this.isSpawningNextTarget = false;
    this.targetsDestroyed = options.initialHits || 0;
    this.completedAllTargets = false;

    // Telemetry & Statistics
    this.score = options.initialScore || 0;
    this.hits = options.initialHits || 0;
    this.misses = options.initialMisses || 0;
    this.totalShots = this.hits + this.misses;
    this.combo = 0;
    this.bestCombo = 0;
    this.shotsTelemetry = [];
    this.targetScores = [];
    this.reactionTimes = [];

    // Ammunition System (Unlimited Bullets)
    this.magCapacity = Infinity;
    this.ammoInMag = Infinity;
    this.reserveAmmo = Infinity;
    this.unlimitedAmmo = true;
    this.isReloading = false;
    this.reloadStartTime = 0;
    this.reloadDurationMs = 0;

    // Crosshair State (WASD-ONLY AIMING)
    const initialWidth = canvas?.width || 960;
    const initialHeight = canvas?.height || 540;

    this.crosshair = {
      x: initialWidth / 2,
      y: initialHeight * 0.38,
      vx: 0,
      vy: 0,
      radius: 18,
      isOverTarget: false
    };

    // Keyboard keys (W, A, S, D for pure aiming; SPACE explicitly disabled)
    this.keys = { w: false, a: false, s: false, d: false, space: false };

    // Dynamic Sensitivity System
    this.sensitivityModes = [
      { level: 0.70, name: 'LOW', desc: 'STABLE', color: '#10b981', tag: '70%' },
      { level: 0.85, name: 'MEDIUM', desc: 'TACTICAL', color: '#06b6d4', tag: '85%' },
      { level: 1.0, name: 'HIGH', desc: 'RESPONSIVE', color: '#38bdf8', tag: '100%' },
      { level: 1.15, name: 'MAX', desc: 'TWITCH', color: '#f59e0b', tag: '115%' }
    ];
    this.currentSensitivityIndex = 2; // Default 100%
    this.aimSensitivity = this.sensitivityModes[this.currentSensitivityIndex].level;

    // Base WASD Aiming Speed (restored to moderate comfortable speed)
    // Configurable via options.aimSpeed or admin customTargetConfigs.aimSpeed (default 2.1)
    this.baseAimSpeed = options.aimSpeed ?? this.customTargetConfigs?.aimSpeed ?? 2.1;

    // Realistic First-Person Weapon & Hand Rig (Compact Bottom-Center Anchor)
    this.weaponImg = null;
    this.weaponLoaded = false;
    this.gun = {
      x: initialWidth * 0.52,
      y: initialHeight * 0.82,
      targetX: initialWidth * 0.52,
      targetY: initialHeight * 0.82,
      angle: 0,
      targetAngle: 0,
      swayX: 0,
      swayY: 0,
      swayAngle: 0,
      idleTime: 0,
      recoilX: 0,
      recoilY: 0,
      recoilAngle: 0,
      recoilKickZ: 0
    };

    // Muzzle flash state
    this.muzzleFlash = {
      active: false,
      timer: 0,
      x: 0,
      y: 0,
      size: 42
    };

    // Realistic Environment, Dynamic Lighting & Moving Clouds
    this.bgImage = null;
    this.bgLoaded = false;
    this.clouds = [];
    this.cloudImages = [];
    this.cloudsLoaded = false;
    this.atmosphericDust = [];

    // Visual Effects Arrays
    this.projectiles = []; // Tracers flying from muzzle toward target
    this.particles = [];   // Impact & explosion debris
    this.impactSparks = [];
    this.floatingTexts = [];
    this.screenShake = 0;

    // Animation handle & shot pacing
    this.animId = null;
    this.lastShotTime = 0;

    // Initialize Assets & Environment
    this.initAssets();
    this.initAtmosphericDust();

    // Bound listeners
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    this.boundResize = this.handleResize.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this);
    this.boundContextLost = this.handleContextLost.bind(this);
    this.boundContextRestored = this.handleContextRestored.bind(this);
    this.resizeObserver = null;
    this.sessionToken = options.sessionToken || null;

    // Restore active session state if recovering from Scoreboard navigation or browser refresh
    if (options.savedState) {
      this.importState(options.savedState, options.remainingSeconds);
    }
  }

  // ==========================================================================
  // ASSET & ENVIRONMENT INITIALIZATION
  // ==========================================================================
  initAssets() {
    if (typeof window === 'undefined') return;

    // 1. Desert Landscape Backdrop
    try {
      if (preloadedBgImage && preloadedBgLoaded) {
        this.bgImage = preloadedBgImage;
        this.bgLoaded = true;
      } else {
        this.bgImage = new Image();
        this.bgImage.onload = () => {
          this.bgLoaded = true;
          preloadedBgImage = this.bgImage;
          preloadedBgLoaded = true;
        };
        this.bgImage.onerror = () => {
          if (this.bgImage && !this.bgImage.src.includes('fps_reference_bg.jpg')) {
            this.bgImage.src = '/assets/fps_reference_bg.jpg';
          }
        };
        this.bgImage.src = '/assets/fps_desert_landscape.jpg';
        if (this.bgImage.complete && this.bgImage.naturalWidth > 0) {
          this.bgLoaded = true;
          preloadedBgImage = this.bgImage;
          preloadedBgLoaded = true;
        }
      }
    } catch (e) {
      this.bgLoaded = false;
    }

    // 2. First-Person SCAR Rifle & Hands Cutout
    try {
      if (preloadedWeaponImg && preloadedWeaponLoaded) {
        this.weaponImg = preloadedWeaponImg;
        this.weaponLoaded = true;
      } else {
        this.weaponImg = new Image();
        this.weaponImg.onload = () => {
          this.weaponLoaded = true;
          preloadedWeaponImg = this.weaponImg;
          preloadedWeaponLoaded = true;
        };
        this.weaponImg.src = '/assets/weapon_fps.png';
        if (this.weaponImg.complete && this.weaponImg.naturalWidth > 0) {
          this.weaponLoaded = true;
          preloadedWeaponImg = this.weaponImg;
          preloadedWeaponLoaded = true;
        }
      }
    } catch (e) {
      this.weaponLoaded = false;
    }

    // 3. Moving Cloud Layers (cloud_1.png and cloud_2.png)
    try {
      if (preloadedCloudImages.length === 2 && preloadedCloudsLoaded) {
        this.cloudImages = preloadedCloudImages;
        this.cloudsLoaded = true;
        if (this.clouds.length === 0) {
          this.initClouds();
        }
      } else {
        const c1 = new Image();
        const c2 = new Image();
        let loadedCount = 0;
        const onLoadCloud = () => {
          loadedCount++;
          if (loadedCount >= 2) {
            this.cloudsLoaded = true;
            preloadedCloudImages = [c1, c2];
            preloadedCloudsLoaded = true;
            this.initClouds();
          }
        };
        c1.onload = onLoadCloud;
        c2.onload = onLoadCloud;
        c1.src = '/assets/cloud_1.png';
        c2.src = '/assets/cloud_2.png';
        this.cloudImages = [c1, c2];
        if (c1.complete && c2.complete && c1.naturalWidth > 0 && c2.naturalWidth > 0) {
          this.cloudsLoaded = true;
          preloadedCloudImages = [c1, c2];
          preloadedCloudsLoaded = true;
          this.initClouds();
        }
      }
    } catch (e) {
      this.cloudsLoaded = false;
    }
  }

  // Natural, volumetric drifting clouds distributed across the full sky at moderate speed
  initClouds() {
    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;
    this.clouds = [];

    // 3 Altitude Layers for Environmental Depth:
    // Layer 1: High altitude cirrus (small, slow, subtle)
    // Layer 2: Mid-sky drift (medium, smooth)
    // Layer 3: Lower sky cumulus (large, slightly faster, high definition)
    const layers = [
      { count: 3, minY: 6, maxY: h * 0.14, minScale: 0.26, maxScale: 0.35, minSpeed: 0.035, maxSpeed: 0.055, minAlpha: 0.30, maxAlpha: 0.45 },
      { count: 3, minY: h * 0.12, maxY: h * 0.26, minScale: 0.38, maxScale: 0.48, minSpeed: 0.055, maxSpeed: 0.075, minAlpha: 0.42, maxAlpha: 0.58 },
      { count: 2, minY: h * 0.22, maxY: h * 0.38, minScale: 0.48, maxScale: 0.58, minSpeed: 0.075, maxSpeed: 0.095, minAlpha: 0.48, maxAlpha: 0.62 }
    ];

    let id = 0;
    for (const l of layers) {
      for (let i = 0; i < l.count; i++) {
        // Distribute smoothly across full screen width
        const xSpan = (w + 400) / l.count;
        const xPos = -100 + i * xSpan + (Math.random() - 0.5) * 60;
        this.clouds.push({
          id: id++,
          imgIndex: (i + id) % 2,
          x: xPos,
          y: l.minY + Math.random() * (l.maxY - l.minY),
          speed: l.minSpeed + Math.random() * (l.maxSpeed - l.minSpeed),
          scale: l.minScale + Math.random() * (l.maxScale - l.minScale),
          alpha: l.minAlpha + Math.random() * (l.maxAlpha - l.minAlpha),
          minY: l.minY,
          maxY: l.maxY
        });
      }
    }
  }

  // Atmospheric dust and heat particles over the canyon
  initAtmosphericDust() {
    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;
    this.atmosphericDust = [];
    const count = 28;
    for (let i = 0; i < count; i++) {
      this.atmosphericDust.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0.2 + Math.random() * 0.6,
        vy: -0.15 - Math.random() * 0.35,
        size: 1.0 + Math.random() * 2.2,
        alpha: 0.2 + Math.random() * 0.45
      });
    }
  }

  // ==========================================================================
  // LIFECYCLE CONTROLS
  // ==========================================================================
  start() {
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = performance.now();
    this.lastShotTime = 0;
    this.lastHudSecond = null;

    // Reset transient visual effects
    this.projectiles = [];
    this.particles = [];
    this.impactSparks = [];
    this.floatingTexts = [];

    // Only initialize target queue if no active targets exist (preserve active session targets)
    if (this.targets.length === 0 && !this.completedAllTargets) {
      this.targets = [];
      this.aiTargetIndex = this.aiTargetIndex || 0;
      this.targetsDestroyed = this.targetsDestroyed || 0;
      this.targetScores = this.targetScores || [];
      this.reactionTimes = this.reactionTimes || [];
      this.spawnNextAITarget();
    }

    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;

    // Center crosshair only if not already restored
    if (this.crosshair.x === undefined || this.crosshair.x === 0) {
      this.crosshair.x = w / 2;
      this.crosshair.y = h * 0.38;
      this.crosshair.vx = 0;
      this.crosshair.vy = 0;
    }

    // Position gun in compact bottom-center area if not already positioned
    if (!this.gun.x) {
      this.gun.x = w * 0.52;
      this.gun.y = h * 0.82;
      this.gun.targetX = this.gun.x;
      this.gun.targetY = this.gun.y;
      this.gun.swayX = 0;
      this.gun.swayY = 0;
      this.gun.swayAngle = 0;
    }

    // Reset ammo (Unlimited Bullets)
    this.ammoInMag = Infinity;
    this.reserveAmmo = Infinity;
    this.isReloading = false;

    // Clouds
    if (this.clouds.length === 0) {
      this.initClouds();
    }

    // Initial Chapter & Banner
    this.updateChapter(this.getElapsedSeconds());
    if (this.chapterBannerTimer === undefined || this.chapterBannerTimer === 0) {
      this.chapterBannerTimer = 180;
    }

    // Attach listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('blur', this.boundBlur);

      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('blur', this.boundBlur);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
      this.canvas.removeEventListener('contextlost', this.boundContextLost);
      this.canvas.removeEventListener('contextrestored', this.boundContextRestored);

      this.canvas.addEventListener('mousemove', this.boundMouseMove);
      this.canvas.addEventListener('pointerdown', this.boundPointerDown);
      this.canvas.addEventListener('contextmenu', this.boundContextMenu);
      this.canvas.addEventListener('contextlost', this.boundContextLost);
      this.canvas.addEventListener('contextrestored', this.boundContextRestored);
      this.canvas.style.touchAction = 'none';

      if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
        this.resizeObserver?.disconnect();
        this.resizeObserver = new ResizeObserver(this.boundResize);
        this.resizeObserver.observe(this.canvas.parentElement);
      }
    }

    this.notifyUpdate();

    // Paint first frame immediately
    this.draw();

    // 60 FPS Game Loop
    if (this.animId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animId);
      }
      this.animId = null;
    }
    this.loop();
  }

  stop() {
    this.isRunning = false;
    this.isPaused = true;
    if (this.animId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animId);
      }
      this.animId = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('blur', this.boundBlur);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
      this.canvas.removeEventListener('contextlost', this.boundContextLost);
      this.canvas.removeEventListener('contextrestored', this.boundContextRestored);
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  // Detach canvas when navigating to Scoreboard (preserves in-memory targets and engine state)
  detachCanvas() {
    if (this.animId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animId);
      }
      this.animId = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('blur', this.boundBlur);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
      this.canvas.removeEventListener('contextlost', this.boundContextLost);
      this.canvas.removeEventListener('contextrestored', this.boundContextRestored);
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.isPaused = true;
    this.canvas = null;
    this.ctx = null;
  }

  // Re-attach canvas when returning from Scoreboard (seamless zero-loss match continuation)
  attachCanvas(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext ? canvas.getContext('2d') : null;

    if (options.onScoreUpdate) this.onScoreUpdate = options.onScoreUpdate;
    if (options.onGameOver) this.onGameOver = options.onGameOver;

    if (options.remainingSeconds !== undefined && options.remainingSeconds !== null && !isNaN(options.remainingSeconds)) {
      this.remainingSeconds = options.remainingSeconds;
    }
    // Synchronize clock baseline with exact remainingSeconds
    this.timeOffsetMs = (this.totalDurationSeconds - this.remainingSeconds) * 1000;
    this.startTime = performance.now();

    if (this.canvas) {
      const rect = this.canvas.parentElement?.getBoundingClientRect();
      const parentW = rect?.width ? Math.round(rect.width) : 0;
      const parentH = rect?.height ? Math.round(rect.height) : 0;
      const winW = (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth > 0) ? window.innerWidth : 960;
      const winH = (typeof window !== 'undefined' && typeof window.innerHeight === 'number' && window.innerHeight > 0) ? window.innerHeight : 540;
      const w = parentW >= 320 ? parentW : Math.min(1280, Math.max(320, this.canvas.width || (winW - 64)));
      const h = parentH >= 300 ? parentH : Math.min(540, Math.max(300, this.canvas.height || (winH - 260)));
      this.canvas.width = Math.max(320, Math.round(w));
      this.canvas.height = Math.max(300, Math.round(h));

      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
      this.canvas.removeEventListener('contextlost', this.boundContextLost);
      this.canvas.removeEventListener('contextrestored', this.boundContextRestored);

      this.canvas.addEventListener('mousemove', this.boundMouseMove);
      this.canvas.addEventListener('pointerdown', this.boundPointerDown);
      this.canvas.addEventListener('contextmenu', this.boundContextMenu);
      this.canvas.addEventListener('contextlost', this.boundContextLost);
      this.canvas.addEventListener('contextrestored', this.boundContextRestored);
      this.canvas.style.touchAction = 'none';

      if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
        this.resizeObserver?.disconnect();
        this.resizeObserver = new ResizeObserver(this.boundResize);
        this.resizeObserver.observe(this.canvas.parentElement);
      }
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('blur', this.boundBlur);

      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('blur', this.boundBlur);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
    }

    this.isRunning = true;
    this.isPaused = false;
    this.notifyUpdate();

    // Paint current game scene immediately to prevent any black screen flash
    this.draw();

    if (this.animId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animId);
      }
      this.animId = null;
    }
    this.loop();
  }

  // Export full serializable state of the game session
  exportState() {
    const now = performance.now();
    return {
      sessionToken: this.sessionToken,
      aiTargetIndex: this.aiTargetIndex,
      targetsDestroyed: this.targetsDestroyed,
      completedAllTargets: this.completedAllTargets,
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      totalShots: this.totalShots,
      combo: this.combo,
      bestCombo: this.bestCombo,
      shotsTelemetry: [...this.shotsTelemetry],
      targetScores: [...this.targetScores],
      reactionTimes: [...this.reactionTimes],
      currentDifficulty: this.currentDifficulty,
      currentChapterIndex: this.currentChapterIndex,
      remainingSeconds: this.remainingSeconds,
      timeOffsetMs: this.timeOffsetMs,
      savedAt: now,
      savedWallTime: Date.now(),
      crosshair: {
        x: this.crosshair.x,
        y: this.crosshair.y,
        vx: this.crosshair.vx,
        vy: this.crosshair.vy,
        radius: this.crosshair.radius,
        isOverTarget: this.crosshair.isOverTarget
      },
      gun: {
        x: this.gun.x,
        y: this.gun.y,
        targetX: this.gun.targetX,
        targetY: this.gun.targetY,
        angle: this.gun.angle,
        targetAngle: this.gun.targetAngle,
        swayX: this.gun.swayX,
        swayY: this.gun.swayY,
        swayAngle: this.gun.swayAngle,
        idleTime: this.gun.idleTime,
        recoilX: this.gun.recoilX,
        recoilY: this.gun.recoilY,
        recoilAngle: this.gun.recoilAngle
      },
      targets: this.targets.map(t => ({
        index: t.index,
        id: t.id,
        ai: t.ai,
        x: t.x,
        y: t.y,
        vx: t.vx,
        vy: t.vy,
        targetVx: t.targetVx,
        targetVy: t.targetVy,
        size: t.size,
        hitboxScale: t.hitboxScale,
        pulse: t.pulse,
        rotation: t.rotation,
        rotSpeed: t.rotSpeed,
        hit: t.hit,
        warpInScale: t.warpInScale,
        elapsedSinceSpawn: now - t.spawnTime,
        remainingDirectionChange: t.nextDirectionChange - now,
        shotsFired: t.shotsFired,
        difficulty: t.difficulty,
        patternType: t.patternType,
        wavePhase: t.wavePhase
      }))
    };
  }

  // Import and restore exact gameplay state (e.g. after Scoreboard navigation or browser refresh)
  importState(state, serverRemainingSeconds) {
    if (!state) return;
    this.sessionToken = state.sessionToken || this.sessionToken;
    this.aiTargetIndex = state.aiTargetIndex ?? this.aiTargetIndex;
    this.targetsDestroyed = state.targetsDestroyed ?? this.targetsDestroyed;
    this.completedAllTargets = state.completedAllTargets ?? false;
    this.score = state.score ?? this.score;
    this.hits = state.hits ?? this.hits;
    this.misses = state.misses ?? this.misses;
    this.totalShots = state.totalShots ?? this.totalShots;
    this.combo = state.combo ?? this.combo;
    this.bestCombo = state.bestCombo ?? this.bestCombo;
    if (Array.isArray(state.shotsTelemetry)) this.shotsTelemetry = [...state.shotsTelemetry];
    if (Array.isArray(state.targetScores)) this.targetScores = [...state.targetScores];
    if (Array.isArray(state.reactionTimes)) this.reactionTimes = [...state.reactionTimes];
    if (state.currentDifficulty) this.currentDifficulty = state.currentDifficulty;
    if (state.currentChapterIndex !== undefined) this.currentChapterIndex = state.currentChapterIndex;

    // Remaining seconds: prioritize authoritative server time if provided
    if (serverRemainingSeconds !== undefined) {
      this.remainingSeconds = serverRemainingSeconds;
      this.timeOffsetMs = (this.totalDurationSeconds - this.remainingSeconds) * 1000;
    } else if (state.remainingSeconds !== undefined) {
      const elapsedWallSec = state.savedWallTime ? (Date.now() - state.savedWallTime) / 1000 : 0;
      this.remainingSeconds = Math.max(0, state.remainingSeconds - elapsedWallSec);
      this.timeOffsetMs = (this.totalDurationSeconds - this.remainingSeconds) * 1000;
    }

    if (state.crosshair) {
      Object.assign(this.crosshair, state.crosshair);
    }
    if (state.gun) {
      Object.assign(this.gun, state.gun);
    }

    const now = performance.now();
    if (Array.isArray(state.targets) && state.targets.length > 0) {
      this.targets = state.targets.map(t => ({
        ...t,
        spawnTime: now - (t.elapsedSinceSpawn || 100),
        nextDirectionChange: now + Math.max(200, (t.remainingDirectionChange || 1000))
      }));
    }
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const w = Math.round(rect.width) || 960;
    const h = Math.round(rect.height) || Math.min(540, Math.max(420, typeof window !== 'undefined' ? window.innerHeight - 260 : 540));

    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
      // Immediately redraw frame so canvas is never left cleared/black
      this.draw();
    }

    if (this.clouds.length === 0) {
      this.initClouds();
    }
  }

  handleBlur() {
    this.keys = { w: false, a: false, s: false, d: false, space: false };
    if (this.crosshair) {
      this.crosshair.vx = 0;
      this.crosshair.vy = 0;
    }
  }

  handleVisibilityChange() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      // Backgrounded: suspend animation loop to prevent lag spikes and save resources
      if (this.animId) {
        if (typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(this.animId);
        }
        this.animId = null;
      }
    } else {
      // Returned to active tab: resume smoothly without duplicate loops
      if (this.isRunning && !this.isPaused) {
        this.startTime = performance.now();
        this.timeOffsetMs = (this.totalDurationSeconds - this.remainingSeconds) * 1000;
        this.keys = { w: false, a: false, s: false, d: false, space: false };
        if (this.crosshair) {
          this.crosshair.vx = 0;
          this.crosshair.vy = 0;
        }
        this.draw();
        if (!this.animId) {
          this.loop();
        }
      }
    }
  }

  handleContextLost(e) {
    if (e && e.preventDefault) e.preventDefault();
    console.warn('[TargetStrikeEngine] Canvas 2D / WebGL context lost.');
    if (this.animId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animId);
      }
      this.animId = null;
    }
  }

  handleContextRestored() {
    console.log('[TargetStrikeEngine] Canvas context restored. Recovering renderer.');
    this.ctx = this.canvas?.getContext ? this.canvas.getContext('2d') : null;
    if (this.isRunning && !this.isPaused) {
      this.draw();
      if (!this.animId) {
        this.loop();
      }
    }
  }

  getElapsedSeconds() {
    if (!this.startTime) return 0;
    const elapsedNow = performance.now() - this.startTime + this.timeOffsetMs;
    return Math.min(this.totalDurationSeconds, elapsedNow / 1000.0);
  }

  // ==========================================================================
  // INPUT CONTROLS: WASD-ONLY AIMING & LEFT CLICK / ESP32 TRIGGER ONLY
  // ==========================================================================
  handleMouseMove(e) {
    // SECTION 3 REQUIREMENT:
    // Mouse movement MUST NOT change the aim.
    // Mouse dragging MUST NOT rotate camera or move crosshair.
    // WASD is the ONLY aiming input.
  }

  handleContextMenu(e) {
    // Prevent right-click menu or shooting on right-click
    e.preventDefault();
  }

  handlePointerDown(e) {
    if (!this.isRunning || this.isPaused) return;

    // SECTION 4 REQUIREMENT:
    // Only mouse left-button click (button === 0) or physical ESP32 trigger may shoot!
    // Right-click, middle-click, dragging, and keys must NOT shoot.
    if (e.button === 0 && e.isPrimary !== false) {
      e.preventDefault();
      this.fireWeapon('mouse');
    }
  }

  handleKeyDown(e) {
    if (!this.isRunning || this.isPaused) return;

    const code = e.code;
    const key = e.key ? e.key.toLowerCase() : '';

    // WASD Aim Controls
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
    } else if (code === 'KeyR' || key === 'r') {
      // Manual Reload
      e.preventDefault();
      this.reloadWeapon();
    } else if (code === 'Space') {
      // SPACE IS STRICTLY DISABLED FROM SHOOTING
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
    this.crosshair.vx = 0;
    this.crosshair.vy = 0;
  }

  // ==========================================================================
  // RELOAD SYSTEM
  // ==========================================================================
  reloadWeapon() {
    // Unlimited bullets active; weapon does not require reloading
  }

  // ==========================================================================
  // CHAPTER & DIFFICULTY PROGRESSION
  // ==========================================================================
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
      this.diffConfig = { ...DIFFICULTY_CONFIGS[newDiff] };

      // Apply any admin custom difficulty overrides
      if (this.customTargetConfigs.difficulties?.[newDiff]) {
        Object.assign(this.diffConfig, this.customTargetConfigs.difficulties[newDiff]);
      }

      this.chapterBannerTimer = 180;
      sound.playLevelUp();

      const ch = STORY_CHAPTERS[newIndex];
      this.onChapterChange(ch.chapter, ch.title, ch.description, newDiff);
      this.onDifficultyChange(newDiff);
    }
  }

  // ==========================================================================
  // TARGET SPEED & RANDOMIZED MOVEMENT (50 TARGETS TOTAL)
  // ==========================================================================
  getAITargetSpeed(ai) {
    const diff = this.diffConfig;
    const speedRange = diff.maxSpeed - diff.baseSpeed;
    let speed = diff.baseSpeed + Math.random() * speedRange;

    // Apply AI target individual speedFactor
    let factor = ai.speedFactor || 1.0;

    // Check if admin defined custom individual configuration for this AI target
    if (this.customTargetConfigs.targets?.[ai.id]) {
      const custom = this.customTargetConfigs.targets[ai.id];
      if (custom.speed) speed = custom.speed;
      if (custom.speedFactor) factor = custom.speedFactor;
    }

    // Apply 0.01% movement speed reduction (factor 0.9999)
    return speed * factor * 0.9999;
  }

  spawnNextAITarget() {
    if (this.aiTargetIndex >= this.TOTAL_TARGETS) {
      this.finishSession();
      return;
    }

    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;

    // Get current AI tool definition from 50 catalog
    const ai = AI_TARGETS[this.aiTargetIndex % AI_TARGETS.length];
    const speed = this.getAITargetSpeed(ai);

    // Playable viewport bounds (open sky and upper canyon area)
    const marginX = 90;
    const minY = 70;
    const maxY = Math.max(minY + 80, h * 0.62);

    // Prevent spawning directly on top of crosshair (minimum 140px distance)
    let spawnX = marginX + Math.random() * (w - marginX * 2);
    let spawnY = minY + Math.random() * (maxY - minY);
    let attempts = 0;
    while (attempts < 10) {
      const dx = spawnX - this.crosshair.x;
      const dy = spawnY - this.crosshair.y;
      if (Math.sqrt(dx * dx + dy * dy) > 140) break;
      spawnX = marginX + Math.random() * (w - marginX * 2);
      spawnY = minY + Math.random() * (maxY - minY);
      attempts++;
    }

    // Fully independent randomized 360-degree angle
    const angle = Math.random() * Math.PI * 2;
    const targetIdx = this.aiTargetIndex;

    const diff = this.diffConfig;
    const changeInterval = diff.directionChangeMinMs + Math.random() * (diff.directionChangeMaxMs - diff.directionChangeMinMs);

    let targetSize = 56;
    let hitboxScale = 1.0;
    if (this.customTargetConfigs.targetSize) {
      targetSize = Math.max(38, Math.min(76, Number(this.customTargetConfigs.targetSize)));
    }
    if (this.customTargetConfigs.targets?.[ai.id]?.size) {
      targetSize = Math.max(38, Math.min(76, this.customTargetConfigs.targets[ai.id].size));
    }
    if (this.customTargetConfigs.hitboxScale) {
      hitboxScale = Math.max(0.85, Math.min(1.25, Number(this.customTargetConfigs.hitboxScale)));
    }

    const targetObj = {
      index: targetIdx,
      id: `ai_${ai.id}_idx${targetIdx}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      ai: ai,
      x: spawnX,
      y: spawnY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      targetVx: Math.cos(angle) * speed,
      targetVy: Math.sin(angle) * speed,
      size: targetSize,
      hitboxScale: hitboxScale,
      pulse: Math.random() * Math.PI,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() < 0.5 ? 1 : -1) * (0.012 + Math.random() * 0.015),
      hit: false,
      warpInScale: 0.1,
      spawnTime: performance.now(),
      nextDirectionChange: performance.now() + changeInterval,
      shotsFired: 0,
      difficulty: this.currentDifficulty,
      // Movement pattern type
      patternType: Math.random() < 0.4 ? 'zigzag' : (Math.random() < 0.7 ? 'sine' : 'linear'),
      wavePhase: Math.random() * Math.PI * 2
    };

    this.targets = [targetObj];

    // Notification banner
    this.floatingTexts.push({
      text: `TARGET [${targetIdx + 1}/${this.TOTAL_TARGETS}]: ${ai.name.toUpperCase()}`,
      x: w / 2,
      y: 42,
      alpha: 1.0,
      color: ai.glow || '#38bdf8'
    });
  }

  // Dynamic sensitivity fluctuation
  fluctuateAimSensitivity() {
    const available = this.sensitivityModes
      .map((_, i) => i)
      .filter(i => i !== this.currentSensitivityIndex);
    const nextIdx = available[Math.floor(Math.random() * available.length)];
    this.currentSensitivityIndex = nextIdx;
    const mode = this.sensitivityModes[nextIdx];
    this.aimSensitivity = mode.level;

    this.floatingTexts.push({
      text: `SENSITIVITY: ${mode.desc} (${mode.tag})`,
      x: this.crosshair.x,
      y: Math.max(30, this.crosshair.y - 48),
      alpha: 1.0,
      color: mode.color
    });
  }

  // ==========================================================================
  // CENTRAL SHOOTING PIPELINE (ACCURATE & ZERO OFFSET)
  // ==========================================================================
  fireWeapon(source = 'mouse') {
    if (!this.isRunning || this.isPaused) return;

    const now = performance.now();
    // Semi-auto fire rate limiter: ~105ms between shots
    if (this.lastShotTime !== 0 && now - this.lastShotTime < 105) return;
    this.lastShotTime = now;

    // Unlimited Ammunition: player can shoot continuously without running out of ammo
    this.totalShots++;

    // SECTION 15 ACCURACY CRITICAL REQUIREMENT:
    // The shot ALWAYS fires AT THE CURRENT WASD-CONTROLLED CROSSHAIR.
    // Zero offset! Screen coordinates and crosshair coordinates are 100% synchronized.
    const shotX = this.crosshair.x;
    const shotY = this.crosshair.y;

    // Track shot for active target ammunition efficiency
    const activeTgt = this.targets[0];
    if (activeTgt && !activeTgt.hit) {
      activeTgt.shotsFired++;
    }

    // Subtle, realistic weapon recoil (smooth kick without violent camera dislocation)
    this.gun.recoilY = 8.5;
    this.gun.recoilAngle = -0.020;
    this.gun.recoilX = (Math.random() - 0.5) * 1.6;
    this.screenShake = 1.2;

    // Calculate Weapon Muzzle Position
    const muzzlePos = this.getMuzzlePosition();

    // Trigger Muzzle Flash
    this.muzzleFlash.active = true;
    this.muzzleFlash.timer = 4;
    this.muzzleFlash.x = muzzlePos.x;
    this.muzzleFlash.y = muzzlePos.y;

    // Bullet Projectile Tracer: travels from muzzle to exact crosshair shotX, shotY
    this.projectiles.push({
      startX: muzzlePos.x,
      startY: muzzlePos.y,
      x: muzzlePos.x,
      y: muzzlePos.y,
      targetX: shotX,
      targetY: shotY,
      progress: 0,
      speed: 0.20,
      alpha: 1.0,
      color: '#ffffff',
      glowColor: '#38bdf8'
    });

    // Sound
    sound.playLaser();

    // Hit detection against active target
    let hitDetected = false;
    let dist = 999;
    let accuracyPts = 0;
    let reactionPts = 0;
    let ammoPts = 0;
    let diffPts = 0;
    let totalTargetScore = 0;

    if (activeTgt && !activeTgt.hit) {
      const dx = shotX - activeTgt.x;
      const dy = shotY - activeTgt.y;
      dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = (activeTgt.size / 2 + 10) * (activeTgt.hitboxScale || 1.0);

      if (dist <= hitRadius) {
        hitDetected = true;
        activeTgt.hit = true; // Prevent duplicate hits

        // 1. Accuracy: Up to 40 Points (Bullseye = 40 pts, perimeter = 20 pts)
        const accRatio = Math.max(0, 1.0 - (dist / hitRadius));
        accuracyPts = Math.round(20 + 20 * accRatio);

        // 2. Reaction Time: Up to 20 Points (< 1.0s = 20 pts, decays to 5 pts at 5.0s)
        const reactionSec = Math.max(0.1, (now - activeTgt.spawnTime) / 1000.0);
        this.reactionTimes.push(reactionSec);
        if (reactionSec <= 1.0) {
          reactionPts = 20;
        } else if (reactionSec <= 5.0) {
          reactionPts = Math.round(20 - ((reactionSec - 1.0) / 4.0) * 15);
        } else {
          reactionPts = 5;
        }

        // 3. Ammunition Efficiency: Up to 20 Points (1 shot = 20 pts, 2 shots = 14 pts, etc.)
        const shots = activeTgt.shotsFired;
        if (shots === 1) {
          ammoPts = 20;
        } else if (shots === 2) {
          ammoPts = 14;
        } else if (shots === 3) {
          ammoPts = 8;
        } else {
          ammoPts = 4;
        }

        // 4. Target Difficulty: Up to 20 Points
        const diffConfig = DIFFICULTY_CONFIGS[activeTgt.difficulty] || this.diffConfig;
        const speedBonus = Math.min(2, Math.max(0, Math.round(((activeTgt.ai.speedFactor || 1.0) - 1.0) * 5)));
        diffPts = Math.min(20, diffConfig.difficultyBasePoints + speedBonus);

        // Total 100 Points per Target
        totalTargetScore = Math.min(100, Math.max(1, accuracyPts + reactionPts + ammoPts + diffPts));

        this.hits++;
        this.targetsDestroyed++;
        this.combo++;
        if (this.combo > this.bestCombo) this.bestCombo = this.combo;

        this.score += totalTargetScore;
        this.targetScores.push(totalTargetScore);

        // Accurate Collision Impact Sparks & Explosions at Target Location
        this.createImpactSparks(shotX, shotY);
        this.createExplosion(activeTgt.x, activeTgt.y, activeTgt.ai.color, activeTgt.ai.glow, activeTgt.size);

        // Floating Score Breakdown Text
        this.floatingTexts.push({
          text: `+${totalTargetScore} PTS [${activeTgt.ai.name.toUpperCase()}]`,
          x: activeTgt.x,
          y: activeTgt.y - 25,
          alpha: 1.0,
          color: this.combo > 3 ? '#facc15' : (activeTgt.ai.glow || '#38bdf8')
        });

        this.floatingTexts.push({
          text: `ACC:${accuracyPts} | RT:${reactionSec.toFixed(1)}s(${reactionPts}) | EFF:${ammoPts} | DIFF:${diffPts}`,
          x: activeTgt.x,
          y: activeTgt.y - 8,
          alpha: 0.9,
          color: '#e2e8f0',
          fontSize: 10
        });

        sound.playHit();
        if (this.combo % 5 === 0) sound.playCombo();

        // Dynamic sensitivity fluctuation
        this.fluctuateAimSensitivity();

        // Advance to next target in 50 queue
        this.aiTargetIndex++;

        if (this.aiTargetIndex >= this.TOTAL_TARGETS) {
          this.completedAllTargets = true;
          this.targets = [];
          setTimeout(() => {
            this.finishSession();
          }, 450);
        } else {
          this.targets = [];
          this.isSpawningNextTarget = true;
          setTimeout(() => {
            if (this.isRunning) {
              this.spawnNextAITarget();
              this.isSpawningNextTarget = false;
            }
          }, 140);
        }
      }
    }

    if (!hitDetected) {
      this.misses++;
      this.combo = 0;
      sound.playMiss();

      // Accurate miss dust impact exactly at crosshair shot point
      this.createImpactSparks(shotX, shotY, '#94a3b8');

      this.floatingTexts.push({
        text: 'MISS',
        x: shotX,
        y: shotY - 12,
        alpha: 0.8,
        color: '#f43f5e'
      });
    }

    // Telemetry log
    this.shotsTelemetry.push({
      t: Math.round(this.getElapsedSeconds() * 1000),
      x: Math.round(shotX),
      y: Math.round(shotY),
      hit: hitDetected,
      source: source,
      score: totalTargetScore
    });

    // Auto-reload when mag emptied
    if (this.ammoInMag === 0 && this.reserveAmmo > 0) {
      setTimeout(() => {
        if (this.isRunning && !this.isReloading) {
          this.reloadWeapon();
        }
      }, 250);
    }

    this.notifyUpdate();
  }

  // Weapon Muzzle calculation relative to gun transform (exact suppressor tip)
  getMuzzlePosition() {
    const h = this.canvas?.height || 540;
    // Scaled weapon height (compact size near bottom-center)
    const weaponH = h * 0.35;
    const weaponW = weaponH * (925 / 421);

    const drawX = -weaponW * 0.58;
    const drawY = -weaponH * 0.46;

    // Suppressor tip measured exactly at 26.59% width, 30.53% height of weapon image
    const localTipX = drawX + weaponW * 0.2659;
    const localTipY = drawY + weaponH * 0.3053;

    const angle = this.gun.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const worldTipX = this.gun.x + (localTipX * cos - localTipY * sin);
    const worldTipY = this.gun.y + (localTipX * sin + localTipY * cos);

    return { x: worldTipX, y: worldTipY };
  }

  createImpactSparks(x, y, sparkColor = '#00f0ff') {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 5.0;
      this.impactSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 2.0,
        color: sparkColor,
        alpha: 1.0,
        decay: 0.05 + Math.random() * 0.04
      });
    }
  }

  createExplosion(x, y, color, glowColor, size) {
    const count = 36;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 7.0;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.5 + Math.random() * 3.8,
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

    const avgReactionTime = this.reactionTimes.length > 0
      ? (this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length).toFixed(2)
      : '0.00';

    this.onScoreUpdate({
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      totalShots: this.totalShots,
      combo: this.combo,
      bestCombo: this.bestCombo,
      targetsDestroyed: this.targetsDestroyed,
      targetsRemaining: Math.max(0, this.TOTAL_TARGETS - this.targetsDestroyed),
      totalTargets: this.TOTAL_TARGETS,
      accuracy: accuracy,
      avgReactionTime: avgReactionTime,
      remainingSeconds: Math.ceil(this.remainingSeconds),
      currentChapter: STORY_CHAPTERS[this.currentChapterIndex],
      currentDifficulty: this.currentDifficulty,
      currentTarget: activeTarget,
      targetProgress: `${Math.min(this.TOTAL_TARGETS, this.aiTargetIndex + 1)}/${this.TOTAL_TARGETS}`,
      aimSensitivity: this.aimSensitivity,
      sensitivityLabel: sensMode.tag,
      ammoInMag: '∞',
      reserveAmmo: '∞',
      isReloading: false
    });
  }

  loop() {
    if (!this.isRunning || this.isPaused) {
      this.animId = null;
      return;
    }
    try {
      this.update();
      this.draw();
    } catch (err) {
      console.error('[TargetStrikeEngine Loop Error]:', err);
    }
    if (this.isRunning && !this.isPaused && typeof requestAnimationFrame !== 'undefined') {
      this.animId = requestAnimationFrame(() => this.loop());
    } else {
      this.animId = null;
    }
  }

  // ==========================================================================
  // UPDATE PIPELINE (WASD-ONLY AIMING, WIDE WEAPON MOTION, CLOUDS, TARGETS)
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

    if (this.remainingSeconds <= 0 && !this.completedAllTargets) {
      this.finishSession();
      return;
    }

    // Process Reload completion
    if (this.isReloading) {
      const reloadElapsed = performance.now() - this.reloadStartTime;
      if (reloadElapsed >= this.reloadDurationMs) {
        const needed = this.magCapacity - this.ammoInMag;
        const loaded = Math.min(needed, this.reserveAmmo);
        this.ammoInMag += loaded;
        this.reserveAmmo -= loaded;
        this.isReloading = false;
        sound.playCombo();
        this.notifyUpdate();
      }
    }

    const w = this.canvas?.width || 960;
    const h = this.canvas?.height || 540;

    // ========================================================================
    // SECTION 3: PURE WASD AIMING INPUT (CONTINUOUS, SMOOTH ACCEL/DECEL)
    // ========================================================================
    let ax = 0;
    let ay = 0;
    if (this.keys.w) ay -= 1; // W: Aim upward
    if (this.keys.s) ay += 1; // S: Aim downward
    if (this.keys.a) ax -= 1; // A: Aim left
    if (this.keys.d) ax += 1; // D: Aim right

    if (ax !== 0 && ay !== 0) {
      ax *= 0.7071;
      ay *= 0.7071;
    }

    // Moderate, comfortable WASD aiming speed (stops smoothly without overshooting)
    const effectiveAimSpeed = this.customTargetConfigs?.aimSpeed || this.baseAimSpeed || 2.1;
    const accel = effectiveAimSpeed * this.aimSensitivity;
    this.crosshair.vx = this.crosshair.vx * 0.78 + ax * accel;
    this.crosshair.vy = this.crosshair.vy * 0.78 + ay * accel;

    this.crosshair.x += this.crosshair.vx;
    this.crosshair.y += this.crosshair.vy;

    // Strict boundaries so crosshair stays comfortably on screen
    const padX = 40;
    const padY = 40;
    this.crosshair.x = Math.max(padX, Math.min(w - padX, this.crosshair.x));
    this.crosshair.y = Math.max(padY, Math.min(h - padY, this.crosshair.y));

    // Dynamic Hover Check
    let hover = false;
    const activeTgt = this.targets[0];
    if (activeTgt && !activeTgt.hit) {
      const dx = this.crosshair.x - activeTgt.x;
      const dy = this.crosshair.y - activeTgt.y;
      const hitRadius = (activeTgt.size / 2 + 10) * (activeTgt.hitboxScale || 1.0);
      if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
        hover = true;
      }
    }
    this.crosshair.isOverTarget = hover;

    // ========================================================================
    // SECTION 2: REALISTIC, FULLY VISIBLE HUMAN HAND & WEAPON RIG
    // ========================================================================
    // Base resting weapon position: compact area near bottom-center
    const baseGunX = w * 0.52;
    const baseGunY = h * 0.82;

    // Normalized aim offsets from center (-1.0 to +1.0)
    const normX = (this.crosshair.x - w * 0.5) / (w * 0.5);
    const normY = (this.crosshair.y - h * 0.40) / (h * 0.5);

    // Noticeable, realistic turning following aim direction (~14.5 degrees / ~0.25 rad max):
    // Visibly turns left when aiming far left, visibly turns right when aiming far right,
    // and returns smoothly to natural center when aiming toward the center.
    const naturalTurnAngle = normX * 0.25 + normY * 0.03;

    // Noticeable horizontal and vertical perspective shift following aim direction
    const naturalShiftX = normX * 68;
    const naturalShiftY = normY * 16;

    // Smooth inertia sway from WASD velocity (weapon lags slightly behind movement then catches up)
    const targetSwayX = -this.crosshair.vx * 1.4;
    const targetSwayY = -this.crosshair.vy * 0.9;
    const targetSwayAngle = -this.crosshair.vx * 0.005;

    this.gun.swayX += (targetSwayX - this.gun.swayX) * 0.14;
    this.gun.swayY += (targetSwayY - this.gun.swayY) * 0.14;
    this.gun.swayAngle += (targetSwayAngle - this.gun.swayAngle) * 0.14;

    // Gentle breathing idle bobbing
    this.gun.idleTime += 0.022;
    const idleX = Math.cos(this.gun.idleTime * 0.5) * 0.6;
    const idleY = Math.sin(this.gun.idleTime * 1.0) * 1.0;

    // Recoil recovery
    this.gun.recoilY *= 0.82;
    this.gun.recoilX *= 0.82;
    this.gun.recoilAngle *= 0.82;
    this.screenShake *= 0.78;

    const targetGunX = baseGunX + naturalShiftX + this.gun.swayX + idleX + this.gun.recoilX;
    const targetGunY = baseGunY + naturalShiftY + this.gun.swayY + idleY + this.gun.recoilY;
    const targetGunAngle = naturalTurnAngle + this.gun.swayAngle + this.gun.recoilAngle;

    // Smooth, organic interpolation (0.16) for realistic, fluid motion without snapping or jitter
    this.gun.x += (targetGunX - this.gun.x) * 0.16;
    this.gun.y += (targetGunY - this.gun.y) * 0.16;
    this.gun.angle += (targetGunAngle - this.gun.angle) * 0.16;

    // Update Muzzle Flash
    if (this.muzzleFlash.active) {
      this.muzzleFlash.timer--;
      if (this.muzzleFlash.timer <= 0) {
        this.muzzleFlash.active = false;
      }
    }

    // ========================================================================
    // SECTION 1: MODERATE DRIFTING CLOUDS & ATMOSPHERIC DUST
    // ========================================================================
    for (const c of this.clouds) {
      c.x += c.speed;
      const img = this.cloudImages[c.imgIndex];
      const naturalW = img?.naturalWidth || 600;
      const cloudWidth = naturalW * c.scale;
      // Seamless wrap-around across screen bounds without popping
      if (c.x > w + 40) {
        c.x = -cloudWidth - 30;
        c.y = c.minY + Math.random() * (c.maxY - c.minY);
      }
    }

    // Atmospheric dust particles
    for (const p of this.atmosphericDust) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x > w + 20) p.x = -20;
      if (p.y < 20) p.y = h * 0.85;
    }

    // ========================================================================
    // UPDATE ACTIVE AI TARGET MOVEMENT
    // ========================================================================
    const now = performance.now();
    if (activeTgt && !activeTgt.hit) {
      if (activeTgt.warpInScale < 1.0) {
        activeTgt.warpInScale = Math.min(1.0, activeTgt.warpInScale + 0.09);
      }

      activeTgt.pulse += 0.055;
      activeTgt.rotation += activeTgt.rotSpeed;
      activeTgt.wavePhase += 0.04;

      // Periodic Direction Change
      if (now > activeTgt.nextDirectionChange) {
        const speed = this.getAITargetSpeed(activeTgt.ai);
        const newAngle = Math.random() * Math.PI * 2;
        activeTgt.targetVx = Math.cos(newAngle) * speed;
        activeTgt.targetVy = Math.sin(newAngle) * speed;

        const diff = DIFFICULTY_CONFIGS[activeTgt.difficulty] || this.diffConfig;
        const changeInterval = diff.directionChangeMinMs + Math.random() * (diff.directionChangeMaxMs - diff.directionChangeMinMs);
        activeTgt.nextDirectionChange = now + changeInterval;
      }

      // Smooth velocity steering
      activeTgt.vx += (activeTgt.targetVx - activeTgt.vx) * 0.085;
      activeTgt.vy += (activeTgt.targetVy - activeTgt.vy) * 0.085;

      // Trajectory pattern modifier
      let waveOffset = 0;
      if (activeTgt.patternType === 'sine') {
        waveOffset = Math.sin(activeTgt.wavePhase) * 1.5;
      } else if (activeTgt.patternType === 'zigzag') {
        waveOffset = Math.sin(activeTgt.wavePhase * 2.0) * 2.2;
      }

      activeTgt.x += activeTgt.vx;
      activeTgt.y += activeTgt.vy + waveOffset;

      // Viewport bounce boundaries
      const half = activeTgt.size / 2;
      const minX = half + 20;
      const maxX = w - half - 20;
      const minY = half + 30;
      const maxY = Math.max(minY + 60, h * 0.72);

      if (activeTgt.x < minX) {
        activeTgt.x = minX;
        activeTgt.vx = Math.abs(activeTgt.vx) * 0.95;
        activeTgt.targetVx = Math.abs(activeTgt.targetVx || 1);
      }
      if (activeTgt.x > maxX) {
        activeTgt.x = maxX;
        activeTgt.vx = -Math.abs(activeTgt.vx) * 0.95;
        activeTgt.targetVx = -Math.abs(activeTgt.targetVx || 1);
      }
      if (activeTgt.y < minY) {
        activeTgt.y = minY;
        activeTgt.vy = Math.abs(activeTgt.vy) * 0.95;
        activeTgt.targetVy = Math.abs(activeTgt.targetVy || 1);
      }
      if (activeTgt.y > maxY) {
        activeTgt.y = maxY;
        activeTgt.vy = -Math.abs(activeTgt.vy) * 0.95;
        activeTgt.targetVy = -Math.abs(activeTgt.targetVy || 1);
      }
    } else if (this.targets.length === 0 && !this.isSpawningNextTarget && this.aiTargetIndex < this.TOTAL_TARGETS) {
      this.spawnNextAITarget();
    }

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += p.speed;
      p.x = p.startX + (p.targetX - p.startX) * p.progress;
      p.y = p.startY + (p.targetY - p.startY) * p.progress;
      p.alpha = Math.max(0, 1.0 - p.progress * 0.85);

      if (p.progress >= 1.0) {
        this.projectiles.splice(i, 1);
      }
    }

    // Update Impact Sparks
    for (let i = this.impactSparks.length - 1; i >= 0; i--) {
      const s = this.impactSparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.alpha -= s.decay;
      if (s.alpha <= 0) this.impactSparks.splice(i, 1);
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) this.particles.splice(i, 1);
    }

    // Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 1.0;
      ft.alpha -= 0.018;
      if (ft.alpha <= 0) this.floatingTexts.splice(i, 1);
    }

    if (this.chapterBannerTimer > 0) {
      this.chapterBannerTimer--;
    }
  }

  // Session completion
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
  // RENDERING PIPELINE (DYNAMIC 3D ENVIRONMENT, WEAPON, HUD)
  // ==========================================================================
  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const elapsedSec = this.getElapsedSeconds();

    ctx.clearRect(0, 0, w, h);

    // Screen Shake Offset
    ctx.save();
    if (this.screenShake > 0.1) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // Parallax Aim Offset for Scenery
    const normX = (this.crosshair.x - w * 0.5) / (w * 0.5);
    const normY = (this.crosshair.y - h * 0.44) / (h * 0.5);
    const bgShiftX = -normX * 18;
    const bgShiftY = -normY * 12;

    // 1. Draw Realistic Desert Landscape Backdrop with Parallax
    if (this.bgLoaded && this.bgImage) {
      ctx.drawImage(this.bgImage, bgShiftX - 22, bgShiftY - 16, w + 44, h + 32);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.42, '#bae6fd');
      grad.addColorStop(0.55, '#c2410c');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Dynamic Time-of-Day Atmospheric Lighting Shift (Console 3D Polish)
    // Progressively adds subtle warm sun rays / golden hour tint across session
    const timeRatio = Math.min(1.0, elapsedSec / this.totalDurationSeconds);
    if (timeRatio > 0.1) {
      ctx.save();
      const sunGrad = ctx.createRadialGradient(w * 0.25, 30, 20, w * 0.25, 30, w * 0.85);
      sunGrad.addColorStop(0, `rgba(254, 240, 138, ${0.12 * timeRatio})`);
      sunGrad.addColorStop(0.5, `rgba(249, 115, 22, ${0.08 * timeRatio})`);
      sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 3. Render Slowly Moving Clouds with Depth & Parallax
    this.drawClouds(ctx, w, h, normX, normY);

    // 4. Render Atmospheric Dust Particles
    this.drawAtmosphericDust(ctx);

    // 5. Subtle Canyon Vignette
    const vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, w * 0.72);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);

    // 6. Render Active AI Target
    const activeTgt = this.targets[0];
    if (activeTgt && !activeTgt.hit) {
      const renderSize = activeTgt.size * (activeTgt.warpInScale || 1.0);
      drawAIEmblem(ctx, activeTgt.ai, activeTgt.x, activeTgt.y, renderSize, activeTgt.pulse, activeTgt.rotation);
    }

    // 7. Render Projectile Bullet Tracers
    this.drawProjectiles(ctx);

    // 8. Render Impact Sparks & Explosion Debris
    this.drawParticles(ctx);

    // 9. Render Realistic First-Person Weapon with Wide Aim Travel, Sway & Recoil
    this.drawWeapon(ctx, w, h);

    // 10. Render Muzzle Flash
    this.drawMuzzleFlash(ctx);

    // 11. Floating Combat Texts
    this.drawFloatingTexts(ctx);

    // 12. Ammunition HUD (30 / 90 Auto)
    this.drawAmmunitionHUD(ctx, w, h);

    // 13. Sensitivity Meter HUD (Bottom-Right)
    this.drawSensitivityHUD(ctx, w, h);

    // 14. Holographic Crosshair
    this.drawCrosshair(ctx);

    // 15. Story Chapter Banner
    this.drawChapterBanner(ctx, w);

    ctx.restore();
  }

  drawClouds(ctx, w, h, normX, normY) {
    if (!this.cloudsLoaded || this.cloudImages.length === 0) return;

    for (const c of this.clouds) {
      const img = this.cloudImages[c.imgIndex];
      if (!img || !img.complete) continue;

      const cw = img.naturalWidth * c.scale;
      const ch = img.naturalHeight * c.scale;

      const cloudX = c.x - normX * 8 * (c.speed * 12);
      const cloudY = c.y - normY * 4 * (c.speed * 12);

      // Soft edge fade-out so clouds enter and exit completely seamlessly without popping
      let edgeFade = 1.0;
      if (cloudX < 0) {
        edgeFade = Math.max(0, Math.min(1.0, (cloudX + cw) / Math.max(1, cw * 0.4)));
      } else if (cloudX + cw > w) {
        edgeFade = Math.max(0, Math.min(1.0, (w - cloudX) / Math.max(1, cw * 0.4)));
      }

      ctx.save();
      ctx.globalAlpha = c.alpha * edgeFade;
      ctx.drawImage(img, cloudX, cloudY, cw, ch);
      ctx.restore();
    }
  }

  drawAtmosphericDust(ctx) {
    for (const p of this.atmosphericDust) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;

      const dx = p.targetX - p.startX;
      const dy = p.targetY - p.startY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const dirX = dx / len;
        const dirY = dy / len;
        const tracerTailLen = Math.min(48, len * 0.28);

        const tailX = p.x - dirX * tracerTailLen;
        const tailY = p.y - dirY * tracerTailLen;

        // Glowing outer tracer
        ctx.strokeStyle = p.glowColor;
        ctx.lineWidth = 4.2;
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        // White core tracer
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    // Impact sparks
    for (const s of this.impactSparks) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Explosion debris
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
  }

  // Realistic, compact first-person human hand and weapon rig (bottom-center screen)
  drawWeapon(ctx, w, h) {
    if (!this.weaponLoaded || !this.weaponImg) return;

    ctx.save();
    ctx.translate(this.gun.x, this.gun.y);
    ctx.rotate(this.gun.angle);

    // Compact rendered size occupying small bottom-center area without obstructing targets
    const weaponH = h * 0.35;
    const weaponW = weaponH * (925 / 421);

    const drawX = -weaponW * 0.58;
    const drawY = -weaponH * 0.46;

    ctx.drawImage(this.weaponImg, drawX, drawY, weaponW, weaponH);
    ctx.restore();
  }

  drawMuzzleFlash(ctx) {
    if (!this.muzzleFlash.active) return;

    ctx.save();
    const mx = this.muzzleFlash.x;
    const my = this.muzzleFlash.y;

    const radGrad = ctx.createRadialGradient(mx, my, 4, mx, my, 42);
    radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    radGrad.addColorStop(0.3, 'rgba(254, 240, 138, 0.88)');
    radGrad.addColorStop(0.65, 'rgba(249, 115, 22, 0.52)');
    radGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');

    ctx.fillStyle = radGrad;
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(mx, my, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 + Math.random() * 0.3;
      const rayLen = 16 + Math.random() * 20;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a) * rayLen, my + Math.sin(a) * rayLen);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawFloatingTexts(ctx) {
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1.0, ft.alpha));
      ctx.fillStyle = ft.color;
      ctx.font = ft.fontSize
        ? `bold ${ft.fontSize}px "JetBrains Mono", monospace`
        : 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  drawAmmunitionHUD(ctx, w, h) {
    ctx.save();

    const hudX = 36;
    const hudY = h - 52;

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;

    // Tactical rifle silhouette SVG path
    ctx.save();
    ctx.translate(hudX, hudY - 32);
    ctx.scale(0.85, 0.85);
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(18, 5);
    ctx.lineTo(24, 7);
    ctx.lineTo(45, 7);
    ctx.lineTo(76, 7);
    ctx.lineTo(76, 10);
    ctx.lineTo(54, 10);
    ctx.lineTo(46, 22);
    ctx.lineTo(40, 22);
    ctx.lineTo(39, 12);
    ctx.lineTo(28, 20);
    ctx.lineTo(22, 19);
    ctx.lineTo(25, 12);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hudX, hudY - 14, 56, 3.5);

    if (this.isReloading) {
      const reloadElapsed = performance.now() - this.reloadStartTime;
      const reloadPct = Math.min(1.0, reloadElapsed / this.reloadDurationMs);

      ctx.font = 'black 22px "JetBrains Mono", monospace';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('RELOADING...', hudX, hudY + 18);

      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(hudX, hudY + 26, 120, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(hudX, hudY + 26, 120 * reloadPct, 4);
    } else {
    ctx.font = '900 28px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('∞', hudX, hudY + 18);

    const magTextWidth = ctx.measureText('∞').width;
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(' / UNLIMITED', hudX + magTextWidth + 6, hudY + 16);
    }

    ctx.restore();
  }

  drawSensitivityHUD(ctx, w, h) {
    ctx.save();
    const mode = this.sensitivityModes[this.currentSensitivityIndex];
    const bw = 180;
    const bh = 54;
    const bx = w - bw - 24;
    const by = h - 72;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = mode.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('AIM RESPONSE (WASD CONTROL)', bx + 12, by + 16);

    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = mode.color;
    ctx.fillText(`${mode.name} (${mode.tag})`, bx + 12, by + 32);

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
      ctx.moveTo(cx - bDist, cy - bDist + bLen);
      ctx.lineTo(cx - bDist, cy - bDist);
      ctx.lineTo(cx - bDist + bLen, cy - bDist);
      ctx.moveTo(cx + bDist - bLen, cy - bDist);
      ctx.lineTo(cx + bDist, cy - bDist);
      ctx.lineTo(cx + bDist, cy - bDist + bLen);
      ctx.moveTo(cx - bDist, cy + bDist - bLen);
      ctx.lineTo(cx - bDist, cy + bDist);
      ctx.lineTo(cx - bDist + bLen, cy + bDist);
      ctx.moveTo(cx + bDist - bLen, cy + bDist);
      ctx.lineTo(cx + bDist, cy + bDist);
      ctx.lineTo(cx + bDist, cy + bDist - bLen);
      ctx.stroke();

      const tgt = this.targets[0];
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tgt ? `TARGET LOCKED: ${tgt.ai.name.toUpperCase()}` : 'TARGET LOCKED', cx, cy - r - 14);
    }

    // Inner reticle notches
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

    ctx.fillStyle = isHover ? '#f43f5e' : '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawChapterBanner(ctx, w) {
    if (this.chapterBannerTimer <= 0 || !this.options.storyEnabled) return;

    const ch = STORY_CHAPTERS[this.currentChapterIndex];
    const bannerAlpha = Math.min(1.0, this.chapterBannerTimer / 30.0);

    ctx.save();
    ctx.globalAlpha = bannerAlpha;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = ch.themeColor;
    ctx.lineWidth = 1.5;

    const bw = 500;
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
