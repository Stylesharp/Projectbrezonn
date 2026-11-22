import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { flightRuntime } from '../utils/flightConfig';
import { useTelemetryStore } from '../store/useTelemetryStore';

const SPARK_COUNT = 32;

// Dynamic 3D spark emitter with ballistic gravity during laser welding
function WeldSparks({ active, targetRef }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(
    () =>
      Array.from({ length: SPARK_COUNT }, () => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: Math.random(),
      })),
    []
  );

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const dt = Math.min(delta, 0.05);
    const origin = targetRef.current || new THREE.Vector3(0, 0, 0);

    particles.forEach((p, i) => {
      p.life -= dt * 2.4;
      if (p.life <= 0) {
        if (active) {
          p.life = 0.4 + Math.random() * 0.6;
          p.pos.copy(origin);
          p.vel.set(
            (Math.random() - 0.5) * 2.6,
            0.7 + Math.random() * 1.8,
            (Math.random() - 0.5) * 2.6
          );
        } else {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(i, dummy.matrix);
          return;
        }
      }

      p.vel.y -= 5.8 * dt; // Gravity
      p.pos.addScaledVector(p.vel, dt);

      const scale = active ? Math.max(0.001, p.life * 0.045) : 0;
      dummy.position.copy(p.pos);
      dummy.scale.set(scale, scale * 2.2, scale);
      dummy.lookAt(p.pos.clone().add(p.vel));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, SPARK_COUNT]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#fde047" toneMapped={false} />
    </instancedMesh>
  );
}

/**
 * Autonomous 3D Hovering Maintenance & Laser-Repair Bot
 * - PATROL mode: orbits the aircraft projecting a cyan holographic lidar scan cone
 * - REPAIR mode: flies directly to the target/fault coordinate, articulates its dual-joint
 *   robotic arm, fires an amber-white micro-weld laser beam, and emits gravity-driven sparks.
 */
