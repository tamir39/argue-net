"use client";

import type { ReactNode } from "react";

/**
 * Ripple — concentric expanding rings emanating from the orb centre
 * (viewport centre). Rendered only when `active` is true. Pure CSS,
 * no extra GPU cost.
 */
export function Ripple({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[5] flex items-center justify-center">
      {[0, 0.7, 1.4, 2.1].map((delay) => (
        <div
          key={delay}
          className="absolute left-1/2 top-1/2 w-[360px] h-[360px] rounded-full border border-cyan-300/40"
          style={{
            animation: `ripple-pulse 2.8s cubic-bezier(0.165, 0.84, 0.44, 1) ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * BgGrid — faint radial-dot grid covering the viewport behind the HUD
 * chrome but in front of the 3D canvas. Adds the "instrument panel"
 * texture without competing with the orb.
 */
export function BgGrid() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[2] bg-tech-grid opacity-60" />
  );
}

/**
 * ScanLine — a thin horizontal sweep line that traverses the viewport
 * vertically every ~6s. Optional decorative element.
 */
export function ScanLine({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent z-[4]"
      style={{
        top: 0,
        animation: "scan-sweep 6s linear infinite",
      }}
    />
  );
}

/**
 * HudFrame — wraps children with 4 corner brackets that pulse when
 * `active` is true. Use on the chat card, mic-error banner, etc.
 */
export function HudFrame({
  active,
  children,
  className = "",
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className={`hud-corner tl${active ? " active" : ""}`} />
      <span className={`hud-corner tr${active ? " active" : ""}`} />
      <span className={`hud-corner bl${active ? " active" : ""}`} />
      <span className={`hud-corner br${active ? " active" : ""}`} />
      {children}
    </div>
  );
}
