import React, { useState, useEffect, useRef } from 'react';
import { TargetStrikeEngine, STORY_CHAPTERS } from '../game/engine';
import { sound } from '../utils/sound';
import { api } from '../services/api';
import { esp32Service, TRIGGER_STATUS } from '../services/esp32Trigger';
import {
  Crosshair, Zap, Play, Trophy, RotateCcw, AlertTriangle, CheckCircle2,
  ShieldCheck, ShieldAlert, Flame, KeyRound, Clock, BookOpen, Layers,
  Radio, Wifi, WifiOff, Cpu, RefreshCw, X, Activity, Sliders, Check,
  Maximize2, Minimize2, Eye, EyeOff
} from 'lucide-react';

const STATES = {
  VERIFY: 'VERIFY',         // Team ID & Access Code entry
  READY: 'READY',           // Briefing & Pre-Game Instructions
  COUNTDOWN: 'COUNTDOWN',   // 3-2-1 match countdown
  PLAYING: 'PLAYING',       // Official 7-minute match active
  SUBMITTING: 'SUBMITTING', // Authoritative server result ingestion
  GAME_OVER: 'GAME_OVER',   // Final score & ranking summary
  ERROR: 'ERROR'
};

// Module-level persistent references to preserve exact active game state across route changes (e.g. visiting Scoreboard)
let inMemoryActiveEngine = null;
let inMemoryActiveSessionToken = null;
let inMemoryActiveSession = null;
let inMemoryActiveHudStats = null;
let inMemoryActiveWasFullscreen = false;

let lastSnapshotSaveTime = 0;

