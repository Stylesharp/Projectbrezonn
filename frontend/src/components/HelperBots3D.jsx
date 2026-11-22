import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { flightRuntime } from '../utils/flightConfig';

export function HelperBots3D({ visible = true, roverWorldPosRef, wildlifePosRef }) {
  const groundBotState = useTelemetryStore((s) => s.recon.groundBotState);
  const wildlifeEnabled = useTelemetryStore((s) => s.recon.wildlifeEnabled);
  const labelsEnabled = useTelemetryStore((s) => s.recon.labelsEnabled);

  const relayRef = useRef();
  const relayRingRef = useRef();
  const relayRotorsRef = useRef([]);
  const linkBeamToUavRef = useRef();
  const linkBeamToRoverRef = useRef();

  const spotterRef = useRef();
  const spotterCoreRef = useRef();
  const spotterConeRef = useRef();

  const upVec = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const tmpMid = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpDesired = useMemo(() => new THREE.Vector3(), []);
  const uavOrigin = useMemo(() => new THREE.Vector3(0, 1.95, 0), []);

  const alignBeam = (mesh, fromPos, toPos, pulse) => {
    if (!mesh) return;
    tmpDir.subVectors(toPos, fromPos);
    const len = tmpDir.length();
    if (len < 0.05) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    tmpMid.addVectors(fromPos, toPos).multiplyScalar(0.5);
    mesh.position.copy(tmpMid);
    mesh.scale.set(pulse, len, pulse);
    tmpQuat.setFromUnitVectors(upVec, tmpDir.normalize());
    mesh.quaternion.copy(tmpQuat);
  };

  useFrame(({ clock }, delta) => {
    if (!visible) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);

    uavOrigin.y = flightRuntime.aircraftY + 0.12;
    if (relayRef.current) {
      const ang = -t * 0.55 + 1.2;
      tmpDesired.set(Math.cos(ang) * 2.4, flightRuntime.aircraftY + 0.95 + Math.sin(t * 1.9) * 0.16, Math.sin(ang) * 2.4);
      relayRef.current.position.lerp(tmpDesired, 1 - Math.exp(-3.5 * dt));
      relayRef.current.lookAt(0, flightRuntime.aircraftY, 0);

      if (relayRingRef.current) relayRingRef.current.rotation.y = t * 3.8;
      relayRotorsRef.current.forEach((r, idx) => {
        if (r) r.rotation.y += dt * 36 * (idx % 2 === 0 ? 1 : -1);
      });

      const beamPulse = 0.8 + Math.sin(t * 12) * 0.25;
      alignBeam(linkBeamToUavRef.current, relayRef.current.position, uavOrigin, beamPulse);

      if (groundBotState !== 'STOWED' && roverWorldPosRef?.current) {
        alignBeam(linkBeamToRoverRef.current, relayRef.current.position, roverWorldPosRef.current, beamPulse);
      } else if (linkBeamToRoverRef.current) {
        linkBeamToRoverRef.current.visible = false;
      }
    }

    if (spotterRef.current) {
      if (wildlifeEnabled && wildlifePosRef?.current && wildlifePosRef.current.lengthSq() > 0.1) {
        const w = wildlifePosRef.current;
        tmpDesired.set(
          w.x + Math.cos(t * 1.2) * 0.95,
          w.y + 1.55 + Math.sin(t * 2.6) * 0.14,
          w.z + Math.sin(t * 1.2) * 0.95
        );
        spotterRef.current.position.lerp(tmpDesired, 1 - Math.exp(-2.8 * dt));
        spotterRef.current.lookAt(w.x, w.y, w.z);
        if (spotterConeRef.current) spotterConeRef.current.visible = true;
      } else {
        const ang = t * 0.65 + 3.4;
        tmpDesired.set(Math.cos(ang) * 2.6, flightRuntime.aircraftY + 0.55 + Math.cos(t * 1.7) * 0.18, Math.sin(ang) * 2.6);
        spotterRef.current.position.lerp(tmpDesired, 1 - Math.exp(-2.8 * dt));
        spotterRef.current.lookAt(0, -0.5, 0);
        if (spotterConeRef.current) spotterConeRef.current.visible = false;
      }

      if (spotterCoreRef.current) {
        spotterCoreRef.current.rotation.y = t * 4.5;
        spotterCoreRef.current.rotation.x = t * 2.2;
      }
    }
  });

  if (!visible) return null;

  return (
    <group>
      <group ref={relayRef} position={[-2.4, 2.75, 1.2]} scale={0.62}>
        <mesh>
          <octahedronGeometry args={[0.17, 0]} />
          <meshStandardMaterial color="#0f172a" metalness={0.92} roughness={0.18} emissive="#38bdf8" emissiveIntensity={0.45} />
        </mesh>
        <mesh ref={relayRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.016, 10, 28]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.6} />
        </mesh>
        {[
          [-0.22, 0.08, -0.22], [0.22, 0.08, -0.22],
          [-0.22, 0.08, 0.22],  [0.22, 0.08, 0.22],
        ].map((pos, idx) => (
          <mesh key={idx} ref={(el) => { relayRotorsRef.current[idx] = el; }} position={pos}>
            <boxGeometry args={[0.16, 0.01, 0.025]} />
            <meshBasicMaterial color="#7dd3fc" />
          </mesh>
        ))}
        {labelsEnabled && (
          <Html position={[0, 0.38, 0]} center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
            <div className="px-1.5 py-0.5 rounded border border-sky-400/45 bg-slate-950/80 text-[8px] leading-none font-mono text-sky-200/90 whitespace-nowrap select-none pointer-events-none">
              RELAY-02
            </div>
          </Html>
        )}
      </group>

      <mesh ref={linkBeamToUavRef} visible={false}>
        <cylinderGeometry args={[0.005, 0.005, 1, 6]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh ref={linkBeamToRoverRef} visible={false}>
        <cylinderGeometry args={[0.008, 0.008, 1, 6]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.55} depthWrite={false} />
      </mesh>

      <group ref={spotterRef} position={[4.5, -4.0, -3.8]} scale={0.62}>
        <mesh ref={spotterCoreRef}>
          <icosahedronGeometry args={[0.15, 0]} />
          <meshStandardMaterial color="#042f2e" metalness={0.88} roughness={0.2} emissive="#10b981" emissiveIntensity={1.4} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.015, 10, 24]} />
          <meshBasicMaterial color="#2dd4bf" />
        </mesh>
        <mesh ref={spotterConeRef} position={[0, 0, 0.78]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.48, 1.45, 20, 1, true]} />
          <meshBasicMaterial color="#2dd4bf" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {labelsEnabled && (
          <Html position={[0, 0.36, 0]} center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
            <div className="px-1.5 py-0.5 rounded border border-teal-400/45 bg-slate-950/80 text-[8px] leading-none font-mono text-teal-200/90 whitespace-nowrap select-none pointer-events-none">
              SCAN-03
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
