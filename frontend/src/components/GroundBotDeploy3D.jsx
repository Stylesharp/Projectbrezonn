import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { getTerrainHeight, getTerrainHeightScreen, TERRAIN_BASE_Y } from './ReconTerrain3D';
import { flightRuntime } from '../utils/flightConfig';
const ROVER_SCALE = 0.56;
const GROUND_CLEARANCE = 0.11;

export function GroundBotDeploy3D({ roverWorldPosRef }) {
  const groundBotState = useTelemetryStore((s) => s.recon.groundBotState);
  const labelsEnabled = useTelemetryStore((s) => s.recon.labelsEnabled);
  const setGroundBotState = useTelemetryStore((s) => s.setGroundBotState);

  const roverRef = useRef();
  const tetherRef = useRef();
  const bayGroupRef = useRef();
  const hatchLeftRef = useRef();
  const hatchRightRef = useRef();
  const wheelRefs = useRef([]);
  const lidarRef = useRef();
  const retroFlameRefs = useRef([]);
  const dustRingRef = useRef();
  const scanFanRef = useRef();

  const progressRef = useRef(0);
  const patrolAngleRef = useRef(0);
  const dustPhaseRef = useRef(1.0);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.getElapsedTime();
    const rover = roverRef.current;
    if (!rover) return;

    const hatchOpen = groundBotState === 'DEPLOYING' || groundBotState === 'RECALLING';
    const targetHatch = hatchOpen ? 1.15 : 0.0;
    if (hatchLeftRef.current) {
      hatchLeftRef.current.rotation.z = THREE.MathUtils.lerp(hatchLeftRef.current.rotation.z, -targetHatch, 0.1);
    }
    if (hatchRightRef.current) {
      hatchRightRef.current.rotation.z = THREE.MathUtils.lerp(hatchRightRef.current.rotation.z, targetHatch, 0.1);
    }

    const dockY = flightRuntime.aircraftY - 0.26;
    if (bayGroupRef.current) bayGroupRef.current.position.y = dockY + 0.04;
    const groundYAtCenter = getTerrainHeight(0, 0) + GROUND_CLEARANCE;

    if (groundBotState === 'STOWED') {
      progressRef.current = 0;
      rover.position.set(0, dockY, 0);
      rover.rotation.set(0, 0, 0);
      rover.scale.setScalar(ROVER_SCALE * 0.5);
      if (tetherRef.current) tetherRef.current.visible = false;
      if (scanFanRef.current) scanFanRef.current.visible = false;
    } else if (groundBotState === 'DEPLOYING') {
      progressRef.current = Math.min(1, progressRef.current + dt * 0.34);
      const ease = 1 - Math.pow(1 - progressRef.current, 3);
      const curY = THREE.MathUtils.lerp(dockY, groundYAtCenter, ease);
      const sway = Math.sin(t * 5.0) * (1 - ease) * 0.09;

      rover.position.set(sway, curY, 0);
      rover.rotation.set(0, ease * Math.PI * 0.5, sway * 0.6);
      rover.scale.setScalar(THREE.MathUtils.lerp(ROVER_SCALE * 0.5, ROVER_SCALE, Math.min(1, ease * 1.6)));

      if (tetherRef.current) {
        const cableLen = Math.max(0.05, dockY - curY);
        tetherRef.current.visible = true;
        tetherRef.current.position.set(sway * 0.5, (dockY + curY) * 0.5, 0);
        tetherRef.current.scale.set(1, cableLen, 1);
      }
      if (scanFanRef.current) scanFanRef.current.visible = false;

      if (progressRef.current >= 1) {
        dustPhaseRef.current = 0.0;
        patrolAngleRef.current = 0;
        setGroundBotState('ROVING');
      }
    } else if (groundBotState === 'ROVING') {
      rover.scale.setScalar(ROVER_SCALE);
      if (tetherRef.current) tetherRef.current.visible = false;
      if (scanFanRef.current) scanFanRef.current.visible = true;

      patrolAngleRef.current += dt * 0.48;
      const a = patrolAngleRef.current;
      const rx = Math.sin(a) * 3.1;
      const rz = Math.sin(a * 0.5) * Math.cos(a) * 2.8 + Math.cos(a) * 1.9;
      const nextX = Math.sin(a + 0.05) * 3.1;
      const nextZ = Math.sin((a + 0.05) * 0.5) * Math.cos(a + 0.05) * 2.8 + Math.cos(a + 0.05) * 1.9;

      const groundY = getTerrainHeightScreen(rx, rz) + GROUND_CLEARANCE;
      const bounce = Math.sin(t * 14) * 0.008;
      rover.position.lerp(new THREE.Vector3(rx, groundY + bounce, rz), 0.14);

      const targetYaw = Math.atan2(nextX - rx, nextZ - rz);
      const dy = Math.atan2(Math.sin(targetYaw - rover.rotation.y), Math.cos(targetYaw - rover.rotation.y));
      rover.rotation.y += dy * 0.14;
      rover.rotation.x = Math.sin(t * 7) * 0.025;
      rover.rotation.z = Math.cos(t * 6) * 0.025;

      wheelRefs.current.forEach((w) => {
        if (w) w.rotation.x += dt * 7.5;
      });
    } else if (groundBotState === 'RECALLING') {
      if (scanFanRef.current) scanFanRef.current.visible = false;
      const horizDist = Math.hypot(rover.position.x, rover.position.z);

      if (horizDist > 0.14) {
        const groundY = getTerrainHeightScreen(rover.position.x, rover.position.z) + GROUND_CLEARANCE;
        rover.position.x = THREE.MathUtils.lerp(rover.position.x, 0, dt * 2.2);
        rover.position.z = THREE.MathUtils.lerp(rover.position.z, 0, dt * 2.2);
        rover.position.y = THREE.MathUtils.lerp(rover.position.y, groundY, 0.2);
        rover.rotation.y = Math.atan2(-rover.position.x, -rover.position.z);
        wheelRefs.current.forEach((w) => {
          if (w) w.rotation.x += dt * 6.5;
        });
        if (tetherRef.current) tetherRef.current.visible = false;
      } else {
        progressRef.current = Math.max(0, progressRef.current - dt * 0.42);
        const curY = THREE.MathUtils.lerp(dockY, groundYAtCenter, progressRef.current);
        rover.position.set(0, curY, 0);
        rover.scale.setScalar(THREE.MathUtils.lerp(ROVER_SCALE * 0.5, ROVER_SCALE, Math.min(1, progressRef.current * 1.5)));
        if (tetherRef.current) {
          const cableLen = Math.max(0.05, dockY - curY);
          tetherRef.current.visible = true;
          tetherRef.current.position.set(0, (dockY + curY) * 0.5, 0);
          tetherRef.current.scale.set(1, cableLen, 1);
        }
        if (progressRef.current <= 0.01) {
          setGroundBotState('STOWED');
        }
      }
    }

    const firingRetro =
      groundBotState === 'DEPLOYING' ||
      (groundBotState === 'RECALLING' && rover.position.y > groundYAtCenter + 0.08);
    retroFlameRefs.current.forEach((flame) => {
      if (!flame) return;
      flame.visible = firingRetro;
      if (firingRetro) flame.scale.set(1, 0.8 + Math.sin(t * 42) * 0.35, 1);
    });

    if (dustRingRef.current) {
      if (dustPhaseRef.current < 1.0) {
        dustPhaseRef.current = Math.min(1.0, dustPhaseRef.current + dt * 1.1);
        dustRingRef.current.visible = true;
        const s = 0.4 + dustPhaseRef.current * 2.8;
        dustRingRef.current.scale.set(s, s, 1);
        dustRingRef.current.material.opacity = (1 - dustPhaseRef.current) * 0.78;
      } else {
        dustRingRef.current.visible = false;
      }
    }

    if (lidarRef.current) {
      lidarRef.current.rotation.y += dt * (groundBotState === 'ROVING' ? 5.5 : 1.5);
    }

    if (roverWorldPosRef) roverWorldPosRef.current.copy(rover.position);
  });

  const isVisible = groundBotState !== 'STOWED';

  return (
    <group>
      {/* UAV Underbelly Payload Bay Doors */}
      <group ref={bayGroupRef} position={[0, 1.58, 0]}>
        <group ref={hatchLeftRef} position={[-0.14, 0, 0]}>
          <mesh position={[0.07, 0, 0]}>
            <boxGeometry args={[0.14, 0.016, 0.28]} />
            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.25} emissive="#0ea5e9" emissiveIntensity={0.25} />
          </mesh>
        </group>
        <group ref={hatchRightRef} position={[0.14, 0, 0]}>
          <mesh position={[-0.07, 0, 0]}>
            <boxGeometry args={[0.14, 0.016, 0.28]} />
            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.25} emissive="#0ea5e9" emissiveIntensity={0.25} />
          </mesh>
        </group>
      </group>

      {/* High-Altitude Retractable Winch Tether */}
      <mesh ref={tetherRef} visible={false}>
        <cylinderGeometry args={[0.01, 0.01, 1, 8]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>

      {/* Touchdown Shockwave Ring on Valley Floor */}
      <mesh ref={dustRingRef} visible={false} position={[0, TERRAIN_BASE_Y + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.56, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* 6x6 Autonomous Ground Rover (UGV-01) */}
      <group ref={roverRef} position={[0, 1.54, 0]} visible={isVisible}>
        <mesh castShadow>
          <boxGeometry args={[0.52, 0.18, 0.78]} />
          <meshStandardMaterial color="#0f172a" metalness={0.88} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0.11, -0.05]}>
          <boxGeometry args={[0.42, 0.05, 0.56]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} emissive="#0284c7" emissiveIntensity={0.35} />
        </mesh>
        {[-0.16, 0.16].map((x, idx) => (
          <mesh key={idx} position={[x, 0.02, 0.4]}>
            <boxGeometry args={[0.09, 0.045, 0.03]} />
            <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={2.6} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 0.04, -0.4]}>
          <boxGeometry args={[0.32, 0.03, 0.02]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={2.0} toneMapped={false} />
        </mesh>

        <group position={[0, 0.24, 0.08]} ref={lidarRef}>
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.045, 0.06, 0.1, 12]} />
            <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <cylinderGeometry args={[0.095, 0.095, 0.09, 16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.15} emissive="#22d3ee" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[0, 0.04, 0.09]}>
            <boxGeometry args={[0.08, 0.04, 0.04]} />
            <meshBasicMaterial color="#10b981" toneMapped={false} />
          </mesh>
        </group>

        <mesh ref={scanFanRef} position={[0, -0.02, 1.05]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.85, 1.35, 16, 1, true]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>

        {[
          [-0.31, -0.08, 0.26], [0.31, -0.08, 0.26],
          [-0.31, -0.08, 0.0],  [0.31, -0.08, 0.0],
          [-0.31, -0.08, -0.26],[0.31, -0.08, -0.26],
        ].map((pos, idx) => (
          <group key={idx} position={pos}>
            <mesh ref={(el) => { wheelRefs.current[idx] = el; }} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.11, 0.11, 0.09, 14]} />
              <meshStandardMaterial color="#020617" roughness={0.75} metalness={0.4} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.045, 0.045, 0.1, 10]} />
              <meshBasicMaterial color="#22d3ee" />
            </mesh>
          </group>
        ))}

        {[
          [-0.22, -0.15, 0.3], [0.22, -0.15, 0.3],
          [-0.22, -0.15, -0.3], [0.22, -0.15, -0.3],
        ].map((pos, idx) => (
          <mesh key={idx} ref={(el) => { retroFlameRefs.current[idx] = el; }} position={pos} visible={false}>
            <coneGeometry args={[0.055, 0.32, 10]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} toneMapped={false} />
          </mesh>
        ))}

        {labelsEnabled && (
          <Html position={[0, 0.55, 0]} center zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
            <div className="px-1.5 py-0.5 rounded border border-emerald-400/60 bg-emerald-950/85 backdrop-blur-sm text-[8px] leading-none font-mono text-emerald-200 tracking-wide whitespace-nowrap select-none pointer-events-none">
              UGV-01 // {groundBotState}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
