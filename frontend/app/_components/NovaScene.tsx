"use client";

import { ContactShadows, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense } from "react";
import * as THREE from "three";

import { Avatar } from "./Avatar";

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

      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 3]} intensity={0.6} color="#9ad7ff" />
      <pointLight position={[-2, 1, 2]} intensity={0.8} color="#26b8ff" />
      <pointLight position={[2, -1, -2]} intensity={0.4} color="#0a3d6b" />

      <Suspense fallback={null}>
        <Stars
          radius={40}
          depth={30}
          count={2200}
          factor={3}
          fade
          speed={0.4}
        />
        <Avatar activeSpeaker={activeSpeaker} />
        <ContactShadows
          position={[0, -1.1, 0]}
          opacity={0.45}
          blur={3}
          far={3}
          resolution={512}
          color="#001a30"
        />
      </Suspense>

      <EffectComposer>
        <Bloom
          intensity={0.9}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
