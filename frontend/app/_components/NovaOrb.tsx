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
// Shell particles — ~3000 dots on a soft sphere shell with
// noise-driven radial wobble. This is the "body" of NovaOrb.
// ─────────────────────────────────────────────────────────────

const SHELL_VERT = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aDir;
  attribute float aPhase;
  uniform float uTime;
  uniform float uActivity;
  varying float vGlow;

  void main() {
    float motion = 0.15 + 0.85 * uActivity;
    float t = uTime + aPhase;

    // Very gentle radial breath (kept small so it doesn't feel like
    // the whole sphere is pulsing as one).
    float breath = sin(t * 0.6) * (0.005 + 0.025 * uActivity);
    vec3 pos = position * (1.0 + breath);

    // Per-particle drift along its OWN random direction. Different
    // particles drift different ways → not synchronized.
    float drift = sin(t * (0.7 + aSeed * 0.6)) * (0.004 + 0.10 * uActivity);
    pos += aDir * drift;

    // Tangential swirl (perpendicular to radial × aDir) so each
    // particle also orbits its own little path around the surface.
    vec3 tangent = normalize(cross(position, aDir + vec3(0.001)));
    float swirl = sin(t * (0.5 + aSeed * 0.4) + aPhase) * (0.003 + 0.08 * uActivity);
    pos += tangent * swirl;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.7 + 0.4 * uActivity + aSeed * 0.5) * (32.0 / -mv.z);

    vGlow = 0.3 + 0.45 * sin(uTime * 1.4 + aSeed * 40.0);
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vGlow;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float fall = 1.0 - smoothstep(0.0, 0.5, d);
    fall = pow(fall, 2.5);
    float a = fall * (0.20 + 0.25 * vGlow);
    gl_FragColor = vec4(uColor * (0.85 + vGlow * 0.5), a);
  }
`;

function ShellParticles({ uniforms }: { uniforms: ShaderUniforms }) {
  const buffers = useMemo(() => {
    const COUNT = 5000;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const dirs = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.cos(phi);
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
      seeds[i] = Math.random();
      // Independent random direction (unit vector, NOT correlated to position)
      const du = Math.random();
      const dv = Math.random();
      const dtheta = 2 * Math.PI * du;
      const dphi = Math.acos(2 * dv - 1);
      dirs[i * 3] = Math.sin(dphi) * Math.cos(dtheta);
      dirs[i * 3 + 1] = Math.cos(dphi);
      dirs[i * 3 + 2] = Math.sin(dphi) * Math.sin(dtheta);
      phases[i] = Math.random() * 6.2831;
    }
    return { positions, seeds, dirs, phases };
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 1]} />
        <bufferAttribute attach="attributes-aDir" args={[buffers.dirs, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[buffers.phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={SHELL_VERT}
        fragmentShader={SHELL_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─────────────────────────────────────────────────────────────
// Orbital ring particles — 3 rings, ~250 dots each, at different
// axes. Replaces the torus meshes. Each ring is a <group> with
// a rotation prop; particles orbit along the local XY plane.
// ─────────────────────────────────────────────────────────────

const RING_VERT = /* glsl */ `
  attribute float aAngle;
  attribute float aSeed;
  uniform float uTime;
  uniform float uActivity;
  uniform float uSpeed;
  uniform float uRadius;
  varying float vGlow;

  void main() {
    float motion = 0.12 + 1.4 * uActivity;
    // Per-particle speed variance — orbits don't march in lockstep
    float speedVar = 0.55 + aSeed * 0.9;
    float angle = aAngle + uTime * uSpeed * motion * speedVar;
    // Per-particle radius wobble — varied amplitude/phase
    float r = uRadius + (0.012 + 0.045 * uActivity) * sin(uTime * (1.2 + aSeed * 1.4) + aSeed * 28.0);
    vec3 pos = vec3(cos(angle) * r, 0.0, sin(angle) * r);
    // Each particle drifts out of the plane independently
    pos.y = sin(uTime * (1.0 + aSeed * 1.2) + aSeed * 20.0) * (0.012 + uActivity * 0.10);
    // Add slight tangential jitter so orbits aren't perfectly circular
    pos.x += cos(uTime * (0.8 + aSeed * 0.6) + aSeed * 15.0) * (0.005 + uActivity * 0.04);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.9 + 0.6 * uActivity + aSeed * 0.4) * (32.0 / -mv.z);

    vGlow = 0.4 + 0.5 * sin(uTime * (1.4 + aSeed * 0.8) + aSeed * 35.0);
  }
`;

const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vGlow;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float fall = 1.0 - smoothstep(0.0, 0.5, d);
    fall = pow(fall, 2.5);
    float a = fall * (0.30 + 0.30 * vGlow);
    gl_FragColor = vec4(uColor * (0.95 + vGlow * 0.4), a);
  }
`;

type RingParams = {
  radius: number;
  speed: number;
  rotation: [number, number, number];
  count: number;
};

