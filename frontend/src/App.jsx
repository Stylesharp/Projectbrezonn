import React, { useEffect, useRef } from 'react';
import { useTelemetryStore } from './store/useTelemetryStore';
import { flightRuntime } from './utils/flightConfig';
import { GlobalHeader } from './components/GlobalHeader';
import { Sidebar } from './components/Sidebar';
import { AlertManager } from './components/AlertManager';
import { Engine3DViewer } from './components/Engine3DViewer';
import { AiCopilotDrawer } from './components/AiCopilotDrawer';
import { BlackboxReplayBar } from './components/BlackboxReplayBar';

import { TelemetryTab } from './tabs/TelemetryTab';
import { ReconMissionTab } from './tabs/ReconMissionTab';
import { AiAnalyticsTab } from './tabs/AiAnalyticsTab';
import { SimulatorTab } from './tabs/SimulatorTab';
import { LogsTab } from './tabs/LogsTab';
import { EnvironmentalTab } from './tabs/EnvironmentalTab';
import { MissionPlanningTab } from './tabs/MissionPlanningTab';
import { FlightDynamicsTab } from './tabs/FlightDynamicsTab';
import { TacticalMapTab } from './tabs/TacticalMapTab';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'localhost:8000';
const WS_URL = import.meta.env.PROD
  ? `wss://${BACKEND_URL}/ws/twin`
  : `ws://${BACKEND_URL}/ws/twin`;

