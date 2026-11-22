import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeight } from './ReconTerrain3D';
import { useTelemetryStore } from '../store/useTelemetryStore';

function FlappingBird({ radius, altitude, speed, phase, thermalMode, label, showLabels }) {
  const birdRef = useRef();
  const leftWingRef = useRef();
  const rightWingRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const ang = t * speed + phase;
    const x = Math.cos(ang) * radius;
    const z = Math.sin(ang) * radius;
    const y = altitude + Math.sin(t * 1.4 + phase) * 0.35;

    const nx = Math.cos(ang + 0.08) * radius;
    const nz = Math.sin(ang + 0.08) * radius;

    if (birdRef.current) {
      birdRef.current.position.set(x, y, z);
      birdRef.current.lookAt(nx, y, nz);
      birdRef.current.rotation.z += 0.26;
    }

    const flapAngle = Math.sin(t * 7.5 + phase * 3.0) * 0.62;
    if (leftWingRef.current) leftWingRef.current.rotation.z = flapAngle;
    if (rightWingRef.current) rightWingRef.current.rotation.z = -flapAngle;
  });

  const bodyCol = thermalMode ? '#facc15' : '#38bdf8';
  const emissiveCol = thermalMode ? '#f97316' : '#0284c7';

  return (
    <group ref={birdRef} scale={0.62}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.045, 0.24, 6]} />
        <meshStandardMaterial color={bodyCol} emissive={emissiveCol} emissiveIntensity={thermalMode ? 1.8 : 0.7} />
      </mesh>
      <group ref={leftWingRef} position={[-0.03, 0.01, 0]}>
        <mesh position={[-0.14, 0, -0.02]}>
          <boxGeometry args={[0.28, 0.012, 0.09]} />
          <meshStandardMaterial color={bodyCol} emissive={emissiveCol} emissiveIntensity={thermalMode ? 1.5 : 0.5} />
        </mesh>
      </group>
      <group ref={rightWingRef} position={[0.03, 0.01, 0]}>
        <mesh position={[0.14, 0, -0.02]}>
          <boxGeometry args={[0.28, 0.012, 0.09]} />
          <meshStandardMaterial color={bodyCol} emissive={emissiveCol} emissiveIntensity={thermalMode ? 1.5 : 0.5} />
        </mesh>
      </group>
      {label && showLabels && (
        <Html position={[0, 0.35, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="px-1 py-0.5 rounded bg-slate-950/75 border border-sky-400/35 text-[8px] leading-none font-mono text-sky-200/85 whitespace-nowrap select-none pointer-events-none">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function WalkingAnimal({
  orbitRadius,
  centerOffset = [0, 0],
  speed = 0.28,
  phase = 0,
  scale = 0.52,
  isStag = true,
  thermalMode = false,
  tagLabel,
  reportPosRef,
  showLabels,
}) {
  const animalRef = useRef();
  const legRefs = useRef([]);
  const headRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const ang = t * speed + phase;
    const x = centerOffset[0] + Math.cos(ang) * orbitRadius;
    const z = centerOffset[1] + Math.sin(ang) * orbitRadius;
    const nx = centerOffset[0] + Math.cos(ang + 0.08) * orbitRadius;
    const nz = centerOffset[1] + Math.sin(ang + 0.08) * orbitRadius;
    const groundY = getTerrainHeight(x, z);

    const stride = t * (isStag ? 4.8 : 6.4) + phase;
    const bob = Math.abs(Math.sin(stride)) * 0.022 * scale;

    if (animalRef.current) {
      animalRef.current.position.set(x, groundY + 0.22 * scale + bob, z);
      animalRef.current.lookAt(nx, groundY + 0.22 * scale, nz);
    }

    if (reportPosRef) {
      reportPosRef.current.set(x, groundY + 0.3, z);
    }

    const swing = Math.sin(stride) * 0.45;
    if (legRefs.current[0]) legRefs.current[0].rotation.x = swing;
    if (legRefs.current[3]) legRefs.current[3].rotation.x = swing;
    if (legRefs.current[1]) legRefs.current[1].rotation.x = -swing;
    if (legRefs.current[2]) legRefs.current[2].rotation.x = -swing;

    if (headRef.current) {
      headRef.current.rotation.x = Math.sin(t * 1.6 + phase) * 0.14;
      headRef.current.rotation.y = Math.cos(t * 0.9 + phase) * 0.18;
    }
  });

  const primaryCol = thermalMode ? '#fb923c' : isStag ? '#2dd4bf' : '#a78bfa';
  const emissiveCol = thermalMode ? '#ef4444' : isStag ? '#0d9488' : '#7c3aed';

  return (
    <group ref={animalRef} scale={scale}>
      <mesh castShadow>
        <boxGeometry args={[0.16, 0.14, 0.42]} />
        <meshStandardMaterial color={primaryCol} emissive={emissiveCol} emissiveIntensity={thermalMode ? 1.8 : 0.65} />
      </mesh>
      <group ref={headRef} position={[0, 0.11, 0.21]}>
        <mesh position={[0, 0.06, 0.04]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[0.08, 0.16, 0.08]} />
          <meshStandardMaterial color={primaryCol} emissive={emissiveCol} emissiveIntensity={thermalMode ? 1.7 : 0.6} />
        </mesh>
        <mesh position={[0, 0.14, 0.1]}>
          <boxGeometry args={[0.09, 0.08, 0.15]} />
          <meshStandardMaterial color={primaryCol} emissive={emissiveCol} emissiveIntensity={thermalMode ? 1.8 : 0.7} />
        </mesh>
        {isStag && (
          <>
            <mesh position={[-0.06, 0.25, 0.06]} rotation={[0.1, 0, 0.45]}>
              <cylinderGeometry args={[0.008, 0.012, 0.18, 6]} />
              <meshBasicMaterial color={thermalMode ? '#fef08a' : '#5eead4'} />
            </mesh>
            <mesh position={[0.06, 0.25, 0.06]} rotation={[0.1, 0, -0.45]}>
              <cylinderGeometry args={[0.008, 0.012, 0.18, 6]} />
              <meshBasicMaterial color={thermalMode ? '#fef08a' : '#5eead4'} />
            </mesh>
          </>
        )}
      </group>
      {[
        [-0.06, -0.06, 0.14], [0.06, -0.06, 0.14],
        [-0.06, -0.06, -0.14], [0.06, -0.06, -0.14],
      ].map((pos, idx) => (
        <group key={idx} position={pos} ref={(el) => { legRefs.current[idx] = el; }}>
          <mesh position={[0, -0.1, 0]}>
            <boxGeometry args={[0.035, 0.22, 0.035]} />
            <meshStandardMaterial color={primaryCol} emissive={emissiveCol} emissiveIntensity={0.45} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.31, 20]} />
        <meshBasicMaterial
          color={thermalMode ? '#f97316' : '#2dd4bf'}
          transparent
          opacity={thermalMode ? 0.75 : 0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {tagLabel && showLabels && (
        <Html position={[0, 0.7, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`px-1 py-0.5 rounded border backdrop-blur-sm text-[8px] leading-none font-mono whitespace-nowrap select-none pointer-events-none ${
              thermalMode
                ? 'border-amber-400/75 bg-amber-950/85 text-amber-200'
                : 'border-teal-400/45 bg-slate-950/75 text-teal-200/90'
            }`}
          >
            {tagLabel}
          </div>
        </Html>
      )}
    </group>
  );
}

export function WildlifeScene3D({ visible = true, thermalMode = false, primaryWildlifePosRef }) {
  const labelsEnabled = useTelemetryStore((s) => s.recon.labelsEnabled);
  if (!visible) return null;

  return (
    <group>
      {/* Soaring Raptor Flock gliding between mountain ridges and aircraft cruise altitude */}
      <FlappingBird radius={6.2} altitude={-0.6} speed={0.42} phase={0.0} thermalMode={thermalMode} label="AVN-01" showLabels={labelsEnabled} />
      <FlappingBird radius={6.6} altitude={-0.25} speed={0.40} phase={0.42} thermalMode={thermalMode} />
      <FlappingBird radius={5.8} altitude={-0.95} speed={0.44} phase={0.85} thermalMode={thermalMode} />
      <FlappingBird radius={7.1} altitude={-0.1} speed={0.38} phase={2.1} thermalMode={thermalMode} />

      {/* Ground Wildlife Herd walking on the valley floor far below */}
      <WalkingAnimal
        orbitRadius={1.8}
        centerOffset={[5.2, -4.4]}
        speed={0.24}
        phase={0.0}
        scale={0.6}
        isStag={true}
        thermalMode={thermalMode}
        tagLabel="BIO-01 • 37.4°C"
        showLabels={labelsEnabled}
        reportPosRef={primaryWildlifePosRef}
      />
      <WalkingAnimal
        orbitRadius={1.9}
        centerOffset={[5.5, -4.0]}
        speed={0.24}
        phase={0.55}
        scale={0.5}
        isStag={true}
        thermalMode={thermalMode}
      />
      <WalkingAnimal
        orbitRadius={1.6}
        centerOffset={[4.9, -4.7]}
        speed={0.24}
        phase={1.1}
        scale={0.44}
        isStag={false}
        thermalMode={thermalMode}
      />
      <WalkingAnimal
        orbitRadius={2.2}
        centerOffset={[-5.4, 3.8]}
        speed={0.34}
        phase={2.4}
        scale={0.48}
        isStag={false}
        thermalMode={thermalMode}
        tagLabel="BIO-02 • 38.6°C"
        showLabels={labelsEnabled}
      />
    </group>
  );
}
