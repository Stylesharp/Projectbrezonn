import React, { Suspense, useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Float, Grid, Center, Sparkles, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { createHologramMaterial, createThermalMaterial, createRotorBlurMaterial } from './HologramMaterials';
import { MaintenanceBot3D } from './MaintenanceBot3D';
import { GroundBotDeploy3D } from './GroundBotDeploy3D';
import { WildlifeScene3D } from './WildlifeScene3D';
import { HelperBots3D } from './HelperBots3D';
import { ReconTerrain3D, AIRCRAFT_Y, TERRAIN_BASE_Y, terrainState } from './ReconTerrain3D';
import { MiniMapOverlay } from './MiniMapOverlay';
import { LANDING_PADS, flightRuntime, getPadById } from '../utils/flightConfig';
import { TerrainArtefacts3D } from './TerrainArtefacts3D';
import { LidarPointCloud3D } from './LidarPointCloud3D';
import { WeatherAtmosphere3D } from './WeatherAtmosphere3D';
import { FlightCorridor3D } from './FlightCorridor3D';
import { propulsionAudio } from '../utils/soundEngine';
import {
  Plane, Disc, Cpu, Activity, X, Gauge, Thermometer,
  Wrench, Volume2, VolumeX, Wind, Radio, Eye,
  Mountain, ArrowDown, ArrowUp, Zap, ScanLine, Navigation, CloudLightning, Gamepad2, Building2, ArrowUpCircle, ArrowDownCircle, PlaneLanding, PlaneTakeoff, MapPin, Tag, Map as MapIcon, Layers
} from 'lucide-react';

useGLTF.preload('/models/drone_detailed.glb');
useGLTF.preload('/models/airplane.glb');
useGLTF.preload('/models/turbofan_core.glb');

function RadarPulseFloor({ alertLevel = 0 }) {
  const ring1Ref = useRef();
  const ring2Ref = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    [ring1Ref, ring2Ref].forEach((ref, i) => {
      if (!ref.current) return;
      const phase = (t * 0.35 + i * 0.5) % 1;
      const scale = 2.2 + phase * 14.0;
      ref.current.scale.set(scale, scale, 1);
      ref.current.material.opacity = (1 - phase) * (0.26 + alertLevel * 0.25);
    });
  });

  const color = alertLevel > 0.5 ? '#f43f5e' : '#22d3ee';

  return (
    <group position={[0, TERRAIN_BASE_Y + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {[ring1Ref, ring2Ref].map((ref, idx) => (
        <mesh key={idx} ref={ref}>
          <ringGeometry args={[0.96, 1.0, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <mesh>
        <ringGeometry args={[6.95, 7.05, 96]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <ringGeometry args={[12.9, 13.05, 96]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function AirflowStreamlines({ enabled = true }) {
  const linesRef = useRef([]);
  const streamlines = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2;
      const radius = 1.45 + (i % 3) * 0.65;
      return {
        x: Math.cos(angle) * radius,
        y: AIRCRAFT_Y + Math.sin(angle) * radius * 0.35,
        zOffset: (i * 0.73) % 7.0,
        len: 0.9 + (i % 4) * 0.35,
      };
    });
  }, []);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.05);
    const vel = flightRuntime.horizontalSpeed * 1.45;
    linesRef.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.visible = vel > 0.25;
      if (!mesh.visible) return;
      mesh.position.y = flightRuntime.aircraftY + (streamlines[i].y - AIRCRAFT_Y);
      mesh.position.z += vel * dt;
      if (mesh.position.z > 4.4) {
        mesh.position.z = -4.4 - (i % 3) * 0.4;
      }
    });
  });

  if (!enabled) return null;

  return (
    <group>
      {streamlines.map((s, idx) => (
        <mesh
          key={idx}
          ref={(el) => { linesRef.current[idx] = el; }}
          position={[s.x, s.y, -4.0 + s.zOffset]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.006, 0.006, s.len, 6]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

const CAMERA_PRESETS = {
  ISO: { pos: [4.6, 3.8, 4.9], target: [0, 1.2, -0.4] },
  CHASE: { pos: [0, 2.75, 4.35], target: [0, 1.35, -3.2] },
  GIMBAL: { pos: [1.35, 1.25, -1.65], target: [0, -2.5, -5.0] },
  ROVER: { pos: [2.8, -4.4, 3.4], target: [0, -6.0, 0] },
  TOP: { pos: [0.01, 11.5, 0.01], target: [0, -1.0, 0] },
};

function SmoothCameraRig({ preset, controlsRef, roverWorldPosRef }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(...CAMERA_PRESETS.ISO.pos));
  const targetLook = useRef(new THREE.Vector3(...CAMERA_PRESETS.ISO.target));
  const animating = useRef(false);

  useEffect(() => {
    const cfg = CAMERA_PRESETS[preset] || CAMERA_PRESETS.ISO;
    targetPos.current.set(...cfg.pos);
    targetLook.current.set(...cfg.target);
    animating.current = true;
  }, [preset]);

  useFrame((_, delta) => {
    const step = 1 - Math.exp(-5.0 * Math.min(delta, 0.05));

    if (preset === 'ROVER' && roverWorldPosRef?.current) {
      const rp = roverWorldPosRef.current;
      targetLook.current.set(rp.x, rp.y + 0.15, rp.z);
      targetPos.current.set(rp.x + 1.85, rp.y + 1.05, rp.z + 2.05);
      camera.position.lerp(targetPos.current, step * 0.7);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetLook.current, step);
        controlsRef.current.update();
      }
      return;
    }

    const dy = flightRuntime.aircraftY - AIRCRAFT_Y;
    const cfg = CAMERA_PRESETS[preset] || CAMERA_PRESETS.ISO;
    const desiredPosY = cfg.pos[1] + (preset === 'TOP' ? 0 : dy);
    const desiredLookY = cfg.target[1] + (preset === 'TOP' ? 0 : dy);

    if (animating.current) {
      targetPos.current.set(cfg.pos[0], desiredPosY, cfg.pos[2]);
      targetLook.current.set(cfg.target[0], desiredLookY, cfg.target[2]);
      camera.position.lerp(targetPos.current, step);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetLook.current, step);
        controlsRef.current.update();
      }
      if (camera.position.distanceTo(targetPos.current) < 0.06) {
        animating.current = false;
      }
    } else if (controlsRef.current && preset !== 'TOP') {
      // Gently follow vertical climbs/landings while still letting user orbit freely!
      const lookDelta = desiredLookY - controlsRef.current.target.y;
      if (Math.abs(lookDelta) > 0.01) {
        controlsRef.current.target.y += lookDelta * step * 0.85;
        camera.position.y += lookDelta * step * 0.85;
        controlsRef.current.update();
      }
    }
  });

  return null;
}

function HotspotPin({ position, anchorOffset = [0, -0.35, 0], label, status = 'nominal', active, onClick }) {
  const showLabel = useTelemetryStore((s) => s.recon.labelsEnabled);
  const statusStyles = {
    nominal: 'border-cyan-400/50 text-cyan-200 bg-slate-950/85',
    warning: 'border-amber-400/80 text-amber-200 bg-amber-950/85',
    critical: 'border-rose-500 text-rose-200 bg-rose-950/90 animate-pulse',
  };
  const dotColor = status === 'critical' ? '#f43f5e' : status === 'warning' ? '#f59e0b' : '#22d3ee';

  const { mid, len, quat } = useMemo(() => {
    const end = new THREE.Vector3(...anchorOffset);
    const length = end.length() || 0.01;
    const midpoint = end.clone().multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.clone().normalize()
    );
    return { mid: midpoint, len: length, quat: q };
  }, [anchorOffset]);

  return (
    <group position={position}>
      <mesh position={anchorOffset}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshBasicMaterial color={dotColor} />
      </mesh>
      <mesh position={mid} quaternion={quat}>
        <cylinderGeometry args={[0.005, 0.005, len, 6]} />
        <meshBasicMaterial color={dotColor} transparent opacity={0.65} />
      </mesh>
      {showLabel && (
        <Html center zIndexRange={[20, 0]}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className={`px-1.5 py-0.5 rounded border backdrop-blur-md text-[9px] leading-none font-mono tracking-wide whitespace-nowrap flex items-center gap-1 transition-all shadow cursor-pointer ${
              active
                ? 'border-cyan-300 bg-cyan-400/25 text-white shadow-[0_0_10px_rgba(34,211,238,0.4)]'
                : `${statusStyles[status]} opacity-90 hover:opacity-100 hover:border-cyan-300`
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
            {label}
          </button>
        </Html>
      )}
    </group>
  );
}

function StrobeBeacon({ position }) {
  const meshRef = useRef();
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const phase = clock.getElapsedTime() % 1.4;
    const flash = phase < 0.08 || (phase > 0.16 && phase < 0.24);
    meshRef.current.material.emissiveIntensity = flash ? 4.5 : 0.2;
  });
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.045, 12, 12]} />
      <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1} />
    </mesh>
  );
}

function TacticalDroneModel({ viewMode, selectedPart, onSelectPart }) {
  const { scene } = useGLTF('/models/drone_detailed.glb');
  const rotorFault = useTelemetryStore(
    (s) => Boolean(s.telemetry?.faults?.cyl2Overheat || s.telemetry?.faults?.oilLineRupture || s.telemetry?.faults?.propStrike)
  );
  const avionicsFault = useTelemetryStore((s) => Boolean(s.telemetry?.faults?.avionicsOverheat));

  const groupRef = useRef();
  const gimbalYawRef = useRef();
  const gimbalPitchRef = useRef();
  const gearGroupRef = useRef();
  const downwashRefs = useRef([]);

  const materials = useMemo(() => ({
    holo: createHologramMaterial({ color: '#22d3ee', opacity: 0.72 }),
    wire: createHologramMaterial({ color: '#38bdf8', opacity: 0.85, wireframe: true }),
    thermal: createThermalMaterial(),
    solidBody: new THREE.MeshStandardMaterial({
      color: '#0f172a',
      emissive: '#0284c7',
      emissiveIntensity: 0.18,
      metalness: 0.88,
      roughness: 0.22,
    }),
    solidBlade: new THREE.MeshStandardMaterial({
      color: '#22d3ee',
      emissive: '#06b6d4',
      emissiveIntensity: 0.75,
      metalness: 0.8,
      roughness: 0.2,
    }),
  }), []);

  const { clonedScene, rotorPivots, blurMats } = useMemo(() => {
    const clone = scene.clone(true);
    const bladeNodes = [];

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
      if (child.name && child.name.toLowerCase().includes('blade')) {
        bladeNodes.push(child);
      }
    });

    const pivots = [];
    const mats = [];
    bladeNodes.forEach((blade, idx) => {
      const parent = blade.parent;
      if (!parent) return;

      let centerOffset = new THREE.Vector3();
      let radius = 0.75;
      if (blade.geometry) {
        blade.geometry.computeBoundingBox();
        if (blade.geometry.boundingBox) {
          blade.geometry.boundingBox.getCenter(centerOffset);
          const sz = blade.geometry.boundingBox.getSize(new THREE.Vector3());
          radius = Math.max(sz.x, sz.z) * 0.52 || 0.75;
        }
      }

      const pivot = new THREE.Group();
      pivot.name = `${blade.name}_Pivot`;
      pivot.position.copy(blade.position).add(centerOffset);
      pivot.quaternion.copy(blade.quaternion);
      pivot.scale.copy(blade.scale);

      parent.add(pivot);
      blade.position.copy(centerOffset).negate();
      blade.rotation.set(0, 0, 0);
      blade.scale.set(1, 1, 1);
      pivot.add(blade);

      const blurMat = createRotorBlurMaterial('#22d3ee');
      blurMat.uniforms.uDirection.value = idx % 2 === 0 ? 1.0 : -1.0;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), blurMat);
      disc.name = `${blade.name}_MotionBlurDisc`;
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.015;
      pivot.add(disc);

      pivots.push(pivot);
      mats.push(blurMat);
    });

    return { clonedScene: clone, rotorPivots: pivots, blurMats: mats };
  }, [scene]);

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (!child.isMesh || child.name.includes('MotionBlurDisc')) return;
      if (viewMode === 'THERMAL') child.material = materials.thermal;
      else if (viewMode === 'XRAY') child.material = materials.holo;
      else if (viewMode === 'WIREFRAME') child.material = materials.wire;
      else child.material = child.name.toLowerCase().includes('blade') ? materials.solidBlade : materials.solidBody;
    });
  }, [clonedScene, viewMode, materials]);

  useFrame((state, delta) => {
    const telemetry = useTelemetryStore.getState().telemetry;
    const t = state.clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    const reconState = useTelemetryStore.getState().recon;
    const isLanded = reconState.flightStatus === 'LANDED';
    const isHoverHold = Boolean(reconState.hoverHold);
    const isStopped = Boolean(telemetry?.faults?.propStrike);
    const effectiveRpm = isStopped ? 0 : isLanded ? 420 : Math.max(1800, telemetry?.rpm ?? 2850);
    const speedFactor = effectiveRpm / 3000;
    const throttle = Math.max(0.2, (telemetry?.actuators?.throttle ?? 55) / 100);
    const alertLevel = (telemetry?.anomalyScore ?? 0) > 0.45 ? 1.0 : 0.0;
    const maxCht = Math.max(...(telemetry?.chts || [110]));

    materials.holo.uniforms.uTime.value = t;
    materials.holo.uniforms.uAlertLevel.value = alertLevel;
    materials.wire.uniforms.uTime.value = t;
    materials.wire.uniforms.uAlertLevel.value = alertLevel;
    materials.thermal.uniforms.uTime.value = t;
    materials.thermal.uniforms.uHeat.value = THREE.MathUtils.clamp((maxCht - 80) / 180, 0.15, 1.0);

    blurMats.forEach((m) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uSpeed.value = speedFactor;
      m.uniforms.uOpacity.value = isStopped ? 0.0 : THREE.MathUtils.clamp(0.24 + speedFactor * 0.34, 0.22, 0.65);
      m.uniforms.uColor.value.set(alertLevel > 0.5 ? '#f43f5e' : '#22d3ee');
    });

    if (effectiveRpm > 0) {
      const omega = Math.min(46, (effectiveRpm / 60) * Math.PI * 2 * 0.45);
      rotorPivots.forEach((pivot, idx) => {
        pivot.rotation.y += omega * dt * (idx % 2 === 0 ? 1 : -1);
      });
    }

    downwashRefs.current.forEach((mesh, idx) => {
      if (!mesh) return;
      const pulse = 0.92 + Math.sin(t * 14 + idx) * 0.08;
      mesh.scale.set(1, throttle * pulse, 1);
      mesh.position.y = -0.45 * throttle * pulse;
    });

    if (groupRef.current) {
      groupRef.current.position.y = flightRuntime.aircraftY;
      const pitchRad = isLanded ? 0 : isHoverHold ? Math.sin(t * 1.3) * 0.014 : THREE.MathUtils.degToRad(telemetry?.pitchAngle || 0);
      const rollRad = isLanded ? 0 : isHoverHold ? Math.cos(t * 1.1) * 0.014 : THREE.MathUtils.degToRad(telemetry?.rollAngle || 0);
      const vib = telemetry?.faults?.mainBearingWear ? 0.008 : 0;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pitchRad + (Math.random() - 0.5) * vib, 0.08);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, -rollRad + (Math.random() - 0.5) * vib, 0.08);
    }

    if (gimbalYawRef.current && gimbalPitchRef.current) {
      gimbalYawRef.current.rotation.y = Math.sin(t * 0.9) * 0.65;
      gimbalPitchRef.current.rotation.x = 0.25 + Math.cos(t * 0.65) * 0.22;
    }

    if (gearGroupRef.current) {
      const targetRot = telemetry?.actuators?.gearDown ?? true ? 0 : Math.PI * 0.42;
      gearGroupRef.current.rotation.x = THREE.MathUtils.lerp(gearGroupRef.current.rotation.x, targetRot, 0.07);
    }
  });

  const col = rotorFault ? '#f43f5e' : '#22d3ee';

  return (
    <group ref={groupRef} position={[0, AIRCRAFT_Y, 0]} scale={0.44}>
      <Float speed={1.5} rotationIntensity={0.06} floatIntensity={0.14}>
        <Center>
          <primitive
            object={clonedScene}
            scale={1.15}
            rotation={[0, Math.PI, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart('AVIONICS BAY / FADEC');
            }}
          />
        </Center>

        <group position={[0, -0.05, -1.35]}>
          <group ref={gimbalYawRef}>
            <group ref={gimbalPitchRef}>
              <mesh>
                <sphereGeometry args={[0.15, 20, 20]} />
                <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.15} />
              </mesh>
              <mesh position={[0.05, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 0.04, 16]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={2} />
              </mesh>
            </group>
          </group>
        </group>

        <group ref={gearGroupRef} position={[0, -0.15, 0]}>
          {[-0.78, 0.78].map((x, i) => (
            <group key={i} position={[x, 0, 0]}>
              <mesh position={[0, -0.4, 0]}>
                <cylinderGeometry args={[0.025, 0.025, 0.65, 12]} />
                <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.25} />
              </mesh>
              <mesh position={[0, -0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.035, 0.035, 1.65, 12]} />
                <meshStandardMaterial color="#0f172a" metalness={0.95} roughness={0.15} emissive="#0ea5e9" emissiveIntensity={0.25} />
              </mesh>
            </group>
          ))}
        </group>

        {[
          [1.08, 0.34, -1.88], [1.08, 0.34, 1.88], [2.17, 0.34, 0],
          [-1.08, 0.34, 1.88], [-2.17, 0.34, 0], [-1.08, 0.34, -1.88],
        ].map((pos, idx) => (
          <group key={idx} position={pos}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.36, 0.018, 12, 36]} />
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1.6} />
            </mesh>
            <mesh ref={(el) => { downwashRefs.current[idx] = el; }} position={[0, -0.35, 0]}>
              <cylinderGeometry args={[0.06, 0.34, 0.9, 16, 1, true]} />
              <meshBasicMaterial color={col} transparent opacity={0.26} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        ))}

        <StrobeBeacon position={[0, 0.62, 0]} />

        <HotspotPin
          position={[0, 1.05, 0]}
          anchorOffset={[0, -0.5, 0]}
          label="AVIONICS // FADEC"
          status={avionicsFault ? 'critical' : 'nominal'}
          active={selectedPart === 'AVIONICS BAY / FADEC'}
          onClick={() => onSelectPart('AVIONICS BAY / FADEC')}
        />
        <HotspotPin
          position={[2.0, 1.0, 0]}
          anchorOffset={[-0.2, -0.5, 0]}
          label="STARBOARD ROTORS"
          status={rotorFault ? 'critical' : 'nominal'}
          active={selectedPart === 'STARBOARD ROTOR BUS'}
          onClick={() => onSelectPart('STARBOARD ROTOR BUS')}
        />
        <HotspotPin
          position={[-2.0, 1.0, 0]}
          anchorOffset={[0.2, -0.5, 0]}
          label="PORT ROTORS"
          status="nominal"
          active={selectedPart === 'PORT ROTOR BUS'}
          onClick={() => onSelectPart('PORT ROTOR BUS')}
        />
      </Float>
    </group>
  );
}

function ReconAirframeModel({ viewMode, selectedPart, onSelectPart }) {
  const { scene } = useGLTF('/models/airplane.glb');
  const avionicsHot = useTelemetryStore((s) => Boolean(s.telemetry?.faults?.avionicsOverheat));
  const oilRupture = useTelemetryStore((s) => Boolean(s.telemetry?.faults?.oilLineRupture));
  const cyl2Hot = useTelemetryStore((s) => Boolean(s.telemetry?.faults?.cyl2Overheat));
  const highG = useTelemetryStore((s) => (s.telemetry?.gLoad ?? 1) > 1.25);

  const groupRef = useRef();
  const leftPlumeRef = useRef();
  const rightPlumeRef = useRef();
  const leftFanRef = useRef();
  const rightFanRef = useRef();

  const materials = useMemo(() => ({
    holo: createHologramMaterial({ color: '#22d3ee', opacity: 0.72 }),
    wire: createHologramMaterial({ color: '#38bdf8', opacity: 0.8, wireframe: true }),
    thermal: createThermalMaterial(),
    solid: new THREE.MeshStandardMaterial({
      color: '#0f172a',
      emissive: '#0284c7',
      emissiveIntensity: 0.24,
      metalness: 0.88,
      roughness: 0.2,
    }),
  }), []);

  // Verified airplane.glb geometry: raw nose points +X, tail points -X, wings span Z.
  // Rotating wrapper.rotation.y = +Math.PI/2 aligns nose EXACTLY forward along -Z!
  const { clonedScene } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const normScale = 2.2 / maxDim; // Realistic 2.2-unit wingspan vs 72-unit mountain world
    clone.scale.setScalar(normScale);
    clone.position.copy(center).multiplyScalar(-normScale);

    const wrapper = new THREE.Group();
    wrapper.add(clone);
    wrapper.rotation.y = Math.PI / 2; // Nose -> -Z (forward), Tail -> +Z (aft), Wings -> +/-X
    return { clonedScene: wrapper };
  }, [scene]);

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (!child.isMesh) return;
      if (viewMode === 'THERMAL') child.material = materials.thermal;
      else if (viewMode === 'XRAY') child.material = materials.holo;
      else if (viewMode === 'WIREFRAME') child.material = materials.wire;
      else child.material = materials.solid;
    });
  }, [clonedScene, viewMode, materials]);

  useFrame((state, delta) => {
    const telemetry = useTelemetryStore.getState().telemetry;
    const t = state.clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    const throttle = Math.max(0.15, (telemetry?.actuators?.throttle ?? 55) / 100);
    const alertLevel = (telemetry?.anomalyScore ?? 0) > 0.45 ? 1.0 : 0.0;
    const maxEgt = Math.max(...(telemetry?.egts || [420]));

    materials.holo.uniforms.uTime.value = t;
    materials.holo.uniforms.uAlertLevel.value = alertLevel;
    materials.wire.uniforms.uTime.value = t;
    materials.wire.uniforms.uAlertLevel.value = alertLevel;
    materials.thermal.uniforms.uTime.value = t;
    materials.thermal.uniforms.uHeat.value = THREE.MathUtils.clamp((maxEgt - 200) / 500, 0.2, 1.0);

    const isLanded = useTelemetryStore.getState().recon.flightStatus === 'LANDED';
    if (groupRef.current) {
      groupRef.current.position.y = flightRuntime.aircraftY;
      const pitchRad = isLanded ? 0 : THREE.MathUtils.degToRad(telemetry?.pitchAngle || 0);
      const rollRad = isLanded ? 0 : THREE.MathUtils.degToRad(telemetry?.rollAngle || 0);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pitchRad, 0.08);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, -rollRad, 0.08);
    }

    const fanSpeed = 14 + throttle * 26;
    if (leftFanRef.current) leftFanRef.current.rotation.z += fanSpeed * dt;
    if (rightFanRef.current) rightFanRef.current.rotation.z -= fanSpeed * dt;

    const flicker = 0.9 + Math.sin(t * 36) * 0.1;
    const lenScale = (0.4 + throttle * 1.15) * flicker;
    [leftPlumeRef, rightPlumeRef].forEach((ref) => {
      if (ref.current) {
        ref.current.scale.set(0.85 + throttle * 0.25, 0.85 + throttle * 0.25, lenScale);
      }
    });
  });

  // Millimeter-verified coordinates for normalized 2.2-unit airplane.glb:
  // Wingtips: [+/-1.1, 0.013, 0.456] | Engine nacelles: [+/-0.344, -0.22, intake -0.37 -> exhaust -0.09]
  const nacelleX = 0.344;

  return (
    <group ref={groupRef} position={[0, AIRCRAFT_Y, 0]}>
      <Float speed={1.4} rotationIntensity={0.04} floatIntensity={0.1}>
        <primitive
          object={clonedScene}
          onClick={(e) => {
            e.stopPropagation();
            onSelectPart('RECON UAV AIRFRAME');
          }}
        />

        {/* Port (Red -X) & Starboard (Green +X) Wingtip Nav Lights */}
        <mesh position={[-1.1, 0.015, 0.458]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="#f43f5e" toneMapped={false} />
        </mesh>
        <mesh position={[1.1, 0.015, 0.455]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="#10b981" toneMapped={false} />
        </mesh>

        {/* Wingtip Condensation Vortices trailing aft along +Z */}
        {highG && (
          <group>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 1.1, 0.015, 1.35]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.005, 0.024, 1.75, 10, 1, true]} />
                <meshBasicMaterial color="#e0f2fe" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            ))}
          </group>
        )}

        {/* Underwing Engine Nacelle Fans (intake z=-0.37) & Exhaust Plumes (nozzle z=-0.09 -> +Z aft) */}
        {[
          { x: -nacelleX, plumeRef: leftPlumeRef, fanRef: leftFanRef },
          { x: nacelleX, plumeRef: rightPlumeRef, fanRef: rightFanRef },
        ].map(({ x, plumeRef, fanRef }, i) => (
          <group key={i} position={[x, -0.215, 0]}>
            <group ref={fanRef} position={[0, 0, -0.37]}>
              {[0, 1, 2, 3].map((b) => (
                <mesh key={b} rotation={[0, 0, (b * Math.PI) / 4]}>
                  <boxGeometry args={[0.11, 0.012, 0.01]} />
                  <meshStandardMaterial color="#38bdf8" emissive="#22d3ee" emissiveIntensity={1.4} />
                </mesh>
              ))}
            </group>
            <group ref={plumeRef} position={[0, 0, -0.09]}>
              <mesh position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.045, 0.11, 0.68, 18, 1, true]} />
                <meshBasicMaterial color="#22d3ee" transparent opacity={0.48} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
              <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.044, 0.007, 10, 20]} />
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={2.6} />
              </mesh>
            </group>
          </group>
        ))}

        <HotspotPin
          position={[0, 0.58, -0.25]}
          anchorOffset={[0, -0.45, 0]}
          label="AVIONICS CORE"
          status={avionicsHot ? 'critical' : 'nominal'}
          active={selectedPart === 'CENTRAL AVIONICS CORE'}
          onClick={() => onSelectPart('CENTRAL AVIONICS CORE')}
        />
        <HotspotPin
          position={[-0.78, 0.38, -0.2]}
          anchorOffset={[0.42, -0.58, 0]}
          label="PORT TURBINE"
          status={oilRupture ? 'critical' : 'nominal'}
          active={selectedPart === 'PORT TURBINE'}
          onClick={() => onSelectPart('PORT TURBINE')}
        />
        <HotspotPin
          position={[0.78, 0.38, -0.2]}
          anchorOffset={[-0.42, -0.58, 0]}
          label="STARBOARD TURBINE"
          status={cyl2Hot ? 'warning' : 'nominal'}
          active={selectedPart === 'STARBOARD TURBINE'}
          onClick={() => onSelectPart('STARBOARD TURBINE')}
        />
      </Float>
    </group>
  );
}

function PropulsionCoreModel({ viewMode, selectedPart, onSelectPart }) {
  const { scene } = useGLTF('/models/turbofan_core.glb');
  const propStrike = useTelemetryStore((s) => Boolean(s.telemetry?.faults?.propStrike));
  const bearingWear = useTelemetryStore((s) => Boolean(s.telemetry?.faults?.mainBearingWear));
  const thermalAlert = useTelemetryStore(
    (s) =>
      Boolean(
        s.telemetry?.faults?.cyl2Overheat ||
          s.telemetry?.faults?.coolantLeakMajor ||
          Math.max(...(s.telemetry?.chts || [110])) > 220
      )
  );

  const coreGroupRef = useRef();
  const exhaustConeRef = useRef();

  const materials = useMemo(() => ({
    holo: createHologramMaterial({ color: '#22d3ee', opacity: 0.72 }),
    wire: createHologramMaterial({ color: '#38bdf8', opacity: 0.85, wireframe: true }),
    thermal: createThermalMaterial(),
  }), []);

  const { clonedScene, spools, originalMats } = useMemo(() => {
    const clone = scene.clone(true);
    const origMap = new Map();
    const found = { spinner: null, spiral: null, fan: null, lpc: null, turbine: null };

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        origMap.set(child.uuid, child.material);
      }
      if (child.name === 'SpinnerCone') found.spinner = child;
      else if (child.name === 'SpinnerSpiral') found.spiral = child;
      else if (child.name === 'FanStage') found.fan = child;
      else if (child.name === 'LPCCompressor') found.lpc = child;
      else if (child.name === 'HPTurbine') found.turbine = child;
    });

    return { clonedScene: clone, spools: found, originalMats: origMap };
  }, [scene]);

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (!child.isMesh) return;
      if (viewMode === 'THERMAL') child.material = materials.thermal;
      else if (viewMode === 'XRAY') child.material = materials.holo;
      else if (viewMode === 'WIREFRAME') child.material = materials.wire;
      else {
        const orig = originalMats.get(child.uuid);
        if (orig) child.material = orig;
      }
    });
  }, [clonedScene, viewMode, materials, originalMats]);

  useFrame((state, delta) => {
    const telemetry = useTelemetryStore.getState().telemetry;
    const t = state.clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    const isStopped = Boolean(telemetry?.faults?.propStrike);
    const rpm = isStopped ? 0 : Math.max(1800, telemetry?.rpm ?? 3200);
    const throttle = Math.max(0.2, (telemetry?.actuators?.throttle ?? 55) / 100);
    const alertLevel = (telemetry?.anomalyScore ?? 0) > 0.45 ? 1.0 : 0.0;
    const maxEgt = Math.max(...(telemetry?.egts || [420]));

    materials.holo.uniforms.uTime.value = t;
    materials.holo.uniforms.uAlertLevel.value = alertLevel;
    materials.wire.uniforms.uTime.value = t;
    materials.wire.uniforms.uAlertLevel.value = alertLevel;
    materials.thermal.uniforms.uTime.value = t;
    materials.thermal.uniforms.uHeat.value = THREE.MathUtils.clamp((maxEgt - 200) / 500, 0.25, 1.0);

    if (rpm > 0) {
      const n1Omega = Math.min(24, (rpm / 60) * Math.PI * 2 * 0.24);
      if (spools.spinner) spools.spinner.rotation.y += n1Omega * dt;
      if (spools.spiral) spools.spiral.rotation.y += n1Omega * dt;
      if (spools.fan) spools.fan.rotation.y += n1Omega * dt;
      if (spools.lpc) spools.lpc.rotation.y -= n1Omega * 1.45 * dt;
      if (spools.turbine) spools.turbine.rotation.y += n1Omega * 2.2 * dt;
    }

    if (coreGroupRef.current) coreGroupRef.current.position.y = flightRuntime.aircraftY;
    if (exhaustConeRef.current) {
      const pulse = 0.9 + Math.sin(t * 34) * 0.1;
      exhaustConeRef.current.scale.set(0.9 + throttle * 0.2, (0.45 + throttle * 1.1) * pulse, 0.9 + throttle * 0.2);
    }
  });

  return (
    <group ref={coreGroupRef} position={[0, AIRCRAFT_Y, 0]} scale={0.68}>
      <Float speed={1.2} rotationIntensity={0.04} floatIntensity={0.14}>
        <primitive
          object={clonedScene}
          scale={1.45}
          onClick={(e) => {
            e.stopPropagation();
            onSelectPart('TURBOFAN PROPULSION CORE');
          }}
        />

        <mesh ref={exhaustConeRef} position={[0, 0, -2.15]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.62, 1.9, 28, 1, true]} />
          <meshBasicMaterial
            color={thermalAlert ? '#f43f5e' : '#38bdf8'}
            transparent
            opacity={0.38}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        <HotspotPin
          position={[0, 1.55, 1.25]}
          anchorOffset={[0, -0.55, 0]}
          label="N1 TITANIUM FAN STAGE"
          status={propStrike ? 'critical' : 'nominal'}
          active={selectedPart === 'N1 TITANIUM FAN STAGE'}
          onClick={() => onSelectPart('N1 TITANIUM FAN STAGE')}
        />
        <HotspotPin
          position={[1.35, 1.25, -0.2]}
          anchorOffset={[-0.65, -0.75, 0]}
          label="ANNULAR COMBUSTOR"
          status={thermalAlert ? 'critical' : 'nominal'}
          active={selectedPart === 'ANNULAR COMBUSTOR'}
          onClick={() => onSelectPart('ANNULAR COMBUSTOR')}
        />
        <HotspotPin
          position={[-1.35, 1.25, -1.0]}
          anchorOffset={[0.65, -0.75, 0]}
          label="N2 HP TURBINE SPOOL"
          status={bearingWear ? 'warning' : 'nominal'}
          active={selectedPart === 'N2 HP TURBINE SPOOL'}
          onClick={() => onSelectPart('N2 HP TURBINE SPOOL')}
        />
      </Float>
    </group>
  );
}

/* ---------------- TRACK-UP HEADING GROUP (1:1 SYNC WITH 2D MAP) ---------------- */
function TrackUpWorldGroup({ children }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      // Rotating North-Up world by +headingRad puts the exact map direction straight ahead of nose (-Z)!
      groupRef.current.rotation.y = terrainState.headingRad;
    }
  });
  return <group ref={groupRef}>{children}</group>;
}

const PART_TARGETS = {
  'AVIONICS BAY / FADEC': [0, AIRCRAFT_Y + 0.12, 0],
  'STARBOARD ROTOR BUS': [0.85, AIRCRAFT_Y + 0.12, 0],
  'PORT ROTOR BUS': [-0.85, AIRCRAFT_Y + 0.12, 0],
  'CENTRAL AVIONICS CORE': [0, AIRCRAFT_Y + 0.08, -0.2],
  'PORT TURBINE': [-0.35, AIRCRAFT_Y - 0.2, -0.2],
  'STARBOARD TURBINE': [0.35, AIRCRAFT_Y - 0.2, -0.2],
  'N1 TITANIUM FAN STAGE': [0, AIRCRAFT_Y + 0.1, 0.85],
  'ANNULAR COMBUSTOR': [0.32, AIRCRAFT_Y + 0.05, -0.15],
  'N2 HP TURBINE SPOOL': [-0.32, AIRCRAFT_Y + 0.05, -0.65],
};

export function Engine3DViewer({ sendCommand = () => {} }) {
  const { telemetry, activePanel, recon, setReconOption, setGroundBotState, initiateLanding, initiateTakeoff, nudgeAltitude, toggleHoverHold } = useTelemetryStore();
  const assetMode = recon.assetMode || 'HEXA';
  const viewMode = recon.viewMode || 'SOLID';
  const setAssetMode = (m) => setReconOption('assetMode', m);
  const setViewMode = (m) => setReconOption('viewMode', m);
  const [selectedPart, setSelectedPart] = useState('AVIONICS BAY / FADEC');
  const [manualRepair, setManualRepair] = useState(false);
  const [repairProgress, setRepairProgress] = useState(0);
  const [audioOn, setAudioOn] = useState(false);
  const [isWelding, setIsWelding] = useState(false);
  const [artefactsOn, setArtefactsOn] = useState(true);

  const controlsRef = useRef();
  const keysPressedRef = useRef(new Set());

  // Live Keyboard Flight Control (W/S pitch, A/D bank & steer, Shift/Ctrl throttle, R rover, G gear)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        keysPressedRef.current.add('space');
        flightRuntime.verticalInput = 1;
        const st = useTelemetryStore.getState();
        if (st.recon.flightStatus === 'LANDED') st.initiateTakeoff();
        return;
      }
      keysPressedRef.current.add(k);
      if (k === 'c' || k === 'v') {
        flightRuntime.verticalInput = -1;
      } else if (k === 'h') {
        useTelemetryStore.getState().toggleHoverHold();
      } else if (k === 'l') {
        const st = useTelemetryStore.getState();
        if (st.recon.flightStatus === 'LANDED') st.initiateTakeoff();
        else if (st.recon.flightStatus === 'AIRBORNE') st.initiateLanding();
      }

      if (k === 'r') {
        const st = useTelemetryStore.getState();
        if (st.recon.groundBotState === 'STOWED') {
          st.setGroundBotState('DEPLOYING');
          st.setReconOption('cameraPreset', 'ROVER');
        } else if (st.recon.groundBotState === 'ROVING') {
          st.setGroundBotState('RECALLING');
          st.setReconOption('cameraPreset', 'ISO');
        }
      } else if (k === 'g') {
        const curGear = useTelemetryStore.getState().telemetry?.actuators?.gearDown ?? false;
        sendCommand({ type: 'setActuator', payload: { key: 'gearDown', value: !curGear } });
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') keysPressedRef.current.delete('space');
      keysPressedRef.current.delete(e.key.toLowerCase());
      const keys = keysPressedRef.current;
      if (keys.has('space')) flightRuntime.verticalInput = 1;
      else if (keys.has('c') || keys.has('v')) flightRuntime.verticalInput = -1;
      else flightRuntime.verticalInput = 0;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [sendCommand]);

  useEffect(() => {
    if (!recon.pilotMode) {
      sendCommand({ type: 'setManualControl', payload: { pitch: 0, roll: 0 } });
      return;
    }
    const id = setInterval(() => {
      const keys = keysPressedRef.current;
      let pitch = 0;
      let roll = 0;
      if (keys.has('w') || keys.has('arrowup')) pitch -= 1;
      if (keys.has('s') || keys.has('arrowdown')) pitch += 1;
      if (keys.has('a') || keys.has('arrowleft')) roll -= 1;
      if (keys.has('d') || keys.has('arrowright')) roll += 1;
      sendCommand({ type: 'setManualControl', payload: { pitch, roll } });

      if (keys.has('shift') || keys.has('e')) {
        const cur = useTelemetryStore.getState().telemetry?.actuators?.throttle ?? 55;
        sendCommand({ type: 'setActuator', payload: { key: 'throttle', value: Math.min(100, cur + 3) } });
      } else if (keys.has('control') || keys.has('q')) {
        const cur = useTelemetryStore.getState().telemetry?.actuators?.throttle ?? 55;
        sendCommand({ type: 'setActuator', payload: { key: 'throttle', value: Math.max(0, cur - 3) } });
      }
    }, 70);
    return () => clearInterval(id);
  }, [recon.pilotMode, sendCommand]);
  const roverWorldPosRef = useRef(new THREE.Vector3(0, AIRCRAFT_Y - 0.26, 0));
  const primaryWildlifePosRef = useRef(new THREE.Vector3(5.2, TERRAIN_BASE_Y + 0.4, -4.4));

  const faults = telemetry?.faults || {};
  const activeFaultKeys = Object.keys(faults).filter((k) => faults[k]);
  const hasActiveFault = activeFaultKeys.length > 0;
  const repairMode = recon.maintenanceBotActive && (manualRepair || hasActiveFault);
  const alertLevel = (telemetry?.anomalyScore ?? 0) > 0.45 ? 1 : 0;
  const isFull3D = activePanel === 1;
  const throttleVal = Math.round(telemetry?.actuators?.throttle ?? 55);

  useEffect(() => {
    propulsionAudio.update({
      rpm: telemetry?.rpm ?? 2850,
      assetMode,
      welding: isWelding,
    });
  }, [telemetry?.rpm, assetMode, isWelding]);

  useEffect(() => {
    if (!manualRepair) {
      setRepairProgress(0);
      return;
    }
    const id = setInterval(() => {
      setRepairProgress((prev) => {
        if (prev >= 100) {
          clearInterval(id);
          activeFaultKeys.forEach((k) => sendCommand({ type: 'setFault', payload: { key: k, value: false } }));
          setManualRepair(false);
          return 0;
        }
        return prev + 4;
      });
    }, 180);
    return () => clearInterval(id);
  }, [manualRepair]); // eslint-disable-line react-hooks/exhaustive-deps

  const botTarget = useMemo(() => {
    if (selectedPart && PART_TARGETS[selectedPart]) return PART_TARGETS[selectedPart];
    if (assetMode === 'CORE') return [0.32, AIRCRAFT_Y + 0.05, -0.15];
    if (assetMode === 'RECON') return [0.35, AIRCRAFT_Y - 0.2, -0.2];
    return [0.85, AIRCRAFT_Y + 0.12, 0];
  }, [selectedPart, assetMode]);

  const handleToggleAudio = () => {
    const next = propulsionAudio.toggle();
    setAudioOn(next);
  };

  const handleRoverAction = () => {
    if (recon.groundBotState === 'STOWED') {
      setGroundBotState('DEPLOYING');
      setReconOption('cameraPreset', 'ROVER');
    } else if (recon.groundBotState === 'ROVING') {
      setGroundBotState('RECALLING');
      setReconOption('cameraPreset', 'ISO');
    }
  };

  return (
    <div className="relative w-full h-full bg-[#040710]">
      <Canvas camera={{ position: [4.6, 3.8, 4.9], fov: 44, far: 140 }} dpr={[1, 2]}>
        <WeatherAtmosphere3D weatherMode={recon.weatherMode} />

        {!recon.terrainEnabled && (
          <Grid
            position={[0, TERRAIN_BASE_Y + 0.02, 0]}
            args={[30, 30]}
            cellSize={0.75}
            cellThickness={0.45}
            cellColor="#0c2640"
            sectionSize={3}
            sectionThickness={0.9}
            sectionColor="#164e63"
            fadeDistance={22}
            fadeStrength={1.6}
          />
        )}

        <TrackUpWorldGroup>
          <ReconTerrain3D
            visible={recon.terrainEnabled}
            scanActive={recon.reconScanActive}
            thermalMode={viewMode === 'THERMAL'}
            sendCommand={sendCommand}
          />

          <TerrainArtefacts3D
            visible={recon.terrainEnabled && artefactsOn}
            thermalMode={viewMode === 'THERMAL'}
          />

          <LidarPointCloud3D
            visible={recon.lidarCloudEnabled && recon.terrainEnabled}
            thermalMode={viewMode === 'THERMAL'}
          />

          <WildlifeScene3D
            visible={recon.wildlifeEnabled}
            thermalMode={viewMode === 'THERMAL'}
            primaryWildlifePosRef={primaryWildlifePosRef}
          />
        </TrackUpWorldGroup>

        <FlightCorridor3D visible={recon.corridorEnabled} />

        <RadarPulseFloor alertLevel={alertLevel} />
        <AirflowStreamlines enabled={recon.airflowEnabled} />
        <Sparkles count={45} scale={10} size={1.8} speed={0.35} opacity={0.35} color="#38bdf8" />

        <Suspense fallback={null}>
          {assetMode === 'HEXA' && (
            <TacticalDroneModel viewMode={viewMode} selectedPart={selectedPart} onSelectPart={setSelectedPart} />
          )}
          {assetMode === 'RECON' && (
            <ReconAirframeModel viewMode={viewMode} selectedPart={selectedPart} onSelectPart={setSelectedPart} />
          )}
          {assetMode === 'CORE' && (
            <PropulsionCoreModel viewMode={viewMode} selectedPart={selectedPart} onSelectPart={setSelectedPart} />
          )}
        </Suspense>

        <GroundBotDeploy3D roverWorldPosRef={roverWorldPosRef} />

        <HelperBots3D
          visible={recon.helperSwarmActive}
          roverWorldPosRef={roverWorldPosRef}
          wildlifePosRef={primaryWildlifePosRef}
        />

        <MaintenanceBot3D
          visible={recon.maintenanceBotActive}
          repairMode={repairMode}
          targetPoint={botTarget}
          statusLabel={
            manualRepair
              ? `MAINT-01 // REPAIRING ${repairProgress}%`
              : hasActiveFault
              ? 'MAINT-01 // FAULT LOCK'
              : 'MAINT-01 // LIDAR PATROL'
          }
          onWeldingChange={setIsWelding}
        />

        <OrbitControls ref={controlsRef} target={[0, 1.2, -0.4]} enableDamping dampingFactor={0.07} minDistance={2.2} maxDistance={28} />
        <SmoothCameraRig
          preset={recon.cameraPreset}
          controlsRef={controlsRef}
          roverWorldPosRef={roverWorldPosRef}
        />

        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.78} mipmapBlur intensity={0.62} />
          <Vignette eskil={false} offset={0.2} darkness={0.62} />
        </EffectComposer>
      </Canvas>

      {isFull3D && (
        <>
          <div className="absolute top-16 left-20 right-4 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="glass-pill p-1 flex items-center gap-1 pointer-events-auto">
              {[
                { id: 'HEXA', label: 'HEXA-UAV', icon: Disc },
                { id: 'CORE', label: 'TURBOFAN', icon: Cpu },
                { id: 'RECON', label: 'RECON JET', icon: Plane },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setAssetMode(id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                    assetMode === id
                      ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
              <button
                onClick={handleRoverAction}
                disabled={recon.groundBotState === 'DEPLOYING' || recon.groundBotState === 'RECALLING'}
                className={`glass-pill px-3 py-1.5 text-[10px] font-bold tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
                  recon.groundBotState === 'STOWED'
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/35'
                    : recon.groundBotState === 'ROVING'
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/35'
                    : 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 animate-pulse'
                }`}
              >
                {recon.groundBotState === 'STOWED' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                <span>
                  {recon.groundBotState === 'STOWED'
                    ? 'DEPLOY ROVER'
                    : recon.groundBotState === 'ROVING'
                    ? 'RECALL ROVER'
                    : recon.groundBotState}
                </span>
              </button>

              <div className="glass-pill p-1 flex items-center gap-1">
                <button
                  onClick={() => setReconOption('helperSwarmActive', !recon.helperSwarmActive)}
                  title="Toggle Helper Swarm (RELAY-02 & SCAN-03)"
                  className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer ${
                    recon.helperSwarmActive ? 'bg-sky-400/20 text-sky-200 border border-sky-400/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio size={11} /> SWARM
                </button>
                <button
                  onClick={() => setReconOption('wildlifeEnabled', !recon.wildlifeEnabled)}
                  title="Toggle 3D Wildlife Bio-Targets"
                  className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer ${
                    recon.wildlifeEnabled ? 'bg-teal-400/20 text-teal-200 border border-teal-400/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye size={11} /> WILDLIFE
                </button>
                <button
                  onClick={() => {
                    const next =
                      recon.mapOverlayMode === 'HOLO'
                        ? 'SAT'
                        : recon.mapLayer === 'SATELLITE'
                        ? 'DARK'
                        : 'HOLO';
                    if (next === 'HOLO') {
                      setReconOption('mapOverlayMode', 'HOLO');
                    } else {
                      setReconOption('mapOverlayMode', 'SAT');
                      setReconOption('mapLayer', next === 'DARK' ? 'DARK' : 'SATELLITE');
                    }
                  }}
                  title="Cycle 3D Terrain Map Texture (Real Satellite / Dark Map / Hologram)"
                  className="px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer bg-emerald-500/20 text-emerald-200 border border-emerald-400/45"
                >
                  <Layers size={11} /> {recon.mapOverlayMode === 'HOLO' ? 'HOLO' : recon.mapLayer === 'DARK' ? 'DARK MAP' : 'SAT MAP'}
                </button>
                <button
                  onClick={() => setReconOption('miniMapEnabled', !recon.miniMapEnabled)}
                  title="Toggle Synced Satellite Mini-Map Overlay"
                  className={`p-1.5 rounded-full cursor-pointer ${
                    recon.miniMapEnabled ? 'text-emerald-300 bg-emerald-500/20' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  <MapIcon size={12} />
                </button>
                <button
                  onClick={() => setReconOption('labelsEnabled', !recon.labelsEnabled)}
                  title="Show / Hide 3D Nametags"
                  className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer ${
                    recon.labelsEnabled ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Tag size={11} /> TAGS
                </button>
                <button
                  onClick={() => setArtefactsOn((v) => !v)}
                  title="Toggle 3D Terrain Cities, Houses, Forests & Wind Turbines"
                  className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer ${
                    artefactsOn ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Building2 size={11} /> WORLD
                </button>
                <button
                  onClick={() => setReconOption('terrainEnabled', !recon.terrainEnabled)}
                  title="Toggle 3D Topographic Recon Terrain"
                  className={`p-1.5 rounded-full cursor-pointer ${
                    recon.terrainEnabled ? 'text-cyan-300 bg-cyan-400/15' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  <Mountain size={12} />
                </button>
                <button
                  onClick={() => {
                    setReconOption('maintenanceBotActive', true);
                    setManualRepair((v) => !v);
                  }}
                  title="Trigger MAINT-01 Laser Repair"
                  className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer ${
                    repairMode ? 'bg-amber-400/25 text-amber-200 border border-amber-400/60 animate-pulse' : 'text-slate-300 hover:text-amber-200'
                  }`}
                >
                  <Wrench size={11} /> {manualRepair ? `${repairProgress}%` : 'REPAIR'}
                </button>
                <button
                  onClick={() => setReconOption('lidarCloudEnabled', !recon.lidarCloudEnabled)}
                  title="Toggle Live 3D LiDAR Point Cloud"
                  className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer ${
                    recon.lidarCloudEnabled ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ScanLine size={11} /> LIDAR
                </button>
                <button
                  onClick={() => setReconOption('corridorEnabled', !recon.corridorEnabled)}
                  title="Toggle Highway-in-the-Sky Flight Corridor"
                  className={`p-1.5 rounded-full cursor-pointer ${
                    recon.corridorEnabled ? 'text-cyan-300 bg-cyan-400/15' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  <Navigation size={12} />
                </button>
                <button
                  onClick={() => {
                    const order = ['CLEAR', 'DUSK', 'STORM', 'SNOW_ICING'];
                    const next = order[(order.indexOf(recon.weatherMode) + 1) % order.length];
                    setReconOption('weatherMode', next);
                    sendCommand({ type: 'setWeather', payload: { mode: next } });
                  }}
                  title={`Cycle Weather (Current: ${recon.weatherMode})`}
                  className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 cursor-pointer ${
                    recon.weatherMode !== 'CLEAR' ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <CloudLightning size={11} /> {recon.weatherMode === 'SNOW_ICING' ? 'SNOW' : recon.weatherMode}
                </button>
                <button
                  onClick={() => {
                    const next = !recon.pilotMode;
                    setReconOption('pilotMode', next);
                    sendCommand({ type: 'setFlightMode', payload: { mode: next ? 'MANUAL_PILOT' : 'LOITER' } });
                  }}
                  title="Toggle WASD Keyboard Manual Flight Control"
                  className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                    recon.pilotMode ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]' : 'text-slate-300 hover:text-emerald-200'
                  }`}
                >
                  <Gamepad2 size={11} /> PILOT
                </button>
                <button
                  onClick={() => setReconOption('airflowEnabled', !recon.airflowEnabled)}
                  title="Toggle Wind-Tunnel Airflow"
                  className={`p-1.5 rounded-full cursor-pointer ${
                    recon.airflowEnabled ? 'text-cyan-300 bg-cyan-400/15' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  <Wind size={12} />
                </button>
                <button
                  onClick={handleToggleAudio}
                  title="Toggle RPM-Synced Audio"
                  className={`p-1.5 rounded-full cursor-pointer ${
                    audioOn ? 'text-emerald-300 bg-emerald-400/15' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {audioOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
                </button>
              </div>

              <div className="glass-pill p-1 flex items-center gap-1">
                {['ISO', 'CHASE', 'GIMBAL', 'ROVER', 'TOP'].map((cam) => (
                  <button
                    key={cam}
                    onClick={() => setReconOption('cameraPreset', cam)}
                    className={`px-2 py-1 rounded-full text-[10px] font-mono transition-colors cursor-pointer ${
                      recon.cameraPreset === cam
                        ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/50'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cam}
                  </button>
                ))}
              </div>

              <div className="glass-pill p-1 flex items-center gap-1">
                {[
                  { id: 'SOLID', label: 'SOLID' },
                  { id: 'WIREFRAME', label: 'WIRE' },
                  { id: 'XRAY', label: 'HOLO' },
                  { id: 'THERMAL', label: 'FLIR' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setViewMode(id)}
                    className={`px-2 py-1 rounded-full text-[10px] font-mono transition-colors cursor-pointer ${
                      viewMode === id
                        ? 'bg-sky-400/25 text-white border border-sky-300/60'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {recon.pilotMode && (
            <div className="absolute top-32 left-1/2 -translate-x-1/2 z-30 glass-pill px-4 py-1.5 text-[10px] font-mono text-emerald-200 border-emerald-400/50 flex items-center gap-3 pointer-events-none">
              <span className="font-bold text-emerald-300">MANUAL PILOT ACTIVE</span>
              <span>[W/S] Pitch</span>
              <span>[A/D] Bank</span>
              <span>[SPACE/C] Up/Down</span>
              <span>[H] Hover Lock</span>
              <span>[L] Land/Takeoff</span>
              <span>[E/Q] Throttle</span>
              <span>[R] Rover</span>
            </div>
          )}

          {/* RIGHT-SIDE VERTICAL FLIGHT & LANDING PAD CONTROL DECK */}
          <div className="absolute right-5 top-1/2 -translate-y-1/2 z-30 w-52 holo-panel corner-bracket p-3 pointer-events-auto flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-cyan-400/20 pb-1.5">
              <span className="text-[10px] font-bold tracking-widest text-cyan-300">FLIGHT DECK // VTOL</span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                  recon.flightStatus === 'LANDED'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : recon.flightStatus === 'AIRBORNE'
                    ? 'bg-cyan-400/20 text-cyan-200'
                    : 'bg-amber-400/20 text-amber-200 animate-pulse'
                }`}
              >
                {recon.hoverHold && recon.flightStatus === 'AIRBORNE' ? 'HOVER LOCK' : recon.flightStatus.replace('_', ' ')}
              </span>
            </div>

            {/* Vertical Ascend / Hold / Descend Buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onMouseDown={() => {
                  flightRuntime.verticalInput = 1;
                  if (recon.flightStatus === 'LANDED') initiateTakeoff();
                }}
                onMouseUp={() => { flightRuntime.verticalInput = 0; }}
                onMouseLeave={() => { flightRuntime.verticalInput = 0; }}
                onClick={() => nudgeAltitude(0.65)}
                title="Ascend / Climb Up (Hold or Press SPACE)"
                className="py-2 rounded-lg bg-cyan-400/15 hover:bg-cyan-400/30 border border-cyan-400/40 text-cyan-200 flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-all"
              >
                <ArrowUpCircle size={15} />
                <span className="text-[9px] font-bold">UP</span>
              </button>

              <button
                onClick={toggleHoverHold}
                title="Toggle Stationary Hover Lock on Single Spot (Hotkey: H)"
                className={`py-2 rounded-lg border flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all active:scale-95 ${
                  recon.hoverHold
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-white/15 text-slate-300'
                }`}
              >
                <span className="text-[9px] font-bold">{recon.hoverHold ? 'HOVERING' : 'HOVER'}</span>
                <span className="text-[8px] text-cyan-300">{Math.round(flightRuntime.aglUnits * 1100)}ft</span>
              </button>

              <button
                onMouseDown={() => { flightRuntime.verticalInput = -1; }}
                onMouseUp={() => { flightRuntime.verticalInput = 0; }}
                onMouseLeave={() => { flightRuntime.verticalInput = 0; }}
                onClick={() => nudgeAltitude(-0.65)}
                title="Descend / Lower Altitude (Hold or Press C)"
                className="py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-all"
              >
                <ArrowDownCircle size={15} />
                <span className="text-[9px] font-bold">DOWN</span>
              </button>
            </div>

            {/* Designated Landing Zone Selector */}
            <div>
              <label className="text-[9px] text-slate-400 uppercase flex items-center gap-1 mb-1">
                <MapPin size={10} className="text-emerald-400" /> Landing / Takeoff Zone
              </label>
              <select
                value={recon.activePadId}
                onChange={(e) => setReconOption('activePadId', e.target.value)}
                className="w-full bg-slate-900/90 border border-white/15 focus:border-cyan-400 rounded-lg px-2 py-1.5 text-[10px] text-cyan-100 outline-none cursor-pointer"
              >
                {LANDING_PADS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-950">
                    {p.shortName} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Land at Pad / Takeoff CTA */}
            {recon.flightStatus === 'LANDED' ? (
              <button
                onClick={() => initiateTakeoff(recon.activePadId)}
                className="w-full py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/60 text-emerald-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_14px_rgba(16,185,129,0.28)]"
              >
                <PlaneTakeoff size={14} /> TAKEOFF ({getPadById(recon.activePadId).shortName})
              </button>
            ) : (
              <button
                onClick={() => initiateLanding(recon.activePadId)}
                disabled={recon.flightStatus === 'APPROACHING_PAD' || recon.flightStatus === 'LANDING'}
                className={`w-full py-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  recon.flightStatus === 'APPROACHING_PAD' || recon.flightStatus === 'LANDING'
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 animate-pulse cursor-wait'
                    : 'bg-cyan-500/20 hover:bg-cyan-500/35 border-cyan-400/60 text-cyan-100'
                }`}
              >
                <PlaneLanding size={14} />
                {recon.flightStatus === 'APPROACHING_PAD'
                  ? 'APPROACHING...'
                  : recon.flightStatus === 'LANDING'
                  ? 'DESCENDING...'
                  : `LAND @ ${getPadById(recon.activePadId).shortName}`}
              </button>
            )}
          </div>

          {selectedPart && (
            <div className="absolute bottom-5 left-20 z-30 w-80 holo-panel corner-bracket p-3.5 pointer-events-auto">
              <div className="flex items-center justify-between border-b border-cyan-400/20 pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-cyan-400" />
                  <span className="text-xs font-bold tracking-wider text-cyan-200 truncate">{selectedPart}</span>
                </div>
                <button onClick={() => setSelectedPart(null)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] mb-2.5">
                <div className="bg-slate-900/70 rounded-lg p-2 border border-white/5">
                  <div className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                    <Thermometer size={11} className="text-cyan-400" /> Temp
                  </div>
                  <div className="text-base font-bold text-cyan-300 mt-0.5">
                    {(telemetry?.avionicsTemp ?? 35.4).toFixed(1)} °C
                  </div>
                </div>
                <div className="bg-slate-900/70 rounded-lg p-2 border border-white/5">
                  <div className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                    <Gauge size={11} className="text-emerald-400" /> Est. RUL
                  </div>
                  <div className="text-base font-bold text-emerald-300 mt-0.5">
                    {(telemetry?.rulHours ?? 1420).toFixed(0)} hrs
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/65 rounded-lg p-2 border border-white/5 mb-2">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-slate-400 flex items-center gap-1"><Zap size={10} className="text-cyan-400" /> LIVE THROTTLE</span>
                  <span className="text-cyan-300 font-bold">{throttleVal}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={throttleVal}
                  onChange={(e) =>
                    sendCommand({ type: 'setActuator', payload: { key: 'throttle', value: Number(e.target.value) } })
                  }
                  className="w-full"
                />
              </div>

              {manualRepair && (
                <div className="mb-2">
                  <div className="flex justify-between text-[10px] text-amber-300 mb-1">
                    <span>MAINT-01 LASER REPAIR</span>
                    <span>{repairProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-amber-400/30">
                    <div className="h-full bg-amber-400 transition-all duration-150" style={{ width: `${repairProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>BIO LOCKS: <strong className="text-teal-300">{recon.contacts.length}</strong></span>
                <span>UGV: <strong className="text-emerald-300">{recon.groundBotState}</strong></span>
              </div>
            </div>
          )}

          <MiniMapOverlay visible={recon.miniMapEnabled} />

          <div className="absolute bottom-5 right-5 z-30 glass-pill px-4 py-2 flex flex-wrap items-center gap-3.5 text-[11px] font-mono pointer-events-auto">
            <span>
              <span className="text-slate-400">{assetMode === 'HEXA' ? 'RPM:' : 'N1:'}</span>{' '}
              <strong className="text-cyan-300">
                {assetMode === 'HEXA'
                  ? Math.round(telemetry?.rpm || 2850)
                  : `${Math.min(100, Math.round((telemetry?.rpm || 3100) / 55))}%`}
              </strong>
            </span>
            <span className="text-slate-700">|</span>
            <span>
              <span className="text-slate-400">ALT:</span>{' '}
              <strong className="text-emerald-300">{Math.round(telemetry?.densityAltitude ?? 8500)} FT</strong>
            </span>
            <span className="text-slate-700">|</span>
            <span>
              <span className="text-slate-400">PHASE:</span>{' '}
              <strong className="text-sky-300">{recon.missionPhase}</strong>
            </span>
            <span className="text-slate-700">|</span>
            <span>
              <span className="text-slate-400">OIL:</span>{' '}
              <strong className={(telemetry?.oilPressure ?? 4.5) < 1.8 ? 'text-rose-400' : 'text-cyan-300'}>
                {(telemetry?.oilPressure ?? 4.5).toFixed(1)} BAR
              </strong>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
