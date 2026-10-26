import React, { useState, useEffect, useRef } from 'react';
import { Tv, Maximize2, Minimize2, Radio, BellRing, Clock, Users, Flame, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { sound } from '../utils/sound';

export default function QueueDisplay() {
  const [queue, setQueue] = useState({
    now_playing: null,
    called_team: null,
    next_team: null,
    upcoming: [],
    stats: { waiting: 0, called: 0, playing: 0, completed: 0, skipped: 0, total: 0 }
  });

  const [callCountdown, setCallCountdown] = useState(30);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastCalledCode, setLastCalledCode] = useState(null);

  // Poll & SSE listener
  useEffect(() => {
    fetchQueue();
    const pollInterval = setInterval(fetchQueue, 3500);

    // Setup SSE connection
    let eventSource = null;
    try {
      eventSource = new EventSource(api.getStreamUrl());
      
      eventSource.addEventListener('QUEUE_UPDATE', (e) => {
        try {
          const data = JSON.parse(e.data);
          updateQueueData(data);
        } catch (err) {}
      });

      eventSource.addEventListener('CALL_TEAM', (e) => {
        try {
          const data = JSON.parse(e.data);
          sound.playCallChime();
          setCallCountdown(data.timeout || 30);
        } catch (err) {}
      });
    } catch (err) {
      console.warn("SSE connection error, falling back to polling.");
    }

    return () => {
      clearInterval(pollInterval);
      if (eventSource) eventSource.close();
    };
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await api.getPublicQueue();
      if (res.success && res.data) {
        updateQueueData(res.data);
      }
    } catch (err) {
      console.warn("Queue fetch error:", err.message);
    }
  };

  const updateQueueData = (data) => {
    setQueue(data);

    // If new team was called, trigger chime & calculate remaining deadline seconds
    if (data.called_team && data.called_team.team_code !== lastCalledCode) {
      sound.playCallChime();
      setLastCalledCode(data.called_team.team_code);
    }

    if (data.called_team && data.called_team.call_deadline) {
      const deadline = new Date(data.called_team.call_deadline).getTime();
      const now = Date.now();
      const remainingSec = Math.max(0, Math.round((deadline - now) / 1000));
      setCallCountdown(remainingSec);
    }
  };

  // 1-second countdown tick for called team timer
  useEffect(() => {
    if (!queue.called_team) return;

    const timer = setInterval(() => {
      setCallCountdown((prev) => {
        if (prev <= 1) {
          fetchQueue();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [queue.called_team]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden">
      
      {/* 1. TOP HEADER & TICKER */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Tv className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-4xl font-black font-display tracking-tight text-white">
                TECNOX
              </h1>
              <span className="text-base sm:text-2xl font-bold font-mono text-cyan-400">
                · AI DOWNFALL
              </span>
            </div>
            <div className="text-[11px] sm:text-xs font-mono tracking-wider uppercase text-cyan-300 font-bold">
              Built by Humans. Ended by Humans.
            </div>
          </div>
        </div>

        {/* Status Indicators & Fullscreen Toggle */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>LIVE SYNC ACTIVE</span>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition"
            title="Toggle Projector Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* 2. PRIMARY QUEUE DISPLAY (2 Big Cards: NOW PLAYING & CALLED) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 my-auto py-6">
        
        {/* CARD A: NOW PLAYING */}
        <div className="bg-slate-900/90 border-2 border-emerald-500/40 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[320px]">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs uppercase tracking-widest font-extrabold border border-emerald-500/40">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                NOW PLAYING
              </span>
              <span className="text-xs text-slate-500 font-mono">GAME STATION 1</span>
            </div>

            {queue.now_playing ? (
              <div>
                <div className="text-6xl sm:text-7xl font-black font-mono tracking-tight text-white mb-2 drop-shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  {queue.now_playing.team_code}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-300">
                  {queue.now_playing.team_name}
                </div>
              </div>
            ) : (
              <div className="py-12 text-slate-500 font-mono text-xl text-center">
                GAME STATION PREPARING FOR MATCH...
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>2-PLAYER CO-OP ENGAGED</span>
            <span>P1: WASD (AIM) • P2: MOUSE CLICK / ESP32 TRIGGER (SHOOT)</span>
          </div>
        </div>

        {/* CARD B: NEXT TEAM (CALLED OR UPCOMING) */}
        <div className={`rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[320px] border-2 transition ${
          queue.called_team
            ? 'bg-gradient-to-br from-cyan-950/50 to-slate-900 border-cyan-400 shadow-cyan-500/20 animate-pulse'
            : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full font-mono text-xs uppercase tracking-widest font-extrabold border ${
                queue.called_team 
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' 
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <BellRing className="w-3.5 h-3.5" />
                <span>{queue.called_team ? 'CALLED TEAM • REPORT NOW' : 'NEXT IN LINE'}</span>
              </span>

              {queue.called_team && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-400 font-mono text-sm font-black">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>REPORT: {callCountdown}s</span>
                </div>
              )}
            </div>

            {queue.called_team ? (
              <div>
                <div className="text-6xl sm:text-7xl font-black font-mono tracking-tight text-cyan-300 mb-2 drop-shadow-[0_0_25px_rgba(6,182,212,0.5)]">
                  {queue.called_team.team_code}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white mb-2">
                  {queue.called_team.team_name}
                </div>
                <div className="text-sm text-cyan-400 font-mono font-semibold">
                  ⚠️ PLEASE REPORT TO GAME STATION IMMEDIATELY!
                </div>
              </div>
            ) : queue.next_team ? (
              <div>
                <div className="text-6xl sm:text-7xl font-black font-mono tracking-tight text-slate-300 mb-2">
                  {queue.next_team.team_code}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-400 mb-2">
                  {queue.next_team.team_name}
                </div>
                <div className="text-sm text-slate-500 font-mono">
                  Stand by. Your team will be called when current match completes.
                </div>
              </div>
            ) : (
              <div className="py-12 text-slate-500 font-mono text-xl text-center">
                QUEUE EMPTY • REGISTER TO PARTICIPATE
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>AUTOMATIC CALL ENGINE ACTIVE</span>
            <span>30s REPORT WINDOW</span>
          </div>
        </div>

      </div>

      {/* 3. UPCOMING TEAMS LIST */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase font-mono tracking-widest text-slate-400 font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>UPCOMING TEAMS IN QUEUE</span>
          </div>
          <div className="text-xs font-mono text-slate-500">
            TOTAL WAITING: <span className="text-cyan-400 font-bold">{queue.stats.waiting}</span>
          </div>
        </div>

        {queue.upcoming.length === 0 ? (
          <div className="text-center py-4 text-slate-600 font-mono text-sm">
            No further upcoming teams in queue.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {queue.upcoming.map((team, idx) => (
              <div
                key={team.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center transition hover:border-slate-700"
              >
                <div className="text-[10px] text-slate-500 font-mono mb-0.5">#{team.queue_number}</div>
                <div className="text-lg font-black font-mono text-cyan-400">{team.team_code}</div>
                <div className="text-xs text-slate-300 truncate font-medium">{team.team_name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
