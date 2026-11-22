// Real-Time Gemini API Client with Function Calling for Live UAV Flight Control
import { LANDING_PADS } from './flightConfig';

export const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Fastest)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Agentic)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Legacy)' },
];

const FLIGHT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'control_vertical_flight',
        description:
          'Move the UAV vertically up or down, engage stationary GPS hover lock on a single spot, resume forward flight, or set a specific altitude in feet.',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              enum: ['ASCEND', 'DESCEND', 'HOLD', 'HOVER_LOCK', 'RESUME_FLIGHT', 'SET_ALTITUDE'],
              description: 'Vertical maneuver to execute.',
            },
            deltaFt: {
              type: 'NUMBER',
              description: 'Altitude change in feet when ascending or descending (e.g. 500 or 1500).',
            },
            targetAltitudeFt: {
              type: 'NUMBER',
              description: 'Absolute target altitude in feet (1200 to 18000) when action is SET_ALTITUDE.',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'land_or_takeoff',
        description:
          'Initiate an automated landing onto a specific designated landing pad/LZ or execute a takeoff back to cruise altitude.',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              enum: ['LAND', 'TAKEOFF'],
              description: 'Whether to land at a pad or take off.',
            },
            padId: {
              type: 'STRING',
              enum: ['PAD-ALPHA', 'PAD-BRAVO', 'PAD-VALLEY', 'PAD-CITY'],
              description: 'Designated landing zone / helipad ID.',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'set_flight_dynamics',
        description:
          'Adjust engine throttle, aircraft pitch/roll/flaps, landing gear, or engage/disengage WASD manual pilot mode.',
        parameters: {
          type: 'OBJECT',
          properties: {
            throttle: { type: 'NUMBER', description: 'Engine throttle percentage from 0 to 100.' },
            pitch: { type: 'NUMBER', description: 'Pitch input from -1 (nose down) to +1 (nose up).' },
            roll: { type: 'NUMBER', description: 'Roll/bank input from -1 (bank left) to +1 (bank right).' },
            flaps: { type: 'NUMBER', description: 'Flaps angle in degrees (0, 10, 20, 30, or 40).' },
            gearDown: { type: 'BOOLEAN', description: 'True to extend landing gear, false to retract.' },
            pilotMode: { type: 'BOOLEAN', description: 'Enable or disable manual keyboard WASD flight control.' },
          },
        },
      },
      {
        name: 'control_mission_systems',
        description:
          'Control 3D cameras, thermal FLIR/hologram optics, weather, ground rover deployment, maintenance bot repair, or fault scenarios.',
        parameters: {
          type: 'OBJECT',
          properties: {
            weatherMode: { type: 'STRING', enum: ['CLEAR', 'DUSK', 'STORM', 'SNOW_ICING'] },
            viewMode: { type: 'STRING', enum: ['SOLID', 'WIREFRAME', 'XRAY', 'THERMAL'] },
            assetMode: { type: 'STRING', enum: ['HEXA', 'CORE', 'RECON'] },
            cameraPreset: { type: 'STRING', enum: ['ISO', 'CHASE', 'GIMBAL', 'ROVER', 'TOP'] },
            roverAction: { type: 'STRING', enum: ['DEPLOY', 'RECALL'] },
            triggerRepair: { type: 'BOOLEAN', description: 'Trigger MAINT-01 laser repair & clear active faults.' },
            scenario: { type: 'STRING', enum: ['NOMINAL', 'STORM_ICING', 'ENGINE_CASCADE', 'EMERGENCY_RTB'] },
          },
        },
      },
      {
        name: 'navigate_to_coordinates',
        description: 'Steer the UAV autopilot to specific GPS latitude/longitude coordinates and altitude.',
        parameters: {
          type: 'OBJECT',
          properties: {
            lat: { type: 'NUMBER', description: 'Target latitude in decimal degrees.' },
            lon: { type: 'NUMBER', description: 'Target longitude in decimal degrees.' },
            altitudeFt: { type: 'NUMBER', description: 'Target cruise altitude in feet.' },
            label: { type: 'STRING', description: 'Waypoint label.' },
          },
          required: ['lat', 'lon'],
        },
      },
    ],
  },
];