export function MaintenanceBot3D({
  visible = true,
  repairMode = false,
  targetPoint = [0, 0.35, 0],
  statusLabel = 'BOT-01 // PATROL',
  onWeldingChange,
}) {
  const labelsEnabled = useTelemetryStore((s) => s.recon.labelsEnabled);
  const botRef = useRef();
  const gyroRingRef = useRef();
  const armUpperRef = useRef();
  const armForeRef = useRef();
  const beamRef = useRef();
  const scanConeRef = useRef();
  const repairRingRef = useRef();
  const worldTargetRef = useRef(new THREE.Vector3(...targetPoint));
  const wasWeldingRef = useRef(false);

  // Reusable vectors (zero GC allocations inside useFrame)
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const tipWorldPos = useMemo(() => new THREE.Vector3(), []);
  const dirVec = useMemo(() => new THREE.Vector3(), []);
  const midVec = useMemo(() => new THREE.Vector3(), []);
  const upVec = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  useEffect(() => {
    worldTargetRef.current.set(targetPoint[0], targetPoint[1], targetPoint[2]);
  }, [targetPoint]);

  useFrame((state, delta) => {
    if (!visible || !botRef.current) return;
    const t = state.clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    worldTargetRef.current.y = flightRuntime.aircraftY + 0.08;
    const tgt = worldTargetRef.current;

    if (repairMode) {
      // Hover closely offset from target component with gentle micro-stabilization
      desiredPos.set(
        tgt.x + Math.cos(t * 0.9) * 0.72,
        tgt.y + 0.42 + Math.sin(t * 2.4) * 0.05,
        tgt.z + Math.sin(t * 0.9) * 0.72
      );
    } else {
      // Smooth orbital diagnostic patrol around the airframe
      const orbitR = 1.95;
      desiredPos.set(
        Math.cos(t * 0.5) * orbitR,
        flightRuntime.aircraftY + 0.48 + Math.sin(t * 1.4) * 0.18,
        Math.sin(t * 0.5) * orbitR
      );
    }

    botRef.current.position.lerp(desiredPos, 1 - Math.exp(-3.4 * dt));
    botRef.current.lookAt(tgt);

    // Spinning outer gyro stabilizer ring
    if (gyroRingRef.current) {
      gyroRingRef.current.rotation.z = t * (repairMode ? 5.2 : 2.4);
      gyroRingRef.current.rotation.x = Math.sin(t * 1.8) * 0.28;
    }

    // Articulated 2-joint robotic repair arm
    if (armUpperRef.current && armForeRef.current) {
      const targetUpper = repairMode ? -0.45 + Math.sin(t * 6.5) * 0.08 : -1.15;
      const targetFore = repairMode ? 0.85 + Math.cos(t * 8.0) * 0.1 : 1.55;
      armUpperRef.current.rotation.x = THREE.MathUtils.lerp(armUpperRef.current.rotation.x, targetUpper, 0.12);
      armForeRef.current.rotation.x = THREE.MathUtils.lerp(armForeRef.current.rotation.x, targetFore, 0.12);
    }

    const distToTarget = botRef.current.position.distanceTo(tgt);
    const isWeldingNow = repairMode && distToTarget < 1.85;

    if (wasWeldingRef.current !== isWeldingNow) {
      wasWeldingRef.current = isWeldingNow;
      onWeldingChange?.(isWeldingNow);
    }

    // Align repair laser beam directly from bot nozzle to exact target point
    if (beamRef.current) {
      beamRef.current.visible = isWeldingNow;
      if (isWeldingNow) {
        tipWorldPos.copy(botRef.current.position);
        tipWorldPos.y -= 0.12;
        dirVec.subVectors(tgt, tipWorldPos);
        const len = dirVec.length();
        midVec.addVectors(tipWorldPos, tgt).multiplyScalar(0.5);
        beamRef.current.position.copy(midVec);
        beamRef.current.scale.set(
          0.85 + Math.sin(t * 55) * 0.35,
          len,
          0.85 + Math.sin(t * 55) * 0.35
        );
        quat.setFromUnitVectors(upVec, dirVec.normalize());
        beamRef.current.quaternion.copy(quat);
      }
    }

    // Diagnostic scan cone during patrol
    if (scanConeRef.current) {
      scanConeRef.current.visible = !isWeldingNow;
      scanConeRef.current.material.opacity = 0.14 + Math.sin(t * 4.0) * 0.05;
    }

    // Pulsing holographic repair reticle at target point
    if (repairRingRef.current) {
      repairRingRef.current.visible = isWeldingNow;
      repairRingRef.current.position.copy(tgt);
      repairRingRef.current.rotation.y = t * 3.0;
      const s = 0.85 + Math.sin(t * 10.0) * 0.15;
      repairRingRef.current.scale.setScalar(s);
    }
  });

  if (!visible) return null;

  const accent = repairMode ? '#f59e0b' : '#22d3ee';

  return (
    <group>
      {/* Floating Maintenance Bot Assembly */}
      <group ref={botRef} position={[1.95, 2.25, 0]} scale={0.56}>
        {/* Main Titanium Chassis Sphere */}
        <mesh castShadow>
          <sphereGeometry args={[0.26, 24, 24]} />
          <meshStandardMaterial color="#0f172a" metalness={0.92} roughness={0.18} />
        </mesh>

        {/* Armored Top Cap */}
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.16, 0.24, 0.12, 16]} />
          <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* Glowing Optical AI Visor (+Z faces lookAt target) */}
        <mesh position={[0, 0.03, 0.23]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.06, 20]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.8} toneMapped={false} />
        </mesh>

        {/* Gyroscope Stabilizer Ring */}
        <group ref={gyroRingRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.37, 0.022, 12, 36]} />
            <meshStandardMaterial color="#38bdf8" emissive={accent} emissiveIntensity={1.2} metalness={0.9} roughness={0.15} />
          </mesh>
        </group>

        {/* Dual Micro-Thruster Pods */}
        {[-0.28, 0.28].map((x, idx) => (
          <group key={idx} position={[x, -0.08, -0.05]}>
            <mesh>
              <cylinderGeometry args={[0.055, 0.07, 0.18, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={[0, -0.15, 0]}>
              <coneGeometry args={[0.055, 0.18, 12]} />
              <meshBasicMaterial color={accent} transparent opacity={0.65} />
            </mesh>
          </group>
        ))}

        {/* Articulated Dual-Joint Robotic Repair Arm */}
        <group position={[0, -0.16, 0.14]} ref={armUpperRef}>
          <mesh position={[0, -0.14, 0]}>
            <cylinderGeometry args={[0.028, 0.024, 0.28, 10]} />
            <meshStandardMaterial color="#64748b" metalness={0.92} roughness={0.2} />
          </mesh>
          {/* Elbow Joint */}
          <group position={[0, -0.28, 0]} ref={armForeRef}>
            <mesh>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
            </mesh>
            <mesh position={[0, -0.14, 0]}>
              <cylinderGeometry args={[0.022, 0.015, 0.28, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.15} />
            </mesh>
            {/* Laser Emitter Tip */}
            <mesh position={[0, -0.29, 0]}>
              <sphereGeometry args={[0.032, 12, 12]} />
              <meshBasicMaterial color={repairMode ? '#fef08a' : '#22d3ee'} toneMapped={false} />
            </mesh>
          </group>
        </group>

        {/* Patrol Lidar Diagnostic Scan Cone */}
        <mesh ref={scanConeRef} position={[0, 0, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.68, 1.85, 24, 1, true]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>

        {/* Bot Status Tag */}
        {labelsEnabled && (
          <Html position={[0, 0.52, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
            <div
              className={`px-1.5 py-0.5 rounded border backdrop-blur-sm text-[8px] leading-none font-mono tracking-wide whitespace-nowrap select-none pointer-events-none ${
                repairMode
                  ? 'border-amber-400/80 bg-amber-950/85 text-amber-200'
                  : 'border-cyan-400/45 bg-slate-950/80 text-cyan-200/90'
              }`}
            >
              {statusLabel}
            </div>
          </Html>
        )}
      </group>

      {/* World-Space Micro-Weld Laser Beam */}
      <mesh ref={beamRef} visible={false}>
        <cylinderGeometry args={[0.016, 0.024, 1, 10]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.92} toneMapped={false} />
      </mesh>

      {/* World-Space Pulsing Repair Reticle Ring */}
      <mesh ref={repairRingRef} visible={false} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.26, 0.34, 32]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Dynamic Ballistic Weld Sparks */}
      <WeldSparks active={repairMode} targetRef={worldTargetRef} />
    </group>
  );
}
