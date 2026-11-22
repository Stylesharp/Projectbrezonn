import React, { useMemo } from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import { GaugeArc } from '../components/GaugeArc';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function TelemetryTab() {
  const { telemetry, sessionFrames } = useTelemetryStore();

  const history = useMemo(
    () =>
      sessionFrames.slice(-80).map((f, idx) => ({
        idx,
        rpm: Math.round(f.rpm || 0),
        oilPressure: Number((f.oilPressure || 0).toFixed(2)),
      })),
    [sessionFrames]
  );

  if (!telemetry) return <div className="text-cyan-300 p-4 font-mono animate-pulse">AWAITING TELEMETRY...</div>;

  const oilCritical = telemetry.oilPressure < 1.5;
  const voltCritical = telemetry.batteryVoltage < 22.0;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <HoloPanel title="MASTER PROPULSION" className="lg:col-span-4 flex items-center justify-center min-h-[240px]">
          <div className="flex items-center justify-center h-full">
            <GaugeArc value={telemetry.rpm} min={0} max={6000} unit="RPM" warnline={4800} redline={5500} size={190} />
          </div>
        </HoloPanel>

        <HoloPanel title="THERMAL DYNAMICS (CHT / EGT)" className="lg:col-span-8 min-h-[240px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 h-full items-center py-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center bg-slate-900/50 rounded-lg p-2.5 border border-white/5">
                <GaugeArc value={telemetry.chts[i]} min={50} max={300} unit="°C" warnline={205} redline={240} size={96} />
                <div className="text-[10px] text-cyan-300 mt-2 font-mono font-bold">CYL {i + 1} CHT</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">{telemetry.egts[i].toFixed(0)} °C EGT</div>
              </div>
            ))}
          </div>
        </HoloPanel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HoloPanel title="LUBRICATION SYSTEM" className="min-h-[140px]">
          <div className="grid grid-cols-3 gap-3 items-center h-full py-2">
            <div className="text-center p-2.5 rounded-lg bg-slate-900/50 border border-white/5">
              <div className={`text-2xl font-mono font-bold mb-1 ${oilCritical ? 'text-rose-400 animate-pulse' : 'text-cyan-300'}`}>
                {telemetry.oilPressure.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">OIL PRESS (BAR)</div>
            </div>
            <div className="text-center p-2.5 rounded-lg bg-slate-900/50 border border-white/5">
              <div className="text-2xl font-mono text-cyan-300 font-bold mb-1">
                {telemetry.oilTemp.toFixed(1)}°
              </div>
              <div className="text-[10px] text-slate-400 font-mono">OIL TEMP (°C)</div>
            </div>
            <div className="text-center p-2.5 rounded-lg bg-slate-900/50 border border-white/5">
              <div className="text-2xl font-mono text-cyan-300 font-bold mb-1">
                {telemetry.crankcasePressure.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">CRANKCASE (BAR)</div>
            </div>
          </div>
        </HoloPanel>

        <HoloPanel title="ELECTRICAL POWER BUS" className="min-h-[140px]">
          <div className="grid grid-cols-2 gap-3 items-center h-full py-2">
            <div className="text-center p-2.5 rounded-lg bg-slate-900/50 border border-white/5">
              <div className={`text-2xl font-mono font-bold mb-1 ${voltCritical ? 'text-rose-400 animate-pulse' : 'text-emerald-300'}`}>
                {telemetry.batteryVoltage.toFixed(1)} V
              </div>
              <div className="text-[10px] text-slate-400 font-mono">28V MAIN BUS</div>
            </div>
            <div className="text-center p-2.5 rounded-lg bg-slate-900/50 border border-white/5">
              <div className="text-2xl font-mono text-cyan-300 font-bold mb-1">
                {telemetry.generatorLoad.toFixed(1)} A
              </div>
              <div className="text-[10px] text-slate-400 font-mono">ALTERNATOR LOAD</div>
            </div>
          </div>
        </HoloPanel>
      </div>

      <HoloPanel title="LIVE RPM TELEMETRY STREAM" className="flex-1 min-h-[210px]">
        <div className="w-full h-[185px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRpm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="idx" hide />
              <YAxis domain={[0, 6000]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#070b14', borderColor: '#22d3ee', borderRadius: '8px', fontSize: 11 }}
                itemStyle={{ color: '#22d3ee' }}
                labelStyle={{ display: 'none' }}
              />
              <Area type="monotone" dataKey="rpm" stroke="#22d3ee" strokeWidth={2} fill="url(#colorRpm)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </HoloPanel>
    </div>
  );
}