export default function App() {
  const { setConnected, updateTelemetry, setLatency, activePanel, setCopilotOpen } = useTelemetryStore();
  const wsRef = useRef(null);
  const lastFrameTimeRef = useRef(performance.now());
  const localOverridesRef = useRef({
    actuators: {},
    faults: {},
    weatherMode: 'CLEAR',
    flightMode: 'LOITER',
    manualControl: { pitch: 0, roll: 0 },
    waypoint: null,
    directPos: null,
  });

  // Global Ctrl+K / Cmd+K shortcut for AI Copilot Drawer
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCopilotOpen(!useTelemetryStore.getState().copilotOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCopilotOpen]);

  useEffect(() => {
    let reconnectTimeout;
    let fallbackInterval;
    let isLive = false;

    const startOfflineFallback = () => {
      if (fallbackInterval) return;
      fallbackInterval = setInterval(() => {
        if (isLive) return;
        const t = Date.now() / 1000;
        const st = useTelemetryStore.getState();
        const prev = st.liveTelemetry;
        const ov = localOverridesRef.current;

        const throttle = ov.actuators.throttle ?? (prev.actuators.throttle ?? 55);
        const oilRupture = ov.faults.oilLineRupture ?? prev.faults.oilLineRupture;
        const cyl2Hot = ov.faults.cyl2Overheat ?? prev.faults.cyl2Overheat;
        const propStrike = ov.faults.propStrike ?? prev.faults.propStrike;
        const hydLeak = ov.faults.hydLeak ?? prev.faults.hydLeak;
        const avionicsHot = ov.faults.avionicsOverheat ?? prev.faults.avionicsOverheat;
        const altFail = ov.faults.alternatorFailure ?? prev.faults.alternatorFailure;
        const bearingWear = ov.faults.mainBearingWear ?? prev.faults.mainBearingWear;
        const coolantLeak = ov.faults.coolantLeakMajor ?? prev.faults.coolantLeakMajor;
        const carbIce = ov.faults.carbIcingEvent ?? prev.faults.carbIcingEvent;

        const wx = st.recon.weatherMode || ov.weatherMode || 'CLEAR';
        const isManual = st.recon.pilotMode || ov.flightMode === 'MANUAL_PILOT';
        const turb = wx === 'STORM' ? 3.2 : wx === 'SNOW_ICING' ? 1.5 : 0.4;

        const isStationary = Boolean(st.recon.hoverHold) || st.recon.flightStatus === 'LANDED';
        const targetPitch = isStationary
          ? 0
          : isManual
          ? ov.manualControl.pitch * 18
          : Math.sin(t * 0.6) * 4.0 + (Math.random() - 0.5) * turb;
        const targetRoll = isStationary
          ? 0
          : isManual
          ? ov.manualControl.roll * 30
          : Math.cos(t * 0.45) * 10.5 + (Math.random() - 0.5) * turb * 1.4;

        const pitchAngle = prev.pitchAngle + (targetPitch - prev.pitchAngle) * 0.25;
        const rollAngle = prev.rollAngle + (targetRoll - prev.rollAngle) * 0.25;

        const isLanded = st.recon.flightStatus === 'LANDED';
        const isHovering = Boolean(st.recon.hoverHold) && st.recon.flightStatus === 'AIRBORNE';
        const targetRpm = propStrike ? 0 : isLanded ? 440 : isHovering ? 2450 + Math.sin(t * 2.0) * 25 : (850 + throttle * 44) * (carbIce ? 0.65 : 1.0) + Math.sin(t * 2.1) * 35;
        const groundSpeed = propStrike || isLanded || isHovering ? 0 : throttle <= 12 ? 0 : 48 + throttle * 0.95;
        let yawRate = isHovering || isLanded ? 0 : isManual ? rollAngle * 0.65 : 2.6;
        let heading = prev.heading || 45;
        let lat = prev.latitude || 37.7749;
        let lon = prev.longitude || -122.4194;

        if (ov.directPos) {
          lat = ov.directPos.lat;
          lon = ov.directPos.lon;
          if (typeof ov.directPos.heading === 'number') heading = ov.directPos.heading;
          ov.directPos = null;
        } else if (!isHovering && !isLanded && groundSpeed > 0) {
          // If user clicked a waypoint on the 2D Map, steer directly toward it!
          if (!isManual && ov.waypoint) {
            const dLat = ov.waypoint.lat - lat;
            const dLon = (ov.waypoint.lon - lon) * Math.cos((37.7749 * Math.PI) / 180);
            const distDeg = Math.hypot(dLat, dLon);
            if (distDeg < 0.0008) {
              ov.waypoint = null;
            } else {
              const desiredHdg = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
              const err = ((desiredHdg - heading + 540) % 360) - 180;
              yawRate = Math.max(-24, Math.min(24, err * 0.85));
            }
          }
          heading = (heading + yawRate * 0.15 + 360) % 360;
          const rad = (heading * Math.PI) / 180;
          // Accurate real-world GPS step (~1.5 - 2.6 world units/sec matching 3D satellite map scale)
          const metersStep = (groundSpeed * 1.45) * 0.15;
          lat += (metersStep * Math.cos(rad)) / 111320;
          lon += (metersStep * Math.sin(rad)) / (111320 * Math.cos((37.7749 * Math.PI) / 180));
        }

        const prevAlt = prev.densityAltitude || 8500;
        const aglBasedAlt = Math.max(0, Math.round(flightRuntime.aglUnits * 1100));
        const nextAlt = isLanded ? 120 : aglBasedAlt;
        const verticalSpeed = ((nextAlt - prevAlt) / 0.15) * 60;

        const anyFault =
          oilRupture || cyl2Hot || propStrike || hydLeak || avionicsHot || altFail || bearingWear || coolantLeak || carbIce;
        const baseTempBoost = coolantLeak ? 80 : 0;
        const cht2 = (cyl2Hot ? 252 : 148 + baseTempBoost + throttle * 0.6) + Math.cos(t * 1.3) * 2.5;
        const oilPress = oilRupture ? 0.72 : 3.8 + (throttle / 100) * 1.1 + Math.sin(t) * 0.08;
        const rul = propStrike ? 0 : anyFault ? 0.48 : 1418.4;

        const nextTelemetry = {
          ...prev,
          timestamp: t,
          rpm: Math.max(0, targetRpm),
          chts: [
            142 + baseTempBoost + throttle * 0.55 + Math.sin(t) * 2,
            cht2,
            139 + baseTempBoost + throttle * 0.52 + Math.sin(t * 0.8) * 2,
            141 + baseTempBoost + throttle * 0.54 + Math.cos(t * 1.1) * 2,
          ],
          egts: [420 + throttle * 2.1, 435 + throttle * 2.2, 418 + throttle * 2.0, 425 + throttle * 2.1],
          oilPressure: oilPress,
          oilTemp: 82 + throttle * 0.25,
          hydPressure: hydLeak ? 260 : 3000 + Math.sin(t) * 15,
          batteryVoltage: altFail ? 20.6 : 27.6,
          avionicsTemp: avionicsHot ? 84.5 : 35.5 + Math.sin(t * 0.4) * 1.8,
          windSpeed: wx === 'STORM' ? 38 + Math.sin(t) * 4 : wx === 'SNOW_ICING' ? 24 : 12.5,
          iceRisk: carbIce || wx === 'SNOW_ICING' ? 0.78 : wx === 'STORM' ? 0.32 : 0.08,
          weatherMode: wx,
          flightMode: isManual ? 'MANUAL_PILOT' : ov.flightMode,
          pitchAngle,
          rollAngle,
          yawRate,
          gLoad: Math.max(0.5, 1.0 + Math.abs(rollAngle) / 52 + Math.abs(pitchAngle) / 80),
          densityAltitude: nextAlt,
          verticalSpeed,
          latitude: lat,
          longitude: lon,
          heading,
          groundSpeed,
          anomalyScore: anyFault ? 0.78 : 0.03 + Math.abs(Math.sin(t * 0.3)) * 0.03,
          rulHours: rul,
          forecast: {
            chtRatePerMin: cyl2Hot ? 14.5 : 0.2,
            oilRatePerMin: oilRupture ? -1.8 : 0.0,
            voltRatePerMin: altFail ? -0.9 : 0.0,
            predCht60s: Math.min(285, cht2 + (cyl2Hot ? 14.5 : 0.4)),
            predOil60s: Math.max(0.2, oilPress - (oilRupture ? 0.4 : 0)),
            predVolt60s: altFail ? 19.7 : 27.6,
            secToThermalRedline: cyl2Hot ? 0 : coolantLeak ? 45 : null,
            missionSurvivalPct: propStrike ? 1.0 : anyFault ? 36.4 : 99.9,
          },
          actuators: { ...prev.actuators, ...ov.actuators, throttle },
          faults: { ...prev.faults, ...ov.faults },
        };

        updateTelemetry(nextTelemetry);
        setLatency(Math.round(16 + Math.random() * 6));
      }, 150);
    };

    const connect = () => {
      try {
        wsRef.current = new WebSocket(WS_URL);
      } catch {
        startOfflineFallback();
        return;
      }

      wsRef.current.onopen = () => {
        isLive = true;
        clearInterval(fallbackInterval);
        fallbackInterval = null;
        setConnected(true);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const now = performance.now();
          const data = JSON.parse(event.data);
          if (data.type === 'telemetry') {
            updateTelemetry(data.payload);
            const serverDelta = data.payload?.timestamp
              ? Math.abs(Date.now() - data.payload.timestamp * 1000)
              : now - lastFrameTimeRef.current;
            const smoothed = Math.min(
              250,
              Math.max(4, Math.round(serverDelta < 500 ? serverDelta : now - lastFrameTimeRef.current))
            );
            setLatency(smoothed);
            lastFrameTimeRef.current = now;
          }
        } catch (e) {
          console.error('Telemetry parse error:', e);
        }
      };

      wsRef.current.onerror = () => wsRef.current?.close();
      wsRef.current.onclose = () => {
        isLive = false;
        setConnected(false);
        startOfflineFallback();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      clearInterval(fallbackInterval);
      wsRef.current?.close();
    };
  }, [setConnected, updateTelemetry, setLatency]);

  const sendCommand = (cmd) => {
    const ov = localOverridesRef.current;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
    // Mirror locally so offline simulation stays 100% responsive
    if (cmd?.type === 'setActuator' && cmd.payload) {
      ov.actuators[cmd.payload.key] = cmd.payload.value;
    } else if ((cmd?.type === 'setFault' || cmd?.type === 'toggleFault') && cmd.payload) {
      ov.faults[cmd.payload.key] = cmd.payload.value;
    } else if (cmd?.type === 'setWeather' && cmd.payload) {
      ov.weatherMode = cmd.payload.mode;
    } else if (cmd?.type === 'setFlightMode' && cmd.payload) {
      ov.flightMode = cmd.payload.mode;
    } else if (cmd?.type === 'setManualControl' && cmd.payload) {
      ov.manualControl = { pitch: cmd.payload.pitch ?? 0, roll: cmd.payload.roll ?? 0 };
    } else if (cmd?.type === 'setWaypoint' && cmd.payload) {
      ov.waypoint = { lat: Number(cmd.payload.lat), lon: Number(cmd.payload.lon) };
      ov.flightMode = 'WAYPOINT_NAV';
    } else if (cmd?.type === 'setPosition' && cmd.payload) {
      ov.directPos = { lat: Number(cmd.payload.lat), lon: Number(cmd.payload.lon), heading: cmd.payload.heading };
    } else if (cmd?.type === 'triggerScenario' && cmd.payload) {
      const name = String(cmd.payload.name || '').toUpperCase();
      if (name === 'NOMINAL') {
        ov.actuators = { throttle: 55 };
        ov.faults = {
          cyl2Overheat: false, oilLineRupture: false, mainBearingWear: false,
          propGovernorFail: false, carbIcingEvent: false, alternatorFailure: false,
          coolantLeakMajor: false, propStrike: false, hydLeak: false, avionicsOverheat: false,
        };
        ov.weatherMode = 'CLEAR';
        ov.flightMode = 'LOITER';
      } else if (name === 'STORM_ICING') {
        ov.weatherMode = 'SNOW_ICING';
        ov.faults.carbIcingEvent = true;
        ov.actuators.throttle = 72;
      } else if (name === 'ENGINE_CASCADE') {
        ov.weatherMode = 'STORM';
        ov.faults.cyl2Overheat = true;
        ov.faults.oilLineRupture = true;
        ov.actuators.throttle = 88;
      } else if (name === 'EMERGENCY_RTB') {
        ov.flightMode = 'EMERGENCY_RTB';
        ov.actuators.throttle = 40;
      }
    } else if (cmd?.type === 'resetSimulation') {
      ov.actuators = { throttle: 55 };
      ov.faults = {};
      ov.weatherMode = 'CLEAR';
      ov.flightMode = 'LOITER';
    }
  };

  const renderActiveTab = () => {
    switch (activePanel) {
      case 0: return <TelemetryTab />;
      case 1: return null;
      case 2: return <ReconMissionTab />;
      case 3: return <AiAnalyticsTab />;
      case 4: return <SimulatorTab sendCommand={sendCommand} />;
      case 5: return <LogsTab sendCommand={sendCommand} />;
      case 6: return <EnvironmentalTab />;
      case 7: return <MissionPlanningTab sendCommand={sendCommand} />;
      case 8: return <FlightDynamicsTab />;
      case 9: return <TacticalMapTab sendCommand={sendCommand} />;
      default: return <TelemetryTab />;
    }
  };

  return (
    <div className="w-full h-screen flex flex-col relative overflow-hidden text-sm bg-[#040710] font-mono">
      <div className="absolute inset-0 z-10 pointer-events-auto">
        <Engine3DViewer sendCommand={sendCommand} />
      </div>

      <div className="absolute inset-0 z-20 flex flex-col pointer-events-none">
        <div className="pointer-events-auto w-full shrink-0">
          <GlobalHeader />
        </div>
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="pointer-events-auto h-full shrink-0">
            <Sidebar />
          </div>
          <main className="flex-1 h-full p-4 overflow-y-auto pointer-events-none min-w-0">
            <div className={`min-h-full pb-12 ${activePanel !== 1 ? 'pointer-events-auto' : 'pointer-events-none'}`}>
              {renderActiveTab()}
            </div>
          </main>
        </div>
      </div>

      <AiCopilotDrawer sendCommand={sendCommand} />
      <BlackboxReplayBar />
      <AlertManager sendCommand={sendCommand} />
    </div>
  );
}
