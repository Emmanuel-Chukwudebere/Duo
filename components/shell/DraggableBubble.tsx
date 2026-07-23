"use client";

import { motion } from "framer-motion";

/**
 * Drag video bubbles anywhere inside the stage (mouse + touch).
 */
export function DraggableBubble({
  children,
  className = "",
  style,
  dragConstraintsRef,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dragConstraintsRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <motion.div
      drag
      dragConstraints={dragConstraintsRef}
      dragMomentum={false}
      dragElastic={0.08}
      whileDrag={{ scale: 1.05, zIndex: 60, cursor: "grabbing" }}
      className={`absolute z-30 touch-none cursor-grab active:cursor-grabbing select-none ${className}`}
      style={style}
    >
      {children}
    </motion.div>
  );
}
