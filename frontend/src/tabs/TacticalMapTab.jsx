import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { HoloPanel } from '../components/HoloPanel';
import { LANDING_PADS } from '../utils/flightConfig';
import {
  Crosshair, Compass, Radio, Globe, Map as MapIcon, KeyRound,
  Plus, Minus, PlaneLanding, PlaneTakeoff, Navigation
} from 'lucide-react';

const BASE_LAT = 37.7749;
const BASE_LON = -122.4194;

// Web Mercator projection helpers for zero-dependency real Satellite & Dark Slippy Tiles
function latLonToWorldPx(lat, lon, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPxToLatLon(x, y, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

function toLocalKm(lat, lon) {
  const dLatKm = (lat - BASE_LAT) * 111.32;
  const dLonKm = (lon - BASE_LON) * 111.32 * Math.cos((BASE_LAT * Math.PI) / 180);
  return { eastKm: dLonKm, northKm: dLatKm };
}

/* ---------------- LIVE GOOGLE MAPS JS API VIEW ---------------- */
function GoogleMapsLiveCanvas({ apiKey, lat, lon, heading, trail, onFlyTo, onLandAtPad, mapStyle }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const uavMarkerRef = useRef(null);
  const polyRef = useRef(null);
  const [status, setStatus] = useState('LOADING');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!apiKey) {
      setStatus('NO_KEY');
      return;
    }

    let cancelled = false;
    const initMap = () => {
      if (cancelled || !containerRef.current || !window.google?.maps) return;
      const g = window.google.maps;

      const map = new g.Map(containerRef.current, {
        center: { lat, lng: lon },
        zoom: 14,
        mapTypeId: mapStyle === 'HYBRID' ? 'hybrid' : mapStyle === 'TERRAIN' ? 'terrain' : 'satellite',
        disableDefaultUI: false,
        streetViewControl: false,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#0b1324' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
        ],
      });

      // Click anywhere on Google Maps to steer the UAV autopilot there!
      map.addListener('click', (e) => {
        if (e.latLng) {
          onFlyTo(e.latLng.lat(), e.latLng.lng(), 'GMAPS TARGET');
        }
      });

      // Designated Landing Pad markers
      LANDING_PADS.forEach((pad) => {
        const m = new g.Marker({
          position: { lat: pad.lat, lng: pad.lon },
          map,
          title: `${pad.name} — Click to Land`,
          label: { text: pad.shortName, color: '#ecfdf5', fontSize: '10px', fontWeight: 'bold' },
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#10b981',
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
        m.addListener('click', () => onLandAtPad(pad.id));
      });

      // Live rotating UAV marker
      uavMarkerRef.current = new g.Marker({
        position: { lat, lng: lon },
        map,
        title: 'UAV-P1 Live Position',
        icon: {
          path: g.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: '#22d3ee',
          fillOpacity: 1,
          strokeColor: '#020617',
          strokeWeight: 1.5,
          rotation: heading,
        },
      });

      // Glowing flight polyline
      polyRef.current = new g.Polyline({
        path: trail.map((p) => ({ lat: p.lat, lng: p.lon })),
        geodesic: true,
        strokeColor: '#22d3ee',
        strokeOpacity: 0.85,
        strokeWeight: 3,
        map,
      });

      mapRef.current = map;
      setStatus('READY');
    };

    if (window.google?.maps) {
      initMap();
    } else {
      const scriptId = 'aegis-google-maps-script';
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
      script.async = true;
      script.onload = initMap;
      script.onerror = () => {
        if (!cancelled) {
          setStatus('ERROR');
          setErrMsg('Failed to load Google Maps JS API. Verify your API key & billing/Maps JS API enabled.');
        }
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update mapType when toggled
  useEffect(() => {
    if (mapRef.current && window.google?.maps) {
      mapRef.current.setMapTypeId(
        mapStyle === 'HYBRID' ? 'hybrid' : mapStyle === 'TERRAIN' ? 'terrain' : 'satellite'
      );
    }
  }, [mapStyle]);

  // Smoothly update UAV position, rotation & flight path
  useEffect(() => {
    if (status !== 'READY' || !uavMarkerRef.current || !window.google?.maps) return;
    uavMarkerRef.current.setPosition({ lat, lng: lon });
    const icon = uavMarkerRef.current.getIcon();
    if (icon) {
      uavMarkerRef.current.setIcon({ ...icon, rotation: heading });
    }
    if (polyRef.current) {
      polyRef.current.setPath(trail.map((p) => ({ lat: p.lat, lng: p.lon })));
    }
  }, [lat, lon, heading, trail, status]);

  if (status === 'NO_KEY' || status === 'ERROR') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#040710]/90 rounded-xl border border-cyan-400/20">
        <Globe size={36} className="text-cyan-400 mb-3 opacity-80" />
        <div className="text-sm font-bold text-cyan-200 mb-1">
          {status === 'ERROR' ? 'Google Maps API Load Error' : 'Connect Google Maps JavaScript API'}
        </div>
        <p className="text-xs text-slate-400 max-w-md mb-3">
          {errMsg ||
            'Paste your Google Maps API Key in the key bar above to load live Google Satellite / Hybrid maps—or switch to the free zero-key SATELLITE MAP mode right next to it.'}
        </p>
        <div className="text-[10px] text-slate-400 bg-slate-900/80 border border-white/10 rounded-lg p-3 text-left max-w-md space-y-1">
          <div className="text-cyan-300 font-bold">Quick Google Cloud Setup:</div>
          <div>1. Open Google Cloud Console → APIs & Services → Enable <strong>Maps JavaScript API</strong>.</div>
          <div>2. Create an API Key under Credentials (restrict HTTP referrer to <code>http://localhost:5173/*</code>).</div>
          <div>3. Paste the key in the <strong>GMAPS KEY</strong> button above (or set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>frontend/.env</code>).</div>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full min-h-[430px] rounded-xl overflow-hidden" />;
}

/* ---------------- ZERO-KEY REAL SATELLITE / DARK SLIPPY-TILE MAP ---------------- */
function FreeSatelliteSlippyMap({ lat, lon, heading, trail, tileLayer, zoom, onFlyTo, onLandAtPad, activePadId }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 460 });

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setSize({ w: containerRef.current.clientWidth || 800, h: containerRef.current.clientHeight || 460 });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const centerWorld = latLonToWorldPx(lat, lon, zoom);
  const halfW = size.w / 2;
  const halfH = size.h / 2;

  const minTileX = Math.floor((centerWorld.x - halfW) / 256);
  const maxTileX = Math.floor((centerWorld.x + halfW) / 256);
  const minTileY = Math.floor((centerWorld.y - halfH) / 256);
  const maxTileY = Math.floor((centerWorld.y + halfH) / 256);
  const maxIndex = Math.pow(2, zoom);

  const tiles = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      if (ty < 0 || ty >= maxIndex) continue;
      const wrappedX = ((tx % maxIndex) + maxIndex) % maxIndex;
      const url =
        tileLayer === 'DARK'
          ? `https://a.basemaps.cartocdn.com/dark_all/${zoom}/${wrappedX}/${ty}@2x.png`
          : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${wrappedX}`;
      tiles.push({
        key: `${zoom}-${tx}-${ty}`,
        url,
        left: tx * 256 - (centerWorld.x - halfW),
        top: ty * 256 - (centerWorld.y - halfH),
      });
    }
  }

  const projectToScreen = (pLat, pLon) => {
    const wp = latLonToWorldPx(pLat, pLon, zoom);
    return { x: wp.x - (centerWorld.x - halfW), y: wp.y - (centerWorld.y - halfH) };
  };

  const handleMapClick = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldX = centerWorld.x - halfW + sx;
    const worldY = centerWorld.y - halfH + sy;
    const target = worldPxToLatLon(worldX, worldY, zoom);
    onFlyTo(target.lat, target.lon, 'MAP WAYPOINT');
  };

  const trailSvg = trail
    .map((pt) => {
      const s = projectToScreen(pt.lat, pt.lon);
      return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div
      ref={containerRef}
      onClick={handleMapClick}
      className="relative w-full h-full min-h-[430px] bg-[#040710] rounded-xl overflow-hidden cursor-crosshair select-none"
      title="Click anywhere on map to steer UAV autopilot"
    >
      {/* Real Satellite / Dark Vector Map Tiles */}
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          draggable={false}
          className="absolute w-[256px] h-[256px] pointer-events-none"
          style={{
            left: `${t.left}px`,
            top: `${t.top}px`,
            filter: tileLayer === 'SATELLITE' ? 'brightness(0.78) contrast(1.12) saturate(0.95)' : 'brightness(0.95)',
          }}
        />
      ))}

      {/* Flight Path SVG Overlay */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {trailSvg && (
          <polyline
            points={trailSvg}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2.5"
            strokeOpacity="0.85"
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Clickable Landing Zone Pins */}
      {LANDING_PADS.map((pad) => {
        const pos = projectToScreen(pad.lat, pad.lon);
        const isActive = activePadId === pad.id;
        return (
          <button
            key={pad.id}
            onClick={(e) => {
              e.stopPropagation();
              onLandAtPad(pad.id);
            }}
            style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
            title={`Click to approach & land at ${pad.name}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-transform hover:scale-110 shadow-lg ${
              isActive
                ? 'bg-emerald-500/90 border-white text-slate-950'
                : 'bg-slate-950/85 border-emerald-400/80 text-emerald-200 hover:bg-emerald-500/30'
            }`}
          >
            <PlaneLanding size={10} /> {pad.shortName}
          </button>
        );
      })}

      {/* Live Centered Rotating UAV Marker */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
      >
        <div
          className="w-8 h-8 rounded-full border border-cyan-400/60 bg-cyan-400/15 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.6)]"
          style={{ transform: `rotate(${heading}deg)` }}
        >
          <Navigation size={15} className="text-cyan-300 fill-cyan-300" />
        </div>
        <span className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/85 border border-cyan-400/50 text-[9px] text-cyan-200 font-bold">
          UAV-P1 • {Math.round(heading)}°
        </span>
      </div>

      {/* Attribution & Hint */}
      <div className="absolute bottom-2 left-3 px-2 py-0.5 rounded bg-slate-950/80 text-[9px] text-slate-400 pointer-events-none">
        CLICK ANYWHERE TO STEER AUTOPILOT • CLICK ANY GREEN PAD TO AUTOLAND
      </div>
    </div>
  );
}

/* ---------------- MAIN TACTICAL MAP & GOOGLE MAPS TAB ---------------- */
export function TacticalMapTab({ sendCommand = () => {} }) {
  const {
    telemetry, sessionFrames, connected, recon, apiKeys, setApiKeys,
    initiateLanding, initiateTakeoff, addWaypoint, setActivePanel, setReconOption
  } = useTelemetryStore();

  const [viewType, setViewType] = useState('SATELLITE'); // SATELLITE | GOOGLE | RADAR
  const tileLayer = recon.mapLayer || 'SATELLITE';
  const setTileLayer = (tl) => setReconOption('mapLayer', tl);
  const [gmapStyle, setGmapStyle] = useState('HYBRID'); // SATELLITE | HYBRID | TERRAIN
  const [zoom, setZoom] = useState(14);
  const [rangeKm, setRangeKm] = useState(5);
  const [followUav, setFollowUav] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [gmapsDraft, setGmapsDraft] = useState(apiKeys.googleMapsApiKey || '');

  const lat = telemetry?.latitude ?? BASE_LAT;
  const lon = telemetry?.longitude ?? BASE_LON;
  const heading = telemetry?.heading ?? 0;
  const speed = telemetry?.groundSpeed ?? 0;
  const alt = telemetry?.densityAltitude ?? 0;

  const { eastKm, northKm } = toLocalKm(lat, lon);
  const distHomeKm = Math.hypot(eastKm, northKm);
  const rtbBearing = (Math.atan2(-eastKm, -northKm) * (180 / Math.PI) + 360) % 360;

  const trail = useMemo(
    () =>
      sessionFrames
        .slice(-140)
        .filter((f) => typeof f.latitude === 'number' && typeof f.longitude === 'number')
        .map((f) => ({ lat: f.latitude, lon: f.longitude })),
    [sessionFrames]
  );

  const handleFlyTo = (targetLat, targetLon, label) => {
    const wpt = {
      id: `MAP-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`,
      name: label,
      lat: Number(targetLat.toFixed(5)),
      lon: Number(targetLon.toFixed(5)),
      alt: Math.round(alt || 8500),
      dist: 'LIVE',
      status: 'ACTIVE',
    };
    addWaypoint(wpt);
    sendCommand({ type: 'setWaypoint', payload: wpt });
  };

  const handleLandPad = (padId) => {
    initiateLanding(padId);
    setActivePanel(1); // Jump straight to 3D stage to watch automated pad landing!
  };

  // Radar polar math
  const pxPerKm = 440 / rangeKm;
  const rawX = eastKm * pxPerKm;
  const rawY = -northKm * pxPerKm;
  const offsetX = followUav ? -rawX : 0;
  const offsetY = followUav ? -rawY : 0;
  const uavX = rawX + offsetX;
  const uavY = rawY + offsetY;
  const isAlert = (telemetry?.anomalyScore ?? 0) > 0.5;
  const uavColor = isAlert ? '#f43f5e' : '#22d3ee';

  const radarTrail = useMemo(() => {
    return trail
      .map((f) => {
        const p = toLocalKm(f.lat, f.lon);
        return `${(p.eastKm * pxPerKm + offsetX).toFixed(1)},${(-p.northKm * pxPerKm + offsetY).toFixed(1)}`;
      })
      .join(' ');
  }, [trail, pxPerKm, offsetX, offsetY]);

  return (
    <div className="flex flex-col gap-4 font-mono select-none h-full">
      {/* Top Vector & Quick Landing Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <HoloPanel title="WGS84 POSITION" className="md:col-span-1">
          <div className="text-cyan-300 text-sm font-bold">LAT {lat.toFixed(5)}° N</div>
          <div className="text-cyan-300 text-sm font-bold">LON {Math.abs(lon).toFixed(5)}° W</div>
          <div className="text-slate-400 text-[10px] mt-1">
            HOME RANGE: <span className="text-amber-300 font-bold">{distHomeKm.toFixed(2)} KM</span>
          </div>
        </HoloPanel>

        <HoloPanel title="FLIGHT VECTOR" className="md:col-span-2">
          <div className="grid grid-cols-4 gap-2 text-center items-center h-full">
            <div>
              <div className="text-slate-400 text-[10px]">GS</div>
              <div className="text-cyan-300 text-xl font-bold">{speed.toFixed(0)}<span className="text-[10px] ml-0.5">KT</span></div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">HDG</div>
              <div className="text-cyan-300 text-xl font-bold">{String(Math.round(heading)).padStart(3, '0')}°</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">ALT</div>
              <div className="text-emerald-300 text-xl font-bold">{Math.round(alt)}<span className="text-[10px] ml-0.5">FT</span></div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">STATUS</div>
              <div className="text-amber-300 text-xs font-bold mt-1">{recon.flightStatus}</div>
            </div>
          </div>
        </HoloPanel>

        <HoloPanel title="PAD OPERATIONS" className="md:col-span-1">
          <div className="flex flex-col gap-1.5 justify-center h-full">
            {recon.flightStatus === 'LANDED' ? (
              <button
                onClick={() => {
                  initiateTakeoff(recon.activePadId);
                  setActivePanel(1);
                }}
                className="w-full py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/60 text-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <PlaneTakeoff size={13} /> TAKEOFF NOW
              </button>
            ) : (
              <button
                onClick={() => handleLandPad(recon.activePadId)}
                className="w-full py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/60 text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <PlaneLanding size={13} /> LAND @ {recon.activePadId.replace('PAD-', '')}
              </button>
            )}
            <div className="text-[9px] text-slate-400 text-center flex items-center justify-center gap-1">
              <Radio size={10} className={connected ? 'text-emerald-400' : 'text-amber-400'} />
              {connected ? 'LIVE TELEMETRY LOCKED' : 'SIM LINK ACTIVE'}
            </div>
          </div>
        </HoloPanel>
      </div>

      {/* Main Multi-Mode Map Viewport */}
      <HoloPanel title="GEOSPATIAL MAP, GOOGLE MAPS & TACTICAL RADAR" titleIcon={<Globe size={15} />} className="flex-1 min-h-[480px]">
        {/* Map Mode Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="glass-pill p-1 flex items-center gap-1">
            {[
              { id: 'SATELLITE', label: 'SATELLITE MAP (FREE)', icon: MapIcon },
              { id: 'GOOGLE', label: 'GOOGLE MAPS', icon: Globe },
              { id: 'RADAR', label: 'TACTICAL RADAR', icon: Compass },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setViewType(id)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  viewType === id
                    ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/60'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {viewType === 'SATELLITE' && (
              <>
                <div className="glass-pill p-1 flex items-center gap-1">
                  {['SATELLITE', 'DARK'].map((tl) => (
                    <button
                      key={tl}
                      onClick={() => setTileLayer(tl)}
                      className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer ${
                        tileLayer === tl ? 'bg-sky-400/25 text-white border border-sky-400/50' : 'text-slate-400'
                      }`}
                    >
                      {tl}
                    </button>
                  ))}
                </div>
                <div className="glass-pill p-1 flex items-center gap-1">
                  <button onClick={() => setZoom((z) => Math.max(11, z - 1))} className="p-1 text-cyan-300 hover:text-white cursor-pointer">
                    <Minus size={12} />
                  </button>
                  <span className="text-[10px] px-1 text-slate-300">Z{zoom}</span>
                  <button onClick={() => setZoom((z) => Math.min(17, z + 1))} className="p-1 text-cyan-300 hover:text-white cursor-pointer">
                    <Plus size={12} />
                  </button>
                </div>
              </>
            )}

            {viewType === 'GOOGLE' && (
              <>
                <div className="glass-pill p-1 flex items-center gap-1">
                  {['HYBRID', 'SATELLITE', 'TERRAIN'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setGmapStyle(st)}
                      className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer ${
                        gmapStyle === st ? 'bg-sky-400/25 text-white border border-sky-400/50' : 'text-slate-400'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowKeyInput((v) => !v)}
                  className="glass-pill px-2.5 py-1 text-[10px] text-amber-200 border-amber-400/50 flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound size={11} /> GMAPS KEY
                </button>
              </>
            )}

            {viewType === 'RADAR' && (
              <>
                <div className="glass-pill p-1 flex items-center gap-1">
                  {[2, 5, 10].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRangeKm(r)}
                      className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer ${
                        rangeKm === r ? 'bg-cyan-400/25 text-cyan-200 border border-cyan-400/50' : 'text-slate-400'
                      }`}
                    >
                      {r}KM
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setFollowUav((v) => !v)}
                  className={`glass-pill px-2.5 py-1 text-[10px] flex items-center gap-1 cursor-pointer ${
                    followUav ? 'text-cyan-200 border-cyan-400/60 bg-cyan-400/20' : 'text-slate-300'
                  }`}
                >
                  <Crosshair size={11} /> {followUav ? 'UAV LOCK' : 'GCS LOCK'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inline Google Maps API Key Entry */}
        {viewType === 'GOOGLE' && showKeyInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApiKeys({ googleMapsApiKey: gmapsDraft.trim() });
              setShowKeyInput(false);
            }}
            className="mb-3 p-2.5 rounded-xl bg-slate-900/90 border border-amber-400/40 flex flex-wrap items-center gap-2 text-xs"
          >
            <KeyRound size={14} className="text-amber-300" />
            <input
              type="password"
              value={gmapsDraft}
              onChange={(e) => setGmapsDraft(e.target.value)}
              placeholder="Paste Google Maps JavaScript API Key (AIza...)"
              className="flex-1 min-w-[220px] bg-slate-950 border border-white/15 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/60 text-emerald-200 font-bold text-[11px] cursor-pointer"
            >
              CONNECT GOOGLE MAPS
            </button>
          </form>
        )}

        {/* Active Map Renderer */}
        <div className="flex-1 w-full min-h-[430px] relative">
          {viewType === 'SATELLITE' && (
            <FreeSatelliteSlippyMap
              lat={lat}
              lon={lon}
              heading={heading}
              trail={trail}
              tileLayer={tileLayer}
              zoom={zoom}
              onFlyTo={handleFlyTo}
              onLandAtPad={handleLandPad}
              activePadId={recon.activePadId}
            />
          )}

          {viewType === 'GOOGLE' && (
            <GoogleMapsLiveCanvas
              apiKey={apiKeys.googleMapsApiKey}
              lat={lat}
              lon={lon}
              heading={heading}
              trail={trail}
              onFlyTo={handleFlyTo}
              onLandAtPad={handleLandPad}
              mapStyle={gmapStyle}
            />
          )}

          {viewType === 'RADAR' && (
            <div className="w-full h-full min-h-[430px] relative bg-[#040710]/90 rounded-xl border border-cyan-400/15 overflow-hidden flex items-center justify-center">
              <style>{`
                @keyframes radar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .radar-sweep-gpu { animation: radar-spin 5.5s linear infinite; transform-origin: 0px 0px; }
              `}</style>
              <svg viewBox="-500 -500 1000 1000" className="w-full h-full max-h-[60vh]">
                <defs>
                  <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.45" />
                  </linearGradient>
                </defs>
                {[110, 220, 330, 440].map((r, idx) => (
                  <g key={r}>
                    <circle cx="0" cy="0" r={r} fill={idx === 3 ? 'url(#radarGlow)' : 'none'} stroke="#38bdf8" strokeWidth="1" strokeOpacity={idx === 3 ? 0.35 : 0.16} strokeDasharray={idx === 3 ? undefined : '4,6'} />
                    <text x="6" y={-r + 14} fill="#64748b" fontSize="11">{((rangeKm * (idx + 1)) / 4).toFixed(1)}km</text>
                  </g>
                ))}
                <line x1="-460" y1="0" x2="460" y2="0" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.18" />
                <line x1="0" y1="-460" x2="0" y2="460" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.18" />
                <g className="radar-sweep-gpu">
                  <path d="M 0 0 L 0 -440 A 440 440 0 0 1 114 -425 Z" fill="url(#sweepGrad)" />
                  <line x1="0" y1="0" x2="114" y2="-425" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.8" />
                </g>
                {radarTrail && <polyline points={radarTrail} fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeOpacity="0.65" />}
                {LANDING_PADS.map((pad) => {
                  const p = toLocalKm(pad.lat, pad.lon);
                  const px = p.eastKm * pxPerKm + offsetX;
                  const py = -p.northKm * pxPerKm + offsetY;
                  return (
                    <g key={pad.id} transform={`translate(${px}, ${py})`} className="cursor-pointer" onClick={() => handleLandPad(pad.id)}>
                      <circle cx="0" cy="0" r="8" fill="none" stroke="#10b981" strokeWidth="2" />
                      <text x="12" y="4" fill="#10b981" fontSize="11" fontWeight="bold">{pad.shortName}</text>
                    </g>
                  );
                })}
                <g transform={`translate(${uavX}, ${uavY})`}>
                  <circle cx="0" cy="0" r="14" fill="none" stroke={uavColor} strokeWidth="1.5">
                    <animate attributeName="r" values="6;28" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                  <g transform={`rotate(${heading})`}>
                    <path d="M 0 -16 L 11 10 L 0 5 L -11 10 Z" fill={uavColor} />
                  </g>
                  <text x="16" y="-12" fill={uavColor} fontSize="14" fontWeight="bold">UAV-P1 • RTB {Math.round(rtbBearing)}°</text>
                </g>
              </svg>
            </div>
          )}
        </div>
      </HoloPanel>
    </div>
  );
}
