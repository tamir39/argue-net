"use client";

import { Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense } from "react";
import * as THREE from "three";

import { NovaOrb } from "./NovaOrb";

type SpeakerKey = "jarvis" | "pro" | "con" | "mediator";

export function NovaScene({ activeSpeaker }: { activeSpeaker: SpeakerKey | null }) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 4.2], fov: 38 }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      dpr={[1, 1.75]}
      shadows={false}
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
    >
      <color attach="background" args={["#03060c"]} />
      <fog attach="fog" args={["#03060c", 6, 14]} />

      <ambientLight intensity={0.15} />
      <pointLight position={[-2, 1, 2]} intensity={0.3} color="#26b8ff" />

      <Suspense fallback={null}>
        <Stars
          radius={50}
          depth={40}
          count={2800}
          factor={3}
          fade
          speed={0.35}
        />
        <NovaOrb activeSpeaker={activeSpeaker} />
      </Suspense>

      <EffectComposer>
        <Bloom
          intensity={0.5}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.4}
          mipmapBlur
          radius={0.6}
        />
      </EffectComposer>
    </Canvas>
  );
}
