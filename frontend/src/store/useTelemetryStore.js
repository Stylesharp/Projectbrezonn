import { create } from 'zustand';
import { cockpitVoice } from '../utils/voiceEngine';
import {
  CRUISE_AIRCRAFT_Y,
  MIN_AIRBORNE_Y,
  MAX_AIRBORNE_Y,
  getPadById,
  flightRuntime,
} from '../utils/flightConfig';

function safeGetStorage(key, fallback = '') {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) || fallback : fallback;
  } catch {
    return fallback;
  }
}

function safeSetStorage(key, val) {
  try {
    if (typeof window !== 'undefined') {
      if (val) window.localStorage.setItem(key, val);
      else window.localStorage.removeItem(key);
    }
  } catch {
    // ignore storage quota / privacy mode errors
  }
}

const initialTelemetry = {
  timestamp: Date.now() / 1000,
  rpm: 2850,
  chts: [148, 152, 146, 149],
  egts: [485, 492, 480, 488],
  oilPressure: 4.3,
  oilTemp: 84.0,
  crankcasePressure: 1.1,
  hydPressure: 3000.0,
  hydTemp: 46.0,
  avionicsTemp: 34.0,
  batteryVoltage: 27.6,
  batteryAmps: 18.0,
  generatorLoad: 44.0,
  turboBoostPressure: 4.1,
  intercoolerTemp: 42.0,
  ambientTemp: -1.4,
  ambientPressure: 740.2,
  densityAltitude: 8500.0,
  verticalSpeed: 0.0,
  windSpeed: 12.5,
  windDir: 275,
  iceRisk: 0.08,
  weatherMode: 'CLEAR',
  flightMode: 'LOITER',
  pitchAngle: 1.8,
  rollAngle: -2.4,
  yawRate: 0.4,
  gLoad: 1.08,
  latitude: 37.7749,
  longitude: -122.4194,
  heading: 45,
  groundSpeed: 96,
  fuelLevelL: 50.0,
  fuelLevelR: 50.0,
  fuelUsedTotal: 0.0,
  anomalyScore: 0.03,
  rulHours: 1420.0,
  forecast: {
    chtRatePerMin: 0.2,
    oilRatePerMin: 0.0,
    voltRatePerMin: 0.0,
    predCht60s: 152.2,
    predOil60s: 4.3,
    predVolt60s: 27.6,
    secToThermalRedline: null,
    missionSurvivalPct: 99.9,
  },
  componentWear: {
    cyl1: 0.012,
    cyl2: 0.015,
    cyl3: 0.011,
    cyl4: 0.013,
    oilPump: 0.024,
    alternator: 0.018,
    turbo: 0.031,
    propGovernor: 0.015,
    bearings: 0.048,
    fuelPump: 0.022,
    hydraulics: 0.019,
    avionics: 0.009,
  },
  faults: {
    cyl2Overheat: false,
    oilLineRupture: false,
    mainBearingWear: false,
    propGovernorFail: false,
    carbIcingEvent: false,
    alternatorFailure: false,
    coolantLeakMajor: false,
    propStrike: false,
    hydLeak: false,
    avionicsOverheat: false,
  },
  actuators: {
    throttle: 55,
    mixture: 60,
    propPitch: 85,
    fuelSelector: 'BOTH',
    carbHeat: false,
    antiIce: false,
    generatorSwitch: true,
    autopilot: true,
    flaps: 0,
    gearDown: false,
    avionicsFan: true,
    hydPump: true,
  },
};

const INITIAL_CONTACTS = [
  { id: 'BIO-01', type: 'WILDLIFE', label: 'Cervidae Herd (x3)', thermalC: 37.4, confidence: 96.8, bearing: 128, distM: 42, status: 'TRACKING' },
  { id: 'BIO-02', type: 'WILDLIFE', label: 'Canid Patrol Signature', thermalC: 38.6, confidence: 93.2, bearing: 235, distM: 58, status: 'TRACKING' },
  { id: 'AVN-01', type: 'AVIAN', label: 'Raptor Flock (x4)', thermalC: 40.1, confidence: 91.5, bearing: 44, distM: 29, status: 'AIRSPACE WATCH' },
  { id: 'POI-04', type: 'TERRAIN', label: 'Thermal Ridge Vent', thermalC: 64.2, confidence: 98.1, bearing: 312, distM: 76, status: 'LOGGED' },
];

