import * as THREE from 'three';

export function createHologramMaterial({
  color = '#22d3ee',
  opacity = 0.72,
  scanSpeed = 1.4,
  fresnelPower = 2.6,
  wireframe = false,
} = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    wireframe,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uScanSpeed: { value: scanSpeed },
      uFresnelPower: { value: fresnelPower },
      uAlertLevel: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      uniform float uTime;
      uniform float uAlertLevel;

      void main() {
        vec3 pos = position;
        float glitchBand = step(0.96, sin(pos.y * 18.0 + uTime * 9.0));
        pos.x += glitchBand * uAlertLevel * 0.03 * sin(uTime * 45.0);

        vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPosition.xyz;
        vLocalPos = pos;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;

      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uScanSpeed;
      uniform float uFresnelPower;
      uniform float uAlertLevel;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndotv = abs(dot(normalize(vWorldNormal), viewDir));
        float fresnel = pow(1.0 - clamp(ndotv, 0.0, 1.0), uFresnelPower);

        float scanlines = 0.78 + 0.22 * sin(vWorldPos.y * 65.0 - uTime * uScanSpeed * 6.0);
        float sweep = smoothstep(0.88, 1.0, sin(vWorldPos.y * 1.6 - uTime * uScanSpeed));

        vec3 faultColor = vec3(1.0, 0.12, 0.28);
        float pulse = 0.5 + 0.5 * sin(uTime * 8.0);
        vec3 baseCol = mix(uColor, faultColor, uAlertLevel * (0.45 + 0.45 * pulse));

        float intensity = (0.18 + fresnel * 1.35 + sweep * 0.65) * scanlines;
        float alpha = clamp(intensity * uOpacity, 0.08, 0.95);

        gl_FragColor = vec4(baseCol * (1.0 + sweep * 0.8), alpha);
      }
    `,
  });
}

export function createThermalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeat: { value: 0.35 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vNormalDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalDir = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vNormalDir;
      uniform float uTime;
      uniform float uHeat;

      vec3 ironbow(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.05, 0.03, 0.18);
        vec3 c1 = vec3(0.45, 0.05, 0.55);
        vec3 c2 = vec3(0.92, 0.16, 0.22);
        vec3 c3 = vec3(1.00, 0.72, 0.08);
        vec3 c4 = vec3(1.00, 0.98, 0.88);
        if (t < 0.25) return mix(c0, c1, t / 0.25);
        if (t < 0.55) return mix(c1, c2, (t - 0.25) / 0.30);
        if (t < 0.82) return mix(c2, c3, (t - 0.55) / 0.27);
        return mix(c3, c4, (t - 0.82) / 0.18);
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = 1.0 - abs(dot(normalize(vNormalDir), viewDir));
        float coreDist = exp(-length(vWorldPos.xz) * 0.55);
        float ripple = 0.03 * sin(vWorldPos.z * 8.0 - uTime * 4.0);
        float temp = clamp(uHeat * 0.75 + coreDist * 0.42 - rim * 0.18 + ripple, 0.0, 1.0);
        gl_FragColor = vec4(ironbow(temp), 1.0);
      }
    `,
  });
}

// Radial motion-blur disc shader for high-RPM hexacopter rotors
export function createRotorBlurMaterial(color = '#22d3ee') {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 1.0 },
      uDirection: { value: 1.0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.48 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uSpeed;
      uniform float uDirection;
      uniform vec3 uColor;
      uniform float uOpacity;

      void main() {
        vec2 centered = vUv * 2.0 - 1.0;
        float r = length(centered);
        if (r > 1.0 || r < 0.14) discard;

        float angle = atan(centered.y, centered.x);
        // 2-blade smeared radial motion streaks + outer tip-vortex ring
        float streaks = pow(0.5 + 0.5 * sin(angle * 2.0 + uTime * 28.0 * uSpeed * uDirection), 2.5);
        float fineBlur = 0.5 + 0.5 * sin(angle * 6.0 - uTime * 18.0 * uDirection);
        float tipRing = smoothstep(0.84, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));
        float radialFade = smoothstep(0.14, 0.28, r) * (1.0 - smoothstep(0.92, 1.0, r));

        float alpha = (0.16 + streaks * 0.42 + fineBlur * 0.12 + tipRing * 0.85) * radialFade * uOpacity;
        vec3 col = mix(uColor, vec3(0.85, 0.98, 1.0), tipRing * 0.7);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
      }
    `,
  });
}
