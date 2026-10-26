import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Target, Users, Tv, Trophy, ShieldCheck, Volume2, VolumeX, Radio } from 'lucide-react';
import { sound } from '../utils/sound';

export default function Navbar() {
  const location = useLocation();
  const [muted, setMuted] = useState(false);
  const [liveConnected, setLiveConnected] = useState(true);

  const toggleSound = () => {
    sound.muted = !muted;
    setMuted(!muted);
  };

  const navLinks = [
    { to: '/game', label: 'Game Station', icon: Target },
    { to: '/register', label: 'Register Team', icon: Users },
    { to: '/queue', label: 'Live Queue (Projector)', icon: Tv },
    { to: '/scoreboard', label: 'Scoreboard', icon: Trophy },
  ];

  return (
    <nav className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo / Brand */}
          <Link to="/game" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-wider text-lg font-display bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300">
                  TECNOX
                </span>
                <span className="text-xs font-mono font-bold text-cyan-400/90 tracking-widest">
                  AI DOWNFALL
                </span>
              </div>
              <span className="block text-[9px] text-slate-400 font-mono tracking-wider">
                Built by Humans. Ended by Humans.
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to || (link.to === '/scoreboard' && location.pathname === '/leaderboard');
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Controls: Audio Toggle & Connection Indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSound}
              title={muted ? 'Unmute Sound FX' : 'Mute Sound FX'}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-700 transition"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-300 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden sm:inline">LIVE</span>
            </div>
          </div>

        </div>
      </div>

      {/* Mobile nav row */}
      <div className="md:hidden flex overflow-x-auto py-2 px-4 gap-2 border-t border-slate-800/80 bg-slate-950/60 text-xs">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to || (link.to === '/scoreboard' && location.pathname === '/leaderboard');
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap ${
                isActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
