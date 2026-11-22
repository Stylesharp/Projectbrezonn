import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Float, Grid, Center, Sparkles, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { 
  Eye, Layers, Crosshair, Zap, ZoomIn, ZoomOut, RotateCcw, 
  Compass, Plane, Disc, ShieldAlert, Cpu, Flame, Radio,
  Video, Navigation2, Activity
} from 'lucide-react';

// Preload 3D models for instant, seamless loading
useGLTF.preload('/models/drone_detailed.glb');
useGLTF.preload('/models/airplane.glb');

/* -------------------------------------------------------------------------- */
/* 1. TACTICAL HEXACOPTER UAV (Articulated Gimbal, Retractable Gear, Rotors)  */
/* -------------------------------------------------------------------------- */
function TacticalDroneModel({ viewMode, selectedPart, onSelectPart }) {
  const { telemetry } = useTelemetryStore();
  const { scene } = useGLTF('/models/drone_detailed.glb');
  
  const groupRef = useRef();
  const bladesRef = useRef([]);
  const gimbalYawRef = useRef();
  const gimbalPitchRef = useRef();
  const gearGroupRef = useRef();
  const leftFlapRef = useRef();
  const rightFlapRef = useRef();

  // Clone scene so materials and hierarchies remain isolated
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    bladesRef.current = [];
    
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.name.toLowerCase().includes('blade')) {
          bladesRef.current.push(child);
        }

        // Material application based on active view mode
        if (viewMode === 'THERMAL') {
          // FLIR Thermal False-Color
          const temp = (telemetry?.chts[1] || 100);
          const heatColor = temp > 220 ? '#ff003c' : temp > 160 ? '#facc15' : '#0ea5e9';
          child.material = new THREE.MeshStandardMaterial({
            color: heatColor,
            emissive: heatColor,
            emissiveIntensity: 0.8,
            roughness: 0.3,
            metalness: 0.7,
            wireframe: false,
          });
        } else if (child.name.toLowerCase().includes('blade')) {
          child.material = new THREE.MeshStandardMaterial({
            color: '#00f0ff',
            emissive: '#00f0ff',
            emissiveIntensity: 0.65,
            metalness: 0.85,
            roughness: 0.15,
            wireframe: viewMode === 'WIREFRAME',
            transparent: true,
            opacity: viewMode === 'XRAY' ? 0.35 : 0.9,
          });
        } else if (child.name.toLowerCase().includes('socket')) {
          child.material = new THREE.MeshStandardMaterial({
            color: '#1e293b',
            emissive: '#0ea5e9',
            emissiveIntensity: 0.3,
            metalness: 0.9,
            roughness: 0.2,
            wireframe: viewMode === 'WIREFRAME',
            transparent: viewMode === 'XRAY',
            opacity: viewMode === 'XRAY' ? 0.35 : 0.95,
          });
        } else {
          child.material = new THREE.MeshStandardMaterial({
            color: '#080c14',
            emissive: '#0284c7',
            emissiveIntensity: 0.15,
            metalness: 0.9,
            roughness: 0.2,
            wireframe: viewMode === 'WIREFRAME',
            transparent: viewMode === 'XRAY',
            opacity: viewMode === 'XRAY' ? 0.35 : 0.95,
          });
        }
      }
    });
    return clone;
  }, [scene, viewMode, telemetry?.chts]);

  // Frame animation loop
  useFrame((state, delta) => {
    const rpm = telemetry?.rpm || 0;
    const isStopped = rpm <= 0 || telemetry?.faults?.propStrike;
    const time = state.clock.getElapsedTime();

    // 1. High-speed counter-rotating hexacopter blades
    if (!isStopped) {
      const rotSpeed = ((rpm || 1200) / 60) * Math.PI * 2 * delta * 2.5;
      bladesRef.current.forEach((blade, idx) => {
        if (blade) {
          const dir = idx % 2 === 0 ? 1 : -1;
          blade.rotation.y += rotSpeed * dir;
        }
      });
    }

    // 2. Flight dynamics attitude synchronization (Pitch, Roll, Yaw)
    if (groupRef.current) {
      const pitchRad = (telemetry?.pitchAngle || 0) * (Math.PI / 180);
      const rollRad = (telemetry?.rollAngle || 0) * (Math.PI / 180);
      
      // High-RPM mechanical jitter / vibration
      const jitterAmp = rpm > 4500 || telemetry?.faults?.mainBearingWear ? 0.005 : 0.0;
      const jitterX = (Math.random() - 0.5) * jitterAmp;
      const jitterZ = (Math.random() - 0.5) * jitterAmp;

      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pitchRad + jitterX, 0.08);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, -rollRad + jitterZ, 0.08);
    }

    // 3. Articulated Surveillance FLIR Gimbal (Search Sweep Pattern)
    if (gimbalYawRef.current && gimbalPitchRef.current) {
      // Pan left-right across 60 degrees
      gimbalYawRef.current.rotation.y = Math.sin(time * 0.8) * 0.55;
      // Tilt up-down looking ahead/down
      gimbalPitchRef.current.rotation.x = 0.2 + Math.cos(time * 0.6) * 0.25;
    }

    // 4. Retractable Landing Gear Animation (Actuator driven)
    if (gearGroupRef.current) {
      const isGearDown = telemetry?.actuators?.gearDown ?? true;
      const targetGearRot = isGearDown ? 0 : Math.PI * 0.42; // Fold upward 75 deg
      gearGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        gearGroupRef.current.rotation.x, 
        targetGearRot, 
        0.06
      );
    }

    // 5. Aero Flaps / Elevon deflection
    if (leftFlapRef.current && rightFlapRef.current) {
      const flapAngle = ((telemetry?.actuators?.flaps || 0) / 40) * (Math.PI / 5);
      leftFlapRef.current.rotation.x = THREE.MathUtils.lerp(leftFlapRef.current.rotation.x, flapAngle, 0.1);
      rightFlapRef.current.rotation.x = THREE.MathUtils.lerp(rightFlapRef.current.rotation.x, flapAngle, 0.1);
    }
  });

  const throttle = (telemetry?.actuators?.throttle || 50) / 100;
  const isSelected = (name) => selectedPart === name;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <Float speed={1.8} rotationIntensity={0.12} floatIntensity={0.32}>
        <Center>
          <primitive 
            object={clonedScene} 
            scale={1.15} 
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart('UAV FUSELAGE / AIRFRAME');
            }}
          />
        </Center>

        {/* 3-AXIS ARTICULATED SURVEILLANCE GIMBAL POD (Under Nose) */}
        <group position={[0, 0.2, 1.45]}>
          {/* Base mount */}
          <mesh>
            <cylinderGeometry args={[0.15, 0.18, 0.08, 16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} emissive="#0ea5e9" emissiveIntensity={0.3} />
          </mesh>
          {/* Yaw Turret */}
          <group ref={gimbalYawRef}>
            <mesh position={[0, -0.08, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.1, 16]} />
              <meshStandardMaterial color="#1e293b" metalness={0.9} />
            </mesh>
            {/* Pitch Head */}
            <group ref={gimbalPitchRef} position={[0, -0.15, 0]}>
              <mesh>
                <sphereGeometry args={[0.16, 20, 20]} />
                <meshStandardMaterial color="#030712" metalness={0.95} roughness={0.1} />
              </mesh>
              {/* Dual FLIR / Optical Lens Apertures */}
              <mesh position={[0.06, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.045, 0.045, 0.05, 16]} />
                <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={1.8} />
              </mesh>
              <mesh position={[-0.06, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.05, 16]} />
                <meshStandardMaterial color="#ff003c" emissive="#ff003c" emissiveIntensity={1.5} />
              </mesh>
              {/* Active Laser Targeting Beam Projecting to Floor */}
              <mesh position={[0, -1.2, 0.5]} rotation={[0.4, 0, 0]}>
                <cylinderGeometry args={[0.004, 0.08, 2.4, 8, 1, true]} />
                <meshBasicMaterial color="#00f0ff" transparent opacity={0.3} side={THREE.DoubleSide} />
              </mesh>
            </group>
          </group>
        </group>

        {/* ARTICULATED RETRACTABLE LANDING SKIDS */}
        <group ref={gearGroupRef} position={[0, -0.1, 0]}>
          {[-0.8, 0.8].map((x, i) => (
            <group key={i} position={[x, 0, 0]}>
              {/* Vertical strut */}
              <mesh position={[0, -0.45, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.7, 12]} />
                <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
              </mesh>
              {/* Skid bar */}
              <mesh position={[0, -0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 1.8, 12]} />
                <meshStandardMaterial color="#0f172a" metalness={0.95} roughness={0.1} emissive="#0ea5e9" emissiveIntensity={0.2} />
              </mesh>
            </group>
          ))}
        </group>

        {/* ARTICULATED REAR FLAPS / ELEVONS */}
        <group position={[0, 0.45, -1.5]}>
          <group ref={leftFlapRef} position={[-0.7, 0, 0]}>
            <mesh position={[0, 0, -0.18]}>
              <boxGeometry args={[0.6, 0.02, 0.28]} />
              <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.5} wireframe={viewMode === 'WIREFRAME'} />
            </mesh>
          </group>
          <group ref={rightFlapRef} position={[0.7, 0, 0]}>
            <mesh position={[0, 0, -0.18]}>
              <boxGeometry args={[0.6, 0.02, 0.28]} />
              <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.5} wireframe={viewMode === 'WIREFRAME'} />
            </mesh>
          </group>
        </group>

        {/* 6 MOTOR DOWNDRAFT THRUSTER RINGS & VORTEX PLUMES */}
        {[
          { pos: [1.1, 0.5, -1.9], id: 'MOTOR 1' },
          { pos: [1.1, 0.5, 1.9], id: 'MOTOR 2' },
          { pos: [2.2, 0.5, 0.0], id: 'MOTOR 3' },
          { pos: [-1.1, 0.5, 1.9], id: 'MOTOR 4' },
          { pos: [-2.2, 0.5, 0.0], id: 'MOTOR 5' },
          { pos: [-1.1, 0.5, -1.9], id: 'MOTOR 6' },
        ].map((motor, idx) => {
          const isWarning = telemetry?.faults?.cyl2Overheat || telemetry?.faults?.oilLineRupture;
          const color = isWarning ? '#ff003c' : '#00f0ff';
          return (
            <group key={idx} position={motor.pos}>
              {/* Emissive Collar */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.34, 0.025, 16, 32]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8 + throttle * 2.0} />
              </mesh>
              {/* High-speed Ion Downdraft Column */}
              <mesh position={[0, -0.5, 0]}>
                <cylinderGeometry args={[0.06, 0.35, 1.0, 16, 1, true]} />
                <meshBasicMaterial color={color} transparent opacity={0.12 + throttle * 0.35} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}

        {/* Anti-Collision Flashing Strobe Beacon */}
        <StrobeBeacon position={[0, 0.65, 0]} />

        {/* Interactive 3D Tactical Pin Tags */}
        <HotspotPin 
          position={[0, 0.65, 0]} 
          label="AVIONICS // FADEC" 
          onClick={() => onSelectPart('AVIONICS BAY / FADEC')} 
          active={isSelected('AVIONICS BAY / FADEC')} 
        />
        <HotspotPin 
          position={[1.8, 0.65, 0]} 
          label="STARBOARD ROTORS" 
          onClick={() => onSelectPart('STARBOARD ROTOR BUS')} 
          active={isSelected('STARBOARD ROTOR BUS')} 
        />
        <HotspotPin 
          position={[-1.8, 0.65, 0]} 
          label="PORT ROTORS" 
          onClick={() => onSelectPart('PORT ROTOR BUS')} 
          active={isSelected('PORT ROTOR BUS')} 
        />
        <HotspotPin 
          position={[0, 0.05, 1.5]} 
          label="FLIR GIMBAL CAM" 
          onClick={() => onSelectPart('PAYLOAD SENSOR GIMBAL')} 
          active={isSelected('PAYLOAD SENSOR GIMBAL')} 
        />
      </Float>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. RECON AIRFRAME (Retractable Gear, Deflecting Ailerons, Afterburner)      */
/* -------------------------------------------------------------------------- */
function ReconAirframeModel({ viewMode, selectedPart, onSelectPart }) {
  const { telemetry } = useTelemetryStore();
  const { scene } = useGLTF('/models/airplane.glb');
  
  const groupRef = useRef();
  const leftAileronRef = useRef();
  const rightAileronRef = useRef();
  const afterburnerRef = useRef();

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = new THREE.MeshStandardMaterial({
          color: viewMode === 'THERMAL' ? '#f59e0b' : '#080c14',
          emissive: viewMode === 'THERMAL' ? '#f59e0b' : '#0ea5e9',
          emissiveIntensity: 0.25,
          metalness: 0.9,
          roughness: 0.15,
          wireframe: viewMode === 'WIREFRAME',
          transparent: viewMode === 'XRAY',
          opacity: viewMode === 'XRAY' ? 0.35 : 0.95,
        });
      }
    });
    return clone;
  }, [scene, viewMode]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (groupRef.current) {
      const pitchRad = (telemetry?.pitchAngle || 0) * (Math.PI / 180);
      const rollRad = (telemetry?.rollAngle || 0) * (Math.PI / 180);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pitchRad, 0.08);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, -rollRad, 0.08);
    }

    // Aileron deflection in roll turns
    if (leftAileronRef.current && rightAileronRef.current) {
      const rollDeflection = (telemetry?.rollAngle || 0) * 0.02;
      leftAileronRef.current.rotation.x = rollDeflection;
      rightAileronRef.current.rotation.x = -rollDeflection;
    }

    // Afterburner flicker
    if (afterburnerRef.current) {
      const pulse = 1.0 + Math.sin(time * 30.0) * 0.15;
      afterburnerRef.current.scale.set(pulse, 1.0 + pulse * 0.2, pulse);
    }
  });

  const throttle = (telemetry?.actuators?.throttle || 50) / 100;
  const gLoad = telemetry?.gLoad || 1.0;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.25}>
        <Center>
          <primitive 
            object={clonedScene} 
            scale={0.065} 
            rotation={[0, Math.PI, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart('RECON UAV AIRFRAME');
            }}
          />
        </Center>

        {/* Wingtip Navigation Lights */}
        <mesh position={[-2.3, 0.1, 0.5]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#ff003c" />
        </mesh>
        <mesh position={[2.3, 0.1, 0.5]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>

        {/* High-G Wingtip Vortex Condensation Trails */}
        {gLoad > 1.5 && (
          <group>
            <mesh position={[-2.3, 0.1, -1.0]}>
              <cylinderGeometry args={[0.01, 0.04, 3.0, 8, 1, true]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[2.3, 0.1, -1.0]}>
              <cylinderGeometry args={[0.01, 0.04, 3.0, 8, 1, true]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}

        {/* Twin Supersonic Exhaust Plumes with Shock Diamond Rings */}
        <group ref={afterburnerRef}>
          {[-0.55, 0.55].map((x, i) => (
            <group key={i} position={[x, -0.05, -1.8]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.1, 0.28, 1.4, 16, 1, true]} />
                <meshBasicMaterial 
                  color="#00f0ff" 
                  transparent 
                  opacity={0.25 + throttle * 0.5} 
                  side={THREE.DoubleSide} 
                />
              </mesh>
              {/* Internal Shock Diamond Ring */}
              <mesh position={[0, 0, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.12, 0.015, 12, 24]} />
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={2.5} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Articulated Wing Ailerons */}
        <group ref={leftAileronRef} position={[-1.7, 0.1, 0.2]}>
          <mesh position={[0, 0, -0.15]}>
            <boxGeometry args={[0.8, 0.02, 0.15]} />
            <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.6} />
          </mesh>
        </group>
        <group ref={rightAileronRef} position={[1.7, 0.1, 0.2]}>
          <mesh position={[0, 0, -0.15]}>
            <boxGeometry args={[0.8, 0.02, 0.15]} />
            <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.6} />
          </mesh>
        </group>

        <HotspotPin position={[0, 0.5, 0]} label="AVIONICS CORE" onClick={() => onSelectPart('CENTRAL AVIONICS CORE')} active={selectedPart === 'CENTRAL AVIONICS CORE'} />
        <HotspotPin position={[-1.2, 0.2, -0.4]} label="PORT TURBINE" onClick={() => onSelectPart('PORT TURBINE')} active={selectedPart === 'PORT TURBINE'} />
        <HotspotPin position={[1.2, 0.2, -0.4]} label="STARBOARD TURBINE" onClick={() => onSelectPart('STARBOARD TURBINE')} active={selectedPart === 'STARBOARD TURBINE'} />
      </Float>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. FADEC PROPULSION CORE (Pistons, Crankshaft, Alternator Belt, Turbo)     */
/* -------------------------------------------------------------------------- */
function PropulsionCoreModel({ viewMode, selectedPart, onSelectPart }) {
  const { telemetry } = useTelemetryStore();
  
  const propGroupRef = useRef();
  const crankRef = useRef();
  const turbineRef = useRef();
  const alternatorPulleyRef = useRef();
  const pistonRefs = useRef([]);

  useFrame((state, delta) => {
    const rpm = telemetry?.rpm || 0;
    const isStopped = rpm <= 0 || telemetry?.faults?.propStrike;

    if (!isStopped) {
      const rotSpeed = (rpm / 60) * Math.PI * 2 * delta;
      
      // Rotate Propeller & Crankshaft
      if (propGroupRef.current) propGroupRef.current.rotation.z -= rotSpeed * 0.35;
      if (crankRef.current) crankRef.current.rotation.x += rotSpeed * 0.6;
      if (turbineRef.current) turbineRef.current.rotation.z += rotSpeed * 2.0;
      if (alternatorPulleyRef.current) alternatorPulleyRef.current.rotation.z += rotSpeed * 0.9;

      // Reciprocate 4 Pistons in 4-stroke cycle
      pistonRefs.current.forEach((piston, idx) => {
        if (piston) {
          const phase = idx * (Math.PI / 2);
          const strokeAmp = 0.22;
          piston.position.y = Math.sin((state.clock.getElapsedTime() * (rpm / 60) * Math.PI * 2) + phase) * strokeAmp;
        }
      });
    }
  });

  const getCylColor = (index) => {
    if (!telemetry) return '#00f0ff';
    const temp = telemetry.chts[index] || 100;
    if (temp > 240) return '#ff003c';
    if (temp > 180) return '#facc15';
    return '#00f0ff';
  };

  const isOilWarning = telemetry?.oilPressure < 1.5;
  const isHydWarning = telemetry?.hydPressure < 1500;
  const boost = telemetry?.turboBoostPressure || 0.0;

  return (
    <group position={[0, -0.2, 0]}>
      {/* Crankcase / Engine Core Block */}
      <mesh 
        position={[0, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelectPart('CRANKCASE / BLOCK'); }}
      >
        <boxGeometry args={[1.3, 1.4, 2.6]} />
        <meshStandardMaterial 
          color={selectedPart === 'CRANKCASE / BLOCK' ? '#00f0ff' : '#0f172a'} 
          metalness={0.9} 
          roughness={0.2} 
          wireframe={viewMode === 'WIREFRAME'}
          transparent={viewMode === 'XRAY'}
          opacity={viewMode === 'XRAY' ? 0.35 : 0.95}
          emissive="#0ea5e9"
          emissiveIntensity={selectedPart === 'CRANKCASE / BLOCK' ? 0.9 : 0.15}
        />
      </mesh>

      {/* Internal Crankshaft Axis (visible in X-ray) */}
      <group ref={crankRef} position={[0, -0.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 2.2, 16]} />
          <meshStandardMaterial color="#38bdf8" metalness={0.95} roughness={0.1} emissive="#0ea5e9" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Oil Sump / Lubrication Pan */}
      <mesh 
        position={[0, -0.85, 0]}
        onClick={(e) => { e.stopPropagation(); onSelectPart('OIL SUMP & PUMP'); }}
      >
        <boxGeometry args={[1.1, 0.4, 2.2]} />
        <meshStandardMaterial 
          color={isOilWarning ? '#ff003c' : '#0ea5e9'} 
          metalness={0.9} 
          roughness={0.2}
          wireframe={viewMode === 'WIREFRAME'}
          emissive={isOilWarning ? '#ff003c' : '#0ea5e9'}
          emissiveIntensity={isOilWarning ? 2.5 : 0.3}
        />
      </mesh>

      {/* Hydraulic Power Unit Pump */}
      <mesh 
        position={[0.75, -0.4, -0.6]} 
        rotation={[0, 0, Math.PI / 4]}
        onClick={(e) => { e.stopPropagation(); onSelectPart('HYDRAULIC PUMP UNIT'); }}
      >
        <cylinderGeometry args={[0.22, 0.22, 0.6, 16]} />
        <meshStandardMaterial 
          color={isHydWarning ? '#ff003c' : '#38bdf8'} 
          metalness={0.9} 
          roughness={0.3}
          wireframe={viewMode === 'WIREFRAME'}
          emissive={isHydWarning ? '#ff003c' : '#0284c7'}
          emissiveIntensity={isHydWarning ? 2.5 : 0.5}
        />
      </mesh>

      {/* Alternator with Rotating Pulley & Belt */}
      <group position={[-0.75, -0.4, -0.6]} rotation={[0, 0, -Math.PI / 4]}>
        <mesh onClick={(e) => { e.stopPropagation(); onSelectPart('ALTERNATOR / 28V BUS'); }}>
          <cylinderGeometry args={[0.25, 0.25, 0.5, 16]} />
          <meshStandardMaterial 
            color={telemetry?.faults?.alternatorFailure ? '#ff003c' : '#00f0ff'} 
            metalness={0.85} 
            emissive={telemetry?.faults?.alternatorFailure ? '#ff003c' : '#00f0ff'}
            emissiveIntensity={telemetry?.faults?.alternatorFailure ? 2.0 : 0.4}
          />
        </mesh>
        {/* Spinning Alternator Pulley */}
        <group ref={alternatorPulleyRef} position={[0, 0.3, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16, 0.04, 12, 24]} />
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
          </mesh>
        </group>
      </group>

      {/* Turbocharger Assembly with Active Impeller & Wastegate Glow */}
      <group position={[0, 0.85, -1.0]}>
        <mesh 
          rotation={[Math.PI / 2, 0, 0]}
          onClick={(e) => { e.stopPropagation(); onSelectPart('TURBOCHARGER & INTAKE'); }}
        >
          <torusGeometry args={[0.35, 0.12, 16, 32]} />
          <meshStandardMaterial 
            color="#f59e0b" 
            metalness={0.95} 
            roughness={0.15}
            wireframe={viewMode === 'WIREFRAME'}
            emissive="#f59e0b"
            emissiveIntensity={0.5 + boost * 0.15}
          />
        </mesh>
        {/* High-speed Turbine Impeller */}
        <group ref={turbineRef}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.08, 12]} />
            <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.9} />
          </mesh>
        </group>
      </group>

      {/* 4 CYLINDERS WITH MOVING PISTONS & THERMAL HEATMAP */}
      {[0, 1, 2, 3].map((i) => {
        const isLeft = i % 2 === 0;
        const zPos = -0.75 + Math.floor(i / 2) * 1.5;
        const xPos = isLeft ? -0.85 : 0.85;
        const partName = `CYLINDER ${i + 1} (${isLeft ? 'PORT' : 'STARBOARD'})`;
        const isSelected = selectedPart === partName;
        
        return (
          <group key={i} position={[xPos, 0.1, zPos]}>
            {/* Cylinder Housing */}
            <mesh 
              rotation={[0, 0, isLeft ? Math.PI / 2 : -Math.PI / 2]}
              onClick={(e) => { e.stopPropagation(); onSelectPart(partName); }}
            >
              <cylinderGeometry args={[0.42, 0.42, 0.7, 24]} />
              <meshStandardMaterial 
                color={getCylColor(i)} 
                emissive={getCylColor(i)} 
                emissiveIntensity={isSelected ? 3.0 : 0.75} 
                wireframe={viewMode === 'WIREFRAME'}
                transparent={viewMode === 'XRAY'}
                opacity={viewMode === 'XRAY' ? 0.35 : 0.9}
                roughness={0.3}
                metalness={0.7}
              />
            </mesh>

            {/* Reciprocating Internal Piston Head (Visible in X-ray/Transparent mode) */}
            <group ref={(el) => (pistonRefs.current[i] = el)} position={[0, 0, 0]}>
              <mesh rotation={[0, 0, isLeft ? Math.PI / 2 : -Math.PI / 2]}>
                <cylinderGeometry args={[0.34, 0.34, 0.18, 16]} />
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.9} metalness={0.9} />
              </mesh>
            </group>

            {/* Cylinder Cooling Fins */}
            <mesh rotation={[0, 0, isLeft ? Math.PI / 2 : -Math.PI / 2]}>
              <cylinderGeometry args={[0.46, 0.46, 0.5, 16]} />
              <meshStandardMaterial 
                color={getCylColor(i)} 
                wireframe={true}
                transparent={true}
                opacity={0.35}
              />
            </mesh>
          </group>
        );
      })}

      {/* Propeller Gearbox & 3 Carbon Propeller Blades */}
      <group position={[0, 0, 1.55]}>
        <mesh 
          rotation={[Math.PI / 2, 0, 0]}
          onClick={(e) => { e.stopPropagation(); onSelectPart('REDUCTION GEARBOX'); }}
        >
          <cylinderGeometry args={[0.3, 0.45, 0.6, 24]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} emissive="#0ea5e9" emissiveIntensity={0.4} />
        </mesh>

        <group ref={propGroupRef} position={[0, 0, 0.35]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.25, 20]} />
            <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.8} />
          </mesh>

          {[0, 120, 240].map((deg, idx) => (
            <group key={idx} rotation={[0, 0, (deg * Math.PI) / 180]}>
              <mesh position={[0, 1.4, 0]}>
                <boxGeometry args={[0.16, 2.5, 0.03]} />
                <meshStandardMaterial 
                  color="#00f0ff" 
                  emissive="#00f0ff" 
                  emissiveIntensity={0.6}
                  transparent={true}
                  opacity={telemetry?.rpm > 200 ? 0.35 : 0.9}
                />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      <HotspotPin position={[0.9, 0.4, 0]} label="CYL 2 / 4 BANK" onClick={() => onSelectPart('CYLINDER 2 (STARBOARD)')} active={selectedPart.includes('CYLINDER 2')} />
      <HotspotPin position={[-0.9, 0.4, 0]} label="CYL 1 / 3 BANK" onClick={() => onSelectPart('CYLINDER 1 (PORT)')} active={selectedPart.includes('CYLINDER 1')} />
      <HotspotPin position={[0, 1.1, -1.0]} label="TURBOCHARGER" onClick={() => onSelectPart('TURBOCHARGER & INTAKE')} active={selectedPart === 'TURBOCHARGER & INTAKE'} />
      <HotspotPin position={[0, -0.9, 0]} label="OIL SUMP" onClick={() => onSelectPart('OIL SUMP & PUMP')} active={selectedPart === 'OIL SUMP & PUMP'} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. SCI-FI HUD EFFECTS: TACTICAL GIMBAL RINGS, RADAR PULSE, LASER SCAN      */
/* -------------------------------------------------------------------------- */
function TacticalGimbalRings() {
  const outerRingRef = useRef();
  const innerRingRef = useRef();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (outerRingRef.current) outerRingRef.current.rotation.z = t * 0.15;
    if (innerRingRef.current) innerRingRef.current.rotation.z = -t * 0.25;
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Outer Tactical Coordinate Ring */}
      <group ref={outerRingRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.2, 4.25, 64]} />
          <meshBasicMaterial color="#00f0ff" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Inner Pitch Orientation Ring */}
      <group ref={innerRingRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.6, 3.63, 48]} />
          <meshBasicMaterial color="#0ea5e9" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function LidarSonarPulse() {
  const pulseRef = useRef();

  useFrame((state) => {
    if (pulseRef.current) {
      // Periodic expanding circular radar wave across the floor
      const t = (state.clock.getElapsedTime() * 0.6) % 1.0;
      const radius = 1.0 + t * 9.0;
      pulseRef.current.scale.set(radius, radius, 1);
      pulseRef.current.material.opacity = Math.max(0, (1.0 - t) * 0.4);
    }
  });

  return (
    <mesh ref={pulseRef} position={[0, -1.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.95, 1.0, 64]} />
      <meshBasicMaterial color="#00f0ff" transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

function StrobeBeacon({ position }) {
  const meshRef = useRef();
  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.getElapsedTime() % 1.1;
      const intensity = t < 0.12 ? 3.5 : 0.1;
      meshRef.current.material.emissiveIntensity = intensity;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshStandardMaterial color="#ff003c" emissive="#ff003c" emissiveIntensity={0.2} />
    </mesh>
  );
}

function HotspotPin({ position, label, onClick, active }) {
  return (
    <group position={position}>
      <Html distanceFactor={8} position={[0, 0.25, 0]} center>
        <button 
          onClick={onClick}
          className={`px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap transition-all flex items-center space-x-1 backdrop-blur-md border shadow-lg ${
            active 
              ? 'bg-plasma/25 border-plasma text-plasma shadow-[0_0_12px_#ff003c]' 
              : 'bg-gray-950/80 border-holo/40 text-holo hover:bg-holo/20 hover:border-holo shadow-[0_0_8px_rgba(0,240,255,0.2)]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-plasma animate-ping' : 'bg-holo'}`} />
          <span>{label}</span>
        </button>
      </Html>
    </group>
  );
}

function ScanningBeam() {
  const beamRef = useRef();
  useFrame((state) => {
    if (beamRef.current) {
      const z = Math.sin(state.clock.getElapsedTime() * 0.9) * 3.2;
      beamRef.current.position.z = z;
    }
  });

  return (
    <group ref={beamRef} position={[0, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 0.05]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. MASTER 3D VIEWER CONTAINER WITH CINEMATIC CONTROLS                      */
/* -------------------------------------------------------------------------- */
export function Engine3DViewer() {
  const { telemetry, activePanel } = useTelemetryStore();
  const controlsRef = useRef();
  const containerRef = useRef(null);
  
  // Model, visual modes, and camera perspective
  const [modelType, setModelType] = useState('UAV'); // 'UAV' | 'ENGINE' | 'RECON'
  const [viewMode, setViewMode] = useState('PBR'); // 'PBR' | 'WIREFRAME' | 'XRAY' | 'THERMAL'
  const [selectedPart, setSelectedPart] = useState('AVIONICS BAY / FADEC');

  const setCameraPreset = (type) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    
    if (type === 'ISO') {
      controls.object.position.set(4.5, 3.2, 5.5);
      controls.target.set(0, 0, 0);
    } else if (type === 'CHASE') {
      // Cinematic chase view looking from behind and slightly above
      controls.object.position.set(0, 1.8, -5.2);
      controls.target.set(0, 0.2, 1.0);
    } else if (type === 'GIMBAL') {
      // Forward nose/FLIR view
      controls.object.position.set(0, 0.4, 2.8);
      controls.target.set(0, 0, 6.0);
    } else if (type === 'FRONT') {
      controls.object.position.set(0, 0, 6);
      controls.target.set(0, 0, 0);
    } else if (type === 'TOP') {
      controls.object.position.set(0, 7.5, 0.1);
      controls.target.set(0, 0, 0);
    } else if (type === 'SIDE') {
      controls.object.position.set(6, 0.5, 0);
      controls.target.set(0, 0, 0);
    }
    controls.update();
  };

  const handleZoom = (delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    const cam = controls.object;
    const factor = delta > 0 ? 0.85 : 1.15;
    cam.position.multiplyScalar(factor);
    controls.update();
  };

  return (
    <div ref={containerRef} className="w-full h-full relative select-none">
      {/* 3D Canvas */}
      <Canvas 
        camera={{ position: [4.5, 3.2, 5.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[12, 16, 12]} intensity={1.8} />
        <directionalLight position={[-10, -10, -5]} intensity={0.9} color="#00f0ff" />
        <pointLight position={[0, 4, 0]} intensity={1.6} color="#00f0ff" />
        <pointLight position={[0, -2, 0]} intensity={1.0} color="#0284c7" />
        
        {/* Active 3D Model */}
        {modelType === 'UAV' && (
          <TacticalDroneModel 
            viewMode={viewMode}
            selectedPart={selectedPart}
            onSelectPart={setSelectedPart}
          />
        )}
        {modelType === 'ENGINE' && (
          <PropulsionCoreModel 
            viewMode={viewMode}
            selectedPart={selectedPart}
            onSelectPart={setSelectedPart}
          />
        )}
        {modelType === 'RECON' && (
          <ReconAirframeModel 
            viewMode={viewMode}
            selectedPart={selectedPart}
            onSelectPart={setSelectedPart}
          />
        )}

        {/* Ambient Holographic Particle Dust */}
        <Sparkles count={55} scale={9} size={2.5} speed={0.45} color="#00f0ff" opacity={0.55} />
        
        {/* Laser Scanner Beam */}
        <ScanningBeam />

        {/* Sci-Fi Compass Gimbal Rings */}
        <TacticalGimbalRings />

        {/* Lidar/Sonar Expanding Pulse */}
        <LidarSonarPulse />

        {/* Holographic Tactical Grid Floor with radial falloff */}
        <Grid 
          position={[0, -1.8, 0]} 
          args={[22, 22]} 
          cellSize={0.5} 
          cellThickness={0.8} 
          cellColor="#00f0ff" 
          sectionSize={2.5} 
          sectionThickness={1.5} 
          sectionColor="#0284c7" 
          fadeDistance={15} 
          fadeStrength={1.6} 
        />

        <EffectComposer>
          <Bloom luminanceThreshold={0.85} mipmapBlur intensity={1.8} />
        </EffectComposer>

        <OrbitControls 
          ref={controlsRef}
          makeDefault
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          autoRotate={false}
          maxPolarAngle={Math.PI / 1.3}
          minDistance={1.2}
          maxDistance={25}
          zoomSpeed={1.2}
          rotateSpeed={0.85}
          panSpeed={0.85}
        />
      </Canvas>

      {/* Interactive Overlay for Tab 1 (Positioned cleanly below Header 50px & Sidebar 72px) */}
      {activePanel === 1 && (
        <div className="absolute inset-0 pointer-events-none pt-[62px] pb-4 pl-[84px] pr-4 flex flex-col justify-between z-20">
          
          {/* Top Bar: Model Selector, Camera Presets & Modes */}
          <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
            
            {/* Model Asset Switcher Tabs */}
            <div className="bg-gray-950/90 backdrop-blur-md border border-holo/40 p-1 rounded flex items-center space-x-1 font-mono text-xs shadow-[0_0_15px_rgba(0,240,255,0.2)]">
              <button 
                onClick={() => setModelType('UAV')}
                className={`px-3 py-1.5 rounded transition-all flex items-center space-x-1.5 text-[11px] font-bold ${
                  modelType === 'UAV' 
                    ? 'bg-holo/25 border border-holo text-holo shadow-[0_0_10px_#00f0ff]' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Disc size={13} className={modelType === 'UAV' ? 'animate-spin' : ''} />
                <span>HEXA-UAV DRONE</span>
              </button>

              <button 
                onClick={() => setModelType('ENGINE')}
                className={`px-3 py-1.5 rounded transition-all flex items-center space-x-1.5 text-[11px] font-bold ${
                  modelType === 'ENGINE' 
                    ? 'bg-holo/25 border border-holo text-holo shadow-[0_0_10px_#00f0ff]' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Cpu size={13} />
                <span>PROPULSION CORE</span>
              </button>

              <button 
                onClick={() => setModelType('RECON')}
                className={`px-3 py-1.5 rounded transition-all flex items-center space-x-1.5 text-[11px] font-bold ${
                  modelType === 'RECON' 
                    ? 'bg-holo/25 border border-holo text-holo shadow-[0_0_10px_#00f0ff]' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Plane size={13} />
                <span>RECON AIRFRAME</span>
              </button>
            </div>

            {/* Camera Presets & View Modes */}
            <div className="bg-gray-950/90 backdrop-blur-md border border-holo/30 p-1.5 rounded flex items-center space-x-1.5 font-mono text-xs shadow-[0_0_15px_rgba(0,240,255,0.15)]">
              {/* Presets */}
              <button onClick={() => setCameraPreset('ISO')} className="px-2 py-1 border border-holo/40 text-holo hover:bg-holo/25 rounded transition-colors text-[10px]">
                ISO
              </button>
              <button onClick={() => setCameraPreset('CHASE')} className="px-2 py-1 border border-holo/40 text-holo hover:bg-holo/25 rounded transition-colors text-[10px] flex items-center space-x-1">
                <Navigation2 size={11} className="rotate-45" />
                <span>CHASE</span>
              </button>
              <button onClick={() => setCameraPreset('GIMBAL')} className="px-2 py-1 border border-holo/40 text-holo hover:bg-holo/25 rounded transition-colors text-[10px] flex items-center space-x-1">
                <Video size={11} />
                <span>FLIR</span>
              </button>
              <button onClick={() => setCameraPreset('TOP')} className="px-2 py-1 border border-holo/40 text-holo hover:bg-holo/25 rounded transition-colors text-[10px]">
                TOP
              </button>
              
              <div className="h-4 w-px bg-holo/30 mx-1" />

              <button onClick={() => handleZoom(1)} className="p-1 border border-holo/40 text-holo hover:bg-holo/25 rounded transition-colors" title="Zoom In">
                <ZoomIn size={12} />
              </button>
              <button onClick={() => handleZoom(-1)} className="p-1 border border-holo/40 text-holo hover:bg-holo/25 rounded transition-colors" title="Zoom Out">
                <ZoomOut size={12} />
              </button>
              <button onClick={() => setCameraPreset('ISO')} className="p-1 border border-holo/40 text-holo hover:bg-holo/25 rounded transition-colors" title="Reset View">
                <RotateCcw size={12} />
              </button>

              <div className="h-4 w-px bg-holo/30 mx-1" />

              {/* View Modes */}
              <button 
                onClick={() => setViewMode(viewMode === 'WIREFRAME' ? 'PBR' : 'WIREFRAME')} 
                className={`px-2 py-1 border rounded flex items-center space-x-1 transition-colors text-[10px] ${
                  viewMode === 'WIREFRAME' ? 'border-plasma text-plasma bg-plasma/20' : 'border-holo/40 text-holo hover:bg-holo/25'
                }`}
              >
                <Layers size={11} />
                <span>WIRE</span>
              </button>

              <button 
                onClick={() => setViewMode(viewMode === 'XRAY' ? 'PBR' : 'XRAY')} 
                className={`px-2 py-1 border rounded flex items-center space-x-1 transition-colors text-[10px] ${
                  viewMode === 'XRAY' ? 'border-amber-400 text-amber-400 bg-amber-400/20' : 'border-holo/40 text-holo hover:bg-holo/25'
                }`}
              >
                <Eye size={11} />
                <span>X-RAY</span>
              </button>

              <button 
                onClick={() => setViewMode(viewMode === 'THERMAL' ? 'PBR' : 'THERMAL')} 
                className={`px-2 py-1 border rounded flex items-center space-x-1 transition-colors text-[10px] ${
                  viewMode === 'THERMAL' ? 'border-red-500 text-red-400 bg-red-500/20' : 'border-holo/40 text-holo hover:bg-holo/25'
                }`}
              >
                <Flame size={11} />
                <span>FLIR</span>
              </button>
            </div>
          </div>

          {/* Bottom Component Diagnostics Card & Telemetry Pill */}
          <div className="flex flex-wrap items-end justify-between gap-3 pointer-events-auto">
            <div className="w-full sm:w-[380px] bg-gray-950/90 backdrop-blur-md border border-holo/40 p-3.5 rounded shadow-[0_0_20px_rgba(0,240,255,0.2)] font-mono text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-holo/20 mb-2.5">
                <span className="text-holo font-bold uppercase tracking-wider flex items-center text-xs truncate max-w-[240px]">
                  <Zap size={13} className="mr-1.5 text-holo shrink-0" /> {selectedPart}
                </span>
                <span className="text-[10px] text-gray-400 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-holo animate-ping" />
                  <span>SYNCED</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] mb-2.5">
                <div className="bg-gray-900/80 p-2 rounded border border-holo/15">
                  <div className="text-gray-400 text-[10px]">OPERATING TEMP</div>
                  <div className="text-holo font-bold text-sm">
                    {selectedPart.includes('CYLINDER 2') ? `${telemetry?.chts[1]?.toFixed(1)} °C` : 
                     selectedPart.includes('CYLINDER 1') ? `${telemetry?.chts[0]?.toFixed(1)} °C` : 
                     selectedPart.includes('CYLINDER 3') ? `${telemetry?.chts[2]?.toFixed(1)} °C` : 
                     selectedPart.includes('CYLINDER 4') ? `${telemetry?.chts[3]?.toFixed(1)} °C` : 
                     selectedPart.includes('OIL') ? `${telemetry?.oilTemp?.toFixed(1)} °C` :
                     selectedPart.includes('AVIONICS') ? `${telemetry?.avionicsTemp?.toFixed(1)} °C` :
                     selectedPart.includes('HYDRAULIC') ? `${telemetry?.hydTemp?.toFixed(1)} °C` : '42.5 °C'}
                  </div>
                </div>

                <div className="bg-gray-900/80 p-2 rounded border border-holo/15">
                  <div className="text-gray-400 text-[10px]">DYNAMIC LOAD / PRESSURE</div>
                  <div className="text-holo font-bold text-sm">
                    {selectedPart.includes('OIL') ? `${telemetry?.oilPressure?.toFixed(2)} BAR` : 
                     selectedPart.includes('HYDRAULIC') ? `${telemetry?.hydPressure?.toFixed(0)} PSI` : 
                     selectedPart.includes('TURBO') ? `${telemetry?.turboBoostPressure?.toFixed(1)} BAR` : 
                     `${((telemetry?.gLoad || 1.0)).toFixed(2)} G`}
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-gray-400 bg-gray-900/50 p-2 rounded border border-holo/10 flex items-center justify-between">
                <span>Drag to orbit • Scroll to zoom • Click pins to inspect</span>
              </div>
            </div>

            {/* Live Telemetry Pill Bar */}
            <div className="bg-gray-950/90 backdrop-blur-md border border-holo/30 px-4 py-2 rounded flex items-center space-x-4 font-mono text-xs shadow-[0_0_15px_rgba(0,240,255,0.15)]">
              <div>RPM: <span className="text-holo font-bold">{Math.round(telemetry?.rpm || 0)}</span></div>
              <div className="h-3 w-px bg-holo/30" />
              <div>THR: <span className="text-holo font-bold">{telemetry?.actuators?.throttle?.toFixed(0)}%</span></div>
              <div className="h-3 w-px bg-holo/30" />
              <div>GEAR: <span className={`font-bold ${telemetry?.actuators?.gearDown ? 'text-holo' : 'text-amber-400'}`}>{telemetry?.actuators?.gearDown ? 'DOWN' : 'RETRACTED'}</span></div>
              <div className="h-3 w-px bg-holo/30" />
              <div>FLAPS: <span className="text-holo font-bold">{telemetry?.actuators?.flaps}°</span></div>
              <div className="h-3 w-px bg-holo/30" />
              <div>OIL: <span className={`font-bold ${telemetry?.oilPressure < 1.5 ? 'text-plasma' : 'text-holo'}`}>{telemetry?.oilPressure?.toFixed(1)} BAR</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
