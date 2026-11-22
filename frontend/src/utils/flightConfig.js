// Unified Authoritative GPS <-> 3D World Coordinate System
// 1 World Unit = 100 Meters (72x72 terrain mesh = 7.2 km x 7.2 km real-world area)
export const BASE_LAT = 37.7749;
export const BASE_LON = -122.4194;
export const METERS_PER_WORLD_UNIT = 100.0;
export const COS_BASE_LAT = Math.cos((BASE_LAT * Math.PI) / 180);

export const TERRAIN_BASE_Y = -6.2;
export const CRUISE_AIRCRAFT_Y = 1.8;
export const MIN_AIRBORNE_Y = -2.8;
export const MAX_AIRBORNE_Y = 4.8;
export const WORLD_SPAN = 56;
export const HALF_SPAN = WORLD_SPAN / 2;

// Convert WGS84 GPS (lat, lon) -> North-Up 3D World (wx = East, wz = South)
export function latLonToWorldXZ(lat, lon) {
  const eastMeters = (lon - BASE_LON) * 111320 * COS_BASE_LAT;
  const northMeters = (lat - BASE_LAT) * 111320;
  return {
    wx: eastMeters / METERS_PER_WORLD_UNIT,
    wz: -northMeters / METERS_PER_WORLD_UNIT,
  };
}

// Convert North-Up 3D World (wx, wz) -> WGS84 GPS (lat, lon)
export function worldXZToLatLon(wx, wz) {
  const eastMeters = wx * METERS_PER_WORLD_UNIT;
  const northMeters = -wz * METERS_PER_WORLD_UNIT;
  return {
    lat: BASE_LAT + northMeters / 111320,
    lon: BASE_LON + eastMeters / (111320 * COS_BASE_LAT),
  };
}

// Designated Landing & Takeoff Pads — 3D (wx, wz) is derived DIRECTLY from real GPS (lat, lon)!
const RAW_PADS = [
  {
    id: 'PAD-ALPHA',
    name: 'Civic Center Helipad Alpha',
    shortName: 'ALPHA PAD',
    lat: 37.7749,
    lon: -122.4194,
    padHeight: 0.12,
    type: 'OUTPOST',
    desc: 'Primary Forward Operating Base Helipad',
  },
  {
    id: 'PAD-BRAVO',
    name: 'Embarcadero Outpost Bravo',
    shortName: 'BRAVO PAD',
    lat: 37.7860,
    lon: -122.4050,
    padHeight: 0.12,
    type: 'OUTPOST',
    desc: 'Waterfront Recon Helipad & Radar',
  },
  {
    id: 'PAD-VALLEY',
    name: 'Mission Valley LZ',
    shortName: 'VALLEY LZ',
    lat: 37.7685,
    lon: -122.4140,
    padHeight: 0.08,
    type: 'CLEARING',
    desc: 'Lowland Clearing / UGV Rover LZ',
  },
  {
    id: 'PAD-CITY',
    name: 'Financial Skyline LZ',
    shortName: 'SKYLINE LZ',
    lat: 37.7915,
    lon: -122.4010,
    padHeight: 0.12,
    type: 'URBAN',
    desc: 'Downtown High-Rise Sector Tactical Pad',
  },
];

export const LANDING_PADS = RAW_PADS.map((p) => {
  const { wx, wz } = latLonToWorldXZ(p.lat, p.lon);
  return { ...p, wx, wz };
});

export function getPadById(id) {
  return LANDING_PADS.find((p) => p.id === id) || LANDING_PADS[0];
}

// High-frequency 60 FPS flight runtime shared across 3D scene & GPS sync
export const flightRuntime = {
  aircraftY: CRUISE_AIRCRAFT_Y,
  targetAircraftY: CRUISE_AIRCRAFT_Y,
  verticalInput: 0,
  verticalVelocity: 0,
  groundElevationBelow: TERRAIN_BASE_Y,
  aglUnits: CRUISE_AIRCRAFT_Y - TERRAIN_BASE_Y,
  horizontalSpeed: 2.2,
  padDistance: 99,
  liveLat: BASE_LAT,
  liveLon: BASE_LON,
  liveHeadingDeg: 45,
};
