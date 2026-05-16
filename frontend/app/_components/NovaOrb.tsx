"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type SpeakerKey = "jarvis" | "pro" | "con" | "mediator";

const COLORS: Record<SpeakerKey, [number, number, number]> = {
  jarvis: [0.27, 0.78, 0.97],
  pro: [0.4, 0.95, 0.55],
  con: [0.99, 0.42, 0.55],
  mediator: [0.99, 0.78, 0.3],
};

const CORE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vDisp;

  // Smooth pseudo-3D noise (sin-stack, cheap)
  float n3(vec3 p) {
    float a = sin(p.x * 1.7 + uTime * 0.55) * cos(p.y * 1.3 - uTime * 0.35);
    float b = sin(p.z * 2.1 + uTime * 0.7) * cos(p.x * 0.9 + uTime * 0.25);
    float c = sin(dot(p, vec3(1.3, -1.7, 2.1)) + uTime * 0.4);
    return (a + b + c) / 3.0;
  }

  void main() {
    float n1 = n3(position * 1.3);
    float n2 = n3(position * 3.0 + vec3(11.7, 3.2, 8.4));
    float n3a = n3(position * 0.5 - vec3(uTime * 0.15));
    float disp = n1 * 0.55 + n2 * 0.25 + n3a * 0.30;
    float amp = 0.18 + 0.40 * uActivity;
    vec3 displaced = position + normal * disp * amp;
    vDisp = disp;
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const CORE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCamera;
  uniform float uActivity;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vDisp;

  void main() {
    vec3 view = normalize(uCamera - vWorldPos);
    float fres = pow(1.0 - clamp(dot(vNormal, view), 0.0, 1.0), 2.2);
    float pulse = 0.5 + 0.5 * sin(uTime * 2.5);
    float core = 0.20 + fres * 1.6 + uActivity * (0.55 + 0.35 * pulse) + abs(vDisp) * 0.3;
    vec3 col = uColor * core;
    float alpha = 0.55 + fres * 0.45 + uActivity * 0.20;
    gl_FragColor = vec4(col, alpha);
  }
`;

const PARTICLE_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aRadius;
  attribute vec3 aDir;
  uniform float uTime;
  uniform float uActivity;
  varying float vGlow;
  varying float vTendrilMix;

  // Each particle does idle orbit + reaches outward when active
  void main() {
    float t = uTime * 0.35 + aSeed * 30.0;

    // Idle orbit position
    float theta = t * (0.7 + aSeed * 0.6) + aSeed * 6.2831;
    float phi = aSeed * 3.14159 + sin(uTime * 0.2 + aSeed * 5.0) * 0.6;
    vec3 idlePos = vec3(
      cos(theta) * sin(phi),
      cos(phi) + sin(uTime * 0.5 + aSeed * 10.0) * 0.15,
      sin(theta) * sin(phi)
    ) * aRadius;

    // Tendril reach: subset of particles (aDir != 0) extend along aDir when active
    float tendrilMag = length(aDir);
    float reach = uActivity * tendrilMag * (1.5 + 0.8 * sin(uTime * 3.0 + aSeed * 20.0));
    vec3 tendril = aDir * reach;

    // Idle pulse breathing
    float breathe = 1.0 + uActivity * 0.45 * sin(uTime * 2.2 + aSeed * 12.0);
    vec3 pos = idlePos * breathe + tendril;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.6 + 3.5 * uActivity + tendrilMag * 1.5) * (320.0 / -mv.z);

    vGlow = 0.4 + 0.6 * sin(uTime * 1.7 + aSeed * 40.0);
    vTendrilMix = tendrilMag;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uActivity;
  varying float vGlow;
  varying float vTendrilMix;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float fall = (1.0 - d * 2.0);
    float a = fall * (0.35 + 0.50 * vGlow + 0.30 * uActivity * vTendrilMix);
    vec3 col = uColor * (1.0 + vGlow * 0.4 + vTendrilMix * 0.6);
    gl_FragColor = vec4(col, a);
  }
`;

const PARTICLE_COUNT = 1800;
const TENDRIL_RATIO = 0.22; // ~22% of particles act as tendril seeds

function useParticleBuffers() {
  return useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const dirs = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i] = Math.random();
      radii[i] = 1.55 + Math.random() * 0.9;
      const isTendril = Math.random() < TENDRIL_RATIO;
      if (isTendril) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const mag = 0.6 + Math.random() * 1.4;
        dirs[i * 3] = Math.sin(phi) * Math.cos(theta) * mag;
        dirs[i * 3 + 1] = Math.cos(phi) * mag;
        dirs[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * mag;
      }
    }
    return { positions, seeds, radii, dirs };
  }, []);
}

export function NovaOrb({
  activeSpeaker,
}: {
  activeSpeaker: SpeakerKey | null;
}) {
  const coreUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0 },
      uColor: { value: new THREE.Color(...COLORS.jarvis) },
      uCamera: { value: new THREE.Vector3() },
    }),
    [],
  );

  const particleUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0 },
      uColor: { value: new THREE.Color(...COLORS.jarvis) },
    }),
    [],
  );

  const targetCol = useRef(new THREE.Color(...COLORS.jarvis));

  useEffect(() => {
    const key: SpeakerKey = activeSpeaker ?? "jarvis";
    targetCol.current.setRGB(...COLORS[key]);
  }, [activeSpeaker]);

  const meshRef = useRef<THREE.Mesh>(null);
  const buffers = useParticleBuffers();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const targetActivity = activeSpeaker ? 1 : 0;

    coreUniforms.uTime.value = t;
    coreUniforms.uActivity.value +=
      (targetActivity - coreUniforms.uActivity.value) * 0.08;
    coreUniforms.uColor.value.lerp(targetCol.current, 0.05);
    coreUniforms.uCamera.value.copy(state.camera.position);

    particleUniforms.uTime.value = t;
    particleUniforms.uActivity.value +=
      (targetActivity - particleUniforms.uActivity.value) * 0.08;
    particleUniforms.uColor.value.lerp(targetCol.current, 0.05);

    if (meshRef.current) {
      meshRef.current.rotation.y += 0.004;
      meshRef.current.rotation.x = Math.sin(t * 0.25) * 0.18;
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 64]} />
        <shaderMaterial
          uniforms={coreUniforms}
          vertexShader={CORE_VERT}
          fragmentShader={CORE_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[buffers.positions, 3]}
          />
          <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 1]} />
          <bufferAttribute
            attach="attributes-aRadius"
            args={[buffers.radii, 1]}
          />
          <bufferAttribute attach="attributes-aDir" args={[buffers.dirs, 3]} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={particleUniforms}
          vertexShader={PARTICLE_VERT}
          fragmentShader={PARTICLE_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
