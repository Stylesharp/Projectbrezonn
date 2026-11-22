import React, { useMemo } from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import { GaugeArc } from '../components/GaugeArc';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, AreaChart, Area, YAxis, CartesianGrid, Tooltip, ReferenceLine
} from 'recharts';
import { BrainCircuit, ShieldCheck, AlertTriangle, Sparkles, Activity } from 'lucide-react';

const clamp = (v) => Math.min(100, Math.max(0, v));

const COMPONENT_LABELS = {
  cyl1: 'Cylinder 1 Rings',
  cyl2: 'Cylinder 2 Rings',
  cyl3: 'Cylinder 3 Rings',
  cyl4: 'Cylinder 4 Rings',
  oilPump: 'Oil Scavenge Pump',
  alternator: '28V Alternator',
  turbo: 'Turbocharger Turbine',
  propGovernor: 'Propeller Governor',
  bearings: 'Crankshaft Bearings',
  fuelPump: 'Fuel Delivery Pump',
  hydraulics: 'Hydraulic Actuators',
  avionics: 'Avionics Core Unit',
};

export function AiAnalyticsTab() {
  const { telemetry: t, sessionFrames: history } = useTelemetryStore();
  const faults = t?.faults || {};

  const rulHours = Math.max(0, t?.rulHours ?? 1420.0);
  const rulMinutes = rulHours * 60;
  const hours = Math.floor(rulHours);
  const mins = Math.floor(rulMinutes % 60);
  const secs = Math.floor((rulMinutes * 60) % 60);
  const isEmergency = rulHours < 2.0;
  const isDegraded = rulHours < 25.0;
  const hasFaults = Object.values(faults).some(Boolean) || isEmergency;

  const maxCht = Math.max(...(t?.chts ?? [100, 100, 100, 100]));
  const thermalVal = clamp(100 - ((maxCht - 100) / 140) * 100);
  const mechanicalVal = clamp(100 - clamp(((t?.rpm ?? 0) / 5500) * 100) * 0.55);
  const oilVal = clamp(((t?.oilPressure ?? 4.5) / 5.0) * 100);
  const fuelVal = clamp((t?.fuelLevelL ?? 50) + (t?.fuelLevelR ?? 50));
  const electricalVal = clamp((((t?.batteryVoltage ?? 26) - 18) / 10) * 100);
  const structuralVal = clamp(100 - Math.max(0, (t?.gLoad ?? 1) - 1) * 22);
  const vibrationVal = clamp(100 - (t?.anomalyScore ?? 0.03) * 100);
  const envVal = clamp(100 - (t?.iceRisk ?? 0) * 100);

  const radarData = [
    { axis: 'Thermal', val: Math.round(thermalVal) },
    { axis: 'Mechanical', val: Math.round(mechanicalVal) },
    { axis: 'Lubrication', val: Math.round(oilVal) },
    { axis: 'Fuel', val: Math.round(fuelVal) },
    { axis: 'Electrical', val: Math.round(electricalVal) },
    { axis: 'Structural', val: Math.round(structuralVal) },
    { axis: 'Vibration', val: Math.round(vibrationVal) },
    { axis: 'Atmospheric', val: Math.round(envVal) },
  ];

  const healthIndex = clamp(
    thermalVal * 0.2 +
      mechanicalVal * 0.15 +
      oilVal * 0.2 +
      fuelVal * 0.1 +
      electricalVal * 0.1 +
      structuralVal * 0.1 +
      vibrationVal * 0.1 +
      envVal * 0.05
  );

  const anomalyScore = t?.anomalyScore ?? 0.03;
  const anomalyColor = anomalyScore > 0.75 ? '#f43f5e' : anomalyScore > 0.45 ? '#f59e0b' : '#22d3ee';
  const anomalyData = useMemo(
    () => history.slice(-120).map((h, i) => ({ i, score: Number((h.anomalyScore || 0).toFixed(3)) })),
    [history]
  );

  const diagnostics = t?.aiDiagnostics?.contributors?.length
    ? t.aiDiagnostics
    : {
        confidence: 96.4,
        model: 'Hybrid Physics-Residual + EWMA Z-Score',
        primaryCause: hasFaults ? 'ACTIVE FAULT SIGNATURE' : 'NOMINAL ENVELOPE',
        recommendation: hasFaults
          ? 'Review highlighted subsystem and execute Copilot mitigation.'
          : 'All telemetry vectors within nominal operating envelope.',
        contributors: [
          { subsystem: 'CYLINDER THERMAL', impactPct: Math.round(100 - thermalVal), severity: thermalVal < 35 ? 'CRITICAL' : thermalVal < 65 ? 'WARNING' : 'NOMINAL' },
          { subsystem: 'OIL LUBRICATION', impactPct: Math.round(100 - oilVal), severity: oilVal < 35 ? 'CRITICAL' : oilVal < 65 ? 'WARNING' : 'NOMINAL' },
          { subsystem: 'ELECTRICAL 28V BUS', impactPct: Math.round(100 - electricalVal), severity: electricalVal < 40 ? 'CRITICAL' : electricalVal < 70 ? 'WARNING' : 'NOMINAL' },
          { subsystem: 'ATMOSPHERIC ICING', impactPct: Math.round(100 - envVal), severity: envVal < 40 ? 'WARNING' : 'NOMINAL' },
        ].sort((a, b) => b.impactPct - a.impactPct),
      };

  const sortedWear = Object.entries(t?.componentWear || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-12 gap-4">
      <HoloPanel className="col-span-12 lg:col-span-4" title="ENGINE HEALTH RADAR" titleIcon={<BrainCircuit size={15} />}>
        <div className="flex flex-col items-center gap-3 py-1">
          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(56, 189, 248, 0.16)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#070b14',
                    border: '1px solid rgba(34,211,238,0.4)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                />
                <Radar
                  dataKey="val"
                  stroke={healthIndex < 55 ? '#f43f5e' : healthIndex < 80 ? '#f59e0b' : '#22d3ee'}
                  fill={healthIndex < 55 ? '#f43f5e' : healthIndex < 80 ? '#f59e0b' : '#22d3ee'}
                  fillOpacity={0.22}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <GaugeArc
            value={healthIndex}
            max={100}
            unit="% SOH"
            label="State of Health"
            size={118}
            warnline={75}
            redline={50}
            invertThresholds={true}
            decimals={1}
            color="#10b981"
            warnColor="#f59e0b"
            criticalColor="#f43f5e"
          />
        </div>
      </HoloPanel>

      <HoloPanel className="col-span-12 lg:col-span-4" title="REMAINING USEFUL LIFE & WEAR" titleIcon={<Activity size={15} />}>
        <div className="flex flex-col gap-3.5 py-1">
          <div
            className={`p-3.5 rounded-lg border text-center transition-all ${
              isEmergency
                ? 'border-rose-500/70 bg-rose-500/15'
                : isDegraded || hasFaults
                ? 'border-amber-400/50 bg-amber-400/10'
                : 'border-cyan-400/25 bg-slate-900/60'
            }`}
          >
            <div className="text-[10px] text-slate-400 tracking-widest mb-1">PREDICTED R.U.L.</div>
            <div
              className={`text-3xl font-mono font-bold tabular-nums ${
                isEmergency ? 'text-rose-400 animate-pulse' : isDegraded ? 'text-amber-300' : 'text-cyan-300'
              }`}
            >
              {hours > 0 ? `${hours}H ${String(mins).padStart(2, '0')}M` : `${mins}M ${String(secs).padStart(2, '0')}S`}
            </div>
            <div className={`text-[10px] mt-1 font-semibold ${isEmergency ? 'text-rose-300' : isDegraded ? 'text-amber-300' : 'text-slate-400'}`}>
              {isEmergency ? 'CRITICAL IMMINENT FAILURE' : isDegraded ? 'MAINTENANCE RECOMMENDED' : `CONFIDENCE ${diagnostics.confidence}%`}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 max-h-[225px] overflow-y-auto pr-1">
            {sortedWear.map(([name, wear]) => {
              const wearPct = wear <= 1.0 ? wear * 100 : wear;
              const wc = wearPct > 60 ? '#f43f5e' : wearPct > 30 ? '#f59e0b' : '#22d3ee';
              return (
                <div key={name}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 truncate pr-2 uppercase">{COMPONENT_LABELS[name] || name}</span>
                    <span className="font-mono text-xs tabular-nums font-bold" style={{ color: wc }}>
                      {wearPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-900 border border-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${clamp(wearPct)}%`, backgroundColor: wc }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </HoloPanel>

      <HoloPanel className="col-span-12 lg:col-span-4" title="AI ANOMALY SCORE STREAM" titleIcon={<Sparkles size={15} />}>
        <div className="flex flex-col gap-3 py-1">
          <div className="h-[185px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={anomalyData}>
                <defs>
                  <linearGradient id="anom-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={anomalyColor} stopOpacity={0.55} />
                    <stop offset="95%" stopColor={anomalyColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: '#94a3b8' }} stroke="rgba(148,163,184,0.3)" width={30} />
                <Tooltip
                  contentStyle={{
                    background: '#070b14',
                    border: `1px solid ${anomalyColor}`,
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                />
                <ReferenceLine y={0.5} stroke="#f59e0b" strokeDasharray="3 3" />
                <ReferenceLine y={0.8} stroke="#f43f5e" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke={anomalyColor}
                  fill="url(#anom-grad)"
                  isAnimationActive={false}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3.5 rounded-lg border border-white/10 bg-slate-900/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 tracking-widest block">ANOMALY INDEX</span>
              <span className="text-[10px] text-slate-500">{diagnostics.model}</span>
            </div>
            <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: anomalyColor }}>
              {(anomalyScore * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </HoloPanel>

      <HoloPanel
        className="col-span-12"
        title="EXPLAINABLE AI // ROOT-CAUSE ATTRIBUTION & COPILOT ADVISORY"
        titleIcon={hasFaults ? <AlertTriangle size={15} className="text-rose-400" /> : <ShieldCheck size={15} className="text-emerald-400" />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5 p-3.5 rounded-lg bg-slate-900/70 border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Primary Diagnostic Classification</div>
            <div className={`text-sm font-bold tracking-wider mb-2 ${hasFaults ? 'text-rose-300' : 'text-emerald-300'}`}>
              {diagnostics.primaryCause}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{diagnostics.recommendation}</p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {diagnostics.contributors.slice(0, 4).map((c) => {
              const barColor =
                c.severity === 'CRITICAL' ? '#f43f5e' : c.severity === 'WARNING' ? '#f59e0b' : '#10b981';
              return (
                <div key={c.subsystem} className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-slate-200 font-semibold">{c.subsystem}</span>
                    <span className="text-[10px] font-bold" style={{ color: barColor }}>
                      {c.severity} ({c.impactPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(4, c.impactPct)}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </HoloPanel>

      {/* 5. 60-SECOND PREDICTIVE TELEMETRY FORECAST & WEIBULL SURVIVAL */}
      <HoloPanel
        className="col-span-12"
        title="60-SECOND LINEAR FORECAST & WEIBULL MISSION SURVIVAL"
        titleIcon={<Sparkles size={15} className="text-cyan-300" />}
      >
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 py-1 font-mono">
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">1H MISSION SURVIVAL</div>
            <div className={`text-xl font-bold mt-1 ${(t?.forecast?.missionSurvivalPct ?? 99.9) < 85 ? 'text-rose-400' : 'text-emerald-300'}`}>
              {(t?.forecast?.missionSurvivalPct ?? 99.9).toFixed(1)}%
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">PREDICTED CHT (+60S)</div>
            <div className={`text-xl font-bold mt-1 ${(t?.forecast?.predCht60s ?? maxCht) > 225 ? 'text-rose-400' : 'text-cyan-300'}`}>
              {(t?.forecast?.predCht60s ?? maxCht).toFixed(1)} °C
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">PREDICTED OIL (+60S)</div>
            <div className={`text-xl font-bold mt-1 ${(t?.forecast?.predOil60s ?? t?.oilPressure ?? 4.2) < 1.8 ? 'text-rose-400' : 'text-cyan-300'}`}>
              {(t?.forecast?.predOil60s ?? t?.oilPressure ?? 4.2).toFixed(2)} BAR
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">THERMAL TREND RATE</div>
            <div className="text-xl font-bold text-amber-300 mt-1">
              {(t?.forecast?.chtRatePerMin ?? 0) >= 0 ? '+' : ''}{(t?.forecast?.chtRatePerMin ?? 0).toFixed(1)} °/m
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/65 border border-white/5">
            <div className="text-[10px] text-slate-400">TIME TO REDLINE</div>
            <div className={`text-xl font-bold mt-1 ${t?.forecast?.secToThermalRedline !== null && t?.forecast?.secToThermalRedline !== undefined ? 'text-rose-400 animate-pulse' : 'text-emerald-300'}`}>
              {t?.forecast?.secToThermalRedline !== null && t?.forecast?.secToThermalRedline !== undefined
                ? `${t.forecast.secToThermalRedline}s`
                : 'SAFE'}
            </div>
          </div>
        </div>
      </HoloPanel>
    </div>
  );
}