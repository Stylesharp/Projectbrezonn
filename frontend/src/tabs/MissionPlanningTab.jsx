import React, { useState } from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid
} from 'recharts';
import { Navigation, Plus, Sparkles, ShieldAlert, CloudLightning, RotateCcw } from 'lucide-react';

const VN_ENVELOPE = [
  { kts: 0, maxG: 0, minG: 0 },
  { kts: 45, maxG: 1.0, minG: -0.2 },
  { kts: 65, maxG: 2.1, minG: -0.8 },
  { kts: 88, maxG: 3.8, minG: -1.5 },
  { kts: 120, maxG: 3.8, minG: -1.5 },
  { kts: 145, maxG: 3.8, minG: -1.5 },
  { kts: 155, maxG: 0, minG: 0 },
];

export function MissionPlanningTab({ sendCommand = () => {} }) {
  const { telemetry, waypoints, activeWaypointId, addWaypoint, setActiveWaypointId, setReconOption } = useTelemetryStore();
  const [newName, setNewName] = useState('');
  const [newAlt, setNewAlt] = useState(9500);

  if (!telemetry) return <div className="text-cyan-300 p-4 font-mono animate-pulse">AWAITING MISSION COMPUTER...</div>;

  const totalFuel = (telemetry.fuelLevelL + telemetry.fuelLevelR).toFixed(1);
  const currentSpeedKts = Math.round(telemetry.groundSpeed || (telemetry.rpm / 5500) * 110);
  const currentG = Number((telemetry.gLoad || 1).toFixed(2));
  const enduranceHrs = ((telemetry.fuelLevelL + telemetry.fuelLevelR) / Math.max(0.2, (telemetry.rpm / 5500) * 14)).toFixed(1);

  const handleSelectWaypoint = (wpt) => {
    setActiveWaypointId(wpt.id);
    sendCommand({ type: 'setWaypoint', payload: { id: wpt.id, lat: wpt.lat, lon: wpt.lon, alt: wpt.alt } });
  };

  const handleAddWaypoint = (e) => {
    e.preventDefault();
    const label = newName.trim() || `ECHO-${waypoints.length + 1} (RECON)`;
    const wpt = {
      id: `WPT-${waypoints.length + 1}`,
      name: label.toUpperCase(),
      lat: Number((37.7749 + (Math.random() - 0.5) * 0.03).toFixed(4)),
      lon: Number((-122.4194 + (Math.random() - 0.5) * 0.03).toFixed(4)),
      alt: Number(newAlt) || 8500,
      dist: `${(waypoints.length * 1.3 + 0.8).toFixed(1)} NM`,
      status: 'QUEUED',
    };
    addWaypoint(wpt);
    setNewName('');
  };

  const runScenario = (name, wx) => {
    sendCommand({ type: 'triggerScenario', payload: { name } });
    if (wx) {
      setReconOption('weatherMode', wx);
      sendCommand({ type: 'setWeather', payload: { mode: wx } });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 font-mono select-none">
      {/* Left Column: V-n Envelope, Endurance & Mission Director */}
      <div className="flex-1 flex flex-col gap-4">
        <HoloPanel title="V-N STRUCTURAL FLIGHT ENVELOPE & LIVE OPERATING POINT" className="min-h-[270px]">
          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={VN_ENVELOPE} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="kts" type="number" domain={[0, 160]} unit="kt" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis domain={[-2, 4.5]} unit="G" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#070b14', borderColor: '#22d3ee', borderRadius: '8px', fontSize: 11 }} />
                <ReferenceLine y={1} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="maxG" stroke="#22d3ee" strokeWidth={2} name="+G Limit" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="minG" stroke="#f43f5e" strokeWidth={2} name="-G Limit" dot={false} isAnimationActive={false} />
                <ReferenceDot x={Math.min(152, currentSpeedKts)} y={currentG} r={6} fill="#10b981" stroke="#fff" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
              <div className="text-[9px] text-slate-400">TOTAL FUEL</div>
              <div className="text-amber-300 font-bold">{totalFuel} L</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
              <div className="text-[9px] text-slate-400">EST. ENDURANCE</div>
              <div className="text-emerald-300 font-bold">{enduranceHrs} HRS</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
              <div className="text-[9px] text-slate-400">CURRENT POINT</div>
              <div className="text-cyan-300 font-bold">{currentSpeedKts} KT • {currentG}G</div>
            </div>
          </div>
        </HoloPanel>

        {/* Mission Director Automated Scenarios */}
        <HoloPanel title="MISSION DIRECTOR // ONE-CLICK TRAINING SCENARIOS" titleIcon={<Sparkles size={15} />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1 text-[11px]">
            <button
              onClick={() => runScenario('STORM_ICING', 'SNOW_ICING')}
              className="p-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/45 text-sky-200 flex flex-col items-center gap-1.5 cursor-pointer"
            >
              <CloudLightning size={16} />
              <span className="font-bold">ICING STORM</span>
            </button>
            <button
              onClick={() => runScenario('ENGINE_CASCADE', 'STORM')}
              className="p-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/45 text-rose-200 flex flex-col items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert size={16} />
              <span className="font-bold">ENGINE CASCADE</span>
            </button>
            <button
              onClick={() => runScenario('EMERGENCY_RTB', 'DUSK')}
              className="p-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/45 text-amber-200 flex flex-col items-center gap-1.5 cursor-pointer"
            >
              <Navigation size={16} />
              <span className="font-bold">EMERGENCY RTB</span>
            </button>
            <button
              onClick={() => runScenario('NOMINAL', 'CLEAR')}
              className="p-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/45 text-emerald-200 flex flex-col items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={16} />
              <span className="font-bold">RESET NOMINAL</span>
            </button>
          </div>
        </HoloPanel>
      </div>

      {/* Right Column: Interactive Autopilot Waypoint Manager */}
      <HoloPanel title="AUTOPILOT WAYPOINT ROUTE (CLICK TO FLY)" titleIcon={<Navigation size={15} />} className="w-full lg:w-[440px]">
        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 mb-3">
          {waypoints.map((w) => {
            const active = w.id === activeWaypointId;
            return (
              <button
                key={w.id}
                onClick={() => handleSelectWaypoint(w)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  active
                    ? 'bg-cyan-400/15 border-cyan-400/60 shadow-[0_0_16px_rgba(34,211,238,0.18)]'
                    : 'bg-slate-900/60 border-white/10 hover:border-cyan-400/35'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-100">{w.id} • {w.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {w.lat}°N, {Math.abs(w.lon)}°W • ALT {w.alt.toLocaleString()} FT
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                    active
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/15 bg-slate-800 text-slate-400'
                  }`}
                >
                  {active ? 'NAV LOCK' : w.status}
                </span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleAddWaypoint} className="pt-2.5 border-t border-cyan-400/20 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Waypoint name..."
            className="flex-1 bg-slate-900/90 border border-white/15 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
          />
          <input
            type="number"
            value={newAlt}
            onChange={(e) => setNewAlt(e.target.value)}
            className="w-20 bg-slate-900/90 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-cyan-300 outline-none"
            title="Target Altitude (FT)"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/35 border border-cyan-400/50 text-cyan-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus size={13} /> ADD
          </button>
        </form>
      </HoloPanel>
    </div>
  );
}
