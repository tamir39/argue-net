"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

type SpeakerKey = "jarvis" | "pro" | "con" | "mediator";

const SPEAKERS: { key: SpeakerKey; label: string; color: [number, number, number] }[] = [
  { key: "jarvis", label: "Nova", color: [0.27, 0.78, 0.97] },
  { key: "pro", label: "Sol", color: [0.34, 0.84, 0.55] },
  { key: "con", label: "Umbra", color: [0.97, 0.42, 0.55] },
  { key: "mediator", label: "Polaris", color: [0.98, 0.78, 0.3] },
];

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uActivity;

  // Hash + value-noise-like wiggle (cheap, smooth enough)
  float wiggle(vec3 p) {
    return sin(p.x * 4.0 + uTime * 1.8)
         * cos(p.y * 3.5 - uTime * 1.2)
         * sin(p.z * 4.0 + uTime * 1.5);
  }

  void main() {
    float amp = 0.05 + 0.18 * uActivity;
    vec3 displaced = position + normal * wiggle(position * 1.3) * amp;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uActivity;
  uniform vec3 uCameraPos;

  void main() {
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float fresnel = pow(1.0 - clamp(dot(vNormal, viewDir), 0.0, 1.0), 2.2);

    float pulse = 0.5 + 0.5 * sin(uTime * 2.5);
    float emissive = 0.25 + 0.55 * uActivity + 0.25 * pulse * uActivity;

    vec3 col = uColor * (0.20 + fresnel * 1.4 + emissive);
    float alpha = 0.55 + fresnel * 0.45 + 0.30 * uActivity;
    gl_FragColor = vec4(col, alpha);
  }
`;

function Orb({
  position,
  color,
  activity,
}: {
  position: [number, number, number];
  color: [number, number, number];
  activity: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0 },
      uColor: { value: new THREE.Color(...color) },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    [color],
  );

  useFrame((state) => {
    if (matRef.current) {
      uniforms.uTime.value = state.clock.elapsedTime;
      // Smooth lerp activity → target
      const cur = uniforms.uActivity.value;
      uniforms.uActivity.value = cur + (activity - cur) * 0.08;
      uniforms.uCameraPos.value.copy(state.camera.position);
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.0025;
      meshRef.current.rotation.x += 0.0008;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <icosahedronGeometry args={[1, 24]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

export function OrbCanvas({ activeSpeaker }: { activeSpeaker: SpeakerKey | null }) {
  return (
    <div className="relative">
      <div className="h-32 sm:h-40">
        <Canvas
          camera={{ position: [0, 0, 5], fov: 40 }}
          gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
          dpr={[1, 2]}
        >
          <ambientLight intensity={0.4} />
          {SPEAKERS.map((s, i) => (
            <Orb
              key={s.key}
              position={[(i - 1.5) * 1.6, 0, 0]}
              color={s.color}
              activity={activeSpeaker === s.key ? 1 : 0}
            />
          ))}
        </Canvas>
      </div>
      <div className="flex justify-around -mt-2 px-4 text-[10px] uppercase tracking-widest pointer-events-none select-none">
        {SPEAKERS.map((s) => (
          <span
            key={s.key}
            className={`transition-opacity ${
              activeSpeaker === s.key ? "opacity-100" : "opacity-50"
            }`}
            style={{ color: `rgb(${s.color.map((c) => Math.round(c * 255)).join(",")})` }}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