const INITIAL_WAYPOINTS = [
  { id: 'WPT-1', name: 'ALPHA (OUTPOST HELIPAD)', lat: 37.7749, lon: -122.4194, alt: 2500, dist: '0.0 NM', status: 'PASSED' },
  { id: 'WPT-2', name: 'BRAVO (RIDGE OUTPOST)', lat: 37.7860, lon: -122.4050, alt: 8500, dist: '1.1 NM', status: 'ACTIVE' },
  { id: 'WPT-3', name: 'CHARLIE (VALLEY LZ)', lat: 37.7810, lon: -122.4130, alt: 5200, dist: '1.8 NM', status: 'QUEUED' },
  { id: 'WPT-4', name: 'DELTA (SKYLINE PAD)', lat: 37.7915, lon: -122.4010, alt: 4800, dist: '2.9 NM', status: 'QUEUED' },
];

export const useTelemetryStore = create((set, get) => ({
  connected: false,
  latency: 18,
  telemetry: initialTelemetry,
  liveTelemetry: initialTelemetry,
  sessionFrames: [],
  activePanel: 1,

  replayIndex: null,
  replayPlaying: false,

  copilotOpen: false,
  voiceEnabled: false,

  // User-supplied API Keys (persisted in localStorage or Vite env vars)
  apiKeys: {
    geminiApiKey: safeGetStorage('aegis_gemini_api_key', import.meta.env.VITE_GEMINI_API_KEY || ''),
    geminiModel: safeGetStorage('aegis_gemini_model', 'gemini-3.5-flash-lite'),
    googleMapsApiKey: safeGetStorage('aegis_gmaps_api_key', import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''),
  },

  waypoints: INITIAL_WAYPOINTS,
  activeWaypointId: 'WPT-2',

  recon: {
    flightStatus: 'AIRBORNE', // AIRBORNE | APPROACHING_PAD | LANDING | LANDED | TAKING_OFF
    hoverHold: false, // GPS Position + Altitude Hover Lock
    activePadId: 'PAD-ALPHA',
    targetAltitudeFt: 8500,
    groundBotState: 'STOWED',
    groundBotBattery: 98,
    groundBotSamples: 2,
    helperSwarmActive: true,
    maintenanceBotActive: true,
    wildlifeEnabled: true,
    terrainEnabled: true,
    reconScanActive: true,
    airflowEnabled: true,
    lidarCloudEnabled: true,
    corridorEnabled: true,
    labelsEnabled: true,
    mapLayer: 'SATELLITE', // Synced between 2D Map & 3D Terrain: SATELLITE | DARK
    mapOverlayMode: 'SAT', // SAT | HOLO
    miniMapEnabled: true,
    pilotMode: false,
    weatherMode: 'CLEAR',
    viewMode: 'SOLID',
    assetMode: 'HEXA',
    cameraPreset: 'ISO',
    missionPhase: 'RECON LOITER',
    contacts: INITIAL_CONTACTS,
  },

  alarmLog: [
    {
      id: 'init-0',
      timestamp: Date.now() - 120000,
      message: 'AEGIS v5.0 VTOL Landing, Satellite Maps & Gemini AI Flight Control online',
      severity: 'INFO',
      component: 'AEGIS CORE',
    },
    {
      id: 'init-1',
      timestamp: Date.now() - 75000,
      message: '4 Designated Landing Zones locked (Alpha, Bravo, Valley LZ, Skyline)',
      severity: 'INFO',
      component: 'FLIGHT DECK',
    },
  ],

  setConnected: (status) => set({ connected: status }),
  setLatency: (ms) => set({ latency: ms }),
  setActivePanel: (index) => set({ activePanel: index }),
  setCopilotOpen: (open) => set({ copilotOpen: Boolean(open) }),

  setApiKeys: (partial) =>
    set((state) => {
      const next = { ...state.apiKeys, ...partial };
      if (partial.geminiApiKey !== undefined) safeSetStorage('aegis_gemini_api_key', partial.geminiApiKey.trim());
      if (partial.geminiModel !== undefined) safeSetStorage('aegis_gemini_model', partial.geminiModel.trim());
      if (partial.googleMapsApiKey !== undefined) safeSetStorage('aegis_gmaps_api_key', partial.googleMapsApiKey.trim());
      return { apiKeys: next };
    }),

  toggleVoice: () =>
    set((state) => {
      const next = !state.voiceEnabled;
      cockpitVoice.setEnabled(next);
      if (next) cockpitVoice.speak('Aegis cockpit voice annunciator online.', 'voice-init', 500);
      return { voiceEnabled: next };
    }),

  setReplayIndex: (idx) =>
    set((state) => {
      if (idx === null || state.sessionFrames.length === 0) {
        return { replayIndex: null, replayPlaying: false, telemetry: state.liveTelemetry };
      }
      const clamped = Math.max(0, Math.min(state.sessionFrames.length - 1, idx));
      return { replayIndex: clamped, telemetry: state.sessionFrames[clamped] };
    }),

  setReplayPlaying: (playing) => set({ replayPlaying: Boolean(playing) }),

  addWaypoint: (wpt) =>
    set((state) => ({
      waypoints: [...state.waypoints, wpt],
    })),

  setActiveWaypointId: (id) =>
    set((state) => ({
      activeWaypointId: id,
      waypoints: state.waypoints.map((w) => ({
        ...w,
        status: w.id === id ? 'ACTIVE' : w.status === 'ACTIVE' ? 'QUEUED' : w.status,
      })),
    })),

  setHoverHold: (flag) =>
    set((state) => {
      const next = Boolean(flag);
      if (next) {
        flightRuntime.verticalInput = 0;
        flightRuntime.targetAircraftY = flightRuntime.aircraftY;
        cockpitVoice.speak('Position hold engaged. Hovering on station.', 'hover-on', 1500);
      } else {
        cockpitVoice.speak('Hover hold released. Resuming forward flight.', 'hover-off', 1500);
      }
      return {
        recon: {
          ...state.recon,
          hoverHold: next,
          missionPhase: next ? 'STATION HOVER LOCK' : 'RECON LOITER',
        },
        alarmLog: [
          {
            id: `hov-${Date.now()}`,
            timestamp: Date.now(),
            message: next
              ? 'GPS Station-Keeping Hover Lock ENGAGED — zero ground drift'
              : 'Hover Lock RELEASED — resuming forward flight cruise',
            severity: 'INFO',
            component: 'FLIGHT DECK',
          },
          ...state.alarmLog,
        ].slice(0, 150),
      };
    }),

  toggleHoverHold: () => {
    const cur = get().recon.hoverHold;
    get().setHoverHold(!cur);
  },

  // Vertical Up / Down Altitude Controls
  nudgeAltitude: (deltaUnits) =>
    set((state) => {
      if (state.recon.flightStatus === 'LANDED') {
        if (deltaUnits > 0) {
          flightRuntime.targetAircraftY = CRUISE_AIRCRAFT_Y;
          cockpitVoice.speak('Initiating vertical takeoff.', 'takeoff-auto', 2000);
          return {
            recon: {
              ...state.recon,
              flightStatus: 'TAKING_OFF',
              missionPhase: 'TAKEOFF CLIMB',
              targetAltitudeFt: 8500,
            },
          };
        }
        return state;
      }
      const nextY = Math.max(MIN_AIRBORNE_Y, Math.min(MAX_AIRBORNE_Y, flightRuntime.targetAircraftY + deltaUnits));
      flightRuntime.targetAircraftY = nextY;
      const nextFt = Math.round(1800 + ((nextY - MIN_AIRBORNE_Y) / (MAX_AIRBORNE_Y - MIN_AIRBORNE_Y)) * 14200);
      return {
        recon: { ...state.recon, targetAltitudeFt: nextFt },
      };
    }),

  setTargetAltitudeFt: (altFt) =>
    set((state) => {
      const clampedFt = Math.max(1200, Math.min(18000, Number(altFt) || 8500));
      const norm = (clampedFt - 1800) / 14200;
      flightRuntime.targetAircraftY = Math.max(
        MIN_AIRBORNE_Y,
        Math.min(MAX_AIRBORNE_Y, MIN_AIRBORNE_Y + norm * (MAX_AIRBORNE_Y - MIN_AIRBORNE_Y))
      );
      const nextStatus = state.recon.flightStatus === 'LANDED' ? 'TAKING_OFF' : state.recon.flightStatus;
      return {
        recon: { ...state.recon, flightStatus: nextStatus, targetAltitudeFt: clampedFt },
      };
    }),

  // Automated Approach & Landing at a Designated Pad
  initiateLanding: (padId) =>
    set((state) => {
      const pad = getPadById(padId || state.recon.activePadId);
      cockpitVoice.speak(`Approaching ${pad.name} for automated landing.`, 'land-init', 2000);
      return {
        recon: {
          ...state.recon,
          activePadId: pad.id,
          flightStatus: 'APPROACHING_PAD',
          hoverHold: false,
          missionPhase: `APPROACH // ${pad.shortName}`,
        },
        alarmLog: [
          {
            id: `land-${Date.now()}`,
            timestamp: Date.now(),
            message: `Automated approach & landing sequence locked onto ${pad.name}`,
            severity: 'INFO',
            component: 'AUTOLAND SYSTEM',
          },
          ...state.alarmLog,
        ].slice(0, 150),
      };
    }),

  // Automated Vertical Takeoff from Current Pad
  initiateTakeoff: (padId) =>
    set((state) => {
      const pad = getPadById(padId || state.recon.activePadId);
      flightRuntime.targetAircraftY = CRUISE_AIRCRAFT_Y;
      cockpitVoice.speak(`Takeoff clearance confirmed from ${pad.name}. Climbing to cruise.`, 'takeoff-init', 2000);
      return {
        recon: {
          ...state.recon,
          activePadId: pad.id,
          flightStatus: 'TAKING_OFF',
          targetAltitudeFt: 8500,
          missionPhase: 'TAKEOFF CLIMB',
        },
        alarmLog: [
          {
            id: `to-${Date.now()}`,
            timestamp: Date.now(),
            message: `Takeoff initiated from ${pad.name} — climbing to 8,500 FT`,
            severity: 'INFO',
            component: 'FLIGHT DECK',
          },
          ...state.alarmLog,
        ].slice(0, 150),
      };
    }),

  setFlightStatus: (status) =>
    set((state) => {
      const pad = getPadById(state.recon.activePadId);
      let phase = state.recon.missionPhase;
      let extraAlarm = null;
      if (status === 'LANDING') {
        phase = `FINAL DESCENT // ${pad.shortName}`;
      } else if (status === 'LANDED') {
        phase = `LANDED // ${pad.shortName}`;
        cockpitVoice.speak(`Touchdown confirmed at ${pad.name}. Engines at ground idle.`, 'landed-ok', 3000);
        extraAlarm = {
          id: `td-${Date.now()}`,
          timestamp: Date.now(),
          message: `Touchdown confirmed at ${pad.name} — rotors in ground idle`,
          severity: 'INFO',
          component: 'AUTOLAND SYSTEM',
        };
      } else if (status === 'AIRBORNE') {
        phase = state.recon.groundBotState === 'ROVING' ? 'MULTI-DOMAIN RECON' : 'RECON LOITER';
      }
      return {
        recon: { ...state.recon, flightStatus: status, missionPhase: phase },
        alarmLog: extraAlarm ? [extraAlarm, ...state.alarmLog].slice(0, 150) : state.alarmLog,
      };
    }),

  setReconOption: (key, value) =>
    set((state) => {
      if (key === 'weatherMode') {
        cockpitVoice.speak(`Weather profile set to ${String(value).replace('_', ' ')}`, 'wx-change', 2500);
      }
      if (key === 'pilotMode') {
        cockpitVoice.speak(value ? 'Manual flight controls engaged.' : 'Autopilot mode restored.', 'pilot-mode', 2000);
      }
      return { recon: { ...state.recon, [key]: value } };
    }),

  setGroundBotState: (nextState) =>
    set((state) => {
      const msgMap = {
        DEPLOYING: 'UGV Ground Rover deployment initiated — payload bay open',
        ROVING: 'UGV Ground Rover touchdown confirmed — autonomous surface recon active',
        RECALLING: 'UGV Ground Rover returning to extraction point',
        STOWED: 'UGV Ground Rover docked & locked in payload bay',
      };
      const voiceMap = {
        DEPLOYING: 'Deploying ground rover.',
        ROVING: 'Ground rover touchdown confirmed.',
        RECALLING: 'Recalling ground rover.',
        STOWED: 'Ground rover stowed.',
      };
      if (voiceMap[nextState]) cockpitVoice.speak(voiceMap[nextState], `ugv-${nextState}`, 2000);

      const alarm = {
        id: `ugv-${Date.now()}`,
        timestamp: Date.now(),
        message: msgMap[nextState] || `UGV state -> ${nextState}`,
        severity: 'INFO',
        component: 'UGV GROUND ROVER',
      };
      return {
        recon: { ...state.recon, groundBotState: nextState },
        alarmLog: [alarm, ...state.alarmLog].slice(0, 150),
      };
    }),

  logReconSample: (label) =>
    set((state) => {
      cockpitVoice.speak('Lidar bio scan verified and logged.', 'lidar-scan', 2500);
      return {
        recon: {
          ...state.recon,
          groundBotSamples: state.recon.groundBotSamples + 1,
          contacts: [
            {
              id: `SIG-${Math.floor(10 + Math.random() * 89)}`,
              type: 'ROVER SCAN',
              label,
              thermalC: Number((28 + Math.random() * 14).toFixed(1)),
              confidence: Number((92 + Math.random() * 7).toFixed(1)),
              bearing: Math.floor(Math.random() * 360),
              distM: Math.floor(15 + Math.random() * 55),
              status: 'VERIFIED',
            },
            ...state.recon.contacts,
          ].slice(0, 12),
        },
        alarmLog: [
          {
            id: `scan-${Date.now()}`,
            timestamp: Date.now(),
            message: `Surface/Bio-Recon verified: ${label}`,
            severity: 'INFO',
            component: 'RECON AI VISION',
          },
          ...state.alarmLog,
        ].slice(0, 150),
      };
    }),

  updateTelemetry: (data) => {
    const prev = get().liveTelemetry;
    const now = Date.now();
    const newAlarms = [];

    if (prev) {
      if (data.oilPressure < 1.5 && prev.oilPressure >= 1.5) {
        cockpitVoice.speak('Warning. Critical oil pressure loss.', 'oil-crit', 8000);
        newAlarms.push({
          id: `oil-${now}`,
          timestamp: now,
          message: `Critical Oil Pressure droop detected (${data.oilPressure.toFixed(2)} BAR)`,
          severity: 'CRITICAL',
          component: 'LUBRICATION PUMP',
        });
      }
      if (data.chts[1] > 230 && prev.chts[1] <= 230) {
        cockpitVoice.speak('Warning. Cylinder two thermal runaway.', 'cht-crit', 8000);
        newAlarms.push({
          id: `c2-${now}`,
          timestamp: now,
          message: `Cylinder 2 Thermal Runaway alert (${data.chts[1].toFixed(1)} °C)`,
          severity: 'CRITICAL',
          component: 'CYLINDER 2 HEAD',
        });
      }
      if (data.batteryVoltage < 22.0 && prev.batteryVoltage >= 22.0) {
        cockpitVoice.speak('Caution. Main bus undervoltage.', 'volt-warn', 8000);
        newAlarms.push({
          id: `bat-${now}`,
          timestamp: now,
          message: `28V Main Bus undervoltage (${data.batteryVoltage.toFixed(1)} V)`,
          severity: 'WARNING',
          component: 'ELECTRICAL POWER BUS',
        });
      }
      if (data.hydPressure < 1800 && prev.hydPressure >= 1800) {
        cockpitVoice.speak('Warning. Hydraulic pressure failure.', 'hyd-crit', 8000);
        newAlarms.push({
          id: `hyd-${now}`,
          timestamp: now,
          message: `Hydraulic surface line pressure loss (${data.hydPressure.toFixed(0)} PSI)`,
          severity: 'CRITICAL',
          component: 'HYDRAULIC POWER UNIT',
        });
      }
      if (data.rulHours < 1.0 && prev.rulHours >= 1.0) {
        newAlarms.push({
          id: `rul-${now}`,
          timestamp: now,
          message: `Predictive R.U.L. critical threshold: ${(data.rulHours * 60).toFixed(0)} MINS remaining`,
          severity: 'CRITICAL',
          component: 'AI PROGNOSTICS CORE',
        });
      }
    }

    set((state) => {
      const updatedFrames = [...state.sessionFrames, data];
      if (updatedFrames.length > 600) updatedFrames.shift();

      const updatedAlarms =
        newAlarms.length > 0 ? [...newAlarms, ...state.alarmLog].slice(0, 150) : state.alarmLog;

      const isReplaying = state.replayIndex !== null;
      return {
        liveTelemetry: data,
        telemetry: isReplaying ? state.telemetry : data,
        sessionFrames: updatedFrames,
        alarmLog: updatedAlarms,
      };
    });
  },

  addAlarm: (alarm) =>
    set((state) => ({
      alarmLog: [
        { ...alarm, id: Math.random().toString(36).substring(7), timestamp: Date.now() },
        ...state.alarmLog,
      ].slice(0, 150),
    })),

  clearAlarms: () => set({ alarmLog: [] }),
}));
