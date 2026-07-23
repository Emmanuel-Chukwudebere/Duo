"use client";

import { useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";

const SWIPE_THRESHOLD = 110;
const VELOCITY_THRESHOLD = 550;

export type SwipeDir = "left" | "right" | "up";

export function SwipeCard({
  children,
  onSwipe,
  disabled,
  className = "",
  style,
  showHints = true,
  leftHint = "Skip",
  rightHint = "Play",
  drag = true,
}: {
  children: React.ReactNode;
  onSwipe: (dir: SwipeDir) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  showHints?: boolean;
  leftHint?: string;
  rightHint?: string;
  /** false freezes the top card while dealing, etc. */
  drag?: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14]);
  const leftOpacity = useTransform(x, [-160, -40, 0], [1, 0.4, 0]);
  const rightOpacity = useTransform(x, [0, 40, 160], [0, 0.4, 1]);
  const [exit, setExit] = useState<{ x: number; y: number } | null>(null);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (disabled) return;
    const ox = info.offset.x;
    const oy = info.offset.y;
    const vx = info.velocity.x;
    const vy = info.velocity.y;

    // Prefer horizontal for left/right; strong upward flick = up
    if (oy < -SWIPE_THRESHOLD || vy < -VELOCITY_THRESHOLD) {
      setExit({ x: ox, y: -520 });
      onSwipe("up");
      return;
    }
    if (ox > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) {
      setExit({ x: 520, y: oy });
      onSwipe("right");
      return;
    }
    if (ox < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) {
      setExit({ x: -520, y: oy });
      onSwipe("left");
      return;
    }
  }

  return (
    <motion.div
      className={`absolute inset-0 touch-none select-none ${className}`}
      style={{ x, y, rotate, ...style }}
      drag={drag && !disabled && !exit ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.92}
      onDragEnd={handleDragEnd}
      animate={
        exit
          ? { x: exit.x, y: exit.y, opacity: 0, transition: { duration: 0.28 } }
          : { x: 0, y: 0, opacity: 1 }
      }
      whileTap={drag && !disabled ? { cursor: "grabbing" } : undefined}
    >
      <div className="relative h-full w-full rounded-3xl border border-white/10 bg-[#181B26] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        {showHints ? (
          <>
            <motion.div
              style={{ opacity: rightOpacity }}
              className="pointer-events-none absolute top-5 left-5 z-20 rounded-xl border-2 border-emerald-400/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300 rotate-[-8deg]"
            >
              {rightHint}
            </motion.div>
            <motion.div
              style={{ opacity: leftOpacity }}
              className="pointer-events-none absolute top-5 right-5 z-20 rounded-xl border-2 border-rose-400/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-300 rotate-[8deg]"
            >
              {leftHint}
            </motion.div>
          </>
        ) : null}
        {children}
      </div>
    </motion.div>
  );
}
