"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

useGLTF.preload("/models/nova.glb");

type Props = {
  activeSpeaker: string | null;
  position?: [number, number, number];
  scale?: number;
};

export function Avatar({ activeSpeaker, position = [0, -1.1, 0], scale = 1 }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/nova.glb");
  const { actions } = useAnimations(animations, groupRef);

  const baseMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x004477,
      emissive: 0x00ddff,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      metalness: 0.1,
      roughness: 0.6,
    });
  }, []);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = baseMaterial;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
  }, [scene, baseMaterial]);

  useEffect(() => {
    const idle = actions["Idle"];
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.5).play();
    }
    return () => {
      idle?.fadeOut(0.3);
    };
  }, [actions]);

  useEffect(() => {
    if (activeSpeaker === "jarvis") {
      const gesture = actions["Wave"] ?? actions["Yes"] ?? actions["ThumbsUp"];
      if (gesture) {
        gesture.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.2).play();
        gesture.clampWhenFinished = true;
      }
    }
  }, [activeSpeaker, actions]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const targetGlow = activeSpeaker === "jarvis" ? 2.6 : 1.4;
    const pulse = activeSpeaker === "jarvis" ? 0.4 * Math.sin(t * 4) : 0;
    baseMaterial.emissiveIntensity +=
      (targetGlow + pulse - baseMaterial.emissiveIntensity) * 0.08;

    if (groupRef.current) {
      groupRef.current.rotation.y =
        Math.sin(t * 0.2) * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}