function buildSystemInstruction(telemetry, recon) {
  const activeFaults = Object.entries(telemetry?.faults || {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  const healthPct = Math.round((1 - (telemetry?.anomalyScore || 0.03)) * 100);
  const padList = LANDING_PADS.map((p) => `${p.id} (${p.name} @ ${p.lat},${p.lon})`).join('; ');

  return `You are AEGIS, the real-time AI Flight Copilot & Avionics Health Officer onboard a multi-domain reconnaissance UAV digital twin.
Respond concisely (1-3 crisp aviation-style sentences) and ALWAYS call the provided flight-control tools whenever the pilot asks you to change altitude, ascend, descend, land, take off, adjust throttle/bank/pitch/gear/flaps, change weather, deploy the ground rover, switch FLIR/camera views, navigate to a point, or repair faults.

LIVE TELEMETRY SNAPSHOT:
- Flight Status: ${recon.flightStatus} | Active Pad: ${recon.activePadId} | Flight Mode: ${telemetry?.flightMode || 'LOITER'}
- RPM: ${Math.round(telemetry?.rpm || 0)} | Throttle: ${Math.round(telemetry?.actuators?.throttle ?? 55)}% | Airspeed: ${Math.round(telemetry?.groundSpeed || 0)} KTS
- Altitude: ${Math.round(telemetry?.densityAltitude || 8500)} FT | VSI: ${Math.round(telemetry?.verticalSpeed || 0)} FPM | Pitch: ${(telemetry?.pitchAngle || 0).toFixed(1)}° | Roll: ${(telemetry?.rollAngle || 0).toFixed(1)}°
- GPS: ${(telemetry?.latitude || 37.7749).toFixed(5)}°N, ${(telemetry?.longitude || -122.4194).toFixed(5)}°W | Heading: ${Math.round(telemetry?.heading || 0)}°
- Health: ${healthPct}% | Max CHT: ${Math.max(...(telemetry?.chts || [150])).toFixed(1)}°C | Oil: ${(telemetry?.oilPressure || 4.2).toFixed(2)} BAR | Bus: ${(telemetry?.batteryVoltage || 27.6).toFixed(1)}V | Est RUL: ${(telemetry?.rulHours || 1420).toFixed(1)} hrs
- Active Faults: ${activeFaults.length ? activeFaults.join(', ') : 'NONE'}
- Weather: ${recon.weatherMode} | Optics: ${recon.viewMode} | Asset: ${recon.assetMode} | Ground Rover: ${recon.groundBotState}
- Available Landing Pads: ${padList}`;
}

export async function queryGeminiFlightCopilot({
  apiKey,
  model = 'gemini-3.5-flash-lite',
  history = [],
  userMessage = '',
  audioBase64 = null,
  audioMimeType = 'audio/webm',
  telemetry,
  recon,
}) {
  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey) {
    throw new Error('NO_API_KEY');
  }

  const userParts = [];
  if (audioBase64) {
    const cleanMime = String(audioMimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
    userParts.push({
      inlineData: {
        mimeType: cleanMime,
        data: audioBase64,
      },
    });
    userParts.push({
      text:
        userMessage ||
        'Listen carefully to this live pilot voice command. Call the appropriate flight-control tools immediately and respond in 1-2 short cockpit sentences confirming what you heard and executed.',
    });
  } else {
    userParts.push({ text: userMessage });
  }

  const contents = [
    ...history.slice(-8).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: userParts },
  ];

  const payload = {
    systemInstruction: {
      parts: [{ text: buildSystemInstruction(telemetry, recon) }],
    },
    contents,
    tools: FLIGHT_TOOLS,
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 320,
    },
  };

  // Try chosen model first, automatically falling back if a model ID is unavailable for the user's key
  const candidates = [model, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );

  let lastErr = null;
  for (const mId of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      mId
    )}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const textParts = parts.filter((p) => typeof p.text === 'string').map((p) => p.text.trim());
      const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      return {
        modelUsed: mId,
        text: textParts.join(' ').trim(),
        functionCalls,
      };
    }

    const errText = await res.text();
    lastErr = `HTTP ${res.status} (${mId}): ${errText.slice(0, 180)}`;
    if (res.status !== 404) {
      // Auth/quota error -> don't keep retrying other models
      break;
    }
  }

  throw new Error(lastErr || 'Gemini API request failed');
}
