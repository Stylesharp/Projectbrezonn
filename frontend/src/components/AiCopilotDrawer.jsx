import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit, X, Send, Sparkles, ShieldAlert, ArrowDown,
  RotateCcw, Gamepad2, KeyRound, Mic, MicOff, Square,
  CheckCircle2, PlaneLanding, PlaneTakeoff, ArrowUpCircle, Loader2, Radio
} from 'lucide-react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { queryGeminiFlightCopilot, GEMINI_MODELS } from '../utils/geminiClient';
import { cockpitVoice } from '../utils/voiceEngine';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function AiCopilotDrawer({ sendCommand }) {
  const {
    copilotOpen, setCopilotOpen, telemetry, recon, apiKeys, setApiKeys,
    setReconOption, setGroundBotState, setActivePanel,
    initiateLanding, initiateTakeoff, nudgeAltitude, setTargetAltitudeFt, setHoverHold, addWaypoint
  } = useTelemetryStore();

  const [input, setInput] = useState('');
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [keyDraft, setKeyDraft] = useState(apiKeys.geminiApiKey || '');
  const [modelDraft, setModelDraft] = useState(apiKeys.geminiModel || 'gemini-3.5-flash-lite');
  const [loading, setLoading] = useState(false);

  // Voice recording & recognition states
  const [listening, setListening] = useState(false);
  const [voiceEngineMode, setVoiceEngineMode] = useState('AUTO'); // AUTO | GEMINI_AUDIO | BROWSER_SPEECH
  const [interimText, setInterimText] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [voiceHint, setVoiceHint] = useState('');

  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'AEGIS AI Flight Copilot online. Click the Mic (or press Alt+V) to speak flight orders. For Brave Browser, add your free Gemini API key (Key icon) to unlock Direct Gemini Audio Mic!',
      actions: [],
    },
  ]);

  const endRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const meterRafRef = useRef(null);
  const chunksRef = useRef([]);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setKeyDraft(apiKeys.geminiApiKey || '');
    setModelDraft(apiKeys.geminiModel || 'gemini-3.5-flash-lite');
  }, [apiKeys.geminiApiKey, apiKeys.geminiModel]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, copilotOpen, loading, interimText]);

  const isGeminiConnected = Boolean((apiKeys.geminiApiKey || '').trim());
  const effectiveVoiceMode =
    voiceEngineMode === 'AUTO'
      ? isGeminiConnected
        ? 'GEMINI_AUDIO'
        : 'BROWSER_SPEECH'
      : voiceEngineMode;

  // Execute structured Gemini Function Calls directly on the 3D UAV & Backend
  const executeToolCalls = useCallback(
    (functionCalls = []) => {
      const executed = [];
      for (const fc of functionCalls) {
        const name = fc.name;
        const args = fc.args || {};

        if (name === 'control_vertical_flight') {
          if (args.action === 'ASCEND') {
            const delta = Math.max(0.5, (args.deltaFt || 1200) / 1400);
            nudgeAltitude(delta);
            executed.push(`ALTITUDE ▲ (+${args.deltaFt || 1200} ft)`);
          } else if (args.action === 'DESCEND') {
            const delta = -Math.max(0.5, (args.deltaFt || 1200) / 1400);
            nudgeAltitude(delta);
            executed.push(`ALTITUDE ▼ (-${args.deltaFt || 1200} ft)`);
          } else if (args.action === 'SET_ALTITUDE' && args.targetAltitudeFt) {
            setTargetAltitudeFt(args.targetAltitudeFt);
            executed.push(`SET ALT -> ${Math.round(args.targetAltitudeFt)} FT`);
          } else if (args.action === 'HOLD' || args.action === 'HOVER_LOCK') {
            setHoverHold(true);
            executed.push('GPS HOVER LOCK -> ON');
          } else if (args.action === 'RESUME_FLIGHT') {
            setHoverHold(false);
            executed.push('HOVER LOCK -> RELEASED');
          }
        } else if (name === 'land_or_takeoff') {
          const padId = args.padId || useTelemetryStore.getState().recon.activePadId;
          if (args.action === 'LAND') {
            initiateLanding(padId);
            setActivePanel(1);
            executed.push(`AUTOLAND -> ${padId}`);
          } else if (args.action === 'TAKEOFF') {
            initiateTakeoff(padId);
            setActivePanel(1);
            executed.push(`TAKEOFF -> ${padId}`);
          }
        } else if (name === 'set_flight_dynamics') {
          if (typeof args.throttle === 'number') {
            const thr = Math.max(0, Math.min(100, args.throttle));
            sendCommand({ type: 'setActuator', payload: { key: 'throttle', value: thr } });
            executed.push(`THROTTLE -> ${Math.round(thr)}%`);
          }
          if (typeof args.pitch === 'number' || typeof args.roll === 'number') {
            setReconOption('pilotMode', true);
            sendCommand({ type: 'setFlightMode', payload: { mode: 'MANUAL_PILOT' } });
            sendCommand({
              type: 'setManualControl',
              payload: { pitch: args.pitch ?? 0, roll: args.roll ?? 0 },
            });
            executed.push(`ATTITUDE P:${args.pitch ?? 0} R:${args.roll ?? 0}`);
          }
          if (typeof args.flaps === 'number') {
            sendCommand({ type: 'setActuator', payload: { key: 'flaps', value: args.flaps } });
            executed.push(`FLAPS -> ${args.flaps}°`);
          }
          if (typeof args.gearDown === 'boolean') {
            sendCommand({ type: 'setActuator', payload: { key: 'gearDown', value: args.gearDown } });
            executed.push(`GEAR -> ${args.gearDown ? 'DOWN' : 'UP'}`);
          }
          if (typeof args.pilotMode === 'boolean') {
            setReconOption('pilotMode', args.pilotMode);
            sendCommand({ type: 'setFlightMode', payload: { mode: args.pilotMode ? 'MANUAL_PILOT' : 'LOITER' } });
            executed.push(`PILOT MODE -> ${args.pilotMode ? 'ON' : 'OFF'}`);
          }
        } else if (name === 'control_mission_systems') {
          if (args.weatherMode) {
            setReconOption('weatherMode', args.weatherMode);
            sendCommand({ type: 'setWeather', payload: { mode: args.weatherMode } });
            executed.push(`WEATHER -> ${args.weatherMode}`);
          }
          if (args.viewMode) {
            setReconOption('viewMode', args.viewMode);
            setActivePanel(1);
            executed.push(`OPTICS -> ${args.viewMode}`);
          }
          if (args.assetMode) {
            setReconOption('assetMode', args.assetMode);
            setActivePanel(1);
            executed.push(`ASSET -> ${args.assetMode}`);
          }
          if (args.cameraPreset) {
            setReconOption('cameraPreset', args.cameraPreset);
            setActivePanel(1);
            executed.push(`CAM -> ${args.cameraPreset}`);
          }
          if (args.roverAction === 'DEPLOY') {
            setGroundBotState('DEPLOYING');
            setReconOption('cameraPreset', 'ROVER');
            setActivePanel(1);
            executed.push('UGV ROVER -> DEPLOY');
          } else if (args.roverAction === 'RECALL') {
            setGroundBotState('RECALLING');
            setReconOption('cameraPreset', 'ISO');
            executed.push('UGV ROVER -> RECALL');
          }
          if (args.triggerRepair) {
            const curFaults = useTelemetryStore.getState().telemetry?.faults || {};
            Object.keys(curFaults).forEach((k) => sendCommand({ type: 'setFault', payload: { key: k, value: false } }));
            executed.push('MAINT-01 -> FAULTS CLEARED');
          }
          if (args.scenario) {
            sendCommand({ type: 'triggerScenario', payload: { name: args.scenario } });
            if (args.scenario === 'STORM_ICING') setReconOption('weatherMode', 'SNOW_ICING');
            if (args.scenario === 'ENGINE_CASCADE') setReconOption('weatherMode', 'STORM');
            if (args.scenario === 'NOMINAL') setReconOption('weatherMode', 'CLEAR');
            executed.push(`SCENARIO -> ${args.scenario}`);
          }
        } else if (name === 'navigate_to_coordinates') {
          const wpt = {
            id: `AI-${Math.floor(10 + Math.random() * 89)}`,
            name: (args.label || 'AI TARGET').toUpperCase(),
            lat: Number(args.lat),
            lon: Number(args.lon),
            alt: Number(args.altitudeFt || 8500),
            dist: 'NAV',
            status: 'ACTIVE',
          };
          addWaypoint(wpt);
          sendCommand({ type: 'setWaypoint', payload: wpt });
          if (args.altitudeFt) setTargetAltitudeFt(args.altitudeFt);
          executed.push(`NAV -> ${wpt.lat.toFixed(4)}°N, ${Math.abs(wpt.lon).toFixed(4)}°W`);
        }
      }
      return executed;
    },
    [
      addWaypoint,
      initiateLanding,
      initiateTakeoff,
      nudgeAltitude,
      sendCommand,
      setActivePanel,
      setGroundBotState,
      setHoverHold,
      setReconOption,
      setTargetAltitudeFt,
    ]
  );

  // Offline / Zero-Key Instant Fallback Parser
  const executeLocalFallback = useCallback(
    (text) => {
      const q = text.toLowerCase();
      const t = useTelemetryStore.getState().telemetry;
      const r = useTelemetryStore.getState().recon;

      const thrMatch = q.match(/throttle\s*(\d+)/);
      if (thrMatch) {
        const val = Math.max(0, Math.min(100, Number(thrMatch[1])));
        sendCommand({ type: 'setActuator', payload: { key: 'throttle', value: val } });
        return { text: `Throttle set to ${val}%. Monitoring spool response.`, actions: [`THROTTLE -> ${val}%`] };
      }
      if (q.includes('hover') || q.includes('hold position') || q.includes('stop moving') || q.includes('stay here')) {
        setHoverHold(true);
        return { text: 'GPS Station-Keeping Hover Lock engaged. Holding steady over current spot.', actions: ['GPS HOVER LOCK -> ON'] };
      }
      if (q.includes('resume') || q.includes('fly forward') || q.includes('unhover')) {
        setHoverHold(false);
        return { text: 'Hover lock released. Resuming forward reconnaissance cruise.', actions: ['HOVER LOCK -> RELEASED'] };
      }
      if (q.includes('takeoff') || q.includes('take off') || q.includes('launch')) {
        initiateTakeoff();
        setActivePanel(1);
        return { text: 'Takeoff cleared. Spooling propulsion and climbing to cruise altitude.', actions: ['TAKEOFF CLIMB'] };
      }
      if (q.includes('land')) {
        const padId = q.includes('bravo')
          ? 'PAD-BRAVO'
          : q.includes('valley')
          ? 'PAD-VALLEY'
          : q.includes('city') || q.includes('skyline')
          ? 'PAD-CITY'
          : 'PAD-ALPHA';
        initiateLanding(padId);
        setActivePanel(1);
        return { text: `Autoland locked onto ${padId}. Aligning approach and extending landing gear.`, actions: [`AUTOLAND -> ${padId}`] };
      }
      if (q.includes('up') || q.includes('climb') || q.includes('ascend') || q.includes('higher')) {
        nudgeAltitude(1.1);
        return { text: 'Climbing to higher reconnaissance altitude.', actions: ['ALTITUDE ▲'] };
      }
      if (q.includes('down') || q.includes('descend') || q.includes('lower')) {
        nudgeAltitude(-1.1);
        return { text: 'Descending toward lower airspace envelope.', actions: ['ALTITUDE ▼'] };
      }
      if (q.includes('deploy') || q.includes('rover')) {
        setGroundBotState('DEPLOYING');
        setReconOption('cameraPreset', 'ROVER');
        setActivePanel(1);
        return { text: 'Opening payload bay and winching UGV-01 Ground Rover down to terrain.', actions: ['UGV ROVER -> DEPLOY'] };
      }
      if (q.includes('recall') || q.includes('stow')) {
        setGroundBotState('RECALLING');
        setReconOption('cameraPreset', 'ISO');
        return { text: 'Recalling UGV-01 back to extraction point.', actions: ['UGV ROVER -> RECALL'] };
      }
      if (q.includes('storm')) {
        setReconOption('weatherMode', 'STORM');
        sendCommand({ type: 'setWeather', payload: { mode: 'STORM' } });
        return { text: 'Storm cell active with heavy rain and wind shear.', actions: ['WEATHER -> STORM'] };
      }
      if (q.includes('snow') || q.includes('ice')) {
        setReconOption('weatherMode', 'SNOW_ICING');
        sendCommand({ type: 'triggerScenario', payload: { name: 'STORM_ICING' } });
        return { text: 'Snow and icing scenario active. Recommend engaging Anti-Ice.', actions: ['SCENARIO -> STORM_ICING'] };
      }
      if (q.includes('cascade') || q.includes('emergency')) {
        sendCommand({ type: 'triggerScenario', payload: { name: 'ENGINE_CASCADE' } });
        setReconOption('weatherMode', 'STORM');
        return { text: 'Engine cascade emergency injected. MAINT-01 locking onto fault.', actions: ['SCENARIO -> ENGINE_CASCADE'] };
      }
      if (q.includes('fix') || q.includes('repair') || q.includes('reset') || q.includes('nominal')) {
        Object.keys(t.faults || {}).forEach((k) => sendCommand({ type: 'setFault', payload: { key: k, value: false } }));
        sendCommand({ type: 'triggerScenario', payload: { name: 'NOMINAL' } });
        setReconOption('weatherMode', 'CLEAR');
        return { text: 'All faults cleared and systems restored to NOMINAL.', actions: ['SYSTEMS -> NOMINAL'] };
      }
      if (q.includes('flir') || q.includes('thermal')) {
        setReconOption('viewMode', 'THERMAL');
        setActivePanel(1);
        return { text: 'FLIR Ironbow thermal vision enabled.', actions: ['OPTICS -> THERMAL'] };
      }
      if (q.includes('pilot') || q.includes('manual')) {
        const next = !r.pilotMode;
        setReconOption('pilotMode', next);
        sendCommand({ type: 'setFlightMode', payload: { mode: next ? 'MANUAL_PILOT' : 'LOITER' } });
        return {
          text: next ? 'Manual WASD + Space/C flight controls engaged.' : 'Autopilot restored.',
          actions: [`PILOT -> ${next ? 'ON' : 'OFF'}`],
        };
      }

      const health = Math.round((1 - (t.anomalyScore || 0.03)) * 100);
      return {
        text: `STATUS — Flight: ${r.flightStatus} | Health: ${health}% | Alt: ${Math.round(
          t.densityAltitude || 8500
        )} ft | Oil: ${t.oilPressure.toFixed(2)} BAR | Est. RUL: ${t.rulHours.toFixed(1)} hrs.`,
        actions: [],
      };
    },
    [initiateLanding, initiateTakeoff, nudgeAltitude, sendCommand, setActivePanel, setGroundBotState, setHoverHold, setReconOption]
  );

  // Send Text Prompt (Gemini or Local Fallback)
  const handleSend = useCallback(
    async (rawText) => {
      const text = (rawText ?? '').trim();
      if (!text) return;

      const userMsg = { role: 'user', text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');

      const st = useTelemetryStore.getState();
      const hasKey = Boolean((st.apiKeys.geminiApiKey || '').trim());

      if (hasKey) {
        setLoading(true);
        try {
          const res = await queryGeminiFlightCopilot({
            apiKey: st.apiKeys.geminiApiKey,
            model: st.apiKeys.geminiModel || 'gemini-3.5-flash-lite',
            history: messagesRef.current,
            userMessage: text,
            telemetry: st.telemetry,
            recon: st.recon,
          });
          const executed = executeToolCalls(res.functionCalls);
          const replyText =
            res.text || (executed.length > 0 ? `Executed flight orders: ${executed.join(', ')}.` : 'Copy that.');
          setMessages((prev) => [...prev, { role: 'ai', text: replyText, actions: executed, model: res.modelUsed }]);
          cockpitVoice.speak(replyText, `gem-${Date.now()}`, 400);
        } catch (err) {
          const fallback = executeLocalFallback(text);
          setMessages((prev) => [
            ...prev,
            { role: 'ai', text: `[Gemini Error: ${err.message}] — Fallback: ${fallback.text}`, actions: fallback.actions },
          ]);
        } finally {
          setLoading(false);
        }
        return;
      }

      const localRes = executeLocalFallback(text);
      setMessages((prev) => [...prev, { role: 'ai', text: localRes.text, actions: localRes.actions }]);
      cockpitVoice.speak(localRes.text, `loc-${Date.now()}`, 400);
    },
    [executeLocalFallback, executeToolCalls]
  );

  // Send Direct Recorded Audio Blob straight to Gemini Multimodal API (100% Brave-Compatible!)
  const handleSendAudio = useCallback(
    async (blob) => {
      const st = useTelemetryStore.getState();
      if (!st.apiKeys.geminiApiKey?.trim()) {
        setVoiceHint('Add a Gemini API Key above to use Direct Gemini Audio Mic.');
        setShowKeyPanel(true);
        return;
      }
      if (!blob || blob.size < 1200) {
        setVoiceHint('Audio clip was too short—hold or speak for at least 1 second.');
        return;
      }

      setMessages((prev) => [...prev, { role: 'user', text: '🎙️ [Live Voice Transmission]' }]);
      setLoading(true);
      setVoiceHint('');
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await queryGeminiFlightCopilot({
          apiKey: st.apiKeys.geminiApiKey,
          model: st.apiKeys.geminiModel || 'gemini-3.5-flash-lite',
          history: messagesRef.current,
          audioBase64,
          audioMimeType: blob.type || 'audio/webm',
          telemetry: st.telemetry,
          recon: st.recon,
        });
        const executed = executeToolCalls(res.functionCalls);
        const replyText =
          res.text || (executed.length > 0 ? `Executed voice orders: ${executed.join(', ')}.` : 'Voice command received.');
        setMessages((prev) => [...prev, { role: 'ai', text: replyText, actions: executed, model: res.modelUsed }]);
        cockpitVoice.speak(replyText, `gem-aud-${Date.now()}`, 400);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: `[Gemini Voice Error: ${err.message}] Check your Gemini API key or model selection.` },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [executeToolCalls]
  );

  // Clean up all active audio streams / recognizers
  const stopAllVoice = useCallback(() => {
    if (meterRafRef.current) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setListening(false);
    setMicLevel(0);
    setInterimText('');
  }, []);

  useEffect(() => () => stopAllVoice(), [stopAllVoice]);

  // ENGINE 1: Direct Gemini Audio Mic via MediaRecorder (works in Brave, Firefox, Chrome, Edge!)
  const startGeminiAudioMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceHint('Microphone API unavailable. Ensure you are on http://localhost or HTTPS.');
      return;
    }
    cockpitVoice.stop(); // Prevent speaker feedback while recording
    setVoiceHint('');
    setInterimText('Listening via Gemini Audio... speak command, then click Stop (or pause 1.8s).');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const chosenMime =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
          ? mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || ''
          : '';

      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
          mediaStreamRef.current = null;
        }
        if (meterRafRef.current) {
          cancelAnimationFrame(meterRafRef.current);
          meterRafRef.current = null;
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        setListening(false);
        setMicLevel(0);
        setInterimText('');

        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: recorder.mimeType || chosenMime || 'audio/webm' });
          handleSendAudio(blob);
        }
      };

      // Live volume meter + smart silence auto-stop (triggers only AFTER user speaks!)
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        let heardSpeech = false;
        let silenceStart = null;
        const startTime = performance.now();

        const monitor = () => {
          if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          const pct = Math.min(100, Math.round(rms * 420));
          setMicLevel(pct);

          const now = performance.now();
          if (rms > 0.035) {
            heardSpeech = true;
            silenceStart = null;
          } else if (heardSpeech) {
            if (!silenceStart) silenceStart = now;
            if (now - silenceStart > 1800) {
              mediaRecorderRef.current.stop();
              return;
            }
          }
          // Hard safety cap at 12 seconds
          if (now - startTime > 12000) {
            mediaRecorderRef.current.stop();
            return;
          }
          meterRafRef.current = requestAnimationFrame(monitor);
        };
        meterRafRef.current = requestAnimationFrame(monitor);
      }

      recorder.start(200);
      setListening(true);
    } catch (err) {
      setListening(false);
      setInterimText('');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setVoiceHint('Microphone permission denied. Click the lock/mic icon in your browser address bar to allow mic access.');
      } else {
        setVoiceHint(`Mic error: ${err.message || err.name}`);
      }
    }
  }, [handleSendAudio]);

  // ENGINE 2: Browser Web Speech API (Zero-key mode for Chrome/Edge, with Brave network-block guidance)
  const startBrowserSpeechMic = useCallback(() => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      setVoiceHint('Browser Web Speech API is unavailable here. Add a Gemini API key to use Direct Gemini Audio Mic.');
      setShowKeyPanel(true);
      return;
    }
    cockpitVoice.stop();
    setVoiceHint('');

    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalTranscript = '';

    rec.onstart = () => {
      setListening(true);
      setInterimText('Listening... speak your flight command now.');
    };

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += txt + ' ';
        else interim += txt;
      }
      setInterimText((finalTranscript + interim).trim());
    };

    rec.onerror = (event) => {
      setListening(false);
      setInterimText('');
      const code = event?.error || 'unknown';
      if (code === 'network') {
        setVoiceHint(
          'Brave Browser blocks built-in Web Speech ("network" error). Paste your Gemini API key above—Direct Gemini Audio Mic works 100% natively in Brave!'
        );
        setShowKeyPanel(true);
      } else if (code === 'not-allowed' || code === 'service-not-allowed') {
        setVoiceHint('Microphone blocked. Allow microphone access in your browser address bar and try again.');
      } else if (code === 'no-speech') {
        setVoiceHint('No speech detected. Check your input mic and speak clearly.');
      } else if (code === 'audio-capture') {
        setVoiceHint('No microphone detected on this device.');
      } else if (code !== 'aborted') {
        setVoiceHint(`Voice error (${code}). Try Gemini Audio Mic with your API key.`);
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterimText('');
      const spoken = finalTranscript.trim();
      if (spoken) handleSend(spoken);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, [handleSend]);

  const toggleMic = useCallback(() => {
    if (listening) {
      stopAllVoice();
      return;
    }
    if (effectiveVoiceMode === 'GEMINI_AUDIO' && isGeminiConnected) {
      startGeminiAudioMic();
    } else {
      startBrowserSpeechMic();
    }
  }, [effectiveVoiceMode, isGeminiConnected, listening, startBrowserSpeechMic, startGeminiAudioMic, stopAllVoice]);

  // Global Alt+V hotkey & Header "VOICE" button listener
  useEffect(() => {
    const onVoiceEvent = () => {
      setCopilotOpen(true);
      setTimeout(() => toggleMic(), 120);
    };
    const onKey = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        onVoiceEvent();
      }
    };
    window.addEventListener('aegis-voice-trigger', onVoiceEvent);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('aegis-voice-trigger', onVoiceEvent);
      window.removeEventListener('keydown', onKey);
    };
  }, [setCopilotOpen, toggleMic]);

  const saveGeminiConfig = (e) => {
    e.preventDefault();
    setApiKeys({ geminiApiKey: keyDraft.trim(), geminiModel: modelDraft.trim() || 'gemini-3.5-flash-lite' });
    setShowKeyPanel(false);
    setVoiceHint('');
    setMessages((p) => [
      ...p,
      {
        role: 'ai',
        text: keyDraft.trim()
          ? `Gemini connected (${modelDraft}) & Direct Gemini Audio Mic unlocked! Click the Mic button and speak any flight command—works natively in Brave.`
          : 'Gemini API key cleared. Using local command mode.',
      },
    ]);
  };

  return (
    <AnimatePresence>
      {copilotOpen && (
        <motion.aside
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 310, damping: 28 }}
          className="fixed top-[56px] bottom-4 right-4 w-[405px] max-w-[94vw] z-[90] holo-panel corner-bracket flex flex-col pointer-events-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-cyan-400/20">
            <div className="flex items-center gap-2 text-cyan-300">
              <BrainCircuit size={16} className="animate-pulse" />
              <div>
                <div className="text-xs font-bold tracking-widest flex items-center gap-1.5">
                  <span>AEGIS GEMINI COPILOT</span>
                  <span
                    className={`text-[8px] px-1.5 py-0.5 rounded-full border ${
                      isGeminiConnected
                        ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                        : 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                    }`}
                  >
                    {isGeminiConnected ? 'GEMINI LIVE' : 'LOCAL MODE'}
                  </span>
                </div>
                <div className="text-[9px] text-slate-400 flex items-center gap-1.5">
                  <span>MIC: {effectiveVoiceMode === 'GEMINI_AUDIO' ? 'GEMINI DIRECT AUDIO' : 'BROWSER SPEECH'}</span>
                  <span>• Alt+V</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  setVoiceEngineMode((m) =>
                    m === 'AUTO' ? (isGeminiConnected ? 'BROWSER_SPEECH' : 'GEMINI_AUDIO') : 'AUTO'
                  )
                }
                title="Switch Voice Engine (Auto / Direct Gemini Audio / Browser Speech)"
                className="px-1.5 py-1 rounded-lg border border-white/15 bg-slate-900 text-[9px] text-cyan-300 hover:border-cyan-400 cursor-pointer"
              >
                {effectiveVoiceMode === 'GEMINI_AUDIO' ? 'AI MIC' : 'WEB MIC'}
              </button>
              <button
                onClick={() => setShowKeyPanel((v) => !v)}
                title="Insert / Configure Gemini API Key"
                className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                  showKeyPanel || !isGeminiConnected
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                    : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                }`}
              >
                <KeyRound size={14} />
              </button>
              <button onClick={() => setCopilotOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Inline Gemini API Key Drawer */}
          {showKeyPanel && (
            <form onSubmit={saveGeminiConfig} className="p-3 my-2 rounded-xl bg-slate-900/95 border border-cyan-400/40 space-y-2 text-[11px]">
              <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between">
                <span>Gemini API Key (Enables Brave Voice!)</span>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-300 underline hover:text-amber-200"
                >
                  Get Key ↗
                </a>
              </div>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Paste Gemini API Key (AIza...)"
                className="w-full bg-slate-950 border border-white/15 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
              />
              <select
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                className="w-full bg-slate-950 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-cyan-200 outline-none"
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-950">
                    {m.label} ({m.id})
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-1.5 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/60 text-emerald-200 font-bold cursor-pointer"
                >
                  SAVE & CONNECT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKeyDraft('');
                    setApiKeys({ geminiApiKey: '' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-300 hover:text-rose-300 cursor-pointer"
                >
                  CLEAR
                </button>
              </div>
            </form>
          )}

          {/* Quick Flight Chips */}
          <div className="py-2 border-b border-white/10">
            <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Sparkles size={10} className="text-cyan-400" /> Quick Flight & Mission Orders
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <button
                onClick={() =>
                  handleSend(
                    recon.flightStatus === 'LANDED'
                      ? 'Take off from current pad and climb to cruise'
                      : `Land safely at ${recon.activePadId}`
                  )
                }
                className="py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 flex items-center gap-1.5 cursor-pointer"
              >
                {recon.flightStatus === 'LANDED' ? <PlaneTakeoff size={11} /> : <PlaneLanding size={11} />}
                {recon.flightStatus === 'LANDED' ? 'Takeoff Cruise' : `Land @ ${recon.activePadId.replace('PAD-', '')}`}
              </button>
              <button
                onClick={() => handleSend(recon.hoverHold ? 'Resume forward flight' : 'Hover right here on station')}
                className="py-1.5 px-2 rounded-lg bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/35 text-cyan-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Radio size={11} /> {recon.hoverHold ? 'Resume Flight' : 'Hover Lock'}
              </button>
              <button
                onClick={() => handleSend(recon.groundBotState === 'STOWED' ? 'Deploy ground rover' : 'Recall ground rover')}
                className="py-1.5 px-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-200 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowDown size={11} /> {recon.groundBotState === 'STOWED' ? 'Deploy Rover' : 'Recall Rover'}
              </button>
              <button
                onClick={() => handleSend('Climb 1500 feet and give me a health diagnosis')}
                className="py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-white/15 text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowUpCircle size={11} /> Climb & Diagnose
              </button>
              <button
                onClick={() => handleSend('Trigger engine cascade emergency in storm weather')}
                className="py-1.5 px-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-rose-200 flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert size={11} /> Engine Cascade
              </button>
              <button
                onClick={() => handleSend('Fix all faults and restore nominal flight')}
                className="py-1.5 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={11} /> Restore Nominal
              </button>
            </div>
          </div>

          {/* Conversation History */}
          <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-xl leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-8 bg-cyan-500/20 border border-cyan-400/40 text-cyan-100'
                    : 'mr-3 bg-slate-900/85 border border-white/10 text-slate-200'
                }`}
              >
                <div className="text-[9px] uppercase tracking-widest opacity-60 mb-0.5">
                  {m.role === 'user' ? 'PILOT' : m.model ? `GEMINI (${m.model})` : 'AEGIS COPILOT'}
                </div>
                <div>{m.text}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.actions.map((act, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[9px] font-bold flex items-center gap-1"
                      >
                        <CheckCircle2 size={9} /> {act}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="mr-3 p-2.5 rounded-xl bg-slate-900/85 border border-cyan-400/30 text-cyan-300 text-xs flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span>Gemini processing voice & flight controls...</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Live Recording Meter / Interim Transcript / Error Diagnostics */}
          {(listening || voiceHint) && (
            <div
              className={`mb-2 p-2 rounded-lg border text-[10px] ${
                listening
                  ? 'bg-rose-500/15 border-rose-400/60 text-rose-100'
                  : 'bg-amber-500/15 border-amber-400/50 text-amber-200'
              }`}
            >
              {listening ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                      {effectiveVoiceMode === 'GEMINI_AUDIO' ? 'RECORDING VOICE (CLICK STOP TO SEND)' : 'LISTENING...'}
                    </span>
                    {effectiveVoiceMode === 'GEMINI_AUDIO' && (
                      <span className="text-[9px] text-rose-200">LVL {micLevel}%</span>
                    )}
                  </div>
                  {effectiveVoiceMode === 'GEMINI_AUDIO' && (
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-rose-400 transition-all duration-75"
                        style={{ width: `${Math.max(6, micLevel)}%` }}
                      />
                    </div>
                  )}
                  {interimText && <div className="text-slate-200 italic">{interimText}</div>}
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <span>{voiceHint}</span>
                  <button onClick={() => setVoiceHint('')} className="text-amber-300 hover:text-white cursor-pointer">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Voice + Text Command Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="pt-2 border-t border-cyan-400/20 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleMic}
              title={listening ? 'Stop & Send Voice Command' : 'Speak Voice Command (Alt+V)'}
              className={`p-2 rounded-lg border cursor-pointer transition-all ${
                listening
                  ? 'bg-rose-500/35 border-rose-400 text-white animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                  : 'bg-slate-900 border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/20'
              }`}
            >
              {listening ? (effectiveVoiceMode === 'GEMINI_AUDIO' ? <Square size={14} /> : <MicOff size={15} />) : <Mic size={15} />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'Speak now... click Stop to send' : 'Speak or type: "hover, climb 1000ft, land at Bravo"...'}
              className="flex-1 bg-slate-900/90 border border-white/15 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs text-white outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="p-2 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/35 border border-cyan-400/50 text-cyan-200 cursor-pointer disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
