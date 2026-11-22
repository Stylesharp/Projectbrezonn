import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';

const PRECIP_COUNT = 520;

export function WeatherAtmosphere3D({ weatherMode = 'CLEAR' }) {
  const instancedRef = useRef();
  const lightningRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const drops = useMemo(
    () =>
      Array.from({ length: PRECIP_COUNT }, () => ({
        x: (Math.random() - 0.5) * 38,
        y: Math.random() * 17 - 6.2,
        z: (Math.random() - 0.5) * 38,
        speed: 0.75 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      })),
    []
  );

  const isStorm = weatherMode === 'STORM';
  const isSnow = weatherMode === 'SNOW_ICING';
  const isDusk = weatherMode === 'DUSK';
  const hasPrecip = isStorm || isSnow;

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    const wind = (useTelemetryStore.getState().telemetry?.windSpeed ?? 18) / 25;

    if (hasPrecip && instancedRef.current) {
      for (let i = 0; i < PRECIP_COUNT; i++) {
        const d = drops[i];
        if (isStorm) {
          d.y -= (13.5 * d.speed) * dt;
          d.z += (4.5 + wind * 3.0) * dt;
          d.x += Math.sin(t + d.phase) * 0.4 * dt;
        } else {
          d.y -= (2.2 * d.speed) * dt;
          d.z += (1.8 + wind * 1.4) * dt;
          d.x += Math.sin(t * 1.6 + d.phase) * 0.9 * dt;
        }

        if (d.y < -6.3) d.y = 10.5 + Math.random() * 2.0;
        if (d.z > 19) d.z -= 38;
        if (d.x > 19) d.x -= 38;
        if (d.x < -19) d.x += 38;

        dummy.position.set(d.x, d.y, d.z);
        if (isStorm) {
          dummy.rotation.set(0.32, 0, 0.06);
          dummy.scale.set(0.014, 0.42, 0.014);
        } else {
          dummy.rotation.set(t + d.phase, t * 0.7, 0);
          dummy.scale.set(0.042, 0.042, 0.042);
        }
        dummy.updateMatrix();
        instancedRef.current.setMatrixAt(i, dummy.matrix);
      }
      instancedRef.current.instanceMatrix.needsUpdate = true;
    }

    // Realistic infrequent volumetric lightning flash in STORM mode
    if (lightningRef.current) {
      if (isStorm) {
        const cycle = t % 6.2;
        const flash = (cycle > 5.7 && cycle < 5.79) || (cycle > 5.84 && cycle < 5.91);
        lightningRef.current.intensity = flash ? 6.5 : 0;
      } else {
        lightningRef.current.intensity = 0;
      }
    }
  });

  const bgCol = isDusk ? '#120b1e' : isSnow ? '#08121e' : isStorm ? '#040812' : '#040710';
  const sunCol = isDusk ? '#fb923c' : isSnow ? '#bae6fd' : isStorm ? '#64748b' : '#e0f2fe';
  const sunIntensity = isDusk ? 1.8 : isStorm ? 0.9 : 1.5;

  return (
    <>
      <color attach="background" args={[bgCol]} />
      <fog attach="fog" args={[bgCol, isStorm || isSnow ? 18 : 26, isStorm ? 46 : 62]} />

      <ambientLight intensity={isDusk ? 0.6 : isSnow ? 0.7 : 0.55} />
      <directionalLight position={isDusk ? [-10, 4, -8] : [6, 10, 6]} intensity={sunIntensity} color={sunCol} />
      <pointLight position={[-5, 3, -4]} intensity={1.6} color={isDusk ? '#f59e0b' : '#22d3ee'} />
      <pointLight position={[4, -1, 4]} intensity={1.1} color="#38bdf8" />
      <pointLight ref={lightningRef} position={[2, 9, -6]} intensity={0} distance={40} color="#dbeafe" />

      {hasPrecip && (
        <instancedMesh ref={instancedRef} args={[null, null, PRECIP_COUNT]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={isSnow ? '#e0f2fe' : '#7dd3fc'}
            transparent
            opacity={isSnow ? 0.75 : 0.42}
            depthWrite={false}
          />
        </instancedMesh>
      )}
    </>
  );
}
