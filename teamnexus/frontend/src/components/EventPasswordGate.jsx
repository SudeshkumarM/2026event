import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, AlertTriangle, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';

export default function EventPasswordGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Clear previous pass so fresh navigation to registration always asks for password
    api.clearEventPass();
    checkStatus();
    return () => {
      // Clear temporary authorization when participant navigates away
      api.clearEventPass();
    };
  }, []);

  const checkStatus = async () => {
    try {
      const res = await api.getEventAuthStatus();
      if (res.success) {
        if (!res.password_required) {
          // No password configured by event organizer, allow immediate access
          setPasswordRequired(false);
          setHasAccess(true);
        } else {
          setPasswordRequired(true);
          // Check if user already holds a valid event pass in localStorage
          if (api.hasEventPass()) {
            setHasAccess(true);
          } else {
            setHasAccess(false);
          }
        }
      }
    } catch (err) {
      console.warn("Could not check event password status:", err.message);
      setPasswordRequired(true);
      setHasAccess(false);
      setError(`Backend connection error: ${err.message || 'Unable to reach the event server.'} Please verify the backend service is running.`);
    } finally {
      setChecking(false);
    }
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setError("Please enter the event password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.verifyEventPassword(passwordInput);
      if (res.success) {
        setHasAccess(true);
      } else {
        setError(res.error || "Incorrect event password.");
      }
    } catch (err) {
      setError(err.message || "Failed to verify event password.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
      </div>
    );
  }

  // If password required and not yet unlocked, display modern security gate
  if (passwordRequired && !hasAccess) {
    return (
      <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden text-center backdrop-blur-xl">
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-5 text-cyan-400">
            <KeyRound className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-black font-display tracking-tight text-white mb-2">
            EVENT ACCESS GATE
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            This competition zone is password-protected by event organizers. Enter the official event password to proceed.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2.5 text-left">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter Event Access Password"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-mono tracking-wider text-center text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide event password' : 'Show event password'}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span>VERIFYING ACCESS...</span>
              ) : (
                <>
                  <span>UNLOCK EVENT ACCESS</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Server-Side Authentication & Rate Limiting</span>
          </div>
        </div>
      </div>
    );
  }

  // Access granted or not required
  return children;
}
