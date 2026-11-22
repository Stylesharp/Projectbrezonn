import React from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import { GaugeArc } from '../components/GaugeArc';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';

const ISA_DATA = [
  { alt: 0, temp: 15.0, press: 1013, density: 1.225 },
  { alt: 5000, temp: 5.1, press: 843, density: 1.056 },
  { alt: 10000, temp: -4.8, press: 697, density: 0.905 },
  { alt: 15000, temp: -14.7, press: 572, density: 0.771 },
  { alt: 20000, temp: -24.6, press: 466, density: 0.653 },
  { alt: 25000, temp: -34.5, press: 376, density: 0.549 },
  { alt: 30000, temp: -44.4, press: 301, density: 0.458 },
];

export function EnvironmentalTab() {
  const { telemetry } = useTelemetryStore();
  if (!telemetry) return <div className="text-cyan-300 p-4 font-mono animate-pulse">AWAITING ENVIRONMENTAL SENSORS...</div>;

  const currentAlt = telemetry.densityAltitude || 8500;
  const isaTempAtAlt = 15.0 - (currentAlt / 1000) * 1.98;
  const isaDev = telemetry.ambientTemp - isaTempAtAlt;
  const inHg = (telemetry.ambientPressure * 0.02953).toFixed(2);
  const densityRatio = Math.max(0.4, 1 - (currentAlt / 30000) * 0.6);
  const powerLossPct = ((1 - densityRatio) * 100).toFixed(1);

  return (
    <div className="flex flex-col gap-4 font-mono select-none">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-h-[210px]">
        <HoloPanel title="ATMOSPHERIC CONDITIONS" className="sm:col-span-2">
          <div className="grid grid-cols-3 gap-3 h-full items-center py-2">
            <div className="text-center p-3 bg-slate-900/60 rounded-lg border border-white/5">
              <div className="text-2xl font-bold text-cyan-300 mb-1">{telemetry.ambientTemp.toFixed(1)} °C</div>
              <div className="text-[10px] text-slate-400">OUTSIDE AIR TEMP</div>
              <div className="text-[10px] text-cyan-400/75 mt-1">
                ISA DEV: {isaDev >= 0 ? '+' : ''}{isaDev.toFixed(1)} °C
              </div>
            </div>

            <div className="text-center p-3 bg-slate-900/60 rounded-lg border border-white/5">
              <div className="text-2xl font-bold text-cyan-300 mb-1">{telemetry.ambientPressure.toFixed(0)}</div>
              <div className="text-[10px] text-slate-400">BARO PRESS (hPa)</div>
              <div className="text-[10px] text-cyan-400/75 mt-1">{inHg} inHg</div>
            </div>

            <div className="text-center p-3 bg-slate-900/60 rounded-lg border border-white/5">
              <div className="text-2xl font-bold text-emerald-300 mb-1">{Math.round(currentAlt).toLocaleString()}&apos;</div>
              <div className="text-[10px] text-slate-400">DENSITY ALTITUDE</div>
              <div className="text-[10px] text-amber-300 mt-1">PWR LOSS: -{powerLossPct}%</div>
            </div>
          </div>
        </HoloPanel>

        <HoloPanel title="WIND & ICING HAZARD" className="flex flex-col items-center justify-center">
          <div className="flex items-center justify-around w-full py-2">
            <div className="flex flex-col items-center">
              <GaugeArc value={telemetry.iceRisk * 100} min={0} max={100} unit="%" warnline={40} redline={70} size={115} />
              <div className="text-[10px] text-cyan-300 mt-1 uppercase font-bold">Icing Risk</div>
            </div>

            <div className="flex flex-col items-center justify-center p-3 bg-slate-900/60 rounded-lg border border-white/5">
              <div className="relative w-16 h-16 rounded-full border border-cyan-400/35 flex items-center justify-center mb-1.5">
                <div
                  className="w-1 h-7 bg-cyan-300 shadow-[0_0_8px_#22d3ee] rounded origin-bottom"
                  style={{ transform: `rotate(${Math.round(telemetry.windDir)}deg)` }}
                />
                <span className="absolute text-[8px] top-0.5 text-slate-400">N</span>
              </div>
              <span className="text-xs font-bold text-cyan-300">{telemetry.windSpeed.toFixed(1)} KTS</span>
              <span className="text-[10px] text-slate-400">DIR: {String(Math.round(telemetry.windDir)).padStart(3, '0')}°</span>
            </div>
          </div>
        </HoloPanel>
      </div>

      <HoloPanel title="ISA ATMOSPHERIC PROFILE & UAV FLIGHT LEVEL" className="flex-1 min-h-[300px]">
        <div className="w-full h-[265px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ISA_DATA} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="alt" unit="ft" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis
                yAxisId="left"
                tick={{ fill: '#38bdf8', fontSize: 10 }}
                label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 10 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#f59e0b', fontSize: 10 }}
                label={{ value: 'Pressure (hPa)', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#070b14', borderColor: '#22d3ee', borderRadius: '8px', fontSize: 11 }}
              />
              <ReferenceLine
                x={Math.round(currentAlt / 5000) * 5000}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{ value: `UAV ALT (${Math.round(currentAlt).toLocaleString()} ft)`, fill: '#f43f5e', fontSize: 10 }}
              />
              <Line yAxisId="left" type="monotone" dataKey="temp" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} name="OAT (°C)" isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="press" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Pressure (hPa)" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </HoloPanel>
    </div>
  );
}
