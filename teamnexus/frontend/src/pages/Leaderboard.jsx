import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Medal, Search, Flame, Clock, Target, CheckCircle2, RefreshCw, Building2 } from 'lucide-react';
import { api } from '../services/api';

export default function Leaderboard() {
  const checkActiveMatch = () => {
    if (typeof window === 'undefined') return false;
    try {
      const token = sessionStorage.getItem('active_game_session_token');
      const snap = sessionStorage.getItem('active_game_engine_snapshot');
      if (!token || !snap) return false;
      const parsed = JSON.parse(snap);
      if (!parsed) return false;
      // If the session has already ended, do not show resume button
      if (
        parsed.isGameOver ||
        parsed.completedAllTargets ||
        (typeof parsed.remainingSeconds === 'number' && parsed.remainingSeconds <= 0)
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const [hasActiveMatch, setHasActiveMatch] = useState(checkActiveMatch);
  const [leaderboard, setLeaderboard] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 4000);

    // Listen to SSE updates
    let eventSource = null;
    try {
      eventSource = new EventSource(api.getStreamUrl());
      eventSource.addEventListener('LEADERBOARD_UPDATE', () => {
        fetchLeaderboard();
      });
    } catch (err) {}

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await api.getLeaderboard();
      if (res.success && res.leaderboard) {
        setLeaderboard(res.leaderboard);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn("Leaderboard fetch error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = leaderboard.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.team_code.toLowerCase().includes(q) ||
      item.team_name.toLowerCase().includes(q) ||
      (item.college_name && item.college_name.toLowerCase().includes(q))
    );
  });

  const getRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/30">
          🥇
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 font-black shadow-lg shadow-slate-300/20">
          🥈
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-700 to-amber-900 text-amber-200 font-black shadow-lg shadow-amber-700/20">
          🥉
        </span>
      );
    }
    return <span className="font-mono font-bold text-slate-400 text-base">#{rank}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Active Match Fast Return Bar */}
        {hasActiveMatch && (
          <div className="mb-6 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-cyan-950/90 border border-emerald-500/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl shadow-emerald-500/10">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <div>
                <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span>ACTIVE COMPETITION MATCH IN PROGRESS</span>
                </div>
                <div className="text-xs text-slate-300">
                  Your match timer, targets, and score continue running in the background.
                </div>
              </div>
            </div>
            <Link
              to="/game"
              id="resume-playing-btn"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black font-mono text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/25 hover:shadow-cyan-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 cursor-pointer"
            >
              <Target className="w-4 h-4 text-slate-950" />
              <span>Resume Playing</span>
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono uppercase tracking-widest mb-3">
            <Trophy className="w-3.5 h-3.5" />
            <span>Official Event Leaderboard</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white mb-1">
            TECNOX <span className="text-amber-400 font-bold font-mono text-2xl sm:text-3xl">· AI DOWNFALL STANDINGS</span>
          </h1>
          <div className="text-xs font-mono font-bold text-amber-300 tracking-wider mb-2">
            Built by Humans. Ended by Humans.
          </div>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Real-time verified match results. Ranked by score, then fastest completion time for tied scores.
          </p>
        </div>

        {/* Filter & Live Indicator Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search team code, name or college..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>LIVE UPDATES ACTIVE</span>
            </div>
            <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <th className="py-4 px-5 text-center w-16">Rank</th>
                  <th className="py-4 px-5">Team / Institution</th>
                  <th className="py-4 px-4 text-center">Difficulty</th>
                  <th className="py-4 px-5 text-right">Score</th>
                  <th className="py-4 px-4 text-center">Hits / Shots</th>
                  <th className="py-4 px-4 text-center">Accuracy</th>
                  <th className="py-4 px-4 text-center">Best Combo</th>
                  <th className="py-4 px-5 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-slate-500 font-mono">
                      {loading ? 'Loading official event scores...' : 'No official match scores recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr
                      key={item.team_code}
                      className={`hover:bg-slate-800/40 transition ${
                        item.rank === 1
                          ? 'bg-amber-500/5'
                          : item.rank === 2
                          ? 'bg-slate-500/5'
                          : item.rank === 3
                          ? 'bg-amber-900/5'
                          : ''
                      }`}
                    >
                      {/* Rank */}
                      <td className="py-4 px-5 text-center font-bold">
                        {getRankBadge(item.rank)}
                      </td>

                      {/* Team & College */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-400 text-sm">{item.team_code}</span>
                          <span className="font-bold text-white text-sm">{item.team_name}</span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{item.college_name || 'Verified Institution'}</span>
                        </div>
                      </td>

                      {/* Difficulty Level */}
                      <td className="py-4 px-4 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          item.difficulty === 'HARD'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : item.difficulty === 'MEDIUM'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {item.difficulty || 'MEDIUM'}
                        </span>
                      </td>

                      {/* Score */}
                      <td className="py-4 px-5 text-right font-mono font-black text-xl text-white">
                        {item.score.toLocaleString()}
                      </td>

                      {/* Hits / Shots */}
                      <td className="py-4 px-4 text-center font-mono text-xs">
                        <span className="text-emerald-400 font-bold">{item.hits}</span>
                        <span className="text-slate-500"> / </span>
                        <span className="text-slate-400">{item.hits + item.misses}</span>
                      </td>

                      {/* Accuracy */}
                      <td className="py-4 px-4 text-center font-mono">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          item.accuracy >= 90
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : item.accuracy >= 75
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {item.accuracy}%
                        </span>
                      </td>

                      {/* Best Combo */}
                      <td className="py-4 px-4 text-center font-mono font-bold text-amber-400">
                        {item.best_combo > 1 ? (
                          <span className="inline-flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-amber-500" />
                            <span>x{item.best_combo}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-4 px-5 text-right font-mono text-xs text-slate-400">
                        {item.duration_seconds}s
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tie Breaker Legend */}
        <div className="mt-4 text-center text-xs text-slate-400 font-mono">
          Tie-breaker rule: 1. Total Score → 2. Accuracy % → 3. Total Hits → 4. Official Duration. Personal participant details remain strictly private.
        </div>

      </div>
    </div>
  );
}
