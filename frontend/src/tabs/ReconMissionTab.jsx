import React from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import {
  Radar, Bot, Mountain, Eye, ArrowDown, ArrowUp,
  Radio, CheckCircle, Activity, Sparkles, Compass
} from 'lucide-react';

export function ReconMissionTab() {
  const { recon, setReconOption, setGroundBotState, logReconSample, setActivePanel, telemetry } = useTelemetryStore();

  const isStowed = recon.groundBotState === 'STOWED';
  const isRoving = recon.groundBotState === 'ROVING';

  const handleDeployOrRecall = () => {
    if (isStowed) {
      setGroundBotState('DEPLOYING');
      setReconOption('cameraPreset', 'ROVER');
      setActivePanel(1);
    } else if (isRoving) {
      setGroundBotState('RECALLING');
      setActivePanel(1);
    }
  };

  const quickToggle = (key, label, icon) => {
    const active = recon[key];
    return (
      <button
        onClick={() => setReconOption(key, !active)}
        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
          active
            ? 'bg-cyan-400/15 border-cyan-400/50 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.14)]'
            : 'bg-slate-900/60 border-white/10 text-slate-400 hover:border-white/25'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <div>
            <div className="text-xs font-bold tracking-wider">{label}</div>
            <div className="text-[10px] opacity-75">{active ? 'ONLINE // ACTIVE' : 'STANDBY'}</div>
          </div>
        </div>
        <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'}`} />
      </button>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-4 font-mono select-none">
      <HoloPanel title="MULTI-DOMAIN RECONNAISSANCE COMMAND" titleIcon={<Radar size={15} />} className="col-span-12">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 py-1">
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">MISSION PHASE</div>
            <div className="text-sm font-bold text-cyan-300 mt-1">{recon.missionPhase}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">UGV GROUND ROVER</div>
            <div className={`text-sm font-bold mt-1 ${isRoving ? 'text-emerald-300' : 'text-amber-300'}`}>
              {recon.groundBotState}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">HELPER SWARM</div>
            <div className="text-sm font-bold text-sky-300 mt-1">
              {recon.helperSwarmActive ? '3 BOTS LINKED' : 'MAINT ONLY'}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">BIO / TERRAIN CONTACTS</div>
            <div className="text-sm font-bold text-teal-300 mt-1">{recon.contacts.length} LOCKED</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">SURFACE SAMPLES</div>
            <div className="text-sm font-bold text-amber-300 mt-1">{recon.groundBotSamples} LOGGED</div>
          </div>
        </div>
      </HoloPanel>

      <HoloPanel title="UGV GROUND ROVER & ROBOTICS MESH" titleIcon={<Bot size={15} />} className="col-span-12 lg:col-span-6">
        <div className="flex flex-col gap-3 py-1">
          <div className="p-4 rounded-xl bg-slate-900/70 border border-cyan-400/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-cyan-200 tracking-wider">UGV-01 SURFACE RECON ROVER</div>
              <p className="text-[11px] text-slate-400 mt-1">
                6x6 wheeled rover with retractable winch tether, retro-thruster descent, and LiDAR terrain sweep.
              </p>
            </div>
            <button
              onClick={handleDeployOrRecall}
              disabled={recon.groundBotState === 'DEPLOYING' || recon.groundBotState === 'RECALLING'}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer ${
                isStowed
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/60 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                  : isRoving
                  ? 'bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/60 text-amber-200'
                  : 'bg-slate-800 border border-white/10 text-slate-400 cursor-wait'
              }`}
            >
              {isStowed ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
              <span>
                {isStowed ? 'DEPLOY 3D ROVER' : isRoving ? 'RECALL TO BAY' : recon.groundBotState}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {quickToggle('helperSwarmActive', 'HELPER SWARM', <Radio size={15} />)}
            {quickToggle('maintenanceBotActive', 'MAINT BOT-01', <Bot size={15} />)}
            {quickToggle('wildlifeEnabled', '3D WILDLIFE BIO', <Eye size={15} />)}
            {quickToggle('terrainEnabled', 'TOPO TERRAIN', <Mountain size={15} />)}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => logReconSample(`Terrain Mineral Sample @ ${(telemetry?.latitude ?? 37.77).toFixed(4)}°N`)}
              className="flex-1 py-2 px-3 rounded-lg bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles size={13} /> CAPTURE LIDAR BIO-SCAN
            </button>
            <button
              onClick={() => setActivePanel(1)}
              className="py-2 px-4 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Compass size={13} /> VIEW IN 3D STAGE
            </button>
          </div>
        </div>
      </HoloPanel>

      <HoloPanel title="BIO-THERMAL WILDLIFE & TARGET CLASSIFIER" titleIcon={<Activity size={15} />} className="col-span-12 lg:col-span-6">
        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 py-1">
          {recon.contacts.map((c) => {
            const badge =
              c.type === 'WILDLIFE'
                ? 'border-teal-400/40 bg-teal-500/15 text-teal-200'
                : c.type === 'AVIAN'
                ? 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                : 'border-amber-400/40 bg-amber-500/15 text-amber-200';
            return (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-slate-900/65 border border-white/8 hover:border-cyan-400/30 transition-colors flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge}`}>{c.type}</span>
                    <span className="text-xs font-bold text-slate-100">{c.id} • {c.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    BRG {String(c.bearing).padStart(3, '0')}° • RANGE {c.distM}m • CORE {c.thermalC}°C
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-emerald-300 flex items-center justify-end gap-1">
                    <CheckCircle size={11} /> {c.confidence}%
                  </div>
                  <div className="text-[9px] text-cyan-400/80 uppercase">{c.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      </HoloPanel>
    </div>
  );
}
