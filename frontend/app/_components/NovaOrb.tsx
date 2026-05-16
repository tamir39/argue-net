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

// ─────────────────────────────────────────────────────────────
// Core: subtly deforming wireframe icosphere
// ─────────────────────────────────────────────────────────────

const CORE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  varying vec3 vNormal;

  float n(vec3 p) {
    return sin(p.x * 1.6 + uTime * 0.4) * cos(p.y * 1.3 - uTime * 0.3)
         + sin(p.z * 1.9 + uTime * 0.55) * 0.5;
  }

  void main() {
    float disp = n(position * 1.1) * (0.04 + 0.10 * uActivity);
    vec3 displaced = position + normal * disp;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const CORE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uActivity;
  varying vec3 vNormal;

  void main() {
    float edge = 0.55 + 0.35 * uActivity;
    gl_FragColor = vec4(uColor * edge, 0.55 + 0.20 * uActivity);
  }
`;

function CoreLattice({
  uniforms,
}: {
  uniforms: { uTime: { value: number }; uActivity: { value: number }; uColor: { value: THREE.Color } };
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (ref.current) {
      ref.current.rotation.y += 0.0025;
      ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.25) * 0.12;
    }
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 4]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={CORE_VERT}
        fragmentShader={CORE_FRAG}
        wireframe
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
// Gyro rings — 3 thin torus rings on different axes
// ─────────────────────────────────────────────────────────────

function GyroRings({
  color,
  activityRef,
}: {
  color: THREE.Color;
  activityRef: React.RefObject<number>;
}) {
  const g1 = useRef<THREE.Mesh>(null);
  const g2 = useRef<THREE.Mesh>(null);
  const g3 = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const a = activityRef.current ?? 0;
    const rotMult = 1 + a * 1.5;
    if (g1.current) {
      g1.current.rotation.x = t * 0.35 * rotMult;
      g1.current.rotation.y = t * 0.15 * rotMult;
      g1.current.scale.setScalar(1 + 0.04 * Math.sin(t * 1.6));
    }
    if (g2.current) {
      g2.current.rotation.y = t * 0.45 * rotMult;
      g2.current.rotation.z = t * 0.2 * rotMult;
      g2.current.scale.setScalar(1 + 0.05 * Math.sin(t * 1.2 + 1.5));
    }
    if (g3.current) {
      g3.current.rotation.z = t * 0.25 * rotMult;
      g3.current.rotation.x = t * 0.3 * rotMult;
      g3.current.scale.setScalar(1 + 0.05 * Math.sin(t * 0.9 + 3));
    }
  });
  return (
    <group>
      <mesh ref={g1}>
        <torusGeometry args={[1.25, 0.006, 6, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh ref={g2} rotation={[Math.PI / 2.3, 0, 0.4]}>
        <torusGeometry args={[1.45, 0.005, 6, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} />
      </mesh>
      <mesh ref={g3} rotation={[0.3, Math.PI / 3, 0.8]}>
        <torusGeometry args={[1.18, 0.005, 6, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Filament threads — line segments forming inner lattice
// ─────────────────────────────────────────────────────────────

function FilamentLattice({ color }: { color: THREE.Color }) {
  const ref = useRef<THREE.LineSegments>(null);
  const positions = useMemo(() => {
    const N = 70; // 70 line segments = 140 vertices
    const arr = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      // Pick two random points on/near unit sphere
      for (let j = 0; j < 2; j++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 0.95 + Math.random() * 0.25;
        arr[(i * 2 + j) * 3] = r * Math.sin(phi) * Math.cos(theta);
        arr[(i * 2 + j) * 3 + 1] = r * Math.cos(phi);
        arr[(i * 2 + j) * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
    }
    return arr;
  }, []);
  useFrame((s) => {
    if (ref.current) {
      ref.current.rotation.y += 0.001;
      ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.1) * 0.08;
    }
  });
  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.28} />
    </lineSegments>
  );
}

// ─────────────────────────────────────────────────────────────
// Sparse drifting particles — small dust, no halo blowout
// ─────────────────────────────────────────────────────────────

const PARTICLE_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aRadius;
  attribute vec3 aDir;
  uniform float uTime;
  uniform float uActivity;
  varying float vGlow;
  varying float vTendrilMix;

  void main() {
    float t = uTime * 0.28 + aSeed * 30.0;
    float theta = t * (0.6 + aSeed * 0.5) + aSeed * 6.2831;
    float phi = aSeed * 3.14159 + sin(uTime * 0.15 + aSeed * 5.0) * 0.5;
    vec3 idlePos = vec3(
      cos(theta) * sin(phi),
      cos(phi),
      sin(theta) * sin(phi)
    ) * aRadius;

    float tendrilMag = length(aDir);
    float reach = uActivity * tendrilMag * (1.2 + 0.5 * sin(uTime * 2.5 + aSeed * 20.0));
    vec3 tendril = aDir * reach;

    vec3 pos = idlePos + tendril;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.4 + 1.8 * uActivity + tendrilMag * 0.6) * (240.0 / -mv.z);

    vGlow = 0.35 + 0.45 * sin(uTime * 1.5 + aSeed * 40.0);
    vTendrilMix = tendrilMag;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vGlow;
  varying float vTendrilMix;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float fall = 1.0 - d * 2.0;
    float a = fall * (0.20 + 0.35 * vGlow + 0.25 * vTendrilMix);
    gl_FragColor = vec4(uColor * (0.8 + vGlow * 0.4), a);
  }
`;

const PARTICLE_COUNT = 600;
const TENDRIL_RATIO = 0.18;

function useParticleBuffers() {
  return useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const dirs = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i] = Math.random();
      radii[i] = 1.7 + Math.random() * 0.8;
      const isTendril = Math.random() < TENDRIL_RATIO;
      if (isTendril) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const mag = 0.5 + Math.random() * 1.0;
        dirs[i * 3] = Math.sin(phi) * Math.cos(theta) * mag;
        dirs[i * 3 + 1] = Math.cos(phi) * mag;
        dirs[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * mag;
      }
    }
    return { positions, seeds, radii, dirs };
  }, []);
}

// ─────────────────────────────────────────────────────────────
// Composite NovaOrb
// ─────────────────────────────────────────────────────────────

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

  // Shared color used by ring + filament basic materials (mutated in place)
  const liveColor = useMemo(() => new THREE.Color(...COLORS.jarvis), []);
  const targetCol = useRef(new THREE.Color(...COLORS.jarvis));
  const activityRef = useRef(0);

  useEffect(() => {
    const key: SpeakerKey = activeSpeaker ?? "jarvis";
    targetCol.current.setRGB(...COLORS[key]);
  }, [activeSpeaker]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const targetActivity = activeSpeaker ? 1 : 0;

    coreUniforms.uTime.value = t;
    coreUniforms.uActivity.value +=
      (targetActivity - coreUniforms.uActivity.value) * 0.06;
    coreUniforms.uColor.value.lerp(targetCol.current, 0.04);

    particleUniforms.uTime.value = t;
    particleUniforms.uActivity.value +=
      (targetActivity - particleUniforms.uActivity.value) * 0.06;
    particleUniforms.uColor.value.lerp(targetCol.current, 0.04);

    liveColor.lerp(targetCol.current, 0.04);
    activityRef.current = coreUniforms.uActivity.value;
  });

  const buffers = useParticleBuffers();

  return (
    <group>
      <CoreLattice uniforms={coreUniforms} />
      <FilamentLattice color={liveColor} />
      <GyroRings color={liveColor} activityRef={activityRef} />
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
