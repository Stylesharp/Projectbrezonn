import React, { useState, useEffect, useRef } from 'react';
import { HoloPanel } from '../components/HoloPanel';
import { useTelemetryStore } from '../store/useTelemetryStore';
import {
  Download, Terminal as TerminalIcon, ShieldAlert, AlertTriangle, Info,
  Trash2, Search, Play, History, FileSpreadsheet
} from 'lucide-react';

export function LogsTab({ sendCommand = () => {} }) {
  const {
    alarmLog, sessionFrames, clearAlarms, telemetry,
    setGroundBotState, setReconOption, setReplayIndex, setActivePanel
  } = useTelemetryStore();

  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [termInput, setTermInput] = useState('');
  const [termLogs, setTermLogs] = useState([
    'AEGIS MIL-STD-1553B AVIONICS CLI v4.0',
    'TYPE "help" FOR DIAGNOSTICS & LIVE AIRCRAFT COMMANDS.',
    '-------------------------------------------------------',
    '[OK] TELEMETRY & BLACKBOX RECORDER: ARMED (10Hz)',
  ]);
  const termEndRef = useRef(null);

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [termLogs]);

  const exportBlackboxJSONL = () => {
    const frames = sessionFrames.length > 0 ? sessionFrames : [telemetry];
    const blob = new Blob([frames.map((f) => JSON.stringify(f)).join('\n')], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_blackbox_${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
    setTermLogs((p) => [...p, `> EXPORTED ${frames.length} FRAMES TO JSONL.`]);
  };

  const exportBlackboxCSV = () => {
    const frames = sessionFrames.length > 0 ? sessionFrames : [telemetry];
    const header = 'timestamp,rpm,cht_max,oil_bar,voltage_v,alt_ft,gs_kts,g_load,anomaly,rul_hrs';
    const rows = frames.map((f) =>
      [
        (f.timestamp || 0).toFixed(2),
        (f.rpm || 0).toFixed(1),
        Math.max(...(f.chts || [0])).toFixed(1),
        (f.oilPressure || 0).toFixed(2),
        (f.batteryVoltage || 0).toFixed(2),
        Math.round(f.densityAltitude || 0),
        (f.groundSpeed || 0).toFixed(1),
        (f.gLoad || 1).toFixed(2),
        (f.anomalyScore || 0).toFixed(3),
        (f.rulHours || 0).toFixed(2),
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_telemetry_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTermLogs((p) => [...p, `> EXPORTED ${frames.length} FRAMES TO CSV.`]);
  };

  const handleCommand = (e) => {
    e.preventDefault();
    const raw = termInput.trim();
    if (!raw) return;
    const cmd = raw.toLowerCase();
    setTermInput('');

    const out = [`$ ${raw}`];
    if (cmd === 'help') {
      out.push(
        'COMMANDS: status | diag | throttle <0-100> | deploy | recall | storm | snow | clear | pilot | reset | clearterm'
      );
    } else if (cmd === 'clearterm') {
      setTermLogs(['[OK] CONSOLE CLEARED.']);
      return;
    } else if (cmd === 'status') {
      out.push(
        `RPM: ${Math.round(telemetry.rpm)} | OIL: ${telemetry.oilPressure.toFixed(2)} BAR | HEALTH: ${Math.round(
          (1 - (telemetry.anomalyScore || 0)) * 100
        )}% | RUL: ${telemetry.rulHours.toFixed(1)}h`
      );
    } else if (cmd === 'diag') {
      out.push(
        `[1/4] BUS 28V: ${telemetry.batteryVoltage.toFixed(1)}V [${telemetry.batteryVoltage > 22 ? 'PASS' : 'FAIL'}]`,
        `[2/4] OIL PRESS: ${telemetry.oilPressure.toFixed(2)} BAR [${telemetry.oilPressure > 1.5 ? 'PASS' : 'FAIL'}]`,
        `[3/4] MAX CHT: ${Math.max(...telemetry.chts).toFixed(1)}°C [${Math.max(...telemetry.chts) < 230 ? 'PASS' : 'WARN'}]`,
        `[4/4] AI MODEL: ${telemetry.aiDiagnostics?.primaryCause || 'NOMINAL'} [SYNCED]`
      );
    } else if (cmd.startsWith('throttle ')) {
      const v = Math.max(0, Math.min(100, Number(cmd.split(' ')[1]) || 55));
      sendCommand({ type: 'setActuator', payload: { key: 'throttle', value: v } });
      out.push(`[OK] THROTTLE SET TO ${v}%.`);
    } else if (cmd === 'deploy') {
      setGroundBotState('DEPLOYING');
      setReconOption('cameraPreset', 'ROVER');
      out.push('[OK] UGV-01 GROUND ROVER DEPLOYMENT INITIATED.');
    } else if (cmd === 'recall') {
      setGroundBotState('RECALLING');
      out.push('[OK] UGV-01 RECALLING TO EXTRACTION POINT.');
    } else if (cmd === 'storm' || cmd === 'snow' || cmd === 'clear') {
      const m = cmd === 'snow' ? 'SNOW_ICING' : cmd.toUpperCase();
      setReconOption('weatherMode', m);
      sendCommand({ type: 'setWeather', payload: { mode: m } });
      out.push(`[OK] WEATHER PROFILE -> ${m}`);
    } else if (cmd === 'pilot') {
      const next = !useTelemetryStore.getState().recon.pilotMode;
      setReconOption('pilotMode', next);
      sendCommand({ type: 'setFlightMode', payload: { mode: next ? 'MANUAL_PILOT' : 'LOITER' } });
      out.push(`[OK] WASD MANUAL PILOT -> ${next ? 'ENGAGED' : 'OFF'}`);
    } else if (cmd === 'reset') {
      sendCommand({ type: 'triggerScenario', payload: { name: 'NOMINAL' } });
      setReconOption('weatherMode', 'CLEAR');
      out.push('[OK] SIMULATION RESET TO NOMINAL.');
    } else {
      out.push(`[ERR] UNKNOWN COMMAND "${raw}". TYPE "help".`);
    }
    setTermLogs((p) => [...p, ...out].slice(-120));
  };

  const filteredAlarms = alarmLog.filter((a) => {
    const matchSev = filter === 'ALL' || a.severity === filter;
    const matchText =
      !searchTerm ||
      a.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.component.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSev && matchText;
  });

  return (
    <div className="grid grid-cols-12 gap-4 font-mono">
      {/* Left: Filterable Alarm & Event Ledger */}
      <HoloPanel title="EVENT LEDGER & BLACKBOX EXPORT" className="col-span-12 lg:col-span-7 min-h-[480px]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            {['ALL', 'CRITICAL', 'WARNING', 'INFO'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-full text-[10px] border cursor-pointer ${
                  filter === f ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200' : 'border-white/10 text-slate-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportBlackboxCSV}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet size={12} /> CSV
            </button>
            <button
              onClick={exportBlackboxJSONL}
              className="px-2.5 py-1 rounded-lg bg-cyan-400/15 hover:bg-cyan-400/30 border border-cyan-400/40 text-cyan-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Download size={12} /> JSONL
            </button>
            {sessionFrames.length >= 10 && (
              <button
                onClick={() => {
                  setReplayIndex(Math.max(0, sessionFrames.length - 40));
                  setActivePanel(1);
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <History size={12} /> REPLAY 3D
              </button>
            )}
            <button onClick={clearAlarms} className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer" title="Clear Log">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter alerts by subsystem or message..."
            className="w-full bg-slate-900/80 border border-white/10 focus:border-cyan-400/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white outline-none"
          />
        </div>

        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filteredAlarms.map((alarm) => (
            <div
              key={alarm.id}
              className={`p-2.5 rounded-lg border text-xs ${
                alarm.severity === 'CRITICAL'
                  ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                  : alarm.severity === 'WARNING'
                  ? 'bg-amber-400/10 border-amber-400/40 text-amber-200'
                  : 'bg-slate-900/65 border-white/8 text-slate-300'
              }`}
            >
              <div className="flex justify-between text-[10px] opacity-80 mb-0.5">
                <span className="font-bold flex items-center gap-1">
                  {alarm.severity === 'CRITICAL' && <ShieldAlert size={11} />}
                  {alarm.severity === 'WARNING' && <AlertTriangle size={11} />}
                  {alarm.severity === 'INFO' && <Info size={11} />}
                  {alarm.component}
                </span>
                <span>{new Date(alarm.timestamp).toLocaleTimeString()}</span>
              </div>
              <p>{alarm.message}</p>
            </div>
          ))}
        </div>
      </HoloPanel>

      {/* Right: Interactive Live Avionics CLI Terminal */}
      <HoloPanel title="LIVE AVIONICS COMMAND TERMINAL" titleIcon={<TerminalIcon size={15} />} className="col-span-12 lg:col-span-5 min-h-[480px]">
        <div className="flex-1 bg-[#03060d] rounded-lg border border-cyan-400/20 p-3 overflow-y-auto max-h-[385px] text-[11px] text-cyan-200 space-y-1 mb-2.5">
          {termLogs.map((line, idx) => (
            <div key={idx} className={line.startsWith('$') ? 'text-amber-300 font-bold' : line.includes('FAIL') || line.includes('[ERR]') ? 'text-rose-400' : 'text-cyan-200/90'}>
              {line}
            </div>
          ))}
          <div ref={termEndRef} />
        </div>

        <form onSubmit={handleCommand} className="flex gap-2">
          <input
            type="text"
            value={termInput}
            onChange={(e) => setTermInput(e.target.value)}
            placeholder='Enter command (help, diag, storm, deploy...)'
            className="flex-1 bg-slate-900/90 border border-white/15 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs text-white outline-none"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/35 border border-cyan-400/50 text-cyan-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Play size={12} /> RUN
          </button>
        </form>
      </HoloPanel>
    </div>
  );
}
