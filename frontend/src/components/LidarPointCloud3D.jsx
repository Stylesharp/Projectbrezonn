import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { getTerrainHeight, terrainState, TERRAIN_BASE_Y } from './ReconTerrain3D';

const POINT_COUNT = 1600;

/**
 * Simulates a real-time airborne spinning LiDAR scanner projecting laser pulses
 * onto the moving 3D topography, painting glowing elevation-colored 3D points
 * that drift naturally aft with the ground beneath the UAV.
 */
export function LidarPointCloud3D({ visible = true, thermalMode = false }) {
  const pointsRef = useRef();
  const writeCursorRef = useRef(0);
  const lastOffsetRef = useRef({ x: 0, z: 0 });

  const { geometry, positions, colors } = useMemo(() => {
    const pos = new Float32Array(POINT_COUNT * 3);
    const col = new Float32Array(POINT_COUNT * 3);
    for (let i = 0; i < POINT_COUNT; i++) {
      pos[i * 3 + 1] = -999; // hidden until scanned
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { geometry: geo, positions: pos, colors: col };
  }, []);

  useFrame(({ clock }) => {
    if (!visible || !pointsRef.current) return;
    const t = clock.getElapsedTime();
    const { recon } = useTelemetryStore.getState();

    // Shift existing scanned points along with the scrolling terrain so they stay locked to hills!
    const dOffX = terrainState.offsetX - lastOffsetRef.current.x;
    const dOffZ = terrainState.offsetZ - lastOffsetRef.current.z;
    lastOffsetRef.current.x = terrainState.offsetX;
    lastOffsetRef.current.z = terrainState.offsetZ;

    for (let i = 0; i < POINT_COUNT; i++) {
      const idx = i * 3;
      if (positions[idx + 1] > -100) {
        positions[idx] -= dOffX;
        positions[idx + 2] -= dOffZ;
        // Fade out points that drifted past the horizon
        if (Math.hypot(positions[idx], positions[idx + 2]) > 27.0) {
          positions[idx + 1] = -999;
        }
      }
    }

    // Cast 26 new LiDAR sweep rays per frame across a rotating swath beneath the drone
    const sweepAngle = t * 2.2;
    const raysPerFrame = recon.groundBotState === 'ROVING' ? 16 : 28;
    for (let r = 0; r < raysPerFrame; r++) {
      const i = writeCursorRef.current;
      writeCursorRef.current = (i + 1) % POINT_COUNT;

      const spread = (r / raysPerFrame - 0.5) * 24.0;
      const forward = -8.5 + Math.sin(sweepAngle + r * 0.12) * 8.0 + (Math.random() - 0.5) * 0.8;
      const sx = spread * Math.cos(sweepAngle * 0.25) + (Math.random() - 0.5) * 0.25;
      const sz = forward;
      const sy = getTerrainHeight(sx, sz) + 0.05;

      const idx = i * 3;
      positions[idx] = sx;
      positions[idx + 1] = sy;
      positions[idx + 2] = sz;

      // Elevation-mapped LiDAR false color (emerald low -> cyan mid -> amber/white high peaks)
      const hNorm = THREE.MathUtils.clamp((sy - TERRAIN_BASE_Y) / 3.8, 0, 1);
      if (thermalMode) {
        colors[idx] = 0.75 + hNorm * 0.25;
        colors[idx + 1] = 0.2 + hNorm * 0.75;
        colors[idx + 2] = 0.1 + (1 - hNorm) * 0.45;
      } else {
        colors[idx] = hNorm > 0.65 ? (hNorm - 0.65) * 2.8 : 0.08;
        colors[idx + 1] = 0.65 + hNorm * 0.35;
        colors[idx + 2] = 0.95 - hNorm * 0.25;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });

  if (!visible) return null;

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.14}
        vertexColors
        transparent
        opacity={0.82}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
