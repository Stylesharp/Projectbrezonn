import React, { useState } from 'react';
import {
  LayoutDashboard, Box, BrainCircuit, Sliders, ScrollText,
  CloudFog, Map, Compass, Crosshair, Radar
} from 'lucide-react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { twMerge } from 'tailwind-merge';

const TABS = [
  { icon: LayoutDashboard, label: 'Live Telemetry' },
  { icon: Box, label: '3D Digital Twin' },
  { icon: Radar, label: 'Recon Mission' },
  { icon: BrainCircuit, label: 'AI Prognostics' },
  { icon: Sliders, label: 'H.I.L Simulator' },
  { icon: ScrollText, label: 'Logs & Reliability' },
  { icon: CloudFog, label: 'Atmospheric' },
  { icon: Map, label: 'Mission Planning' },
  { icon: Compass, label: 'Flight Dynamics' },
  { icon: Crosshair, label: 'Tactical Radar' },
];

export function Sidebar() {
  const { activePanel, setActivePanel, recon } = useTelemetryStore();
  const [hovered, setHovered] = useState(false);

  return (
    <aside
      className={twMerge(
        'h-full bg-[#060a15]/86 backdrop-blur-2xl border-r border-cyan-400/18 transition-all duration-300 flex flex-col z-30 pointer-events-auto',
        hovered ? 'w-[224px]' : 'w-[68px]'
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex-1 py-3 flex flex-col gap-1 overflow-y-auto">
        {TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = activePanel === idx;
          return (
            <button
              key={idx}
              onClick={() => setActivePanel(idx)}
              title={!hovered ? tab.label : undefined}
              className={twMerge(
                'relative flex items-center h-11 px-5 transition-all duration-200 outline-none cursor-pointer group',
                isActive
                  ? 'text-cyan-300 bg-cyan-400/10'
                  : 'text-slate-500 hover:text-cyan-200 hover:bg-slate-900/80'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
              )}

              <Icon size={20} className={twMerge('shrink-0', isActive && 'drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]')} />

              <span
                className={twMerge(
                  'ml-3.5 font-mono text-[11px] uppercase whitespace-nowrap tracking-wider transition-opacity duration-200',
                  hovered ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                )}
              >
                {tab.label}
              </span>

              {idx === 2 && recon.groundBotState === 'ROVING' && (
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <div
        className={twMerge(
          'px-4 py-3 border-t border-cyan-400/15 transition-opacity duration-300 overflow-hidden font-mono text-[10px] text-slate-500 whitespace-nowrap',
          hovered ? 'opacity-100 h-20' : 'opacity-0 h-0 p-0 border-transparent'
        )}
      >
        <p>MESH LINK <span className="text-emerald-400">ENCRYPTED</span></p>
        <p>SUITE: RECON-AI v3.0</p>
        <p>ROVER: <span className="text-cyan-300">{recon.groundBotState}</span></p>
      </div>
    </aside>
  );
}
