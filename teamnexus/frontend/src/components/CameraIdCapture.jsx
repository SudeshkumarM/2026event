import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, RotateCcw, Check, X, SwitchCamera, AlertCircle, Shield, RefreshCw, Video, VideoOff } from 'lucide-react';

const MAX_ID_IMAGE_BYTES = 5 * 1024 * 1024;

const getDataUrlByteSize = (dataUrl) => {
  const separatorIndex = dataUrl.indexOf(',');
  return separatorIndex < 0
    ? Infinity
    : Math.ceil((dataUrl.length - separatorIndex - 1) * 3 / 4);
};

export default function CameraIdCapture({
  label = "College ID Card",
  participantName = "",
  currentPreview,
  onImageSelected,
  accentColor = 'cyan', // 'cyan' or 'indigo'
  required = true
}) {
  const [mode, setMode] = useState('IDLE'); // 'IDLE', 'CAMERA', 'PREVIEW'
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' or 'user'
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const isStartingCameraRef = useRef(false);

  // Enumerate devices without requesting permission; labels appear after camera access is granted.
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          setAvailableDevices(devices.filter((device) => device.kind === 'videoinput'));
        })
        .catch((err) => console.warn('Could not enumerate media devices:', err));
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    isStartingCameraRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setVideoReady(false);
    setIsStartingCamera(false);
    setIsCapturingImage(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (mode === 'CAMERA' && videoRef.current && stream) {
      const video = videoRef.current;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.srcObject = stream;

      let isCancelled = false;

      const handlePlay = async () => {
        try {
          await video.play();
          if (!isCancelled) setVideoReady(true);
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.error('Camera preview playback failed:', err);
          if (!isCancelled) {
            setCameraError('The camera connected, but video playback was paused. Click Retry or upload an ID image.');
            stopCamera();
            setMode('IDLE');
          }
        }
      };

      const handleMetadata = () => {
        handlePlay();
      };

      video.addEventListener('loadedmetadata', handleMetadata);
      video.addEventListener('canplay', handlePlay);

      if (video.readyState >= 2 || video.videoWidth > 0) {
        handlePlay();
      }

      return () => {
        isCancelled = true;
        video.removeEventListener('loadedmetadata', handleMetadata);
        video.removeEventListener('canplay', handlePlay);
      };
    }
  }, [mode, stream, stopCamera]);

  const startCamera = async (targetDeviceId = selectedDeviceId, targetFacing = facingMode) => {
    // Cleanly stop any existing stream and reset state before starting
    stopCamera();
    const requestId = cameraRequestRef.current;
    setCameraError(null);

    const getMediaDevices = () => {
      if (navigator.mediaDevices?.getUserMedia) {
        return (constraints) => navigator.mediaDevices.getUserMedia(constraints);
      }
      const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
      if (legacyGetUserMedia) {
        return (constraints) => new Promise((resolve, reject) => legacyGetUserMedia.call(navigator, constraints, resolve, reject));
      }
      return null;
    };

    const getUserMediaFn = getMediaDevices();
    if (!getUserMediaFn) {
      const isSecure = typeof window !== 'undefined' && (
        window.isSecureContext ||
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      );
      const isLanHttp = typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

      if (isLanHttp || !isSecure) {
        const port = window.location.port ? `:${window.location.port}` : '';
        const httpsUrl = `https://${window.location.hostname}${port}${window.location.pathname}${window.location.search}${window.location.hash}`;
        setCameraError({
          type: 'LAN_HTTP',
          message: 'Camera access on LAN requires HTTPS or browser security trust for this IP. Access via HTTPS (npm run dev:https) or tap "Upload File Instead" below.',
          httpsUrl: httpsUrl
        });
      } else {
        setCameraError({
          type: 'UNSUPPORTED',
          message: 'Camera access is not supported or was blocked by browser security. You can tap "Upload File Instead" to select your ID card image.'
        });
      }
      setMode('IDLE');
      return;
    }

    isStartingCameraRef.current = true;
    setIsStartingCamera(true);
    setMode('CAMERA');
    setVideoReady(false);

    try {
      // Build constraints with hierarchical fallbacks
      let constraints;
      if (targetDeviceId) {
        constraints = {
          video: {
            deviceId: { exact: targetDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
      } else {
        constraints = {
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
      }

      let mediaStream;
      try {
        mediaStream = await getUserMediaFn(constraints);
      } catch (firstErr) {
        console.warn('Primary camera constraints failed; retrying with facingMode constraints:', firstErr);
        try {
          mediaStream = await getUserMediaFn({
            video: { facingMode: { ideal: targetFacing } },
            audio: false
          });
        } catch (secondErr) {
          console.warn('FacingMode constraints failed; retrying with generic video constraints:', secondErr);
          mediaStream = await getUserMediaFn({ video: true, audio: false });
        }
      }

      if (requestId !== cameraRequestRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);

      if (navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setAvailableDevices(videoInputs);
          const activeDeviceId = mediaStream.getVideoTracks()[0]?.getSettings().deviceId;
          if (activeDeviceId) setSelectedDeviceId(activeDeviceId);
        }).catch((err) => console.warn('Could not refresh camera list:', err));
      }

    } catch (err) {
      console.error("Camera access error:", err);
      let errorDesc = "Unable to start camera. Please verify camera permissions or upload an image file.";

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorDesc = 'Camera permission was denied. Tap the lock/camera icon in your browser address bar to allow camera access, then click Retry Camera.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorDesc = 'No camera device found on this system. Please connect or enable your camera, or tap "Upload File Instead".';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorDesc = 'The camera is currently busy or in use by another app (Zoom, Teams, or another tab). Close the other app and click Retry Camera.';
      } else if (err.name === 'OverconstrainedError') {
        errorDesc = 'The requested camera resolution is not supported. Click Retry Camera to connect with default settings.';
      } else if (err.name === 'SecurityError') {
        errorDesc = 'Camera access was blocked by browser security restrictions. Ensure you are accessing via HTTPS or trusted localhost.';
      }

      if (requestId === cameraRequestRef.current) {
        setCameraError(errorDesc);
        setMode('IDLE');
      }
    } finally {
      if (requestId === cameraRequestRef.current) {
        isStartingCameraRef.current = false;
        setIsStartingCamera(false);
      }
    }
  };

  const handleDeviceChange = (e) => {
    const devId = e.target.value;
    setSelectedDeviceId(devId);
    startCamera(devId, facingMode);
  };

  const toggleFacingMode = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedDeviceId(''); // clear specific device to allow facingMode ideal
    startCamera('', nextFacing);
  };

  // Capture frame from active video
  const captureFrame = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if ((video.readyState < 1 && !video.videoWidth) || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera preview is not ready yet. Wait for the live image, then capture again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCameraError('The browser could not prepare an image for capture. Retry or upload an image file.');
      return;
    }

    const requestId = cameraRequestRef.current;
    setIsCapturingImage(true);
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const compressedImage = await compressImage(dataUrl, 1600, 0.85);
      if (requestId !== cameraRequestRef.current) return;
      if (getDataUrlByteSize(compressedImage) > MAX_ID_IMAGE_BYTES) {
        setCameraError('The captured image is larger than 5 MB after processing. Try another camera setting or upload a smaller image.');
        return;
      }
      setCapturedImage(compressedImage);
      stopCamera();
      setMode('PREVIEW');
    } catch (err) {
      console.error('Could not capture the camera frame:', err);
      if (requestId === cameraRequestRef.current) {
        setCameraError('The camera image could not be captured. Retry or upload an image file.');
      }
    } finally {
      if (requestId === cameraRequestRef.current) {
        setIsCapturingImage(false);
      }
    }
  };

  const confirmCapturedImage = () => {
    if (capturedImage) {
      onImageSelected(capturedImage, `id_card_${Date.now()}.jpg`, null);
      setMode('IDLE');
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera(selectedDeviceId, facingMode);
  };

  const cancelCamera = () => {
    stopCamera();
    setMode('IDLE');
    setCameraError(null);
  };

  const compressImage = (dataUrl, maxDim = 1600, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not prepare the selected image.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('The selected file could not be decoded as an image.'));
      img.src = dataUrl;
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCameraError('Please upload a valid JPG, PNG, or WebP image.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_ID_IMAGE_BYTES) {
      setCameraError('The image must be larger than 0 bytes and no larger than 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        if (typeof event.target.result !== 'string') {
          throw new Error('The selected image could not be read.');
        }
        const compressed = await compressImage(event.target.result, 1600, 0.85);
        if (getDataUrlByteSize(compressed) > MAX_ID_IMAGE_BYTES) {
          throw new Error('The processed image is larger than 5 MB. Please choose a smaller image.');
        }
        onImageSelected(compressed, file.name, file);
        setCameraError(null);
        setMode('IDLE');
      } catch (err) {
        console.error('Could not process the selected ID image:', err);
        setCameraError(err.message || 'Could not process the selected image. Please try another file.');
      }
    };
    reader.onerror = () => {
      setCameraError("Failed to read the selected file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const isCyan = accentColor === 'cyan';
  const borderFocus = isCyan ? 'border-cyan-500' : 'border-indigo-500';
  const bgAccent = isCyan ? 'bg-cyan-500' : 'bg-indigo-600';
  const textAccent = isCyan ? 'text-cyan-400' : 'text-indigo-400';

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Header Label */}
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-slate-200 font-bold">
            {label} {required && <span className="text-rose-400">*</span>}
          </label>
          {participantName && (
            <span className="text-[11px] text-slate-400 font-sans">
              For: <strong className="text-white">{participantName}</strong>
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
          <Shield className="w-3 h-3 text-emerald-400" /> Secure ID Storage
        </span>
      </div>

      {/* Error Banner with Actionable Advice */}
      {cameraError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 text-rose-400 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div>{typeof cameraError === 'object' ? cameraError.message : cameraError}</div>
            {typeof cameraError === 'object' && cameraError.httpsUrl && (
              <div className="pt-0.5">
                <a
                  href={cameraError.httpsUrl}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 underline font-semibold"
                >
                  Switch to Secure HTTPS ({cameraError.httpsUrl}) →
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => startCamera(selectedDeviceId, facingMode)}
                disabled={isStartingCamera}
                className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-mono font-bold flex items-center gap-1 transition"
              >
                <RefreshCw className="w-3 h-3" /> Retry Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-mono font-bold flex items-center gap-1 transition"
              >
                <Upload className="w-3 h-3" /> Upload File Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 1. CAMERA MODE (LIVE VIEWFINDER + FRAMING GUIDE) */}
      {/* ==================================================================== */}
      {mode === 'CAMERA' && (
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-cyan-500/60 shadow-2xl">
          {/* Top Camera Status & Switcher Bar */}
          <div className="absolute top-0 inset-x-0 z-20 p-2.5 bg-gradient-to-b from-slate-950/90 to-transparent flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-emerald-400 bg-slate-950/80 px-2.5 py-1 rounded-full border border-emerald-500/30 text-[10px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE VIEWFINDER</span>
            </div>

            {/* Device Selector if multiple cameras exist */}
            {availableDevices.length > 1 && (
              <select
                value={selectedDeviceId}
                onChange={handleDeviceChange}
                disabled={isStartingCamera}
                className="bg-slate-900/90 border border-slate-700 text-slate-200 text-[11px] rounded-lg px-2 py-1 max-w-[140px] truncate focus:outline-none"
              >
                {availableDevices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Video Preview Element */}
          <div className="relative min-h-[260px] max-h-[360px] bg-black flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover select-none"
            />

            {/* Loading Spinner while video stream initializes */}
            {isStartingCamera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-2 z-10">
                <div className="w-8 h-8 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
                <span className="text-xs font-mono text-cyan-300">INITIALIZING CAMERA HARDWARE...</span>
              </div>
            )}

            {/* Target ID Card Framing Guide */}
            {videoReady && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 z-10">
                <div className="w-full max-w-sm h-48 border-2 border-dashed border-cyan-400 rounded-2xl relative shadow-[0_0_30px_rgba(6,182,212,0.35)] bg-cyan-950/10">
                  <div className="absolute top-2 left-3 text-[10px] uppercase font-mono font-bold tracking-wider text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                    ALIGN COLLEGE ID CARD
                  </div>
                  <div className="absolute bottom-2 right-3 text-[9px] font-mono text-cyan-300/90 bg-slate-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">
                    Front Face Clear
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Camera Action Controls Bar */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 z-20">
            <button
              type="button"
              onClick={cancelCamera}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition"
            >
              <X className="w-4 h-4" />
              <span>Stop Camera</span>
            </button>

            <button
              type="button"
              onClick={captureFrame}
              disabled={!videoReady || isCapturingImage}
              className={`flex-1 py-3 px-6 rounded-xl ${bgAccent} hover:opacity-95 text-white font-mono font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 transition transform active:scale-95 disabled:opacity-50`}
            >
              <Camera className="w-4 h-4" />
              <span>{isCapturingImage ? 'PROCESSING IMAGE...' : 'CAPTURE ID CARD NOW'}</span>
            </button>

            <button
              type="button"
              onClick={toggleFacingMode}
              title="Switch between front/rear camera"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. PREVIEW CAPTURED PHOTO (CONFIRM / RETAKE FLOW) */}
      {/* ==================================================================== */}
      {mode === 'PREVIEW' && capturedImage && (
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-emerald-500/40 p-4 text-center shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4" /> ID CARD CAPTURED
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Verify text & photo clarity</span>
          </div>

          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 max-h-56 flex items-center justify-center">
            <img
              src={capturedImage}
              alt="Captured College ID"
              className="w-full h-auto max-h-56 object-contain"
            />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={retakePhoto}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake Photo</span>
            </button>

            <button
              type="button"
              onClick={confirmCapturedImage}
              className={`flex-1 py-2.5 rounded-xl ${bgAccent} hover:opacity-95 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-cyan-500/20`}
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Use ID</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. IDLE MODE (SHOW CONFIRMED IMAGE OR SCAN/UPLOAD BUTTONS) */}
      {/* ==================================================================== */}
      {mode === 'IDLE' && (
        <div>
          {currentPreview ? (
            /* Card Attached Successfully Badge with Quick Rescan */
            <div className="relative rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/20 p-3.5 flex items-center gap-3.5 shadow-lg">
              <img
                src={currentPreview}
                alt="Confirmed ID"
                className="w-24 h-16 object-cover rounded-xl border border-emerald-500/40 flex-shrink-0 shadow-md bg-slate-900"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="truncate">COLLEGE ID CARD VERIFIED</span>
                </div>
                <div className="text-[11px] text-slate-300 font-sans mt-0.5">
                  Ready for secure event submission
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-300 border border-slate-700 transition"
                >
                  Rescan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onImageSelected(null, null, null);
                    setCapturedImage(null);
                    setCameraError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-xs font-mono text-rose-300 border border-rose-800/60 transition"
                >
                  Remove
                </button>
                <label className="px-3 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-[10px] font-mono text-slate-400 text-center cursor-pointer transition">
                  Change
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            /* Primary Scan & Upload Actions */
            <div className="space-y-2.5">
              {/* PRIMARY SCAN CAMERA BUTTON */}
              <button
                type="button"
                onClick={() => startCamera()}
                className={`w-full py-4 px-4 rounded-2xl border-2 border-dashed ${borderFocus} bg-slate-900 hover:bg-slate-850 text-white transition-all group flex items-center justify-center gap-3.5 shadow-xl shadow-cyan-950/25 active:scale-[0.99] cursor-pointer`}
              >
                <div className={`w-11 h-11 rounded-xl ${bgAccent} flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 group-hover:scale-110 transition-transform flex-shrink-0`}>
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-extrabold font-mono tracking-wider text-white">
                    OPEN CAMERA & SCAN ID CARD
                  </span>
                  <span className="block text-[11px] text-slate-400 font-sans">
                    Activate system camera to photograph college ID card
                  </span>
                </div>
              </button>

              {/* SECONDARY UPLOAD FALLBACK */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-1">
                <span>Or if camera is unavailable:</span>
                <label className="text-cyan-400 hover:text-cyan-300 font-mono font-bold cursor-pointer underline flex items-center gap-1 transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image File (JPG/PNG)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