function RingParticles({
  baseUniforms,
  params,
}: {
  baseUniforms: ShaderUniforms;
  params: RingParams;
}) {
  const buffers = useMemo(() => {
    const angles = new Float32Array(params.count);
    const seeds = new Float32Array(params.count);
    const positions = new Float32Array(params.count * 3); // dummy, position computed in shader
    for (let i = 0; i < params.count; i++) {
      angles[i] = (i / params.count) * Math.PI * 2 + Math.random() * 0.05;
      seeds[i] = Math.random();
    }
    return { positions, angles, seeds };
  }, [params.count]);

  // Per-ring uniforms layered on top of base
  const uniforms = useMemo(
    () => ({
      ...baseUniforms,
      uSpeed: { value: params.speed },
      uRadius: { value: params.radius },
    }),
    [baseUniforms, params.speed, params.radius],
  );

  return (
    <group rotation={params.rotation}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
          <bufferAttribute attach="attributes-aAngle" args={[buffers.angles, 1]} />
          <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 1]} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={RING_VERT}
          fragmentShader={RING_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Drift + tendril particles — atmospheric dust + reaching motes
// ─────────────────────────────────────────────────────────────

const DRIFT_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aRadius;
  attribute vec3 aDir;
  uniform float uTime;
  uniform float uActivity;
  varying float vGlow;
  varying float vTendrilMix;

  void main() {
    // Per-particle speed variance so the cloud doesn't pulse together
    float personalSpeed = 0.5 + aSeed * 1.2;
    float motion = (0.10 + 1.0 * uActivity) * personalSpeed;
    float t = uTime * 0.28 * motion + aSeed * 30.0;
    float theta = t * (0.6 + aSeed * 0.5) + aSeed * 6.2831;
    float phi = aSeed * 3.14159 + sin(uTime * 0.15 * motion + aSeed * 5.0) * 0.5;
    vec3 idlePos = vec3(
      cos(theta) * sin(phi),
      cos(phi),
      sin(theta) * sin(phi)
    ) * aRadius;

    float tendrilMag = length(aDir);
    // Each tendril reaches with its own rhythm
    float reach = uActivity * tendrilMag * (1.0 + 0.5 * sin(uTime * (2.0 + aSeed * 1.5) + aSeed * 20.0));
    vec3 pos = idlePos + aDir * reach;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.6 + 0.8 * uActivity + tendrilMag * 0.3) * (32.0 / -mv.z);

    vGlow = 0.25 + 0.4 * sin(uTime * 1.5 * motion + aSeed * 40.0);
    vTendrilMix = tendrilMag;
  }
`;

const DRIFT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vGlow;
  varying float vTendrilMix;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float fall = 1.0 - smoothstep(0.0, 0.5, d);
    fall = pow(fall, 2.5);
    float a = fall * (0.10 + 0.18 * vGlow + 0.18 * vTendrilMix);
    gl_FragColor = vec4(uColor * (0.75 + vGlow * 0.4), a);
  }
`;

function DriftParticles({ uniforms }: { uniforms: ShaderUniforms }) {
  const buffers = useMemo(() => {
    const COUNT = 1200;
    const TENDRIL_RATIO = 0.2;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const radii = new Float32Array(COUNT);
    const dirs = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      seeds[i] = Math.random();
      radii[i] = 1.7 + Math.random() * 0.9;
      if (Math.random() < TENDRIL_RATIO) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const mag = 0.5 + Math.random() * 1.1;
        dirs[i * 3] = Math.sin(phi) * Math.cos(theta) * mag;
        dirs[i * 3 + 1] = Math.cos(phi) * mag;
        dirs[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * mag;
      }
    }
    return { positions, seeds, radii, dirs };
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 1]} />
        <bufferAttribute attach="attributes-aRadius" args={[buffers.radii, 1]} />
        <bufferAttribute attach="attributes-aDir" args={[buffers.dirs, 3]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={DRIFT_VERT}
        fragmentShader={DRIFT_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─────────────────────────────────────────────────────────────
// Composite — three uniform groups so each layer can have its
// own shader-specific extras while sharing time/activity/color.
// ─────────────────────────────────────────────────────────────

type ShaderUniforms = {
  uTime: { value: number };
  uActivity: { value: number };
  uColor: { value: THREE.Color };
};

export function NovaOrb({
  activeSpeaker,
}: {
  activeSpeaker: SpeakerKey | null;
}) {
  const sharedUniforms: ShaderUniforms = useMemo(
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

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const targetActivity = activeSpeaker ? 1 : 0;
    sharedUniforms.uTime.value = t;
    sharedUniforms.uActivity.value +=
      (targetActivity - sharedUniforms.uActivity.value) * 0.06;
    sharedUniforms.uColor.value.lerp(targetCol.current, 0.04);
    if (groupRef.current) {
      // Very slow, constant y rotation — no activity-driven tilting that
      // would make the whole sphere look like it's being shaken.
      groupRef.current.rotation.y += 0.0006;
    }
  });

  return (
    <group ref={groupRef}>
      <ShellParticles uniforms={sharedUniforms} />
      <RingParticles
        baseUniforms={sharedUniforms}
        params={{ radius: 1.3, speed: 0.35, rotation: [0, 0, 0], count: 380 }}
      />
      <RingParticles
        baseUniforms={sharedUniforms}
        params={{
          radius: 1.45,
          speed: 0.22,
          rotation: [Math.PI / 2.3, 0, 0.4],
          count: 380,
        }}
      />
      <RingParticles
        baseUniforms={sharedUniforms}
        params={{
          radius: 1.18,
          speed: 0.45,
          rotation: [0.3, Math.PI / 3, 0.8],
          count: 320,
        }}
      />
      <DriftParticles uniforms={sharedUniforms} />
    </group>
  );
}
