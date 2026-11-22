import React from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { LANDING_PADS } from '../utils/flightConfig';
import { Navigation, MapPin, Expand } from 'lucide-react';

function latLonToWorldPx(lat, lon, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * Compact Live Picture-in-Picture Satellite Mini-Map inside the 3D Digital Twin
 * Rotates Track-Up with the UAV so you can see 1:1 parity with the 3D terrain!
 */
export function MiniMapOverlay({ visible = true }) {
  const { telemetry, recon, initiateLanding, setActivePanel } = useTelemetryStore();
  if (!visible) return null;

  const lat = telemetry?.latitude ?? 37.7749;
  const lon = telemetry?.longitude ?? -122.4194;
  const heading = telemetry?.heading ?? 45;
  const zoom = 14;
  const boxSize = 168;
  const half = boxSize / 2;

  const center = latLonToWorldPx(lat, lon, zoom);
  const cTx = Math.floor(center.x / 256);
  const cTy = Math.floor(center.y / 256);
  const maxIndex = Math.pow(2, zoom);

  const tiles = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = ((cTx + dx) % maxIndex + maxIndex) % maxIndex;
      const ty = cTy + dy;
      if (ty < 0 || ty >= maxIndex) continue;
      const url =
        recon.mapLayer === 'DARK'
          ? `https://a.basemaps.cartocdn.com/dark_all/${zoom}/${tx}/${ty}.png`
          : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
      tiles.push({
        key: `${tx}-${ty}`,
        url,
        left: (cTx + dx) * 256 - (center.x - half),
        top: (cTy + dy) * 256 - (center.y - half),
      });
    }
  }

  return (
    <div className="absolute bottom-16 right-5 z-30 holo-panel corner-bracket p-1.5 pointer-events-auto w-[182px]">
      <div className="flex items-center justify-between px-1 pb-1 text-[9px] font-mono text-cyan-300">
        <span className="font-bold flex items-center gap-1">
          <MapPin size={10} className="text-emerald-400" /> SYNCED MAP
        </span>
        <button
          onClick={() => setActivePanel(9)}
          title="Open Full Satellite / Google Maps Tab"
          className="text-slate-400 hover:text-white cursor-pointer flex items-center gap-0.5"
        >
          <span>HDG {String(Math.round(heading)).padStart(3, '0')}°</span>
          <Expand size={10} />
        </button>
      </div>

      {/* Track-Up Rotating Satellite Mini-Map Viewport */}
      <div className="relative w-[168px] h-[142px] rounded-lg overflow-hidden border border-cyan-400/30 bg-[#040710]">
        <div
          className="absolute inset-0"
          style={{
            transform: `rotate(${-heading}deg)`,
            transformOrigin: 'center center',
            transition: 'transform 120ms linear',
          }}
        >
          {tiles.map((t) => (
            <img
              key={t.key}
              src={t.url}
              alt=""
              draggable={false}
              className="absolute w-[256px] h-[256px] max-w-none pointer-events-none"
              style={{
                left: `${t.left}px`,
                top: `${t.top - 13}px`,
                filter: recon.mapLayer === 'DARK' ? 'brightness(0.95)' : 'brightness(0.8) contrast(1.12)',
              }}
            />
          ))}

          {/* Landing Pad Dots */}
          {LANDING_PADS.map((pad) => {
            const p = latLonToWorldPx(pad.lat, pad.lon, zoom);
            const sx = p.x - (center.x - half);
            const sy = p.y - (center.y - half) - 13;
            const isActive = recon.activePadId === pad.id;
            return (
              <button
                key={pad.id}
                onClick={() => initiateLanding(pad.id)}
                title={`Land at ${pad.name}`}
                style={{ left: `${sx}px`, top: `${sy}px` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border cursor-pointer ${
                  isActive ? 'bg-emerald-400 border-white shadow-[0_0_8px_#10b981]' : 'bg-cyan-400/90 border-slate-950'
                }`}
              />
            );
          })}
        </div>

        {/* Fixed Forward-Pointing Center UAV Reticle (Track-Up!) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <Navigation size={14} className="text-cyan-300 fill-cyan-300 drop-shadow-[0_0_6px_#22d3ee]" />
        </div>
        <div className="absolute bottom-1 left-1.5 px-1 rounded bg-slate-950/80 text-[8px] text-slate-300 pointer-events-none">
          {lat.toFixed(4)}°N {Math.abs(lon).toFixed(4)}°W
        </div>
      </div>
    </div>
  );
}
