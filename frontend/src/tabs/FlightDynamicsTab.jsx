import React from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import { Compass, AlertTriangle } from 'lucide-react';

export function FlightDynamicsTab() {
  const { telemetry } = useTelemetryStore();

  if (!telemetry) {
    return <div className="text-cyan-300 p-4 font-mono animate-pulse">AWAITING TELEMETRY...</div>;
  }

  const pitch = telemetry.pitchAngle || 0;
  const roll = telemetry.rollAngle || 0;
  const heading = telemetry.heading || 0;
  const speed = telemetry.groundSpeed || 0;
  const altitude = telemetry.densityAltitude || 0;
  const vsi = telemetry.verticalSpeed || 0;
  const gLoad = telemetry.gLoad || 1.0;

  const V_WIDTH = 860;
  const V_HEIGHT = 560;
  const cx = V_WIDTH / 2;
  const cy = V_HEIGHT / 2;
  const PITCH_FACTOR = 7.5;
  const pitchOffset = pitch * PITCH_FACTOR;

  const stallWarn = speed < 42 && (telemetry.rpm || 0) > 1000;
  const bankWarn = Math.abs(roll) > 28;
  const overspeedWarn = speed > 135;

  const pitchLines = [];
  for (let i = -40; i <= 40; i += 5) {
    if (i === 0) continue;
    const y = cy - i * PITCH_FACTOR;
    const isMajor = i % 10 === 0;
    const width = isMajor ? 130 : 62;
    pitchLines.push(
      <g key={i} transform={`translate(0, ${y})`}>
        <line
          x1={cx - width / 2}
          y1={0}
          x2={cx + width / 2}
          y2={0}
          stroke={i > 0 ? '#38bdf8' : '#f59e0b'}
          strokeWidth={isMajor ? '2.5' : '1.5'}
          strokeDasharray={i < 0 ? '6,4' : undefined}
        />
        {isMajor && (
          <>
            <text x={cx - width / 2 - 10} y={5} fill="#e0f2fe" fontSize="13" textAnchor="end">{Math.abs(i)}</text>
            <text x={cx + width / 2 + 10} y={5} fill="#e0f2fe" fontSize="13" textAnchor="start">{Math.abs(i)}</text>
          </>
        )}
      </g>
    );
  }

  // Flight Path Vector (velocity vector indicator)
  const fpvY = cy - Math.max(-90, Math.min(90, (vsi / 600) * 35));
  const slipX = Math.max(-28, Math.min(28, (telemetry.yawRate || 0) * 1.4));

  return (
    <div className="flex flex-col gap-4 font-mono select-none h-full">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <HoloPanel title="FLIGHT MODE" className="py-2">
          <div className="text-sm font-bold text-cyan-300">{telemetry.flightMode || 'LOITER'}</div>
          <div className="text-[10px] text-slate-400">AUTOPILOT {telemetry.actuators?.autopilot ? 'ENGAGED' : 'STBY'}</div>
        </HoloPanel>
        <HoloPanel title="PITCH / ROLL" className="py-2">
          <div className="text-sm font-bold text-sky-300">{pitch.toFixed(1)}° / {roll.toFixed(1)}°</div>
          <div className="text-[10px] text-slate-400">YAW RATE {(telemetry.yawRate || 0).toFixed(1)}°/s</div>
        </HoloPanel>
        <HoloPanel title="VERTICAL SPEED" className="py-2">
          <div className={`text-sm font-bold ${vsi >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
            {vsi >= 0 ? '+' : ''}{Math.round(vsi)} FPM
          </div>
          <div className="text-[10px] text-slate-400">BARO VSI</div>
        </HoloPanel>
        <HoloPanel title="G-LOAD FACTOR" className="py-2">
          <div className={`text-sm font-bold ${gLoad > 2.8 ? 'text-rose-400' : 'text-cyan-300'}`}>{gLoad.toFixed(2)} G</div>
          <div className="text-[10px] text-slate-400">LIMIT +3.8G / -1.5G</div>
        </HoloPanel>
        <HoloPanel title="CONFIG" className="py-2">
          <div className="text-sm font-bold text-amber-300">
            FLAPS {telemetry.actuators?.flaps ?? 0}° • {telemetry.actuators?.gearDown ? 'GEAR DN' : 'GEAR UP'}
          </div>
          <div className="text-[10px] text-slate-400">WEATHER {telemetry.weatherMode || 'CLEAR'}</div>
        </HoloPanel>
      </div>

      <HoloPanel title="MIL-STD SYNTHETIC VISION // PRIMARY FLIGHT DISPLAY" titleIcon={<Compass size={15} />} className="flex-1 min-h-[430px]">
        <div className="relative w-full h-full overflow-hidden bg-[#040812] rounded-xl border border-cyan-400/20 flex items-center justify-center">
          {(stallWarn || bankWarn || overspeedWarn) && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1 rounded-full bg-rose-500/25 border border-rose-400 text-rose-200 text-xs font-bold flex items-center gap-2 animate-pulse">
              <AlertTriangle size={14} />
              {stallWarn ? 'STALL CAUTION' : overspeedWarn ? 'OVERSPEED VNE' : 'EXCESSIVE BANK ANGLE'}
            </div>
          )}

          <svg viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`} className="w-full h-full max-h-[68vh]">
            <defs>
              <clipPath id="pfd-clip">
                <rect x="0" y="0" width={V_WIDTH} height={V_HEIGHT} rx="14" />
              </clipPath>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#082f49" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
              <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#431407" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
            </defs>

            <g clipPath="url(#pfd-clip)">
              {/* Artificial Horizon + Synthetic Grid */}
              <g transform={`translate(${cx}, ${cy}) rotate(${-roll}) translate(${-cx}, ${-cy + pitchOffset})`}>
                <rect x={-V_WIDTH} y={-V_HEIGHT * 2} width={V_WIDTH * 3} height={V_HEIGHT * 2 + cy} fill="url(#skyGrad)" />
                <rect x={-V_WIDTH} y={cy} width={V_WIDTH * 3} height={V_HEIGHT * 2} fill="url(#groundGrad)" />
                {/* Synthetic perspective ground rays */}
                {[-6, -4, -2, 0, 2, 4, 6].map((k) => (
                  <line key={k} x1={cx + k * 45} y1={cy} x2={cx + k * 210} y2={cy + 340} stroke="#22d3ee" strokeOpacity="0.16" strokeWidth="1" />
                ))}
                <line x1={-V_WIDTH} y1={cy} x2={V_WIDTH * 2} y2={cy} stroke="#22d3ee" strokeWidth="3" />
                {pitchLines}
              </g>

              {/* Top Bank Angle Scale Arc */}
              <g transform={`translate(${cx}, ${cy})`}>
                <path d="M -140 -175 A 220 220 0 0 1 140 -175" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeOpacity="0.6" />
                <g transform={`rotate(${-roll})`}>
                  <polygon points="0,-220 -7,-206 7,-206" fill="#22d3ee" />
                </g>
              </g>

              {/* Flight Path Vector (Velocity Vector) */}
              <g transform={`translate(${cx + slipX}, ${fpvY})`}>
                <circle cx="0" cy="0" r="9" fill="none" stroke="#10b981" strokeWidth="2" />
                <line x1="-22" y1="0" x2="-9" y2="0" stroke="#10b981" strokeWidth="2" />
                <line x1="9" y1="0" x2="22" y2="0" stroke="#10b981" strokeWidth="2" />
                <line x1="0" y1="-9" x2="0" y2="-18" stroke="#10b981" strokeWidth="2" />
              </g>

              {/* Center Boresight Watermark */}
              <g stroke="#facc15" strokeWidth="3" fill="none">
                <polyline points={`${cx - 56},${cy} ${cx - 18},${cy} ${cx - 18},${cy + 12}`} />
                <polyline points={`${cx + 56},${cy} ${cx + 18},${cy} ${cx + 18},${cy + 12}`} />
                <circle cx={cx} cy={cy} r="3" fill="#facc15" />
              </g>

              {/* Left Airspeed Tape */}
              <rect x="26" y="95" width="96" height="360" rx="8" fill="#040710" fillOpacity="0.78" stroke="#22d3ee" strokeOpacity="0.4" />
              <text x="74" y="84" fill="#94a3b8" fontSize="11" textAnchor="middle">IAS KTS</text>
              {[-30, -20, -10, 0, 10, 20, 30].map((d) => {
                const tickVal = Math.max(0, Math.round(speed / 10) * 10 + d);
                const y = cy - (tickVal - speed) * 4.5;
                if (y < 105 || y > 445) return null;
                return (
                  <g key={d} transform={`translate(0, ${y})`}>
                    <line x1="106" y1="0" x2="122" y2="0" stroke="#22d3ee" strokeWidth="1.5" />
                    <text x="98" y="4" fill="#cbd5e1" fontSize="12" textAnchor="end">{tickVal}</text>
                  </g>
                );
              })}
              <rect x="22" y={cy - 18} width="104" height="36" rx="4" fill="#020617" stroke="#22d3ee" strokeWidth="2" />
              <text x="74" y={cy + 6} fill="#22d3ee" fontSize="18" fontWeight="bold" textAnchor="middle">{Math.round(speed)}</text>

              {/* Right Altitude Tape + VSI */}
              <rect x={V_WIDTH - 132} y="95" width="106" height="360" rx="8" fill="#040710" fillOpacity="0.78" stroke="#22d3ee" strokeOpacity="0.4" />
              <text x={V_WIDTH - 79} y="84" fill="#94a3b8" fontSize="11" textAnchor="middle">ALT FT</text>
              {[-600, -400, -200, 0, 200, 400, 600].map((d) => {
                const tickVal = Math.max(0, Math.round(altitude / 200) * 200 + d);
                const y = cy - (tickVal - altitude) * 0.22;
                if (y < 105 || y > 445) return null;
                return (
                  <g key={d} transform={`translate(0, ${y})`}>
                    <line x1={V_WIDTH - 132} y1="0" x2={V_WIDTH - 118} y2="0" stroke="#10b981" strokeWidth="1.5" />
                    <text x={V_WIDTH - 112} y="4" fill="#cbd5e1" fontSize="12">{tickVal}</text>
                  </g>
                );
              })}
              <rect x={V_WIDTH - 136} y={cy - 18} width="114" height="36" rx="4" fill="#020617" stroke="#10b981" strokeWidth="2" />
              <text x={V_WIDTH - 79} y={cy + 6} fill="#10b981" fontSize="17" fontWeight="bold" textAnchor="middle">{Math.round(altitude)}</text>

              {/* Bottom Heading Tape */}
              <rect x={cx - 180} y={V_HEIGHT - 64} width="360" height="44" rx="8" fill="#040710" fillOpacity="0.82" stroke="#22d3ee" strokeOpacity="0.45" />
              <text x={cx} y={V_HEIGHT - 36} fill="#22d3ee" fontSize="19" fontWeight="bold" textAnchor="middle">
                HDG {String(Math.round(heading)).padStart(3, '0')}°
              </text>
              {/* Slip / Skid Ball */}
              <rect x={cx - 34} y={V_HEIGHT - 18} width="68" height="10" rx="5" fill="#0f172a" stroke="#475569" />
              <circle cx={cx + slipX * 0.8} cy={V_HEIGHT - 13} r="4" fill="#22d3ee" />
            </g>
          </svg>
        </div>
      </HoloPanel>
    </div>
  );
}
