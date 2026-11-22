import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeight, terrainState, TERRAIN_BASE_Y } from './ReconTerrain3D';
import { LANDING_PADS, WORLD_SPAN, HALF_SPAN } from '../utils/flightConfig';
import { useTelemetryStore } from '../store/useTelemetryStore';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapCoord(val) {
  let v = ((val + HALF_SPAN) % WORLD_SPAN);
  if (v < 0) v += WORLD_SPAN;
  return v - HALF_SPAN;
}

const TREE_COUNT = 150;
const HOUSE_COUNT = 30;
const BUILDING_COUNT = 18;

export function TerrainArtefacts3D({ visible = true, thermalMode = false }) {
  const activePadId = useTelemetryStore((s) => s.recon.activePadId);
  const flightStatus = useTelemetryStore((s) => s.recon.flightStatus);
  const initiateLanding = useTelemetryStore((s) => s.initiateLanding);
  const labelsEnabled = useTelemetryStore((s) => s.recon.labelsEnabled);

  const treeTrunkRef = useRef();
  const treeLowerRef = useRef();
  const treeUpperRef = useRef();

  const houseWallRef = useRef();
  const houseRoofRef = useRef();
  const houseWinRef = useRef();

  const bldgBodyRef = useRef();
  const bldgGlowRef = useRef();
  const bldgBeaconRef = useRef();

  const turbineGroupRefs = useRef([]);
  const turbineBladeRefs = useRef([]);
  const padRefs = useRef([]);
  const radarDishRefs = useRef([]);
  const beaconBeamRefs = useRef([]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  const layout = useMemo(() => {
    const rng = mulberry32(202611);

    const trees = Array.from({ length: TREE_COUNT }, () => ({
      wx: (rng() - 0.5) * WORLD_SPAN,
      wz: (rng() - 0.5) * WORLD_SPAN,
      scale: 0.65 + rng() * 0.85,
      rot: rng() * Math.PI * 2,
    }));

    const villageCenters = [[-11, -8], [12, -14], [-14, 11], [10, 10]];
    const houses = Array.from({ length: HOUSE_COUNT }, (_, i) => {
      const c = villageCenters[i % villageCenters.length];
      return {
        wx: c[0] + (rng() - 0.5) * 9.5,
        wz: c[1] + (rng() - 0.5) * 9.5,
        w: 0.42 + rng() * 0.24,
        h: 0.30 + rng() * 0.16,
        d: 0.45 + rng() * 0.28,
        rot: Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.2,
      };
    });

    const cityCenters = [[17.5, -5.5], [-16, -16]];
    const buildings = Array.from({ length: BUILDING_COUNT }, (_, i) => {
      const c = cityCenters[i % cityCenters.length];
      return {
        wx: c[0] + (rng() - 0.5) * 8.5,
        wz: c[1] + (rng() - 0.5) * 8.5,
        w: 0.55 + rng() * 0.48,
        h: 1.05 + rng() * 1.95,
        d: 0.55 + rng() * 0.48,
        rot: Math.floor(rng() * 4) * (Math.PI / 2),
      };
    });

    const turbines = [
      { wx: -7.5, wz: -18.5, rot: 0.4 },
      { wx: -4.2, wz: -20.2, rot: 0.4 },
      { wx: 18.5, wz: 14.0, rot: -0.6 },
      { wx: 21.2, wz: 11.8, rot: -0.6 },
      { wx: -20.0, wz: 3.5, rot: 0.2 },
      { wx: 6.5, wz: 21.5, rot: -0.3 },
    ];

    return { trees, houses, buildings, turbines };
  }, []);

  useFrame(({ clock }, delta) => {
    if (!visible) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    const ox = terrainState.offsetX;
    const oz = terrainState.offsetZ;

    // Helper to keep a small clearance around every landing pad
    const nearAnyPad = (lx, lz) => {
      for (let p = 0; p < LANDING_PADS.length; p++) {
        const px = LANDING_PADS[p].wx - ox;
        const pz = LANDING_PADS[p].wz - oz;
        if (Math.hypot(lx - px, lz - pz) < 2.6) return true;
      }
      return false;
    };

    // 1. 150 Evergreen Trees
    if (treeTrunkRef.current && treeLowerRef.current && treeUpperRef.current) {
      layout.trees.forEach((tr, i) => {
        const lx = wrapCoord(tr.wx - ox);
        const lz = wrapCoord(tr.wz - oz);
        const y = getTerrainHeight(lx, lz);
        const elev = y - TERRAIN_BASE_Y;
        const radial = Math.hypot(lx, lz);
        const valid = elev > 0.14 && elev < 2.65 && radial < 26.5 && !nearAnyPad(lx, lz);
        const s = valid ? tr.scale : 0;

        dummy.position.set(lx, y + 0.12 * s, lz);
        dummy.rotation.set(0, tr.rot, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        treeTrunkRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lx, y + 0.42 * s, lz);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        treeLowerRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lx, y + 0.72 * s, lz);
        dummy.scale.set(s * 0.72, s * 0.75, s * 0.72);
        dummy.updateMatrix();
        treeUpperRef.current.setMatrixAt(i, dummy.matrix);
      });
      treeTrunkRef.current.instanceMatrix.needsUpdate = true;
      treeLowerRef.current.instanceMatrix.needsUpdate = true;
      treeUpperRef.current.instanceMatrix.needsUpdate = true;
    }

    // 2. 30 Village Houses
    if (houseWallRef.current && houseRoofRef.current && houseWinRef.current) {
      layout.houses.forEach((h, i) => {
        const lx = wrapCoord(h.wx - ox);
        const lz = wrapCoord(h.wz - oz);
        const y = getTerrainHeight(lx, lz);
        const elev = y - TERRAIN_BASE_Y;
        const radial = Math.hypot(lx, lz);
        const valid = elev > 0.08 && elev < 1.55 && radial < 25.5 && !nearAnyPad(lx, lz);
        const vis = valid ? 1 : 0;

        dummy.position.set(lx, y + h.h * 0.5 * vis, lz);
        dummy.rotation.set(0, h.rot, 0);
        dummy.scale.set(h.w * vis, h.h * vis, h.d * vis);
        dummy.updateMatrix();
        houseWallRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lx, y + (h.h + 0.14) * vis, lz);
        dummy.rotation.set(0, h.rot + Math.PI / 4, 0);
        dummy.scale.set(h.w * 0.84 * vis, 0.28 * vis, h.d * 0.84 * vis);
        dummy.updateMatrix();
        houseRoofRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lx, y + h.h * 0.52 * vis, lz);
        dummy.rotation.set(0, h.rot, 0);
        dummy.scale.set((h.w + 0.02) * vis, h.h * 0.28 * vis, (h.d + 0.02) * vis);
        dummy.updateMatrix();
        houseWinRef.current.setMatrixAt(i, dummy.matrix);
      });
      houseWallRef.current.instanceMatrix.needsUpdate = true;
      houseRoofRef.current.instanceMatrix.needsUpdate = true;
      houseWinRef.current.instanceMatrix.needsUpdate = true;
    }

    // 3. 18 City High-Rises
    if (bldgBodyRef.current && bldgGlowRef.current && bldgBeaconRef.current) {
      layout.buildings.forEach((b, i) => {
        const lx = wrapCoord(b.wx - ox);
        const lz = wrapCoord(b.wz - oz);
        const y = getTerrainHeight(lx, lz);
        const elev = y - TERRAIN_BASE_Y;
        const radial = Math.hypot(lx, lz);
        const valid = elev > 0.04 && elev < 1.8 && radial < 25.5 && !nearAnyPad(lx, lz);
        const vis = valid ? 1 : 0;

        dummy.position.set(lx, y + b.h * 0.5 * vis, lz);
        dummy.rotation.set(0, b.rot, 0);
        dummy.scale.set(b.w * vis, b.h * vis, b.d * vis);
        dummy.updateMatrix();
        bldgBodyRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lx, y + b.h * 0.58 * vis, lz);
        dummy.scale.set((b.w + 0.025) * vis, b.h * 0.65 * vis, (b.d + 0.025) * vis);
        dummy.updateMatrix();
        bldgGlowRef.current.setMatrixAt(i, dummy.matrix);

        const blink = (t + i * 0.4) % 1.6 < 0.35 ? 1 : 0.3;
        dummy.position.set(lx, y + (b.h + 0.08) * vis, lz);
        dummy.scale.setScalar(0.055 * blink * vis);
        dummy.updateMatrix();
        bldgBeaconRef.current.setMatrixAt(i, dummy.matrix);
      });
      bldgBodyRef.current.instanceMatrix.needsUpdate = true;
      bldgGlowRef.current.instanceMatrix.needsUpdate = true;
      bldgBeaconRef.current.instanceMatrix.needsUpdate = true;
    }

    // 4. 6 Spinning Wind Turbines
    layout.turbines.forEach((tb, idx) => {
      const grp = turbineGroupRefs.current[idx];
      if (!grp) return;
      const lx = wrapCoord(tb.wx - ox);
      const lz = wrapCoord(tb.wz - oz);
      const y = getTerrainHeight(lx, lz);
      grp.visible = Math.hypot(lx, lz) < 25.5 && (y - TERRAIN_BASE_Y) > 0.12;
      grp.position.set(lx, y, lz);

      const rotor = turbineBladeRefs.current[idx];
      if (rotor) rotor.rotation.z -= dt * (2.6 + idx * 0.18);
    });

    // 5. All 4 Designated Landing & Takeoff Pads at EXACT Real-World GPS Coordinates!
    LANDING_PADS.forEach((pad, idx) => {
      const grp = padRefs.current[idx];
      if (!grp) return;
      const lx = pad.wx - ox;
      const lz = pad.wz - oz;
      const y = getTerrainHeight(lx, lz);
      grp.visible = Math.hypot(lx, lz) < 32.0;
      grp.position.set(lx, y + 0.04, lz);

      const dish = radarDishRefs.current[idx];
      if (dish) dish.rotation.y += dt * 1.8;

      const beam = beaconBeamRefs.current[idx];
      if (beam) {
        const isTargeted = activePadId === pad.id && flightStatus !== 'AIRBORNE';
        beam.visible = isTargeted;
        if (isTargeted) {
          beam.material.opacity = 0.14 + Math.sin(t * 6.0) * 0.06;
        }
      }
    });
  });

  if (!visible) return null;

  return (
    <group>
      {/* 150 Evergreen Trees */}
      <instancedMesh ref={treeTrunkRef} args={[null, null, TREE_COUNT]} frustumCulled={false}>
        <cylinderGeometry args={[0.04, 0.055, 0.25, 6]} />
        <meshStandardMaterial color={thermalMode ? '#3b0764' : '#3f2e21'} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={treeLowerRef} args={[null, null, TREE_COUNT]} frustumCulled={false}>
        <coneGeometry args={[0.24, 0.52, 6]} />
        <meshStandardMaterial color={thermalMode ? '#4c1d95' : '#0b3b3c'} emissive={thermalMode ? '#581c87' : '#0e7490'} emissiveIntensity={0.18} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={treeUpperRef} args={[null, null, TREE_COUNT]} frustumCulled={false}>
        <coneGeometry args={[0.22, 0.48, 6]} />
        <meshStandardMaterial color={thermalMode ? '#6d28d9' : '#0f5156'} emissive={thermalMode ? '#7c3aed' : '#22d3ee'} emissiveIntensity={0.22} roughness={0.75} />
      </instancedMesh>

      {/* 30 Village Houses */}
      <instancedMesh ref={houseWallRef} args={[null, null, HOUSE_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={thermalMode ? '#7c2d12' : '#1e293b'} emissive={thermalMode ? '#c2410c' : '#0f172a'} emissiveIntensity={thermalMode ? 0.6 : 0.15} roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={houseRoofRef} args={[null, null, HOUSE_COUNT]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color={thermalMode ? '#9a3412' : '#334155'} emissive={thermalMode ? '#ea580c' : '#0284c7'} emissiveIntensity={thermalMode ? 0.45 : 0.12} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={houseWinRef} args={[null, null, HOUSE_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={thermalMode ? '#fef08a' : '#fbbf24'} transparent opacity={thermalMode ? 0.9 : 0.72} />
      </instancedMesh>

      {/* 18 City High-Rises */}
      <instancedMesh ref={bldgBodyRef} args={[null, null, BUILDING_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={thermalMode ? '#581c87' : '#0f172a'} metalness={0.75} roughness={0.25} emissive={thermalMode ? '#9333ea' : '#0c4a6e'} emissiveIntensity={thermalMode ? 0.55 : 0.22} />
      </instancedMesh>
      <instancedMesh ref={bldgGlowRef} args={[null, null, BUILDING_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={thermalMode ? '#fb923c' : '#38bdf8'} wireframe transparent opacity={0.45} />
      </instancedMesh>
      <instancedMesh ref={bldgBeaconRef} args={[null, null, BUILDING_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color={thermalMode ? '#fef08a' : '#f43f5e'} toneMapped={false} />
      </instancedMesh>

      {/* 6 Spinning Wind Turbines */}
      {layout.turbines.map((tb, idx) => (
        <group key={idx} ref={(el) => { turbineGroupRefs.current[idx] = el; }} rotation={[0, tb.rot, 0]}>
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.032, 0.06, 1.6, 8]} />
            <meshStandardMaterial color={thermalMode ? '#c084fc' : '#cbd5e1'} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.62, 0.04]}>
            <boxGeometry args={[0.1, 0.09, 0.2]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
          </mesh>
          <group ref={(el) => { turbineBladeRefs.current[idx] = el; }} position={[0, 1.62, 0.15]}>
            {[0, 1, 2].map((b) => (
              <group key={b} rotation={[0, 0, (b * Math.PI * 2) / 3]}>
                <mesh position={[0, 0.34, 0]}>
                  <boxGeometry args={[0.04, 0.68, 0.014]} />
                  <meshStandardMaterial color={thermalMode ? '#facc15' : '#e0f2fe'} emissive={thermalMode ? '#f97316' : '#38bdf8'} emissiveIntensity={0.4} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      ))}

      {/* 4 Designated Clickable 3D Landing & Takeoff Pads */}
      {LANDING_PADS.map((pad, idx) => {
        const isActive = activePadId === pad.id;
        const padCol = isActive ? '#10b981' : thermalMode ? '#facc15' : '#22d3ee';
        return (
          <group key={pad.id} ref={(el) => { padRefs.current[idx] = el; }}>
            {/* Concrete Helipad Base */}
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[1.35, 1.48, 0.1, 20]} />
              <meshStandardMaterial color="#1e293b" metalness={0.55} roughness={0.55} />
            </mesh>
            {/* Glowing Perimeter Ring */}
            <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.92, 1.06, 28]} />
              <meshBasicMaterial color={padCol} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            {/* Helipad H Markings */}
            <mesh position={[-0.26, 0.105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.1, 0.72]} />
              <meshBasicMaterial color={padCol} />
            </mesh>
            <mesh position={[0.26, 0.105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.1, 0.72]} />
              <meshBasicMaterial color={padCol} />
            </mesh>
            <mesh position={[0, 0.105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.52, 0.1]} />
              <meshBasicMaterial color={padCol} />
            </mesh>

            {/* Vertical Approach Guide Beam when actively landing/taking off here */}
            <mesh ref={(el) => { beaconBeamRefs.current[idx] = el; }} position={[0, 3.6, 0]} visible={false}>
              <cylinderGeometry args={[0.88, 1.05, 7.2, 24, 1, true]} />
              <meshBasicMaterial color="#10b981" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>

            {/* Outpost Bunker & Rotating Radar Dish on Outpost/Urban Pads */}
            {pad.type !== 'CLEARING' && (
              <>
                <mesh position={[1.65, 0.26, -0.5]}>
                  <boxGeometry args={[0.85, 0.45, 0.65]} />
                  <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} emissive="#0284c7" emissiveIntensity={0.25} />
                </mesh>
                <group ref={(el) => { radarDishRefs.current[idx] = el; }} position={[1.65, 0.68, -0.5]}>
                  <mesh position={[0, -0.1, 0]}>
                    <cylinderGeometry args={[0.04, 0.05, 0.22, 8]} />
                    <meshStandardMaterial color="#64748b" />
                  </mesh>
                  <mesh rotation={[0.3, 0, 0]}>
                    <boxGeometry args={[0.42, 0.14, 0.05]} />
                    <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} />
                  </mesh>
                </group>
              </>
            )}

            {/* Clickable 3D Pad Tag -> Click directly in 3D to land there! */}
            {labelsEnabled && (
              <Html position={[0, 0.75, 0]} center zIndexRange={[14, 0]}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    initiateLanding(pad.id);
                  }}
                  title={`Click to land at ${pad.name}`}
                  className={`px-1.5 py-0.5 rounded border backdrop-blur-sm text-[8px] leading-none font-mono tracking-wide whitespace-nowrap cursor-pointer transition-all hover:scale-105 ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.45)]'
                      : 'border-cyan-400/45 bg-slate-950/75 text-cyan-200/90 hover:border-emerald-400'
                  }`}
                >
                  H • {pad.shortName}
                </button>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
