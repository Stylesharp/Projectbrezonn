import React from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import { GaugeArc } from '../components/GaugeArc';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { BrainCircuit, AlertTriangle, TrendingDown, Activity } from 'lucide-react';

/** Clamp a value to [0, 100] */
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
  avionics: 'Avionics Core Unit'
};

export function AiAnalyticsTab() {
  const { telemetry: t, sessionFrames: history } = useTelemetryStore();
  const faults = t?.faults;

  const rulHours = Math.max(0, t?.rulHours ?? 1420.0);
  const rulMinutes = rulHours * 60;
  const hours = Math.floor(rulHours);
  const mins = Math.floor(rulMinutes % 60);
  const secs = Math.floor((rulMinutes * 60) % 60);
  const isEmergency = rulHours < 2.0;
  const isDegraded = rulHours < 25.0;
  const hasFaults = Object.values(faults || {}).some(Boolean) || isEmergency;

  // ── Health Radar ─────────────────────────────────────────────────────────────
  // All axes clamped to [0, 100] and derived from real telemetry fields.
  const maxCht = Math.max(...(t?.chts ?? [100, 100, 100, 100]));
  const avgCht = (t?.chts ?? [100, 100, 100, 100]).reduce((a, b) => a + b, 0) / 4;

  // Thermal: 100 = cool (100 °C), 0 = at or above redline (240 °C)
  const thermalVal = clamp(100 - ((maxCht - 100) / 140) * 100);

  // Mechanical: derived from RPM — high sustained RPM = more mechanical stress
  const rpmPct = clamp((t?.rpm ?? 0) / 5500 * 100);
  const mechanicalVal = clamp(100 - rpmPct * 0.6);

  // Lubrication: oil pressure 0–5 bar → 0–100, capped
  const oilVal = clamp(((t?.oilPressure ?? 4.5) / 5.0) * 100);

  // Fuel: average of left+right tank level (each 0–50 L, combined 0–100 L → 0–100%)
  const totalFuelPct = clamp(((t?.fuelLevelL ?? 50) + (t?.fuelLevelR ?? 50)));
  const fuelVal = clamp(totalFuelPct); // 0–100 L maps naturally to 0–100

  // Electrical: 18 V = dead (0%), 28 V = full (100%)
  const electricalVal = clamp(((t?.batteryVoltage ?? 24) - 18) / 10 * 100);

  // Structural: g-load. 1g = perfect (100). Each additional g removes 20 pts.
  const structuralVal = clamp(100 - ((t?.gLoad ?? 1) - 1) * 20);

  // Vibration: proxy via anomaly score. Low anomaly = low vibration = healthy.
  const vibrationVal = clamp(100 - (t?.anomalyScore ?? 0.03) * 100);

  // Environmental: icing risk. 0 = clear, 1 = max icing risk.
  const envVal = clamp(100 - (t?.iceRisk ?? 0) * 100);

  const radarData = [
    { axis: 'Thermal',      val: thermalVal },
    { axis: 'Mechanical',   val: mechanicalVal },
    { axis: 'Lubrication',  val: oilVal },
    { axis: 'Fuel',         val: fuelVal },
    { axis: 'Electrical',   val: electricalVal },
    { axis: 'Structural',   val: structuralVal },
    { axis: 'Vibration',    val: vibrationVal },
    { axis: 'Environmental',val: envVal },
  ];

  // Composite health index — weighted average of all axes
  const healthIndex = clamp(
    (thermalVal * 0.20 +
     mechanicalVal * 0.15 +
     oilVal * 0.20 +
     fuelVal * 0.10 +
     electricalVal * 0.10 +
     structuralVal * 0.10 +
     vibrationVal * 0.10 +
     envVal * 0.05)
  );

  const anomalyData = history.map((h, i) => ({ i, score: h.anomalyScore || 0 }));

  const componentWear = t?.componentWear || {
    'Crankshaft Bearings': 12.5,
    'Piston Rings': 8.2,
    'Valves': 5.4,
    'Turbocharger': 15.0,
    'Oil Pump': 2.1,
    'Spark Plugs': 45.0
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ENGINE HEALTH RADAR */}
      <HoloPanel className="col-span-12 lg:col-span-4" title="ENGINE HEALTH RADAR" titleIcon={<BrainCircuit size={16} />}>
        <div className="flex flex-col items-center gap-4 py-2">
          <div style={{ height: 220, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(0, 240, 255, 0.15)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: '#00f0ff', fontSize: 10, fontFamily: 'monospace' }}
                />
                <Radar
                  dataKey="val"
                  stroke="#00f0ff"
                  fill="#00f0ff"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  style={{ filter: 'drop-shadow(0 0 5px #00f0ff)' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col items-center mt-2">
            <GaugeArc
              value={healthIndex}
              max={100}
              unit="%"
              label="State of Health"
              size={110}
              warnline={70}
              redline={50}
              decimals={1}
              color="#0ea5e9"
              warnColor="#facc15"
              criticalColor="#ff003c"
            />
          </div>
        </div>
      </HoloPanel>

      {/* RUL + WEAR */}
      <HoloPanel className="col-span-12 lg:col-span-4" title="REMAINING USEFUL LIFE & WEAR">
        <div className="flex flex-col gap-4 py-2">
          <div className={`p-4 rounded-xl border text-center transition-all ${isEmergency ? 'border-plasma bg-plasma/15' : isDegraded || hasFaults ? 'border-amber-400/50 bg-amber-400/10' : 'border-holo/30 bg-gray-900/60'}`}>
            <div className="text-[10px] text-gray-400 tracking-widest mb-1">PREDICTED R.U.L.</div>
            <div className={`text-4xl font-mono font-bold tabular-nums ${isEmergency ? 'text-plasma animate-pulse' : isDegraded ? 'text-amber-400' : 'text-holo'}`} style={{ textShadow: `0 0 10px ${isEmergency ? '#ff003c' : '#00f0ff'}` }}>
              {hours > 0 ? `${hours}H ${String(mins).padStart(2, '0')}M` : `${mins}M ${String(secs).padStart(2, '0')}S`}
            </div>
            <div className={`text-[10px] mt-2 font-bold ${isEmergency ? 'text-plasma animate-pulse' : isDegraded ? 'text-amber-400' : 'text-gray-500'}`}>
              {isEmergency ? 'CRITICAL IMMINENT FAILURE' : isDegraded ? 'MAINTENANCE REQUIRED' : '± 45 min confidence'}
            </div>
          </div>

          <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-1 mt-2">
            {Object.entries(componentWear).map(([name, wear]) => {
              // Wear values from backend are 0.0–1.0 fractions; display as percentage.
              const wearPct = wear <= 1.0 ? wear * 100 : wear;
              const wc = wearPct > 60 ? '#ff003c' : wearPct > 35 ? '#facc15' : '#00f0ff';
              const label = COMPONENT_LABELS[name] || name;
              return (
                <div key={name}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-400 truncate pr-2 uppercase">{label}</span>
                    <span className="font-mono text-xs tabular-nums font-bold" style={{ color: wc, textShadow: `0 0 5px ${wc}` }}>
                      {wearPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-950 border border-holo/10 rounded overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${clamp(wearPct)}%`, backgroundColor: wc, boxShadow: `0 0 8px ${wc}` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </HoloPanel>

      {/* ANOMALY STREAM */}
      <HoloPanel className="col-span-12 lg:col-span-4" title="ISOLATION FOREST ANOMALY SCORE">
        <div className="flex flex-col gap-3 py-2">
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={anomalyData.slice(-120)}>
                <defs>
                  <linearGradient id="anom-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 240, 255, 0.1)" />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: '#00f0ff' }} stroke="#00f0ff" />
                <Tooltip
                  contentStyle={{
                    background: '#030712',
                    border: '1px solid #00f0ff',
                    borderRadius: '4px',
                    fontSize: 12,
                    boxShadow: '0 0 10px rgba(0,240,255,0.2)'
                  }}
                  itemStyle={{ color: '#00f0ff' }}
                />
                <ReferenceLine y={0.5} stroke="#facc15" strokeDasharray="3 2" label={{ value: 'WARN', fill: '#facc15', fontSize: 9 }} />
                <ReferenceLine y={0.8} stroke="#ff003c" strokeDasharray="3 2" label={{ value: 'CRIT', fill: '#ff003c', fontSize: 9 }} />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#00f0ff"
                  fill="url(#anom-grad)"
                  isAnimationActive={false}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="p-4 rounded-xl border border-holo/30 bg-gray-900/50 flex flex-col justify-between mt-4">
            <span className="text-[10px] text-gray-400 tracking-widest mb-2">CURRENT ANOMALY INDEX</span>
            <span
              className={`font-mono text-3xl font-bold tabular-nums ${(t?.anomalyScore || 0) > 0.8 ? 'text-plasma animate-pulse' : (t?.anomalyScore || 0) > 0.5 ? 'text-amber-400' : 'text-holo'}`}
              style={{ textShadow: `0 0 10px ${(t?.anomalyScore || 0) > 0.8 ? '#ff003c' : '#00f0ff'}` }}
            >
              {((t?.anomalyScore || 0) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </HoloPanel>
    </div>
  );
}
