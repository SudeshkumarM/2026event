import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Crosshair, Zap, CheckCircle2, AlertTriangle, ArrowRight, Printer, Shield, KeyRound, Building2, Camera, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import CameraIdCapture from '../components/CameraIdCapture';

export default function Registration() {
  const navigate = useNavigate();

  // Workflow Steps: 'SCAN_ID' (Step 1: Mandatory ID Card Scan) -> 'DETAILS' (Step 2: Team details form)
  const [currentStep, setCurrentStep] = useState('SCAN_ID');

  const [formData, setFormData] = useState({
    team_name: '',
    college_name: '',
    p1_name: '',
    p1_college: '',
    p1_phone: '',
    p1_roll: '',
    p2_name: '',
    p2_college: '',
    p2_phone: '',
    p2_roll: '',
  });

  const [p1Image, setP1Image] = useState(null); // Data URL or File
  const [p2Image, setP2Image] = useState(null);
  const [p1FileObj, setP1FileObj] = useState(null);
  const [p2FileObj, setP2FileObj] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleP1ImageSelected = (dataUrl, fileName, fileObj = null) => {
    setP1Image(dataUrl);
    setP1FileObj(fileObj);
    setError(null);
  };

  const handleP2ImageSelected = (dataUrl, fileName, fileObj = null) => {
    setP2Image(dataUrl);
    setP2FileObj(fileObj);
    setError(null);
  };

  // STEP 1 VALIDATION -> Advance to Step 2
  const handleProceedToDetails = () => {
    setError(null);
    if (!p1Image) {
      setError('Player 1 (Aim Controller) College ID card is mandatory. Please scan with camera or upload image.');
      return;
    }
    if (!p2Image) {
      setError('Player 2 (Shoot Controller) College ID card is mandatory. Please scan with camera or upload image.');
      return;
    }
    setCurrentStep('DETAILS');
  };

  // STEP 2 SUBMISSION -> Backend Registration
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // 1. Mandatory Field Validations (Roll numbers are optional)
    if (!formData.team_name.trim()) {
      setError('Please provide an official Team Name.');
      return;
    }

    if (!formData.college_name.trim()) {
      setError('Please provide the College / Institution Name.');
      return;
    }

    if (!formData.p1_name.trim() || !formData.p1_phone.trim()) {
      setError('Player 1 (Aim) Name and Mobile Phone are required.');
      return;
    }

    if (!formData.p2_name.trim() || !formData.p2_phone.trim()) {
      setError('Player 2 (Shoot) Name and Mobile Phone are required.');
      return;
    }

    // 2. Phone validation (10 digits)
    const cleanP1Phone = formData.p1_phone.replace(/\D/g, '');
    const cleanP2Phone = formData.p2_phone.replace(/\D/g, '');
    if (cleanP1Phone.length < 10 || cleanP2Phone.length < 10) {
      setError('Please enter valid 10-digit mobile numbers for both participants.');
      return;
    }
    if (cleanP1Phone === cleanP2Phone) {
      setError('Player 1 and Player 2 cannot share the same mobile phone number.');
      return;
    }

    // 3. Mandatory ID Card Upload Check
    if (!p1Image || !p2Image) {
      setError('Both College ID card images are strictly required.');
      setCurrentStep('SCAN_ID');
      return;
    }

    setLoading(true);

    try {
      // Build submission payload
      const payload = {
        team_name: formData.team_name.trim(),
        college_name: formData.college_name.trim(),
        p1_name: formData.p1_name.trim(),
        p1_college: formData.p1_college.trim() || formData.college_name.trim(),
        p1_phone: cleanP1Phone,
        p1_roll: formData.p1_roll.trim(),
        p1_id_card_data: p1Image,

        p2_name: formData.p2_name.trim(),
        p2_college: formData.p2_college.trim() || formData.college_name.trim(),
        p2_phone: cleanP2Phone,
        p2_roll: formData.p2_roll.trim(),
        p2_id_card_data: p2Image,
      };

      const res = await api.registerTeam(payload);
      if (res.success) {
        setSuccessData(res);
      } else {
        setError(res.error || 'Registration failed.');
      }
    } catch (err) {
      setError(err.message || 'Network error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  // --- CONFIRMATION SCREEN ---
  if (successData) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto mb-5 text-emerald-400">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold mb-1">
            REGISTRATION SUCCESSFUL
          </div>
          <h2 className="text-3xl font-black font-display tracking-tight text-white mb-1">
            {successData.team_name.toUpperCase()}
          </h2>
          <p className="text-slate-400 text-xs mb-6">
            {successData.college_name || 'Verified Institution'} • Queue Ticket #{successData.queue_number}
          </p>

          {/* TEAM ID & ACCESS CODE BADGE */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 mb-6 text-left space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">
                  Official Team Identifier (Public)
                </div>
                <div className="text-2xl font-black tracking-wider text-cyan-400 font-mono">
                  {successData.team_code}
                </div>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300 font-semibold">
                  Queue #{successData.queue_number}
                </span>
              </div>
            </div>

            {/* Secret Game Access Code */}
            <div className="bg-gradient-to-r from-cyan-950/40 to-indigo-950/40 border border-cyan-500/40 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-300 font-bold mb-1">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>YOUR GAME ACCESS CODE (SAVE THIS!)</span>
              </div>
              <div className="text-3xl font-black tracking-widest text-white font-mono select-all bg-slate-900/80 px-3 py-2 rounded-lg border border-cyan-500/30 text-center mb-1 shadow-inner">
                {successData.access_code}
              </div>
              <div className="text-[11px] text-amber-200/90 text-center">
                ⚠️ Save this access code. Enter it at the Game Station to unlock your 7-minute match session!
              </div>
            </div>
          </div>

          {/* Event Instructions */}
          <div className="text-xs text-slate-400 bg-slate-800/40 rounded-xl p-4 text-left mb-6 space-y-1.5 border border-slate-800">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span>Next Steps:</span>
            </div>
            <div>• Proceed to the competition waiting area and watch the <span className="text-cyan-400 font-medium">Live Queue Display</span>.</div>
            <div>• When <span className="text-cyan-400 font-mono font-semibold">{successData.team_code}</span> is called, report to the game station.</div>
            <div>• Enter your Team ID and Game Access Code at the station to start your official 7-minute match.</div>
            <div>• Player 1 controls WASD (aim) while Player 2 controls Mouse Left Click or ESP32 Trigger (shoot).</div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => window.print()}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save Pass</span>
            </button>
            <button
              onClick={() => navigate('/game')}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 font-semibold text-xs shadow-lg shadow-cyan-500/25 transition flex items-center justify-center gap-2"
            >
              <span>Go to Game Station</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setSuccessData(null);
                setCurrentStep('SCAN_ID');
                setFormData({
                  team_name: '', college_name: '',
                  p1_name: '', p1_college: '', p1_phone: '', p1_roll: '',
                  p2_name: '', p2_college: '', p2_phone: '', p2_roll: '',
                });
                setP1Image(null);
                setP2Image(null);
                setP1FileObj(null);
                setP2FileObj(null);
              }}
              className="py-3 px-3 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-400 text-xs transition"
            >
              Register Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">

        {/* Header Banner */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono uppercase tracking-widest mb-3">
            <Users className="w-3.5 h-3.5" />
            <span>2-Player Competitive Event Registration</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white mb-1">
            TECNOX <span className="text-cyan-400 font-bold font-mono text-2xl sm:text-3xl">· AI DOWNFALL</span>
          </h1>
          <div className="text-xs font-mono font-bold text-cyan-300 tracking-wider mb-2">
            Built by Humans. Ended by Humans.
          </div>
          <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto">
            Mandatory Camera-First ID Card Scanning. Capture both college ID cards before entering team details.
          </p>
        </div>

        {/* STEP PROGRESS BAR */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
            currentStep === 'SCAN_ID'
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-lg shadow-cyan-500/20'
              : 'bg-slate-900 border-emerald-500/50 text-emerald-400'
          }`}>
            <Camera className="w-4 h-4" />
            <span>STEP 1: SCAN ID CARDS</span>
            {p1Image && p2Image && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
          </div>

          <div className="w-8 h-0.5 bg-slate-800"></div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
            currentStep === 'DETAILS'
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-lg shadow-cyan-500/20'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <Users className="w-4 h-4" />
            <span>STEP 2: TEAM DETAILS</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center gap-3 shadow-lg">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 1: MANDATORY ID CARD CAMERA & SCAN SCREEN (COMES FIRST) */}
        {/* ==================================================================== */}
        {currentStep === 'SCAN_ID' && (
          <div className="space-y-6">
            {/* Step 1 Introduction Box */}
            <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-slate-300 flex items-start gap-3">
              <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-mono text-xs uppercase tracking-wider mb-0.5">
                  ID CARD VERIFICATION REQUIRED FIRST
                </strong>
                College ID cards are mandatory for all tournament participants. Use your device camera to scan both cards or upload digital copies. Once both IDs are attached, you can proceed to enter your team credentials.
              </div>
            </div>

            {/* 2 Player Camera Scanners */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Player 1 Scanner */}
              <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Crosshair className="w-4 h-4" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider">
                      PLAYER 1: AIM OPERATIVE
                    </span>
                  </div>
                  {p1Image && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                      ✓ ID Attached
                    </span>
                  )}
                </div>

                <CameraIdCapture
                  label="Player 1 College ID Card"
                  participantName="Player 1 (Aim)"
                  currentPreview={p1Image}
                  onImageSelected={handleP1ImageSelected}
                  accentColor="cyan"
                  required={true}
                />
              </div>

              {/* Player 2 Scanner */}
              <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Zap className="w-4 h-4" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider">
                      PLAYER 2: SHOOT OPERATIVE
                    </span>
                  </div>
                  {p2Image && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                      ✓ ID Attached
                    </span>
                  )}
                </div>

                <CameraIdCapture
                  label="Player 2 College ID Card"
                  participantName="Player 2 (Shoot)"
                  currentPreview={p2Image}
                  onImageSelected={handleP2ImageSelected}
                  accentColor="indigo"
                  required={true}
                />
              </div>
            </div>

            {/* Proceed to Step 2 Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleProceedToDetails}
                disabled={!p1Image || !p2Image}
                className={`w-full py-4 px-6 rounded-2xl font-bold font-mono text-sm tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl ${
                  p1Image && p2Image
                    ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/25 cursor-pointer'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-80'
                }`}
              >
                <span>CONTINUE TO PARTICIPANT DETAILS (STEP 2)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              {(!p1Image || !p2Image) && (
                <div className="text-center text-[11px] text-slate-400 mt-2 font-mono">
                  * Scan or upload both ID cards above to unlock Step 2.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 2: PARTICIPANT & TEAM DETAILS FORM */}
        {/* ==================================================================== */}
        {currentStep === 'DETAILS' && (
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Top Bar: Attached ID Status Summary with Return option */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                    <span>2 COLLEGE ID CARDS VERIFIED & ATTACHED</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Both participant ID cards are secured and ready for registration.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCurrentStep('SCAN_ID')}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change / Rescan IDs</span>
              </button>
            </div>

            {/* Team & College Info Section */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-2 font-bold">
                    Team Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="team_name"
                    value={formData.team_name}
                    onChange={handleInputChange}
                    placeholder="e.g. TECNOX, NEURAL OVERLORDS"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-2 font-bold">
                    College / Institution Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="college_name"
                    value={formData.college_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Sree Sakthi Engineering College"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition text-sm"
                  />
                </div>
              </div>
            </div>

            {/* 2 Players Input Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* PLAYER 1: AIM CONTROL (WASD) */}
              <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                <div className="flex items-center gap-2 mb-4 text-cyan-400 border-b border-slate-800 pb-3">
                  <Crosshair className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">
                    PLAYER 1: AIM CONTROL (WASD)
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      Full Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="p1_name"
                      value={formData.p1_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Alex Morgan"
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      Mobile Number <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      name="p1_phone"
                      value={formData.p1_phone}
                      onChange={handleInputChange}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      College Roll No. <span className="text-slate-500 text-[11px]">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      name="p1_roll"
                      value={formData.p1_roll}
                      onChange={handleInputChange}
                      placeholder="e.g. 714021104001 (Optional)"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* PLAYER 2: SHOOT CONTROL (MOUSE / ESP32) */}
              <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                <div className="flex items-center gap-2 mb-4 text-indigo-400 border-b border-slate-800 pb-3">
                  <Zap className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">
                    PLAYER 2: SHOOT CONTROL (MOUSE / ESP32)
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      Full Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="p2_name"
                      value={formData.p2_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Jordan Lee"
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      Mobile Number <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      name="p2_phone"
                      value={formData.p2_phone}
                      onChange={handleInputChange}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      College Roll No. <span className="text-slate-500 text-[11px]">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      name="p2_roll"
                      value={formData.p2_roll}
                      onChange={handleInputChange}
                      placeholder="e.g. 714021104002 (Optional)"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Submission Actions */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep('SCAN_ID')}
                className="py-4 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to ID Cards</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-4 px-8 rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-black text-sm tracking-wider font-mono shadow-xl shadow-cyan-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>REGISTERING TEAM & ENCRYPTING ID CARDS...</span>
                ) : (
                  <>
                    <span>SUBMIT REGISTRATION & GET GAME ACCESS CODE</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}
