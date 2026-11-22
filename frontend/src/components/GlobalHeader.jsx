import React, { useState, useRef, useEffect } from 'react';
import {
  Bell, Activity, Wifi, WifiOff, Clock, MapPin, Cpu, ShieldAlert,
  AlertTriangle, Info, Trash2, ArrowRight, X, Sparkles, Volume2, VolumeX, History, Mic
} from 'lucide-react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { twMerge } from 'tailwind-merge';

export function GlobalHeader() {
  const {
    connected, latency, alarmLog, telemetry, clearAlarms, setActivePanel,
    copilotOpen, setCopilotOpen, voiceEnabled, toggleVoice, replayIndex, setReplayIndex, sessionFrames
  } = useTelemetryStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [missionTime, setMissionTime] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      setMissionTime(`Z ${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const unreadAlarms = alarmLog.filter((a) => a.severity === 'CRITICAL' || a.severity === 'WARNING').length;

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const healthPct = Math.max(0, Math.min(100, Math.round((1 - (telemetry?.anomalyScore || 0.04)) * 100)));
  const healthBadgeClass =
    healthPct < 55
      ? 'border-rose-500/50 text-rose-300 bg-rose-500/10'
      : healthPct < 85
      ? 'border-amber-400/50 text-amber-300 bg-amber-400/10'
      : 'border-emerald-400/40 text-emerald-300 bg-emerald-400/10';

  const lat = telemetry?.latitude ?? 37.7749;
  const lon = telemetry?.longitude ?? -122.4194;
  const isReplaying = replayIndex !== null;

  return (
    <header className="h-[52px] bg-[#060a15]/92 backdrop-blur-2xl border-b border-cyan-400/20 flex items-center justify-between px-4 text-xs font-mono select-none shrink-0 z-40 relative">
      <div className="flex items-center space-x-3 shrink-0">
        <div className="flex items-center space-x-2 text-cyan-300">
          <Activity size={16} className={connected ? 'animate-pulse text-cyan-300' : 'text-amber-400'} />
          <span className="font-bold tracking-widest text-xs sm:text-sm">AEGIS // UAV-TWIN</span>
        </div>

        <div className="hidden lg:block h-4 w-px bg-cyan-400/20" />

        <div className="hidden lg:flex items-center space-x-1.5 text-slate-400 text-[11px]">
          <MapPin size={13} className="text-cyan-400/70" />
          <span>{lat.toFixed(4)}° N, {Math.abs(lon).toFixed(4)}° W</span>
        </div>

        {isReplaying && (
          <button
            onClick={() => setReplayIndex(null)}
            className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/60 text-rose-200 text-[10px] font-bold animate-pulse cursor-pointer"
          >
            REPLAY MODE • CLICK FOR LIVE
          </button>
        )}
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
        {/* 1-Click Live Voice Command Trigger (Alt+V) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('aegis-voice-trigger'))}
          title="Speak Live Voice Flight Command (Alt + V)"
          className="flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-full border border-emerald-400/45 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 transition-all cursor-pointer"
        >
          <Mic size={12} />
          <span className="font-bold hidden sm:inline">VOICE</span>
        </button>

        {/* AI Copilot Drawer Trigger */}
        <button
          onClick={() => setCopilotOpen(!copilotOpen)}
          title="Open AEGIS AI Flight Copilot (Ctrl + K)"
          className={`flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
            copilotOpen
              ? 'border-cyan-300 bg-cyan-400/25 text-white shadow-[0_0_14px_rgba(34,211,238,0.4)]'
              : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20'
          }`}
        >
          <Sparkles size={12} />
          <span className="font-bold">AI COPILOT</span>
          <span className="hidden md:inline text-[9px] opacity-65 border border-cyan-300/30 px-1 rounded">⌘K</span>
        </button>

        {/* Quick Blackbox Scrub Button */}
        {sessionFrames.length >= 10 && (
          <button
            onClick={() => setReplayIndex(isReplaying ? null : Math.max(0, sessionFrames.length - 30))}
            title="Blackbox Time-Travel Replay"
            className={`hidden md:flex items-center space-x-1 text-[10px] px-2 py-1 rounded-full border cursor-pointer transition-colors ${
              isReplaying
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                : 'border-white/10 bg-slate-900/70 text-slate-300 hover:text-white'
            }`}
          >
            <History size={12} />
            <span>REPLAY</span>
          </button>
        )}

        {/* Cockpit Voice Callouts Toggle */}
        <button
          onClick={toggleVoice}
          title={voiceEnabled ? 'Mute Cockpit Voice Callouts' : 'Enable Cockpit Voice Callouts'}
          className={`p-1.5 rounded-full border cursor-pointer transition-colors ${
            voiceEnabled
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
              : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
          }`}
        >
          {voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </button>

        {/* AI Health Pill */}
        {telemetry && (
          <button
            onClick={() => setActivePanel(3)}
            title="Open AI Prognostics & Forecast"
            className={`hidden sm:flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-all hover:scale-105 cursor-pointer ${healthBadgeClass}`}
          >
            <Cpu size={13} />
            <span className="opacity-75">HEALTH:</span>
            <span className="font-bold">{healthPct}%</span>
          </button>
        )}

        <div
          className={twMerge(
            'hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] border shrink-0',
            connected
              ? 'border-cyan-400/40 text-cyan-300 bg-cyan-400/10'
              : 'border-amber-400/40 text-amber-300 bg-amber-400/10'
          )}
        >
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span>{connected ? `LIVE ${latency}ms` : `SIM ${latency}ms`}</span>
        </div>

        <div className="hidden xl:flex items-center space-x-1.5 text-slate-300 text-[11px]">
          <Clock size={12} className="text-cyan-400/80" />
          <span>{missionTime}</span>
        </div>

        {/* Alarms Bell */}
        <div className="relative flex items-center" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="p-1.5 rounded-md hover:bg-slate-800/80 transition-colors focus:outline-none relative cursor-pointer"
            title="Telemetry Alarms & Notifications"
          >
            <Bell
              size={17}
              className={
                unreadAlarms > 0
                  ? 'text-rose-400 animate-pulse drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                  : 'text-cyan-300 hover:text-white'
              }
            />
            {unreadAlarms > 0 && (
              <div className="absolute -top-1 -right-1 bg-rose-500 text-slate-950 text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {unreadAlarms > 9 ? '9+' : unreadAlarms}
              </div>
            )}
          </button>

          {showDropdown && (
            <div className="absolute top-10 right-0 w-80 sm:w-96 bg-slate-950/95 backdrop-blur-xl border border-cyan-400/35 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] p-3 z-50 font-mono text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-cyan-400/20 mb-2">
                <span className="text-cyan-300 font-bold flex items-center space-x-1 text-[11px]">
                  <Bell size={13} />
                  <span>NOTIFICATIONS ({alarmLog.length})</span>
                </span>
                <div className="flex items-center space-x-2">
                  <button onClick={clearAlarms} className="text-slate-400 hover:text-rose-400 cursor-pointer" title="Clear">
                    <Trash2 size={13} />
                  </button>
                  <button onClick={() => setShowDropdown(false)} className="text-slate-400 hover:text-cyan-300 cursor-pointer">
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {alarmLog.slice(0, 8).map((alarm) => (
                  <div
                    key={alarm.id}
                    className={`p-2 rounded-lg border text-[11px] flex flex-col gap-1 ${
                      alarm.severity === 'CRITICAL'
                        ? 'bg-rose-500/15 border-rose-500/60 text-rose-200'
                        : alarm.severity === 'WARNING'
                        ? 'bg-amber-400/10 border-amber-400/50 text-amber-200'
                        : 'bg-slate-900/70 border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold uppercase flex items-center space-x-1">
                        {alarm.severity === 'CRITICAL' && <ShieldAlert size={11} className="text-rose-400" />}
                        {alarm.severity === 'WARNING' && <AlertTriangle size={11} className="text-amber-400" />}
                        {alarm.severity === 'INFO' && <Info size={11} className="text-cyan-400" />}
                        <span>{alarm.component}</span>
                      </span>
                      <span className="opacity-70">{new Date(alarm.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="opacity-95 leading-tight">{alarm.message}</p>
                  </div>
                ))}
                {alarmLog.length === 0 && (
                  <div className="text-center py-6 text-slate-500 text-xs italic">NO UNREAD NOTIFICATIONS</div>
                )}
              </div>

              <div className="pt-2 border-t border-cyan-400/20 mt-2">
                <button
                  onClick={() => {
                    setActivePanel(5);
                    setShowDropdown(false);
                  }}
                  className="w-full py-1.5 bg-cyan-400/15 hover:bg-cyan-400/30 border border-cyan-400/40 text-cyan-200 text-[11px] font-bold rounded-lg flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <span>OPEN FULL MISSION LOGS</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
