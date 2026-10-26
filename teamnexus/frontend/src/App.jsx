import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import GameStation from './pages/GameStation';
import Registration from './pages/Registration';
import QueueDisplay from './pages/QueueDisplay';
import Leaderboard from './pages/Leaderboard';
import AdminDashboard from './pages/AdminDashboard';
import EventPasswordGate from './components/EventPasswordGate';

function AppLayout() {
  const location = useLocation();
  // On dedicated projector queue screen, keep navbar optional or hidden for clean full display
  const isQueueProjector = location.pathname === '/queue';

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col">
      {!isQueueProjector && <Navbar />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/game" replace />} />
          <Route
            path="/game"
            element={<GameStation />}
          />
          <Route
            path="/register"
            element={
              <EventPasswordGate>
                <Registration />
              </EventPasswordGate>
            }
          />
          <Route path="/queue" element={<QueueDisplay />} />
          <Route path="/scoreboard" element={<Leaderboard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/game" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}
