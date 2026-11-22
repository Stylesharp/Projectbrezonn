import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { flightRuntime } from '../utils/flightConfig';

const GATE_COUNT = 5;

/**
 * Military Synthetic Vision "Highway-in-the-Sky" (HITS) 3D Flight Corridor:
 * Glowing holographic navigation gates stream toward the aircraft and curve
 * dynamically with live roll/pitch steering vectors.
 */
export function FlightCorridor3D({ visible = true }) {
  const gateRefs = useRef([]);
  const zOffsets = useRef(Array.from({ length: GATE_COUNT }, (_, i) => -2.8 - i * 3.0));

  useFrame((_, delta) => {
    if (!visible) return;
    const dt = Math.min(delta, 0.05);
    const { telemetry, recon } = useTelemetryStore.getState();
    const hovering = Boolean(recon.hoverHold) || recon.groundBotState !== 'STOWED' || recon.flightStatus !== 'AIRBORNE';
    const throttle = (telemetry?.actuators?.throttle ?? 55) / 100;
    const speed = hovering ? 0 : 2.6 + throttle * 4.5;
    const roll = THREE.MathUtils.degToRad(telemetry?.rollAngle ?? 0);
    const pitch = THREE.MathUtils.degToRad(telemetry?.pitchAngle ?? 0);

    zOffsets.current.forEach((z, idx) => {
      let nextZ = z + speed * dt;
      if (nextZ > 1.5) nextZ -= GATE_COUNT * 3.0;
      zOffsets.current[idx] = nextZ;

      const mesh = gateRefs.current[idx];
      if (!mesh) return;
      const ahead = Math.max(0, -nextZ);
      // Curve corridor smoothly into turns and climbs
      const curveX = Math.sin(roll) * ahead * ahead * 0.11;
      const curveY = flightRuntime.aircraftY + Math.sin(pitch) * ahead * 0.35;
      mesh.position.set(curveX, curveY, nextZ);
      mesh.rotation.z = -roll * 0.45;
      const fade = hovering ? 0.0 : THREE.MathUtils.clamp(1 - Math.abs(nextZ + 5.5) / 8.5, 0.08, 0.55);
      if (mesh.material) mesh.material.opacity = fade;
    });
  });

  if (!visible) return null;

  return (
    <group>
      {Array.from({ length: GATE_COUNT }, (_, idx) => (
        <mesh
          key={idx}
          ref={(el) => { gateRefs.current[idx] = el; }}
          position={[0, 1.8, -2.8 - idx * 3.0]}
        >
          <ringGeometry args={[0.88, 0.93, 6]} />
          <meshBasicMaterial
            color="#22d3ee"
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
