import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Users, Play, SkipForward, RotateCcw, CheckCircle, 
  Settings, AlertOctagon, Download, Trash2, Eye, X, Lock, Flame, RefreshCw, AlertTriangle, KeyRound
} from 'lucide-react';
import { api } from '../services/api';

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(api.isAdminLoggedIn());
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState(null);

  // Stats & Data
  const [stats, setStats] = useState(null);
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [config, setConfig] = useState(null);

  // Modals & Viewers
  const [viewingIdCard, setViewingIdCard] = useState(null);
  const [viewingTeamDetails, setViewingTeamDetails] = useState(null);
  const [resetCodeModal, setResetCodeModal] = useState(null); // { team_code, new_code }
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  // Event password state inside config
  const [eventPasswordInput, setEventPasswordInput] = useState('');

  useEffect(() => {
    if (isLoggedIn) {
      loadAdminData();
    }
  }, [isLoggedIn, search, statusFilter]);

  const loadAdminData = async () => {
    try {
      const [statsRes, teamsRes, cfgRes] = await Promise.all([
        api.getAdminStats(),
        api.getAllTeams(search, statusFilter),
        api.getAdminConfig()
      ]);

      if (statsRes.success) setStats(statsRes.stats);
      if (teamsRes.success) setTeams(teamsRes.teams);
      if (cfgRes.success) setConfig(cfgRes.config);
    } catch (err) {
      console.warn("Failed to load admin data:", err.message);
      if (err.message.includes('401') || err.message.includes('token')) {
        api.adminLogout();
        setIsLoggedIn(false);
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await api.adminLogin(loginUser, loginPass);
      if (res.success) {
        setIsLoggedIn(true);
      }
    } catch (err) {
      setLoginError(err.message || "Invalid credentials.");
    }
  };

  const handleLogout = () => {
    api.adminLogout();
    setIsLoggedIn(false);
  };

  const triggerCall = async (teamId) => {
    setActionError(null);
    try {
      const res = await api.callTeam(teamId, config?.queue_timeout_seconds || 30);
      if (res.success) {
        setActionSuccess(res.message);
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const triggerSkip = async (teamId) => {
    if (!window.confirm("Are you sure you want to mark this team as SKIPPED?")) return;
    setActionError(null);
    try {
      const res = await api.skipTeam(teamId, "Operator skip");
      if (res.success) {
        setActionSuccess(res.message);
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const triggerRestore = async (teamId) => {
    setActionError(null);
    try {
      const res = await api.restoreTeam(teamId);
      if (res.success) {
        setActionSuccess(res.message);
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const triggerMarkPresent = async (teamId) => {
    setActionError(null);
    try {
      const res = await api.markPresent(teamId);
      if (res.success) {
        setActionSuccess(res.message);
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteTeam = async (teamId, teamCode) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete team ${teamCode}? This will remove all their participant records and results.`)) return;
    try {
      const res = await api.deleteTeam(teamId);
      if (res.success) {
        setActionSuccess(res.message);
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleResetAccessCode = async (teamId) => {
    if (!window.confirm("Generate a new secret game access code for this team? Old credentials will be revoked immediately.")) return;
    try {
      const res = await api.resetTeamAccessCode(teamId);
      if (res.success) {
        setResetCodeModal({
          team_code: res.team_code,
          new_code: res.new_access_code
        });
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handlePurgeIdCards = async () => {
    if (!window.confirm("CRITICAL PRIVACY ACTION: Are you sure you want to permanently delete all uploaded ID card scans from the server disk? This action CANNOT be undone.")) return;
    try {
      const res = await api.purgeAllIdCards();
      if (res.success) {
        setActionSuccess(res.message);
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    setActionError(null);
    try {
      const payload = {
        ...config,
        ...(eventPasswordInput ? { event_password: eventPasswordInput } : {})
      };
      const res = await api.updateAdminConfig(payload);
      if (res.success) {
        setActionSuccess("Configuration updated successfully.");
        setConfig(res.config);
        setShowConfigModal(false);
        setEventPasswordInput('');
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleEmergencyAction = async (action, payload = {}) => {
    try {
      const res = await api.emergencyAction(action, payload);
      if (res.success) {
        setActionSuccess(res.message);
        loadAdminData();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  // --- LOGIN SCREEN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-950">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-5 text-cyan-400">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-black font-display tracking-tight text-white mb-2">
            ADMIN COMMAND CONSOLE
          </h2>
          <p className="text-slate-400 text-xs mb-6">
            Enter administrator credentials to access queue management, live configurations, and telemetry audits.
          </p>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-left">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Admin Username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Admin Password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs tracking-wider shadow-lg shadow-cyan-500/20 transition"
            >
              LOG IN TO COMMAND CONSOLE
            </button>
          </form>

        </div>
      </div>
    );
  }

  // --- AUTHENTICATED DASHBOARD ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Control Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono uppercase tracking-widest mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Event Command Console</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-display text-white">
              AI TARGET STRIKE ADMIN
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowConfigModal(true)}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Settings className="w-4 h-4 text-cyan-400" />
              <span>Event Settings</span>
            </button>

            <button
              onClick={() => setShowEmergencyModal(true)}
              className="py-2 px-3 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>Emergency Controls</span>
            </button>

            <a
              href={api.getExportCsvUrl()}
              download
              className="py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </a>

            <button
              onClick={handleLogout}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold transition"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Action Notifications */}
        {actionSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{actionError}</span>
            </span>
            <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. Event Metrics Overview */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">Registered</span>
              <span className="text-2xl font-black font-mono text-white">{stats.total_teams}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">Waiting</span>
              <span className="text-2xl font-black font-mono text-cyan-400">{stats.waiting}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">Called</span>
              <span className="text-2xl font-black font-mono text-amber-400">{stats.called}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">Playing</span>
              <span className="text-2xl font-black font-mono text-emerald-400">{stats.playing}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">Completed</span>
              <span className="text-2xl font-black font-mono text-indigo-400">{stats.completed}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">Skipped</span>
              <span className="text-2xl font-black font-mono text-rose-400">{stats.skipped}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">High Score</span>
              <span className="text-2xl font-black font-mono text-white">{stats.highest_score}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <span className="block text-[10px] font-mono uppercase text-slate-500">Avg Acc</span>
              <span className="text-2xl font-black font-mono text-emerald-400">{stats.average_accuracy}%</span>
            </div>
          </div>
        )}

        {/* 2. Registered Teams Management Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black font-display text-white">Registered Teams & Queue Control</h2>
              <p className="text-xs text-slate-400">Manage queue progression, call next team, review ID cards, reset access codes, or authorize replays.</p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search team code, name, college..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="WAITING">WAITING</option>
                <option value="CALLED">CALLED</option>
                <option value="PRESENT">PRESENT</option>
                <option value="PLAYING">PLAYING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="SKIPPED">SKIPPED</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Team / College</th>
                  <th className="py-3 px-4">Player 1 (Aim)</th>
                  <th className="py-3 px-4">Player 2 (Shoot)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Score</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {teams.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-slate-500 font-mono">
                      No matching teams found in registration records.
                    </td>
                  </tr>
                ) : (
                  teams.map((t) => {
                    const p1 = t.participants?.find(p => p.player_role === 'PLAYER_1_AIM');
                    const p2 = t.participants?.find(p => p.player_role === 'PLAYER_2_SHOOT');

                    return (
                      <tr key={t.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 text-center font-mono text-slate-500">{t.queue_number}</td>
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400">{t.team_code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{t.team_name}</div>
                          <div className="text-[10px] text-slate-400">{t.college_name || 'Verified Institution'}</div>
                        </td>

                        {/* P1 */}
                        <td className="py-3 px-4">
                          {p1 ? (
                            <div>
                              <div className="text-slate-200 font-medium">{p1.name}</div>
                              <div className="text-[10px] text-slate-500">{p1.roll_number} • {p1.phone}</div>
                              {p1.id_card_filename && (
                                <button
                                  onClick={() => setViewingIdCard({ filename: p1.id_card_filename, name: `${p1.name} (P1 Aim - ${t.team_code})` })}
                                  className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 mt-0.5"
                                >
                                  <Eye className="w-3 h-3" /> View ID Card
                                </button>
                              )}
                            </div>
                          ) : '-'}
                        </td>

                        {/* P2 */}
                        <td className="py-3 px-4">
                          {p2 ? (
                            <div>
                              <div className="text-slate-200 font-medium">{p2.name}</div>
                              <div className="text-[10px] text-slate-500">{p2.roll_number} • {p2.phone}</div>
                              {p2.id_card_filename && (
                                <button
                                  onClick={() => setViewingIdCard({ filename: p2.id_card_filename, name: `${p2.name} (P2 Shoot - ${t.team_code})` })}
                                  className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1 mt-0.5"
                                >
                                  <Eye className="w-3 h-3" /> View ID Card
                                </button>
                              )}
                            </div>
                          ) : '-'}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold ${
                            t.status === 'CALLED'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                              : t.status === 'PLAYING'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : t.status === 'COMPLETED'
                              ? 'bg-slate-800 text-slate-300'
                              : t.status === 'SKIPPED'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                          }`}>
                            {t.status}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                          {t.score !== null ? t.score.toLocaleString() : '-'}
                        </td>

                        {/* Action Buttons */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {t.status === 'WAITING' && (
                              <button
                                onClick={() => triggerCall(t.id)}
                                title="Call Team (30s Timer)"
                                className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition"
                              >
                                Call
                              </button>
                            )}

                            {t.status === 'CALLED' && (
                              <>
                                <button
                                  onClick={() => triggerMarkPresent(t.id)}
                                  title="Mark Present"
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition"
                                >
                                  Present
                                </button>
                                <button
                                  onClick={() => triggerSkip(t.id)}
                                  title="Skip Team"
                                  className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition"
                                >
                                  Skip
                                </button>
                              </>
                            )}

                            {t.status === 'SKIPPED' && (
                              <button
                                onClick={() => triggerRestore(t.id)}
                                title="Restore to Queue"
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-[11px] transition"
                              >
                                Restore
                              </button>
                            )}

                            {t.status === 'COMPLETED' && (
                              <button
                                onClick={() => handleEmergencyAction('replay', { team_id: t.id })}
                                title="Authorize Replay"
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] transition"
                              >
                                Replay
                              </button>
                            )}

                            {/* Reset Access Code */}
                            <button
                              onClick={() => setViewingTeamDetails(t)}
                              title="View Team and Player Details"
                              className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Reset Access Code */}
                            <button
                              onClick={() => handleResetAccessCode(t.id)}
                              title="Reset Game Access Code"
                              className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Team */}
                            <button
                              onClick={() => handleDeleteTeam(t.id, t.team_code)}
                              title="Delete Team"
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL 1: VIEW ID CARD (Authenticated Stream) */}
      {viewingTeamDetails && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setViewingTeamDetails(null)}
              aria-label="Close team details"
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5 pr-8">
              <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">Admin-only registration details</div>
              <h3 className="text-xl font-bold text-white mt-1">{viewingTeamDetails.team_name}</h3>
              <p className="text-xs text-slate-400 font-mono mt-1">
                {viewingTeamDetails.team_code} · Queue #{viewingTeamDetails.queue_number} · {viewingTeamDetails.status}
              </p>
              <p className="text-sm text-slate-300 mt-2">
                {viewingTeamDetails.college_name || 'Institution not provided'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['PLAYER_1_AIM', 'PLAYER_2_SHOOT'].map((role) => {
                const participant = viewingTeamDetails.participants?.find(player => player.player_role === role);
                return (
                  <section key={role} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                    <h4 className="text-xs font-mono font-bold text-cyan-300 mb-3">
                      {role === 'PLAYER_1_AIM' ? 'PLAYER 1 · AIM' : 'PLAYER 2 · SHOOT'}
                    </h4>
                    {participant ? (
                      <dl className="space-y-2 text-sm">
                        <div>
                          <dt className="text-[10px] uppercase text-slate-500">Full name</dt>
                          <dd className="text-white font-medium">{participant.name}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase text-slate-500">College / institution</dt>
                          <dd className="text-slate-200">{participant.college || 'Not provided'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase text-slate-500">Phone</dt>
                          <dd className="text-slate-200 font-mono">{participant.phone || 'Not provided'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase text-slate-500">Roll number</dt>
                          <dd className="text-slate-200 font-mono">{participant.roll_number || 'Not provided'}</dd>
                        </div>
                        {participant.created_at && (
                          <div>
                            <dt className="text-[10px] uppercase text-slate-500">Registered</dt>
                            <dd className="text-slate-400">{new Date(participant.created_at).toLocaleString()}</dd>
                          </div>
                        )}
                        {participant.id_card_filename ? (
                          <button
                            type="button"
                            onClick={() => setViewingIdCard({
                              filename: participant.id_card_filename,
                              name: `${participant.name} (${role === 'PLAYER_1_AIM' ? 'P1 Aim' : 'P2 Shoot'} - ${viewingTeamDetails.team_code})`
                            })}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300"
                          >
                            <Eye className="w-3.5 h-3.5" /> View ID card image
                          </button>
                        ) : (
                          <p className="text-xs text-amber-400 mt-2">ID card image unavailable or purged.</p>
                        )}
                      </dl>
                    ) : (
                      <p className="text-sm text-slate-500">No player details registered.</p>
                    )}
                  </section>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-slate-300">
              <div className="font-bold text-amber-300 mb-1">Passwords and game access</div>
              <p>
                Player passwords are not collected or stored. Game access codes are stored only as one-way hashes,
                so an existing code cannot be viewed. Use “Reset Game Access Code” in the team actions to revoke
                the old code and issue a replacement shown once.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  handleResetAccessCode(viewingTeamDetails.id);
                  setViewingTeamDetails(null);
                }}
                className="px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-bold"
              >
                Reset game access code
              </button>
              <button
                type="button"
                onClick={() => setViewingTeamDetails(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingIdCard && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setViewingIdCard(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-base text-white mb-1">Authenticated ID Card Review</h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">{viewingIdCard.name}</p>
            <img
              src={api.getIdCardUrl(viewingIdCard.filename)}
              alt="ID Card"
              className="w-full h-auto rounded-xl border border-slate-800 object-contain max-h-[70vh]"
            />
          </div>
        </div>
      )}

      {/* MODAL 2: RESET ACCESS CODE DISPLAY */}
      {resetCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl text-center relative">
            <button
              onClick={() => setResetCodeModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
              <KeyRound className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white mb-1">New Game Access Code Issued</h3>
            <p className="text-xs text-slate-400 mb-4">
              Hand this secret code to the participants for team <span className="text-cyan-400 font-mono font-bold">{resetCodeModal.team_code}</span>.
            </p>
            <div className="text-2xl font-black font-mono text-amber-300 bg-slate-950 p-3 rounded-xl border border-amber-500/30 select-all mb-4">
              {resetCodeModal.new_code}
            </div>
            <button
              onClick={() => setResetCodeModal(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: EVENT CONFIGURATION */}
      {showConfigModal && config && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowConfigModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-lg text-white mb-1">Live Event & Security Settings</h3>
            <p className="text-xs text-slate-400 mb-6">Modify match parameters, password gate, timers, and difficulty.</p>

            <form onSubmit={handleUpdateConfig} className="space-y-4 text-xs">
              
              {/* Event Password Gate Section */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Public Event Password Gate (Registration & Game Access)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Set / Change Password</label>
                    <input
                      type="text"
                      placeholder="Leave blank to keep current"
                      value={eventPasswordInput}
                      onChange={(e) => setEventPasswordInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Password Protection Status</label>
                    <select
                      value={config.event_password_enabled ? '1' : '0'}
                      onChange={(e) => setConfig({ ...config, event_password_enabled: parseInt(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="1">ENABLED (Password Required)</option>
                      <option value="0">DISABLED (Open Access)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Match Duration & Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Match Duration (Seconds) - 420s = 7m</label>
                  <input
                    type="number"
                    value={config.game_duration || 420}
                    onChange={(e) => setConfig({ ...config, game_duration: parseInt(e.target.value) || 420 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Default Difficulty</label>
                  <select
                    value={config.difficulty || 'MEDIUM'}
                    onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    <option value="EASY">EASY (Slower, Larger Targets)</option>
                    <option value="MEDIUM">MEDIUM (Standard Competition)</option>
                    <option value="HARD">HARD (High Speed & Precision)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Difficulty Mode</label>
                  <select
                    value={config.difficulty_mode || 'EVENT_LOCKED'}
                    onChange={(e) => setConfig({ ...config, difficulty_mode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    <option value="EVENT_LOCKED">EVENT_LOCKED (Fair Baseline)</option>
                    <option value="TEAM_SELECTS">TEAM_SELECTS (Team Decides)</option>
                    <option value="ADMIN_ASSIGNS">ADMIN_ASSIGNS (Operator Decides)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Operating Mode</label>
                  <select
                    value={config.operating_mode || 'OPERATOR_CONTROLLED'}
                    onChange={(e) => setConfig({ ...config, operating_mode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    <option value="OPERATOR_CONTROLLED">OPERATOR_CONTROLLED (Queue Queue)</option>
                    <option value="SELF_SERVICE">SELF_SERVICE (Direct Access)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Queue Call Timeout (s)</label>
                  <input
                    type="number"
                    value={config.queue_timeout_seconds || 30}
                    onChange={(e) => setConfig({ ...config, queue_timeout_seconds: parseInt(e.target.value) || 30 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Competition Mode</label>
                  <select
                    value={config.competition_mode || 'COMPETITION'}
                    onChange={(e) => setConfig({ ...config, competition_mode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    <option value="COMPETITION">COMPETITION (Official Scores)</option>
                    <option value="PRACTICE">PRACTICE (Unranked)</option>
                    <option value="TEST">TEST (Sandbox)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Registration Status</label>
                  <select
                    value={config.registration_open ? '1' : '0'}
                    onChange={(e) => setConfig({ ...config, registration_open: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    <option value="1">OPEN (Accepting Teams)</option>
                    <option value="0">CLOSED (Locked)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Story Mode Enabled</label>
                  <select
                    value={config.story_enabled ? '1' : '0'}
                    onChange={(e) => setConfig({ ...config, story_enabled: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    <option value="1">ENABLED (3 Chapters Narrative)</option>
                    <option value="0">DISABLED</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold text-white shadow-lg"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EMERGENCY CONTROLS */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowEmergencyModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-rose-400 mb-2">
              <AlertOctagon className="w-6 h-6" />
              <h3 className="font-black text-lg text-white">Event Emergency Controls</h3>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Critical operational actions for event station management.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => {
                  handleEmergencyAction('cancel-current');
                  setShowEmergencyModal(false);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500/30 text-rose-300 font-bold text-xs text-left flex items-center justify-between"
              >
                <span>Abort Currently Active Game Station Match</span>
                <X className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  handleEmergencyAction('toggle-registration');
                  setShowEmergencyModal(false);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs text-left"
              >
                Toggle Registration Open / Closed
              </button>

              <button
                onClick={() => {
                  handleEmergencyAction('toggle-event');
                  setShowEmergencyModal(false);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs text-left"
              >
                Pause / Resume Official Event Progression
              </button>

              <div className="pt-3 border-t border-slate-800">
                <button
                  onClick={() => {
                    handlePurgeIdCards();
                    setShowEmergencyModal(false);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-950 border border-rose-600/50 hover:bg-rose-900 text-rose-300 font-bold text-xs text-left flex items-center justify-between"
                >
                  <span>Post-Event Privacy Compliance: Wipe All ID Cards</span>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
