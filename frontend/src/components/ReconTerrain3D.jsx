import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';
import {
  TERRAIN_BASE_Y,
  CRUISE_AIRCRAFT_Y,
  MIN_AIRBORNE_Y,
  MAX_AIRBORNE_Y,
  latLonToWorldXZ,
  worldXZToLatLon,
  getPadById,
  flightRuntime,
} from '../utils/flightConfig';
import { mapTileManager } from '../utils/mapTileManager';

export const AIRCRAFT_Y = CRUISE_AIRCRAFT_Y;
export { TERRAIN_BASE_Y };

const ELEV_SCALE = 0.0155; // 280m Twin Peaks -> ~4.34 world units

// Shared North-Up 3D terrain state synced 1:1 with live GPS telemetry & 2D Map
export const terrainState = {
  offsetX: 0,    // Current UAV North-Up East coordinate (world units)
  offsetZ: 0,    // Current UAV North-Up South coordinate (world units)
  headingRad: (45 * Math.PI) / 180,
  flatBlend: 0,  // 0 = true topography, 1 = leveled clearing for ground rover / valley LZ
};

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Procedural fallback relief used only for the first fraction of a second before AWS DEM loads
function fallbackElevationUnits(wx, wz) {
  const h1 = Math.sin(wx * 0.14) * Math.cos(wz * 0.13) * 1.85;
  const h2 = Math.sin(wx * 0.31 + wz * 0.25) * 0.65;
  const h3 = Math.cos((wx - wz) * 0.19) * 0.45;
  return Math.max(0.0, h1 + h2 + h3 + 0.45);
}

// North-Up local (x=East, z=South relative to UAV) -> world Y height (exact GPU shader parity)
export function getTerrainHeight(
  localNorthX,
  localNorthZ,
  offsetX = terrainState.offsetX,
  offsetZ = terrainState.offsetZ,
  flatBlend = terrainState.flatBlend
) {
  const wx = localNorthX + offsetX;
  const wz = localNorthZ + offsetZ;
  const dist = Math.hypot(localNorthX, localNorthZ);
  const clearingMask = THREE.MathUtils.lerp(1.0, smoothstepJS(3.2, 8.5, dist), flatBlend);

  const realMeters = mapTileManager.sampleElevationMeters(wx, wz);
  const rawElev = realMeters !== null ? realMeters * ELEV_SCALE : fallbackElevationUnits(wx, wz);
  return TERRAIN_BASE_Y + clearingMask * rawElev;
}

// Convert Screen-Space (Track-Up relative to aircraft nose -Z) -> exact terrain height
export function getTerrainHeightScreen(screenX, screenZ) {
  const c = Math.cos(terrainState.headingRad);
  const s = Math.sin(terrainState.headingRad);
  const nx = screenX * c - screenZ * s;
  const nz = screenX * s + screenZ * c;
  return getTerrainHeight(nx, nz);
}

function createSyncedMapTerrainMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uTileBounds: { value: new THREE.Vector4(-48, 48, -48, 48) },
      uSatMap: { value: mapTileManager.satTexture },
      uDemMap: { value: mapTileManager.demTexture },
      uHasDem: { value: 0 },
      uSatBlend: { value: 0.92 }, // 1.0 = crisp satellite imagery, 0.0 = pure tactical hologram
      uFlatBlend: { value: 0 },
      uThermal: { value: 0 },
      uScanPos: { value: new THREE.Vector2(0, 0) },
      uScanActive: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uOffset;
      uniform vec4 uTileBounds; // (minWx, maxWx, minWz, maxWz)
      uniform sampler2D uDemMap;
      uniform float uHasDem;
      uniform float uFlatBlend;

      varying float vElevation;
      varying float vWaterMask;
      varying float vRadialDist;
      varying vec2 vTileUv;
      varying vec2 vScrollPos;
      varying vec2 vLocalXZ;
      varying vec3 vNormalDir;
      varying vec3 vWorldPos;

      vec2 worldToTileUv(float wx, float wz) {
        float u = (wx - uTileBounds.x) / max(0.001, uTileBounds.y - uTileBounds.x);
        float v = 1.0 - (wz - uTileBounds.z) / max(0.001, uTileBounds.w - uTileBounds.z);
        return vec2(u, v);
      }

      float fallbackElev(float wx, float wz) {
        float h1 = sin(wx * 0.14) * cos(wz * 0.13) * 1.85;
        float h2 = sin(wx * 0.31 + wz * 0.25) * 0.65;
        float h3 = cos((wx - wz) * 0.19) * 0.45;
        return max(0.0, h1 + h2 + h3 + 0.45);
      }

      float sampleElev(float x, float z) {
        float wx = x + uOffset.x;
        float wz = z + uOffset.y;
        float dist = length(vec2(x, z));
        float clearingMask = mix(1.0, smoothstep(3.2, 8.5, dist), uFlatBlend);

        if (uHasDem > 0.5) {
          vec2 uv = clamp(worldToTileUv(wx, wz), vec2(0.002), vec2(0.998));
          float meters = texture2D(uDemMap, uv).r * 360.0;
          return clearingMask * meters * 0.0155;
        }
        return clearingMask * fallbackElev(wx, wz);
      }

      void main() {
        vec3 pos = position;
        float wx = pos.x + uOffset.x;
        float wz = pos.z + uOffset.y;
        vec2 uv = worldToTileUv(wx, wz);

        float elev = sampleElev(pos.x, pos.z);
        pos.y = -6.2 + elev;

        float eps = 0.22;
        float hL = sampleElev(pos.x - eps, pos.z);
        float hR = sampleElev(pos.x + eps, pos.z);
        float hD = sampleElev(pos.x, pos.z - eps);
        float hU = sampleElev(pos.x, pos.z + eps);
        vec3 n = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));

        float waterFlag = 0.0;
        if (uHasDem > 0.5) {
          waterFlag = texture2D(uDemMap, clamp(uv, vec2(0.002), vec2(0.998))).b;
        } else {
          waterFlag = 1.0 - smoothstep(0.01, 0.08, elev);
        }

        vElevation = elev;
        vWaterMask = waterFlag;
        vRadialDist = length(pos.xz);
        vTileUv = uv;
        vScrollPos = vec2(wx, wz);
        vLocalXZ = pos.xz;
        vNormalDir = normalize(mat3(modelMatrix) * n);

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uSatMap;
      uniform float uSatBlend;
      uniform float uThermal;
      uniform vec2 uScanPos;
      uniform float uScanActive;

      varying float vElevation;
      varying float vWaterMask;
      varying float vRadialDist;
      varying vec2 vTileUv;
      varying vec2 vScrollPos;
      varying vec2 vLocalXZ;
      varying vec3 vNormalDir;
      varying vec3 vWorldPos;

      vec3 tacticalRamp(float h) {
        vec3 basin    = vec3(0.020, 0.048, 0.105);
        vec3 plain    = vec3(0.032, 0.135, 0.215);
        vec3 forest   = vec3(0.042, 0.265, 0.335);
        vec3 ridge    = vec3(0.115, 0.520, 0.650);
        vec3 snowPeak = vec3(0.840, 0.960, 1.000);
        vec3 col = mix(basin, plain, smoothstep(0.08, 0.65, h));
        col = mix(col, forest, smoothstep(0.65, 1.65, h));
        col = mix(col, ridge, smoothstep(1.65, 2.75, h));
        col = mix(col, snowPeak, smoothstep(2.75, 3.85, h));
        return col;
      }

      vec3 ironbow(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.05, 0.02, 0.15);
        vec3 c1 = vec3(0.36, 0.04, 0.48);
        vec3 c2 = vec3(0.84, 0.14, 0.25);
        vec3 c3 = vec3(0.98, 0.62, 0.08);
        vec3 c4 = vec3(1.00, 0.97, 0.82);
        if (t < 0.25) return mix(c0, c1, t / 0.25);
        if (t < 0.55) return mix(c1, c2, (t - 0.25) / 0.30);
        if (t < 0.82) return mix(c2, c3, (t - 0.55) / 0.27);
        return mix(c3, c4, (t - 0.82) / 0.18);
      }

      float gridMask(vec2 coord, float stepSize, float thickness) {
        vec2 p = coord / stepSize;
        vec2 grid = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(0.0001));
        float line = min(grid.x, grid.y);
        return 1.0 - smoothstep(thickness, thickness + 1.1, line);
      }

      void main() {
        vec2 safeUv = clamp(vTileUv, vec2(0.002), vec2(0.998));
        vec3 satTex = texture2D(uSatMap, safeUv).rgb;
        float satLum = dot(satTex, vec3(0.299, 0.587, 0.114));

        // Tactical night-ops color grade on real satellite imagery so HUD & 3D aircraft pop cleanly
        vec3 gradedSat = mix(satTex * 0.92, satTex * vec3(0.76, 0.94, 1.08), 0.32);
        vec3 holoCol = tacticalRamp(vElevation);

        vec3 baseCol = mix(holoCol, gradedSat, uSatBlend);

        // In FLIR mode, map real satellite luminance + real elevation into Ironbow thermal vision!
        if (uThermal > 0.5) {
          float thermalSignal = clamp(satLum * 0.58 + (vElevation / 4.2) * 0.42 - vWaterMask * 0.35, 0.02, 0.98);
          baseCol = ironbow(thermalSignal);
        }

        // Directional terrain relief shading so real SF hills have crisp 3D depth
        vec3 lightDir = normalize(vec3(0.55, 0.85, 0.45));
        float ndotl = max(dot(normalize(vNormalDir), lightDir), 0.0);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = pow(1.0 - abs(dot(normalize(vNormalDir), viewDir)), 3.0);
        vec3 litCol = baseCol * (0.62 + 0.52 * ndotl) + baseCol * rim * 0.14;

        // Animated water shimmer over real SF Bay / Ocean (where DEM elevation <= 1.2m)
        if (vWaterMask > 0.35) {
          float ripple = sin(vScrollPos.x * 3.2 + uTime * 2.2) * cos(vScrollPos.y * 3.2 - uTime * 1.9);
          vec3 waterTint = mix(vec3(0.02, 0.17, 0.31), vec3(0.12, 0.03, 0.26), uThermal);
          vec3 specCol = mix(vec3(0.28, 0.82, 1.0), vec3(0.95, 0.52, 0.15), uThermal);
          float spec = pow(max(0.0, 0.5 + 0.5 * ripple), 4.0) * 0.34;
          litCol = mix(litCol, mix(litCol, waterTint, 0.52) + specCol * (spec + rim * 0.22), vWaterMask * 0.8);
        }

        // Subtle glowing topographic elevation contours draped over real hills
        float minorStep = 0.42;
        float minorCoord = vElevation / minorStep;
        float minorDist = abs(fract(minorCoord - 0.5) - 0.5) / max(fwidth(minorCoord), 0.001);
        float minorContour = (1.0 - smoothstep(0.55, 1.5, minorDist)) * smoothstep(0.08, 0.22, vElevation);

        vec3 contourTint = mix(vec3(0.13, 0.85, 0.96), vec3(1.0, 0.78, 0.18), uThermal);
        litCol += contourTint * minorContour * mix(0.32, 0.16, uSatBlend);

        // Subtle draped WGS84 tactical grid lines (synced to world km)
        float majorGrid = gridMask(vScrollPos, 10.0, 0.65);
        litCol += contourTint * majorGrid * mix(0.24, 0.10, uSatBlend);

        // Projected UAV Sensor Sweep Reticle on terrain
        if (uScanActive > 0.5) {
          float scanD = length(vLocalXZ - uScanPos);
          float scanRing = exp(-pow((scanD - 1.5) * 4.5, 2.0));
          float scanFill = smoothstep(1.6, 0.0, scanD) * 0.12;
          vec3 scanCol = mix(vec3(0.13, 0.92, 0.98), vec3(1.0, 0.72, 0.1), uThermal);
          litCol += scanCol * (scanRing * 0.6 + scanFill) * (0.85 + 0.15 * sin(uTime * 8.0));
        }

        float edgeAlpha = 1.0 - smoothstep(26.5, 35.5, vRadialDist);
        if (edgeAlpha < 0.01) discard;

        gl_FragColor = vec4(litCol, edgeAlpha);
      }
    `,
  });
}

export function ReconTerrain3D({ visible = true, scanActive = true, thermalMode = false, sendCommand }) {
  const sweepConeRef = useRef();
  const gearSentRef = useRef(null);
  const lastGpsSyncRef = useRef(0);
  const prevOffsetRef = useRef({ x: 0, z: 0 });

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(72, 72, 144, 144);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const terrainMaterial = useMemo(() => createSyncedMapTerrainMaterial(), []);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    const store = useTelemetryStore.getState();
    const { telemetry, recon, setFlightStatus } = store;

    const status = recon.flightStatus || 'AIRBORNE';
    const pad = getPadById(recon.activePadId);
    const isRoverDeployed = recon.groundBotState !== 'STOWED';

    // 1. Authoritative 1:1 GPS <-> 3D World Position & Heading Sync
    if (status === 'APPROACHING_PAD') {
      const dx = pad.wx - terrainState.offsetX;
      const dz = pad.wz - terrainState.offsetZ;
      const dist = Math.hypot(dx, dz);
      flightRuntime.padDistance = dist;

      // Rotate heading smoothly toward the landing pad
      if (dist > 0.3) {
        const desiredHdg = Math.atan2(dx, -dz);
        const hDiff = Math.atan2(Math.sin(desiredHdg - terrainState.headingRad), Math.cos(desiredHdg - terrainState.headingRad));
        terrainState.headingRad += hDiff * Math.min(1, 3.0 * dt);
      }

      const approachSpeed = Math.min(9.0, Math.max(2.4, dist * 1.25));
      if (dist > 0.18) {
        terrainState.offsetX += (dx / dist) * approachSpeed * dt;
        terrainState.offsetZ += (dz / dist) * approachSpeed * dt;
        flightRuntime.targetAircraftY = THREE.MathUtils.lerp(flightRuntime.targetAircraftY, 1.1, dt * 1.8);
      } else {
        terrainState.offsetX = pad.wx;
        terrainState.offsetZ = pad.wz;
        if (gearSentRef.current !== true) {
          gearSentRef.current = true;
          sendCommand?.({ type: 'setActuator', payload: { key: 'gearDown', value: true } });
        }
        setFlightStatus('LANDING');
      }

      // Keep 2D Map GPS position locked to our 3D approach path!
      const curGps = worldXZToLatLon(terrainState.offsetX, terrainState.offsetZ);
      flightRuntime.liveLat = curGps.lat;
      flightRuntime.liveLon = curGps.lon;
      flightRuntime.liveHeadingDeg = ((terrainState.headingRad * 180) / Math.PI + 360) % 360;
      if (t - lastGpsSyncRef.current > 0.15) {
        lastGpsSyncRef.current = t;
        sendCommand?.({
          type: 'setPosition',
          payload: { lat: curGps.lat, lon: curGps.lon, heading: flightRuntime.liveHeadingDeg },
        });
      }
    } else if (status === 'LANDING' || status === 'LANDED') {
      terrainState.offsetX = THREE.MathUtils.lerp(terrainState.offsetX, pad.wx, 1 - Math.exp(-6.0 * dt));
      terrainState.offsetZ = THREE.MathUtils.lerp(terrainState.offsetZ, pad.wz, 1 - Math.exp(-6.0 * dt));
      flightRuntime.padDistance = 0;
      flightRuntime.liveLat = pad.lat;
      flightRuntime.liveLon = pad.lon;
    } else {
      // AIRBORNE or TAKING_OFF -> track real GPS telemetry (lat, lon, heading) smoothly at 60 FPS!
      const targetLat = telemetry?.latitude ?? 37.7749;
      const targetLon = telemetry?.longitude ?? -122.4194;
      const targetW = latLonToWorldXZ(targetLat, targetLon);

      // Smoothly interpolate toward the 10Hz telemetry GPS so scrolling is silky 60 FPS
      const smooth = 1 - Math.exp(-7.5 * dt);
      terrainState.offsetX = THREE.MathUtils.lerp(terrainState.offsetX, targetW.wx, smooth);
      terrainState.offsetZ = THREE.MathUtils.lerp(terrainState.offsetZ, targetW.wz, smooth);

      // Smoothly track true GPS heading (Track-Up alignment with 2D Map!)
      const targetHdgRad = ((telemetry?.heading ?? 45) * Math.PI) / 180;
      const hDiff = Math.atan2(
        Math.sin(targetHdgRad - terrainState.headingRad),
        Math.cos(targetHdgRad - terrainState.headingRad)
      );
      terrainState.headingRad += hDiff * (1 - Math.exp(-5.0 * dt));

      flightRuntime.liveLat = targetLat;
      flightRuntime.liveLon = targetLon;
      flightRuntime.liveHeadingDeg = ((terrainState.headingRad * 180) / Math.PI + 360) % 360;
    }

    // Measure actual horizontal world speed for airflow streamlines
    const moved = Math.hypot(
      terrainState.offsetX - prevOffsetRef.current.x,
      terrainState.offsetZ - prevOffsetRef.current.z
    );
    prevOffsetRef.current.x = terrainState.offsetX;
    prevOffsetRef.current.z = terrainState.offsetZ;
    flightRuntime.horizontalSpeed = THREE.MathUtils.lerp(
      flightRuntime.horizontalSpeed,
      moved / Math.max(0.001, dt),
      0.25
    );

    // Ensure the 5x5 Real Satellite + AWS DEM tile patch is loaded around the UAV's live GPS
    const activeLayer = recon.mapLayer || 'SATELLITE';
    mapTileManager.ensureLoaded(flightRuntime.liveLat, flightRuntime.liveLon, activeLayer);

    // Flatten clearing when UGV rover deploys or landing at Valley LZ
    const needFlat = isRoverDeployed || (pad.id === 'PAD-VALLEY' && status !== 'AIRBORNE');
    terrainState.flatBlend = THREE.MathUtils.lerp(
      terrainState.flatBlend,
      needFlat ? 1.0 : 0.0,
      1 - Math.exp(-3.2 * dt)
    );

    // 2. Vertical Altitude Kinematics (Up/Down + Landing + Takeoff)
    const groundUnderUav = getTerrainHeight(0, 0);
    const touchdownY = groundUnderUav + (pad.padHeight || 0.12) + 0.34;
    const prevY = flightRuntime.aircraftY;

    if (status === 'LANDING') {
      flightRuntime.aircraftY = THREE.MathUtils.lerp(flightRuntime.aircraftY, touchdownY, 1 - Math.exp(-1.7 * dt));
      if (Math.abs(flightRuntime.aircraftY - touchdownY) < 0.06) {
        flightRuntime.aircraftY = touchdownY;
        flightRuntime.targetAircraftY = touchdownY;
        sendCommand?.({ type: 'setActuator', payload: { key: 'throttle', value: 8 } });
        setFlightStatus('LANDED');
      }
    } else if (status === 'LANDED') {
      flightRuntime.aircraftY = touchdownY;
      flightRuntime.targetAircraftY = touchdownY;
    } else if (status === 'TAKING_OFF') {
      if (gearSentRef.current !== false) {
        gearSentRef.current = false;
        sendCommand?.({ type: 'setActuator', payload: { key: 'throttle', value: 72 } });
        sendCommand?.({ type: 'setActuator', payload: { key: 'gearDown', value: false } });
      }
      flightRuntime.targetAircraftY = CRUISE_AIRCRAFT_Y;
      flightRuntime.aircraftY = THREE.MathUtils.lerp(
        flightRuntime.aircraftY,
        CRUISE_AIRCRAFT_Y,
        1 - Math.exp(-1.6 * dt)
      );
      if (Math.abs(flightRuntime.aircraftY - CRUISE_AIRCRAFT_Y) < 0.08) {
        flightRuntime.aircraftY = CRUISE_AIRCRAFT_Y;
        setFlightStatus('AIRBORNE');
      }
    } else {
      if (flightRuntime.verticalInput !== 0) {
        const climbRate = 2.6;
        flightRuntime.targetAircraftY = THREE.MathUtils.clamp(
          flightRuntime.targetAircraftY + flightRuntime.verticalInput * climbRate * dt,
          Math.max(groundUnderUav + 0.9, MIN_AIRBORNE_Y),
          MAX_AIRBORNE_Y
        );
      }
      const safeFloor = Math.max(groundUnderUav + 0.85, MIN_AIRBORNE_Y);
      const clampedTarget = THREE.MathUtils.clamp(flightRuntime.targetAircraftY, safeFloor, MAX_AIRBORNE_Y);
      flightRuntime.aircraftY = THREE.MathUtils.lerp(
        flightRuntime.aircraftY,
        clampedTarget,
        1 - Math.exp(-4.0 * dt)
      );
    }

    flightRuntime.verticalVelocity = (flightRuntime.aircraftY - prevY) / Math.max(0.001, dt);
    flightRuntime.groundElevationBelow = groundUnderUav;
    flightRuntime.aglUnits = Math.max(0, flightRuntime.aircraftY - groundUnderUav);

    // 3. Push exact tile bounds & live textures to GPU shader
    const b = mapTileManager.bounds;
    terrainMaterial.uniforms.uTime.value = t;
    terrainMaterial.uniforms.uOffset.value.set(terrainState.offsetX, terrainState.offsetZ);
    terrainMaterial.uniforms.uTileBounds.value.set(b.minWx, b.maxWx, b.minWz, b.maxWz);
    terrainMaterial.uniforms.uHasDem.value = mapTileManager.hasRealDem ? 1.0 : 0.0;
    terrainMaterial.uniforms.uSatBlend.value = recon.mapOverlayMode === 'HOLO' ? 0.0 : mapTileManager.hasRealSat ? 0.92 : 0.35;
    terrainMaterial.uniforms.uFlatBlend.value = terrainState.flatBlend;
    terrainMaterial.uniforms.uThermal.value = thermalMode ? 1.0 : 0.0;
    terrainMaterial.uniforms.uScanActive.value = scanActive && status !== 'LANDED' ? 1.0 : 0.0;

    // Project sensor sweep reticle onto North-Up coordinates ahead of the aircraft
    const localForwardX = Math.sin(terrainState.headingRad) * 2.4 + Math.cos(terrainState.headingRad) * Math.sin(t * 0.55) * 3.0;
    const localForwardZ = -Math.cos(terrainState.headingRad) * 2.4 + Math.sin(terrainState.headingRad) * Math.sin(t * 0.55) * 3.0;
    terrainMaterial.uniforms.uScanPos.value.set(localForwardX, localForwardZ);

    if (sweepConeRef.current) {
      sweepConeRef.current.visible = scanActive && status !== 'LANDED';
      sweepConeRef.current.position.set(0, flightRuntime.aircraftY - 0.18, 0);
      const beamHeight = Math.max(0.6, flightRuntime.aglUnits);
      sweepConeRef.current.scale.set(1, beamHeight / 7.8, 1);
      sweepConeRef.current.rotation.y = -terrainState.headingRad;
      sweepConeRef.current.rotation.z = Math.sin(t * 0.55) * 0.3;
      sweepConeRef.current.rotation.x = 0.22;
    }
  });

  if (!visible) return null;

  return (
    <group>
      <mesh geometry={geometry} material={terrainMaterial} frustumCulled={false} />

      <group ref={sweepConeRef} position={[0, CRUISE_AIRCRAFT_Y - 0.18, 0]}>
        <mesh position={[0, -3.9, 0]}>
          <coneGeometry args={[2.1, 7.8, 28, 1, true]} />
          <meshBasicMaterial
            color={thermalMode ? '#f59e0b' : '#22d3ee'}
            transparent
            opacity={0.055}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