function saveEngineSnapshot(engine, token, sessionData, stats, wasFs, force = false) {
  if (!engine || !token) return;
  const now = Date.now();
  if (sessionData) {
    inMemoryActiveSession = sessionData;
  }
  if (stats) {
    inMemoryActiveHudStats = stats;
  }
  if (wasFs !== undefined) {
    inMemoryActiveWasFullscreen = Boolean(wasFs);
  }

  // Throttle disk/sessionStorage writes to once every 4 seconds during active gameplay unless forced
  if (!force && now - lastSnapshotSaveTime < 4000) return;
  lastSnapshotSaveTime = now;

  try {
    const state = engine.exportState();
    state.sessionToken = token;
    if (sessionData) {
      state.sessionData = sessionData;
      sessionStorage.setItem('active_game_session_data', JSON.stringify(sessionData));
    }
    if (stats) {
      state.hudStats = stats;
    }
    if (wasFs !== undefined) {
      state.wasFullscreen = Boolean(wasFs);
    }
    sessionStorage.setItem('active_game_engine_snapshot', JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save engine snapshot:', err);
  }
}

export default function GameStation() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const gameAreaRef = useRef(null);

  // Fast recovery check: detect if returning to an active ongoing match
  const checkActiveMatch = () => {
    if (
      inMemoryActiveEngine &&
      inMemoryActiveEngine.remainingSeconds > 0 &&
      !inMemoryActiveEngine.completedAllTargets
    ) {
      return true;
    }
    try {
      const snap = sessionStorage.getItem('active_game_engine_snapshot');
      if (snap) {
        const parsed = JSON.parse(snap);
        if (parsed && parsed.remainingSeconds > 0 && !parsed.completedAllTargets) {
          return true;
        }
      }
    } catch {}
    return false;
  };

  const isReturningActive = checkActiveMatch();

  const [gameState, setGameState] = useState(() => (isReturningActive ? STATES.PLAYING : STATES.VERIFY));
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(isReturningActive && inMemoryActiveWasFullscreen));
  const [fullscreenError, setFullscreenError] = useState('');
  const [countdown, setCountdown] = useState(3);
  const countdownTimerRef = useRef(null);
  const countdownActiveRef = useRef(false);

  // Clean up any pending countdown timer on component unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);
  const [inputTeamCode, setInputTeamCode] = useState('');
  const [inputAccessCode, setInputAccessCode] = useState('');
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState('MEDIUM');

  // Active Session info - fast restored from in-memory cache or sessionStorage
  const [activeSession, setActiveSession] = useState(() => {
    if (inMemoryActiveSession) return inMemoryActiveSession;
    try {
      const raw = sessionStorage.getItem('active_game_session_data');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });
  const [sessionToken, setSessionToken] = useState(() => {
    return inMemoryActiveSessionToken || sessionStorage.getItem('active_game_session_token') || null;
  });
  const [errorMsg, setErrorMsg] = useState(null);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [cachedTelemetry, setCachedTelemetry] = useState(null);
  const [showOperatorPanel, setShowOperatorPanel] = useState(false);

  // Live HUD - restored immediately from active engine state
  const [hudStats, setHudStats] = useState(() => {
    if (inMemoryActiveHudStats) return inMemoryActiveHudStats;
    if (inMemoryActiveEngine) {
      const actualShots = Math.max(1, inMemoryActiveEngine.totalShots);
      return {
        score: inMemoryActiveEngine.score,
        hits: inMemoryActiveEngine.hits,
        misses: inMemoryActiveEngine.misses,
        totalShots: inMemoryActiveEngine.totalShots,
        combo: inMemoryActiveEngine.combo,
        bestCombo: inMemoryActiveEngine.bestCombo,
        targetsDestroyed: inMemoryActiveEngine.targetsDestroyed,
        targetsRemaining: Math.max(0, inMemoryActiveEngine.TOTAL_TARGETS - inMemoryActiveEngine.targetsDestroyed),
        totalTargets: inMemoryActiveEngine.TOTAL_TARGETS,
        accuracy: inMemoryActiveEngine.totalShots > 0
          ? parseFloat(((inMemoryActiveEngine.hits / actualShots) * 100).toFixed(1))
          : 0,
        remainingSeconds: Math.ceil(inMemoryActiveEngine.remainingSeconds),
        currentChapter: STORY_CHAPTERS[inMemoryActiveEngine.currentChapterIndex] || STORY_CHAPTERS[0],
        currentDifficulty: inMemoryActiveEngine.currentDifficulty,
        currentTarget: inMemoryActiveEngine.targets[0]?.ai || null,
        targetProgress: `${Math.min(inMemoryActiveEngine.TOTAL_TARGETS, inMemoryActiveEngine.aiTargetIndex + 1)}/${inMemoryActiveEngine.TOTAL_TARGETS}`,
        aimSensitivity: inMemoryActiveEngine.aimSensitivity,
        sensitivityLabel: inMemoryActiveEngine.sensitivityModes?.[inMemoryActiveEngine.currentSensitivityIndex]?.tag || '100%',
        ammoInMag: '∞',
        reserveAmmo: '∞',
        isReloading: false
      };
    }
    return {
      score: 0,
      hits: 0,
      misses: 0,
      totalShots: 0,
      combo: 0,
      bestCombo: 0,
      targetsDestroyed: 0,
      accuracy: 0,
      remainingSeconds: 420,
      currentChapter: STORY_CHAPTERS[0]
    };
  });

  // Final Result
  // Final Result
  const [finalResult, setFinalResult] = useState(null);

  // Queue pool for operator convenience
  const [queueTeams, setQueueTeams] = useState([]);

  // ESP32 Hardware Trigger State
  const [esp32Status, setEsp32Status] = useState(esp32Service.getESP32Status());
  const [esp32Info, setEsp32Info] = useState({
    status: esp32Service.getESP32Status(),
    url: esp32Service.getUrl(),
    lastReceivedAt: null,
    triggerCount: 0
  });
  const [showHardwareTestModal, setShowHardwareTestModal] = useState(false);
  const [customWsUrl, setCustomWsUrl] = useState(esp32Service.getUrl());
  const [hardwarePulse, setHardwarePulse] = useState(false);
  const [urlSavedFeedback, setUrlSavedFeedback] = useState(false);

  // Keep a ref to gameState to prevent stale closures in the trigger listener
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = document.fullscreenElement === gameAreaRef.current;
      setIsFullscreen(fullscreen);
      if (fullscreen) setFullscreenError('');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (
      [STATES.SUBMITTING, STATES.GAME_OVER, STATES.ERROR].includes(gameState) &&
      document.fullscreenElement === gameAreaRef.current
    ) {
      document.exitFullscreen().catch((error) => {
        console.error('Could not exit game fullscreen:', error);
        setFullscreenError('The match ended, but the browser could not exit fullscreen. Press Esc to leave.');
      });
    }
  }, [gameState]);

  // ESP32 WebSocket Lifecycle & Shooting Integration
  useEffect(() => {
    // 1. Establish single shared connection to configured ESP32 address
    esp32Service.connectESP32();

    // 2. Subscribe to connection status changes
    const unsubStatus = esp32Service.subscribeToStatus((info) => {
      setEsp32Status(info.status);
      setEsp32Info(info);
      setCustomWsUrl(info.url);
    });

    // 3. Subscribe to incoming hardware trigger SHOOT events
    const unsubTrigger = esp32Service.subscribeToTrigger((event) => {
      // Visual feedback pulse for operator
      setHardwarePulse(true);
      setTimeout(() => setHardwarePulse(false), 220);

      // Section 8: RESPECT THE GAME STATE
      // Reject trigger input if game is not in official active PLAYING state!
      // (reject IDLE/VERIFY, READY, COUNTDOWN, SUBMITTING, GAME_OVER, ERROR, or paused)
      if (gameStateRef.current !== STATES.PLAYING) {
        console.log(`[ESP32 Trigger] Shot ignored: current gameState is ${gameStateRef.current} (not PLAYING)`);
        return;
      }

      // Ensure engine is running and not paused
      if (!engineRef.current || !engineRef.current.isRunning || engineRef.current.isPaused) {
        console.log('[ESP32 Trigger] Shot ignored: engine is not running');
        return;
      }

      // Section 7: Invoke existing game shooting controller
      engineRef.current.fireWeapon('esp32');
    });

    return () => {
      unsubStatus();
      unsubTrigger();
    };
  }, []);

  const handleSaveCustomUrl = (e) => {
    if (e) e.preventDefault();
    esp32Service.setCustomUrl(customWsUrl);
    setUrlSavedFeedback(true);
    setTimeout(() => setUrlSavedFeedback(false), 2000);
  };

  const handleResetDiagnostics = () => {
    esp32Service.resetDiagnostics();
  };


  const handleSimulateTrigger = () => {
    esp32Service.simulateTrigger();
  };

  const toggleGameFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === gameAreaRef.current) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement && gameAreaRef.current?.requestFullscreen) {
        await gameAreaRef.current.requestFullscreen();
      } else {
        setFullscreenError('Fullscreen is unavailable while another element is fullscreen.');
      }
    } catch (error) {
      console.error('Could not toggle game fullscreen:', error);
      setFullscreenError('Could not enter fullscreen. Check your browser permissions and try again.');
    }
  };

  // Check for existing active session on mount (Browser Refresh Recovery)
  useEffect(() => {
    if (!inMemoryActiveEngine) {
      checkCachedSession();
    }
  }, []);

  // Only poll queue when on the verification screen to avoid unnecessary network latency during gameplay
  useEffect(() => {
    if (gameState === STATES.VERIFY) {
      loadQueue();
      const qInterval = setInterval(loadQueue, 5000);
      return () => clearInterval(qInterval);
    }
  }, [gameState]);

  // Re-engage fullscreen on gesture if returning to a match that was in fullscreen
  useEffect(() => {
    if (isReturningActive && inMemoryActiveWasFullscreen && gameAreaRef.current && !document.fullscreenElement) {
      const resumeFs = () => {
        if (!document.fullscreenElement && gameAreaRef.current?.requestFullscreen) {
          gameAreaRef.current.requestFullscreen().catch(() => {});
        }
        window.removeEventListener('click', resumeFs);
        window.removeEventListener('keydown', resumeFs);
      };
      window.addEventListener('click', resumeFs, { once: true });
      window.addEventListener('keydown', resumeFs, { once: true });
      return () => {
        window.removeEventListener('click', resumeFs);
        window.removeEventListener('keydown', resumeFs);
      };
    }
  }, []);

  const loadQueue = async () => {
    try {
      const res = await api.getPublicQueue();
      if (res.success && res.data) {
        const pool = [];
        if (res.data.called_team) pool.push(res.data.called_team);
        if (res.data.next_team) pool.push(res.data.next_team);
        if (res.data.upcoming) {
          res.data.upcoming.forEach(t => {
            if (!pool.some(p => p.id === t.id)) pool.push(t);
          });
        }
        setQueueTeams(pool);
      }
    } catch (err) {
      console.warn("Could not poll queue:", err.message);
    }
  };

  const checkCachedSession = async () => {
    // If a countdown is actively underway, do not interfere with game flow
    if (gameStateRef.current === STATES.COUNTDOWN) return;

    const cachedToken = sessionToken || inMemoryActiveSessionToken || sessionStorage.getItem('active_game_session_token');
    if (!cachedToken) return;

    try {
      const res = await api.getGameSessionStatus(cachedToken);
      if (
        res.success &&
        ['INITIATED', 'COUNTDOWN', 'PLAYING'].includes(res.status) &&
        res.remaining_seconds > 0
      ) {
        setSessionToken(cachedToken);
        inMemoryActiveSessionToken = cachedToken;
        const sessionData = {
          team_code: res.team_code,
          team_name: res.team_name,
          difficulty: res.difficulty,
          duration_seconds: res.duration_seconds,
          remaining_seconds: res.remaining_seconds,
          current_score: res.total_score || 0,
          current_hits: res.total_hits || 0,
          current_misses: res.total_misses || 0,
          target_configs: res.target_configs
        };
        inMemoryActiveSession = sessionData;
        setActiveSession(sessionData);

        // Synchronize in-memory engine remaining time non-blockingly
        if (inMemoryActiveEngine && inMemoryActiveEngine.isRunning) {
          inMemoryActiveEngine.remainingSeconds = res.remaining_seconds;
          inMemoryActiveEngine.timeOffsetMs = (inMemoryActiveEngine.totalDurationSeconds - res.remaining_seconds) * 1000;
        }

        setHudStats(prev => ({
          ...prev,
          remainingSeconds: res.remaining_seconds,
          score: inMemoryActiveEngine ? inMemoryActiveEngine.score : (res.total_score || 0),
          hits: inMemoryActiveEngine ? inMemoryActiveEngine.hits : (res.total_hits || 0),
          misses: inMemoryActiveEngine ? inMemoryActiveEngine.misses : (res.total_misses || 0)
        }));

        if (res.status === 'PLAYING') {
          if (gameStateRef.current !== STATES.PLAYING) {
            setGameState(STATES.PLAYING);
          }
        } else if (res.status === 'INITIATED') {
          if (gameStateRef.current === STATES.VERIFY) {
            setGameState(STATES.READY);
          }
        }
      } else {
        sessionStorage.removeItem('active_game_session_token');
        sessionStorage.removeItem('active_game_engine_snapshot');
        sessionStorage.removeItem('active_game_session_data');
        if (inMemoryActiveEngine) {
          inMemoryActiveEngine.stop();
          inMemoryActiveEngine = null;
        }
        inMemoryActiveSessionToken = null;
        inMemoryActiveSession = null;
        inMemoryActiveHudStats = null;
        inMemoryActiveWasFullscreen = false;
        if (gameStateRef.current === STATES.PLAYING) {
          setGameState(STATES.VERIFY);
        }
      }
    } catch (err) {
      if (!inMemoryActiveEngine) {
        sessionStorage.removeItem('active_game_session_token');
      }
    }
  };

  // Verify Team ID & Game Access Code Handshake
  const handleVerifyAndStart = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const teamCode = inputTeamCode.trim().toUpperCase();
    const accessCode = inputAccessCode.trim().toUpperCase();

    if (!accessCode) {
      setErrorMsg("Please enter your secret Game Access Code.");
      return;
    }

    setLoadingVerify(true);

    try {
      const res = await api.verifyGameAccess(teamCode, accessCode, selectedDifficulty);
      if (res.success) {
        setSessionToken(res.session_token);
        inMemoryActiveSessionToken = res.session_token;
        inMemoryActiveSession = res;
        sessionStorage.setItem('active_game_session_token', res.session_token);
        sessionStorage.setItem('active_game_session_data', JSON.stringify(res));
        setActiveSession(res);
        setHudStats(prev => ({
          ...prev,
          remainingSeconds: res.remaining_seconds || 420,
          score: res.current_score || 0,
          hits: res.current_hits || 0,
          misses: res.current_misses || 0
        }));
        setGameState(STATES.READY);
      } else {
        setErrorMsg(res.error || "Verification failed.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to verify game access credentials.");
    } finally {
      setLoadingVerify(false);
    }
  };

  // Start 3-2-1 Countdown
  const launchCountdown = () => {
    if (!sessionToken) {
      setErrorMsg('No verified game session is available. Verify the access code again.');
      setGameState(STATES.ERROR);
      return;
    }

    if (countdownActiveRef.current) return;
    countdownActiveRef.current = true;

    if (!document.fullscreenElement) {
      void toggleGameFullscreen();
    }

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setGameState(STATES.COUNTDOWN);
    setCountdown(3);
    sound.playCountdown(false);

    let count = 3;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count === 2) {
        setCountdown(2);
        sound.playCountdown(false);
      } else if (count === 1) {
        setCountdown(1);
        sound.playCountdown(false);
      } else if (count === 0) {
        setCountdown('START');
        sound.playCountdown(true);
      } else if (count < 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        countdownActiveRef.current = false;

        api.startGameSession(sessionToken).then((res) => {
          setActiveSession((current) => {
            const updated = { ...current, ...res };
            inMemoryActiveSession = updated;
            sessionStorage.setItem('active_game_session_data', JSON.stringify(updated));
            return updated;
          });
          setHudStats((current) => ({
            ...current,
            remainingSeconds: res.remaining_seconds
          }));
          setGameState(STATES.PLAYING);
        }).catch((err) => {
          setErrorMsg(err.message || 'Could not start the official game session.');
          setGameState(STATES.ERROR);
        });
      }
    }, 1000);
  };

  // Start or resume the official game loop
  useEffect(() => {
    if (gameState === STATES.PLAYING && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.parentElement?.getBoundingClientRect();
      const parentW = rect?.width ? Math.round(rect.width) : 0;
      const parentH = rect?.height ? Math.round(rect.height) : 0;
      const w = parentW >= 320 ? parentW : (typeof window !== 'undefined' && window.innerWidth ? Math.min(1280, window.innerWidth - 64) : 960);
      const h = parentH >= 300 ? parentH : Math.min(540, Math.max(420, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260));
      canvas.width = Math.max(320, w);
      canvas.height = Math.max(300, h);

      try {
        // 1. Check if we have an in-memory active engine instance (e.g. returning from Scoreboard)
        if (
          inMemoryActiveEngine &&
          inMemoryActiveEngine.sessionToken === sessionToken &&
          inMemoryActiveEngine.remainingSeconds > 0 &&
          !inMemoryActiveEngine.completedAllTargets
        ) {
          // Re-attach canvas to exact existing engine instance with active targets, positions, speeds, score preserved
          inMemoryActiveEngine.attachCanvas(canvas, {
            onScoreUpdate: (stats) => {
              setHudStats(stats);
              inMemoryActiveHudStats = stats;
              saveEngineSnapshot(inMemoryActiveEngine, sessionToken, activeSession, stats, isFullscreen);
            },
            onGameOver: (telemetry) => {
              handleOfficialGameEnd(telemetry);
            }
          });
          engineRef.current = inMemoryActiveEngine;
        } else {
          // 2. Check for serialized snapshot from sessionStorage (e.g. page refresh)
          let savedState = null;
          try {
            const raw = sessionStorage.getItem('active_game_engine_snapshot');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.sessionToken === sessionToken) {
                savedState = parsed;
              }
            }
          } catch (e) {
            console.warn('Could not read saved engine snapshot:', e);
          }

          const engine = new TargetStrikeEngine(canvas, {
            difficulty: activeSession?.difficulty || 'MEDIUM',
            targetConfigs: activeSession?.target_configs || null,
            durationSeconds: activeSession?.duration_seconds ?? 420,
            remainingSeconds: activeSession?.remaining_seconds ?? activeSession?.duration_seconds ?? 420,
            initialScore: savedState?.score ?? activeSession?.current_score ?? 0,
            initialHits: savedState?.hits ?? activeSession?.current_hits ?? 0,
            initialMisses: savedState?.misses ?? activeSession?.current_misses ?? 0,
            savedState: savedState,
            sessionToken: sessionToken,
            onScoreUpdate: (stats) => {
              setHudStats(stats);
              inMemoryActiveHudStats = stats;
              saveEngineSnapshot(engine, sessionToken, activeSession, stats, isFullscreen);
            },
            onGameOver: (telemetry) => {
              handleOfficialGameEnd(telemetry);
            }
          });

          engine.sessionToken = sessionToken;
          engineRef.current = engine;
          inMemoryActiveEngine = engine;
          inMemoryActiveSessionToken = sessionToken;
          engine.start();
        }
      } catch (err) {
        console.error('[GameStation] Failed to start TargetStrikeEngine:', err);
      }

      return () => {
        // On unmount (e.g. user navigates to Scoreboard):
        if (engineRef.current) {
          const wasFs = (document.fullscreenElement === gameAreaRef.current) || isFullscreen;
          inMemoryActiveWasFullscreen = wasFs;
          saveEngineSnapshot(engineRef.current, sessionToken, activeSession, hudStats, wasFs, true);
          engineRef.current.detachCanvas();
          // Retain in inMemoryActiveEngine so returning from Scoreboard seamlessly resumes!
        }
      };
    }
  }, [gameState, sessionToken]);

  // Handle Game End & Submit Telemetry to Server
  const handleOfficialGameEnd = async (telemetry) => {
    setGameState(STATES.SUBMITTING);
    if (telemetry) setCachedTelemetry(telemetry);
    const dataToSubmit = telemetry || cachedTelemetry;

    try {
      const payload = {
        session_token: sessionToken,
        ...dataToSubmit
      };

      const res = await api.submitGameSession(payload);
      if (res.success) {
        setFinalResult(res);
        sessionStorage.removeItem('active_game_session_token');
        sessionStorage.removeItem('active_game_engine_snapshot');
        sessionStorage.removeItem('active_game_session_data');
        if (inMemoryActiveEngine) {
          inMemoryActiveEngine.stop();
          inMemoryActiveEngine = null;
        }
        inMemoryActiveSessionToken = null;
        inMemoryActiveSession = null;
        inMemoryActiveHudStats = null;
        inMemoryActiveWasFullscreen = false;
        setGameState(STATES.GAME_OVER);
      } else {
        setErrorMsg(res.error || "Server validation rejected submission.");
        setGameState(STATES.ERROR);
      }
    } catch (err) {
      setErrorMsg(err.message || "Network error occurred during result submission.");
      setGameState(STATES.ERROR);
    }
  };

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={gameAreaRef}
      className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 ${
        isFullscreen ? 'fixed inset-0 z-[100] h-screen w-screen max-w-none justify-start overflow-hidden' : ''
      }`}
    >
      <div className={`max-w-5xl w-full ${isFullscreen ? 'max-w-none h-full min-h-0 flex flex-col' : ''}`}>

        {/* ==================================================================== */}
        {/* ESP32 HARDWARE TRIGGER STATUS PANEL */}
        {/* ==================================================================== */}
        {!isFullscreen && <div className="mb-4 bg-slate-900/95 border border-slate-800 rounded-2xl p-3.5 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
          {/* Left: Device & Address */}
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
              hardwarePulse
                ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 scale-105'
                : esp32Status === TRIGGER_STATUS.CONNECTED
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : esp32Status === TRIGGER_STATUS.CONNECTING
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 animate-pulse'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              <Cpu className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                  ESP32 HARDWARE TRIGGER
                </span>
                <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                  PORT 81
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  • GPIO 4
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5 mt-0.5">
                <span>Target:</span>
                <code className="text-cyan-300 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                  {esp32Info.url}
                </code>
              </div>
            </div>
          </div>

          {/* Quick Connect Presets */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                esp32Service.setCustomUrl('ws://192.168.4.1:81/');
                setCustomWsUrl('ws://192.168.4.1:81/');
              }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition ${
                esp32Info.url.includes('192.168.4.1')
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Connect to default ESP32 Wi-Fi Access Point"
            >
              ESP32 AP (:81)
            </button>
            <button
              type="button"
              onClick={() => {
                esp32Service.setCustomUrl('ws://127.0.0.1:81/');
                setCustomWsUrl('ws://127.0.0.1:81/');
              }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition ${
                esp32Info.url.includes('127.0.0.1') || esp32Info.url.includes('localhost')
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Connect via local machine bridge"
            >
              Localhost (:81)
            </button>
          </div>

          {/* Center/Right: Status Badge, Trigger Flash & Actions */}
          <div className="flex items-center gap-2.5 ml-auto flex-wrap">
            {/* Live Trigger Pulse Indicator */}
            {hardwarePulse && (
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300 text-[10px] font-mono font-bold animate-pulse flex items-center gap-1">
                <Zap className="w-3 h-3 fill-current" />
                <span>TRIGGER PULSE!</span>
              </span>
            )}

            {/* Status Badge */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-bold tracking-wider ${
              esp32Status === TRIGGER_STATUS.CONNECTED
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : esp32Status === TRIGGER_STATUS.CONNECTING
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                : esp32Status === TRIGGER_STATUS.ERROR
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                esp32Status === TRIGGER_STATUS.CONNECTED
                  ? 'bg-emerald-400 animate-pulse'
                  : esp32Status === TRIGGER_STATUS.CONNECTING
                  ? 'bg-amber-400 animate-ping'
                  : esp32Status === TRIGGER_STATUS.ERROR
                  ? 'bg-rose-400'
                  : 'bg-slate-500'
              }`} />
              <span>{esp32Status}</span>
            </div>

            {/* Reconnect button */}
            <button
              type="button"
              onClick={() => esp32Service.connectESP32()}
              title="Connect / Reconnect to ESP32 WebSocket"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Hardware Test Mode button */}
            <button
              type="button"
              onClick={() => setShowHardwareTestModal(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-medium text-slate-300 hover:text-white transition flex items-center gap-1.5 shadow-sm"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Hardware Test Mode</span>
            </button>
          </div>

          {/* Actionable message when unavailable */}
          {esp32Status !== TRIGGER_STATUS.CONNECTED && esp32Status !== TRIGGER_STATUS.CONNECTING && (
            <div className="w-full pt-1.5 border-t border-slate-800/60 text-[11px] font-mono text-amber-400/90 flex items-center justify-between">
              <span>ESP32 is not connected. Use mouse left-click or connect the physical trigger.</span>
              <button
                type="button"
                onClick={() => esp32Service.connectESP32()}
                className="text-cyan-400 hover:text-cyan-300 underline font-semibold ml-2 cursor-pointer"
              >
                Connect / Retry
              </button>
            </div>
          )}
        </div>}

        {/* ==================================================================== */}
        {/* HARDWARE TEST MODE MODAL (SECTION 11) */}
        {/* Isolated diagnostic test bench — strictly does not affect game score */}
        {/* ==================================================================== */}
        {showHardwareTestModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-44 h-44 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-5">
                <div>
                  <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
                    <Activity className="w-4 h-4" />
                    <span>ESP32 HARDWARE TEST & DIAGNOSTICS</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    Diagnostic test bench — strictly isolated from official competition scoring.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHardwareTestModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* WebSocket Network Settings */}
              <div className="mb-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-xs font-mono uppercase text-slate-300 font-bold tracking-wider flex items-center justify-between">
                  <span>ESP32 WebSocket Address</span>
                  <span className="text-[10px] text-slate-500 font-normal">Port 81</span>
                </div>

                <form onSubmit={handleSaveCustomUrl} className="flex gap-2">
                  <input
                    type="text"
                    value={customWsUrl}
                    onChange={(e) => setCustomWsUrl(e.target.value)}
                    placeholder="ws://192.168.4.1:81/"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition flex items-center gap-1"
                  >
                    {urlSavedFeedback ? <Check className="w-3.5 h-3.5" /> : <Sliders className="w-3.5 h-3.5" />}
                    <span>Save & Connect</span>
                  </button>
                </form>

                <div className="text-[11px] text-slate-400 font-mono space-y-0.5">
                  <div>• Wi-Fi AP SSID: <span className="text-slate-200 font-bold">ESP32-Trigger</span></div>
                  <div>• Wi-Fi Password: <span className="text-slate-200 font-bold">Configured in ESP32 firmware</span></div>
                  <div>• Default Access Point IP: <span className="text-cyan-400 font-bold">192.168.4.1</span></div>
                </div>
              </div>

              {/* Diagnostic Metrics */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-1">
                    Connection Status
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      esp32Status === TRIGGER_STATUS.CONNECTED
                        ? 'bg-emerald-400 animate-pulse'
                        : esp32Status === TRIGGER_STATUS.CONNECTING
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                    }`} />
                    <span className="text-base font-bold font-mono text-white">
                      {esp32Status}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-1">
                    Last Trigger
                  </div>
                  <div className={`text-base font-bold font-mono ${
                    hardwarePulse ? 'text-cyan-300 animate-pulse' : esp32Info.lastReceivedAt ? 'text-cyan-400' : 'text-slate-500'
                  }`}>
                    {esp32Info.lastReceivedAt ? 'SHOOT' : 'Never'}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-1">
                    Trigger Count
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {esp32Info.triggerCount}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">Diagnostic Counter</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-1">
                    Last Event Time
                  </div>
                  <div className="text-xs font-mono text-slate-200 mt-1">
                    {esp32Info.lastReceivedAt ? (
                      new Date(esp32Info.lastReceivedAt).toLocaleTimeString() +
                      '.' +
                      String(new Date(esp32Info.lastReceivedAt).getMilliseconds()).padStart(3, '0')
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
              </div>

              {/* Visual Trigger Reaction Banner */}
              <div className={`p-3 rounded-2xl border text-center transition-all duration-200 mb-5 ${
                hardwarePulse
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-950/60 border-slate-800 text-slate-500'
              }`}>
                <div className="text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                  <Zap className={`w-4 h-4 ${hardwarePulse ? 'fill-current text-cyan-300 animate-bounce' : 'text-slate-600'}`} />
                  <span>{hardwarePulse ? 'HARDWARE TRIGGER PULSE DETECTED!' : 'AWAITING PHYSICAL BUTTON PRESS...'}</span>
                </div>
              </div>

              {/* Diagnostic Controls */}
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleResetDiagnostics}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Test Counter</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSimulateTrigger}
                    className="py-2.5 px-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Simulate Shoot (Test)</span>
                  </button>
                </div>

                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (esp32Status === TRIGGER_STATUS.CONNECTED || esp32Status === TRIGGER_STATUS.CONNECTING) {
                        esp32Service.disconnectESP32();
                      } else {
                        esp32Service.connectESP32();
                      }
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-medium transition"
                  >
                    {esp32Status === TRIGGER_STATUS.CONNECTED ? 'Disconnect WebSocket' : 'Connect / Reconnect'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHardwareTestModal(false)}
                    className="py-2.5 px-5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition"
                  >
                    Close Test Bench
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1. VERIFICATION VIEW (Team ID & Game Access Code) */}
        {gameState === STATES.VERIFY && (
          <div className="max-w-xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono uppercase tracking-widest mb-2">
                <Crosshair className="w-3.5 h-3.5" />
                <span>TECNOX — AI DOWNFALL Game Station</span>
              </div>
              <div className="text-[11px] font-mono text-cyan-300 font-bold tracking-wider mb-2">
                Built by Humans. Ended by Humans.
              </div>
              <h1 className="text-3xl font-black font-display tracking-tight text-white mb-1">
                ENTER YOUR GAME ACCESS CODE
              </h1>
              <p className="text-slate-400 text-xs">
                Enter your secret Game Access Code to authorize your official 7-minute competition session.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* OPERATOR QUICK-TOOLS (Only shown when toggled) */}
            {showOperatorPanel && queueTeams.length > 0 && (
              <div className="mb-5 p-3 rounded-xl bg-slate-900 border border-amber-500/30">
                <div className="text-[10px] font-mono uppercase text-amber-400 tracking-wider mb-2 font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Operator Mode: Live Queue Quick-Select</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {queueTeams.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInputTeamCode(t.team_code)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition ${
                        inputTeamCode === t.team_code
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {t.team_code} ({t.team_name.slice(0, 14)})
                    </button>
                  ))}
                </div>
              </div>
            )}
            {queueTeams.length > 0 && (
              <div className="mb-5 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-2">
                  Live Queue Quick-Select:
                </div>
                <div className="flex flex-wrap gap-2">
                  {queueTeams.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInputTeamCode(t.team_code)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition ${
                        inputTeamCode === t.team_code
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-slate-900 border-slate-700/80 hover:border-slate-600 text-slate-300'
                      }`}
                    >
                      {t.team_code} • {t.team_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleVerifyAndStart} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  Secret Game Access Code <span className="text-cyan-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAccessCode ? 'text' : 'password'}
                    value={inputAccessCode}
                    onChange={(e) => setInputAccessCode(e.target.value.toUpperCase())}
                    placeholder="e.g. TECH-A7B-24A"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white font-mono text-base placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition tracking-widest text-center"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccessCode((visible) => !visible)}
                    aria-label={showAccessCode ? 'Hide game access code' : 'Show game access code'}
                    aria-pressed={showAccessCode}
                    className="absolute right-4 top-3.5 text-slate-500 hover:text-cyan-400"
                  >
                    {showAccessCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Official Team ID <span className="text-slate-500 font-sans text-[11px]">(Optional — auto-resolved if blank)</span>
                </label>
                <input
                  type="text"
                  value={inputTeamCode}
                  onChange={(e) => setInputTeamCode(e.target.value.toUpperCase())}
                  placeholder="e.g. TECH-2400 (Optional)"
                  className="w-full bg-slate-950 border border-slate-700/70 rounded-xl px-4 py-3 text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition tracking-wider text-center"
                />
              </div>

              <button
                type="submit"
                disabled={loadingVerify}
                className="w-full mt-3 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingVerify ? (
                  <span>VERIFYING ACCESS CODE...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>CONTINUE</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* 2. READY & BRIEFING SCREEN */}
        {gameState === STATES.READY && activeSession && (
          <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="text-center mb-6">
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono uppercase font-bold tracking-wider">
                ACCESS AUTHORIZED
              </span>
              <h2 className="text-3xl font-black font-display tracking-tight text-white mt-2 mb-1">
                {activeSession.team_name}
              </h2>
              <div className="text-cyan-400 font-mono text-sm">
                TEAM ID: {activeSession.team_code} • {activeSession.difficulty} DIFFICULTY
              </div>
            </div>

            {/* Match Information */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" /> Official Session
                </div>
                <div className="text-2xl font-black text-white font-mono">
                  {formatTime(activeSession.remaining_seconds ?? activeSession.duration_seconds ?? 420)}
                </div>
                <div className="text-[10px] text-slate-400">7 Minutes Duration</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Story Mode
                </div>
                <div className="text-2xl font-black text-indigo-300 font-mono">
                  3 CHAPTERS
                </div>
                <div className="text-[10px] text-slate-400">Dynamic Multi-Target Spawns</div>
              </div>
            </div>

            {/* 2-Player Controls Guide */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 mb-6 space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold border-b border-slate-800 pb-2">
                Simultaneous 2-Player Controller Assignment:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-900 border border-cyan-500/30">
                  <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 mb-1">
                    <Crosshair className="w-4 h-4" />
                    <span>PLAYER 1: AIM CONTROL</span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono">
                    Keys: <span className="text-cyan-300 font-bold">W A S D</span>
                  </div>
                  <div className="text-[11px] text-slate-400">Smooth omnidirectional crosshair aim</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-indigo-500/30">
                  <div className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1">
                    <Zap className="w-4 h-4" />
                    <span>PLAYER 2: SHOOT CONTROL</span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono">
                    <span className="text-cyan-300 font-bold">MOUSE LEFT CLICK</span> (Primary) • <span className="text-emerald-300 font-bold">ESP32 TRIGGER</span> • <span className="text-slate-500 line-through">SPACE</span>
                  </div>
                  <div className="text-[11px] text-slate-400">Single pipeline fires weapon at WASD crosshair position (SPACE disabled)</div>
                </div>
              </div>
            </div>

            <button
              onClick={launchCountdown}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white font-extrabold text-base tracking-wide shadow-xl shadow-cyan-500/20 transition flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>START 7-MINUTE COMPETITION SESSION</span>
            </button>
          </div>
        )}

        {/* 3. 3-2-1 COUNTDOWN OVERLAY */}
        {gameState === STATES.COUNTDOWN && (
          <div
            id="countdown-overlay"
            className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-center p-4 select-none"
          >
            <div className="text-xs sm:text-sm font-mono uppercase tracking-widest text-cyan-400 mb-6 flex items-center justify-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
              <span>GET READY • AI DOWNFALL IMMINENT</span>
            </div>
            <div className="relative flex items-center justify-center min-h-[200px]">
              {countdown === 'START' ? (
                <div className="text-7xl sm:text-8xl md:text-9xl font-black font-mono tracking-widest text-emerald-400 drop-shadow-[0_0_45px_rgba(52,211,153,0.9)] scale-110 animate-bounce">
                  START
                </div>
              ) : (
                <div className="text-9xl sm:text-[10rem] md:text-[12rem] font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 drop-shadow-[0_0_45px_rgba(6,182,212,0.9)] scale-100 transition-all duration-300">
                  {countdown}
                </div>
              )}
            </div>
            <div className="mt-8 text-xs font-mono text-slate-400 tracking-wider">
              WASD: Aim Crosshair • Mouse Left-Click / ESP32: Fire Shot
            </div>
          </div>
        )}

        {/* 4. OFFICIAL PLAYING SCREEN */}
        {gameState === STATES.PLAYING && (
          <div
          className={`space-y-3 ${isFullscreen ? 'flex flex-1 min-h-0 flex-col overflow-hidden' : ''}`}
          >
            {/* Top HUD Bar */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              {/* Team Info & Active Stage */}
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-mono text-cyan-400 font-bold tracking-wider">
                    {activeSession?.team_code}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-extrabold tracking-wider ${
                    (hudStats.currentDifficulty || 'EASY') === 'HARD'
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                      : (hudStats.currentDifficulty || 'EASY') === 'MEDIUM'
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  }`}>
                    STAGE: {hudStats.currentDifficulty || activeSession?.difficulty || 'EASY'}
                  </span>
                  {hudStats.currentTarget && (
                    <span
                      style={{ borderColor: hudStats.currentTarget.color }}
                      className="px-2 py-0.5 rounded-full border bg-slate-950 text-[10px] font-mono font-extrabold tracking-wider text-white flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: hudStats.currentTarget.color }}></span>
                      <span>TARGET {hudStats.targetProgress}: {hudStats.currentTarget.name.toUpperCase()}</span>
                    </span>
                  )}
                </div>
                <div className="text-lg font-black text-white leading-tight">
                  {activeSession?.team_name}
                </div>
              </div>

              {/* DYNAMIC AIM SENSITIVITY BADGE */}
              {hudStats.sensitivityLabel && (
                <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-amber-500/40 text-center">
                  <div className="text-[9px] font-mono uppercase text-slate-400 tracking-wider">
                    Dynamic Aim Speed
                  </div>
                  <div className="text-xs font-black font-mono text-amber-300 tracking-wider flex items-center gap-1">
                    <span className="animate-spin">⚙</span>
                    <span>{hudStats.sensitivityLabel}</span>
                  </div>
                </div>
              )}

              {/* 7-MINUTE TIMER DISPLAY */}
              <div className="px-5 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-center shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" /> Match Clock
                </div>
                <div className={`text-2xl font-black font-mono tracking-widest ${
                  hudStats.remainingSeconds <= 30 ? 'text-rose-400 animate-pulse' : 'text-cyan-300'
                }`}>
                  {formatTime(hudStats.remainingSeconds)}
                </div>
              </div>

              {/* Real-Time Stats Counters */}
              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Score (Max 5000)</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    {hudStats.score}
                  </div>
                </div>

                <div className="border-l border-slate-800 pl-4">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Target Total</div>
                  <div className="text-base font-bold text-cyan-300 font-mono">
                    {hudStats.targetsDestroyed || 0} / {hudStats.totalTargets || 50}
                  </div>
                </div>

                <div className="border-l border-slate-800 pl-4">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Accuracy</div>
                  <div className="text-base font-bold text-sky-400 font-mono">
                    {hudStats.accuracy}%
                  </div>
                </div>

                {hudStats.avgReactionTime && hudStats.avgReactionTime !== '0.00' && (
                  <div className="border-l border-slate-800 pl-4 hidden md:block">
                    <div className="text-[10px] font-mono text-purple-400 uppercase">Avg RT</div>
                    <div className="text-base font-bold text-purple-300 font-mono">
                      {hudStats.avgReactionTime}s
                    </div>
                  </div>
                )}

                {hudStats.combo > 1 && (
                  <div className="border-l border-slate-800 pl-4">
                    <div className="text-[10px] font-mono text-amber-400 uppercase flex items-center gap-1">
                      <Flame className="w-3 h-3" /> Combo
                    </div>
                    <div className="text-base font-bold text-amber-300 font-mono">
                      {hudStats.combo}x
                    </div>
                  </div>
                )}

                {/* ESP32 Hardware Status Badge in HUD */}
                <div className="border-l border-slate-800 pl-4 flex flex-col items-end">
                  <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-cyan-400" /> ESP32 Trigger
                  </div>
                  <div className={`text-xs font-mono font-bold flex items-center gap-1.5 mt-0.5 ${
                    esp32Status === TRIGGER_STATUS.CONNECTED
                      ? 'text-emerald-400'
                      : esp32Status === TRIGGER_STATUS.CONNECTING
                      ? 'text-amber-400'
                      : 'text-slate-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      esp32Status === TRIGGER_STATUS.CONNECTED ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`} />
                    <span>{esp32Status}</span>
                    {hardwarePulse && <span className="text-cyan-300 animate-ping">●</span>}
                  </div>
                </div>

                {/* Quick Link to Scoreboard */}
                <a
                  href="#/scoreboard"
                  onClick={() => {
                    const wasFs = (document.fullscreenElement === gameAreaRef.current) || isFullscreen;
                    inMemoryActiveWasFullscreen = wasFs;
                    if (engineRef.current) {
                      saveEngineSnapshot(engineRef.current, sessionToken, activeSession, hudStats, wasFs);
                    }
                  }}
                  title="View Live Scoreboard (Match continues in background)"
                  className="border-l border-slate-800 pl-4 flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 hover:text-amber-300 transition"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">SCOREBOARD</span>
                </a>

                <button
                  type="button"
                  onClick={toggleGameFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen game' : 'Enter fullscreen game'}
                  title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
                  className="border-l border-slate-800 pl-4 flex items-center gap-2 text-xs font-mono font-bold text-slate-300 hover:text-cyan-300 transition"
                >
                  {isFullscreen
                    ? <Minimize2 className="w-4 h-4" />
                    : <Maximize2 className="w-4 h-4" />}
                  <span className="hidden xl:inline">{isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>
                </button>
              </div>
            </div>

            {/* Game Canvas Viewport */}
            <div className={`relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 flex items-center justify-center ${
              isFullscreen ? 'flex-1 min-h-0' : 'min-h-[460px]'
            }`}>
              <canvas
                ref={canvasRef}
                style={{
                  minHeight: isFullscreen ? undefined : '440px',
                  width: '100%',
                  height: isFullscreen ? '100%' : 'auto',
                  display: 'block',
                  background: '#020617'
                }}
                className="w-full cursor-crosshair select-none block"
              />
            </div>

            {/* Bottom Controls Legend */}
            <div className={`flex items-center justify-between text-xs text-slate-400 px-2 font-mono ${
              isFullscreen ? 'shrink-0' : ''
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-cyan-300 font-bold flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AIM: W A S D (KEYBOARD ONLY)</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-indigo-300 font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 fill-current text-indigo-400" />
                  <span>SHOOT: MOUSE LEFT-CLICK / ESP32 TRIGGER</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 font-bold flex items-center gap-1.5">
                  <span>RELOAD: R KEY</span>
                </span>
                {hudStats.sensitivityLabel && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-amber-500/40 text-amber-300 font-bold flex items-center gap-1.5">
                    <span className="animate-pulse">⚡</span>
                    <span>AIM SENSITIVITY: {hudStats.sensitivityLabel}</span>
                  </span>
                )}
              </div>
              <div>
                AI Targets Hit: <span className="text-emerald-400 font-bold">{hudStats.hits}</span> / 50 • Shots: <span className="text-white font-bold">{hudStats.totalShots}</span>
              </div>
            </div>
            {fullscreenError && (
              <p role="alert" className="text-center text-xs font-mono text-rose-400">
                {fullscreenError}
              </p>
            )}
          </div>
        )}

        {/* 5. SUBMITTING TELEMETRY */}
        {gameState === STATES.SUBMITTING && (
          <div className="min-h-[400px] flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
            <div className="text-lg font-bold font-mono text-white">
              VERIFYING & RECORDING OFFICIAL SCORE...
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Validating hitscan telemetry with server anti-cheat engine...
            </div>
          </div>
        )}

        {/* 6. GAME OVER / RESULT SUMMARY */}
        {gameState === STATES.GAME_OVER && finalResult && (
          <div className="max-w-xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 text-amber-400">
              <Trophy className="w-8 h-8" />
            </div>

            <div className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold mb-1">
              OFFICIAL MATCH CONCLUDED
            </div>
            <h2 className="text-3xl font-black font-display text-white mb-1">
              {finalResult.team_name}
            </h2>
            <div className="text-xs text-slate-400 font-mono mb-6">
              {finalResult.team_code} • Current Leaderboard Rank: #{finalResult.rank}
            </div>

            {/* Scorecard */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-6">
              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Final Score</div>
                <div className="text-2xl font-black text-emerald-400 font-mono">
                  {finalResult.official_result?.score}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Accuracy</div>
                <div className="text-2xl font-black text-sky-400 font-mono">
                  {finalResult.official_result?.accuracy}%
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Targets Hit</div>
                <div className="text-2xl font-black text-white font-mono">
                  {finalResult.official_result?.hits} / 50
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Best Streak</div>
                <div className="text-2xl font-black text-amber-400 font-mono">
                  {finalResult.official_result?.best_combo}x
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setGameState(STATES.VERIFY);
                  setActiveSession(null);
                  setSessionToken(null);
                  setInputTeamCode('');
                  setInputAccessCode('');
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Next Team Game Access</span>
              </button>
            </div>
          </div>
        )}

        {/* 7. SUBMISSION ERROR SCREEN (TELEMETRY PRESERVED) */}
        {gameState === STATES.ERROR && (
          <div className="max-w-xl mx-auto bg-slate-900/95 border border-rose-500/40 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="text-xs font-mono uppercase tracking-widest text-rose-400 font-bold mb-1">
              SCORE SUBMISSION HALTED
            </div>
            <h2 className="text-2xl font-black font-display text-white mb-2">
              Match Result Not Yet Synced
            </h2>
            <p className="text-xs text-rose-200/90 font-mono bg-rose-950/40 border border-rose-800/40 rounded-xl p-3 mb-6 text-left">
              <strong>Server Response:</strong> {errorMsg || "Connection timed out or server validation failed."}
            </p>

            {/* Preserved Match Stats */}
            {cachedTelemetry && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-6 text-left">
                <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-2">
                  Preserved In-Memory Match Telemetry:
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono text-center">
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">SCORE</div>
                    <div className="text-lg font-bold text-emerald-400">{cachedTelemetry.score ?? hudStats.score}</div>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">HITS</div>
                    <div className="text-lg font-bold text-sky-400">{cachedTelemetry.hits ?? hudStats.hits}</div>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">ACCURACY</div>
                    <div className="text-lg font-bold text-amber-400">
                      {Math.round(((cachedTelemetry.hits ?? hudStats.hits) / Math.max(1, (cachedTelemetry.total_shots ?? hudStats.totalShots))) * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleOfficialGameEnd(cachedTelemetry)}
                className="flex-1 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-mono font-bold text-xs shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry Score Upload</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGameState(STATES.VERIFY);
                  setActiveSession(null);
                  setSessionToken(null);
                }}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono transition"
              >
                Cancel & Return
              </button>
            </div>
          </div>
        )}

        {fullscreenError && gameState !== STATES.PLAYING && (
          <p role="alert" className="mt-3 text-center text-xs font-mono text-rose-400">
            {fullscreenError}
          </p>
        )}

      </div>
    </div>
  );
}
