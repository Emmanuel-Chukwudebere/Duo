"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SwipeCard, type SwipeDir } from "./SwipeCard";

export interface StackItem {
  id: string;
  node: React.ReactNode;
  leftHint?: string;
  rightHint?: string;
  showHints?: boolean;
}

/**
 * Tinder-style stack. Top card (items[0]) is swipeable (touch + mouse).
 * Cards underneath scale/offset for depth.
 */
export function CardStack({
  items,
  onSwipeTop,
  disabled,
  className = "",
}: {
  items: StackItem[];
  onSwipeTop: (dir: SwipeDir, item: StackItem) => void;
  disabled?: boolean;
  className?: string;
}) {
  const visible = items.slice(0, 4);
  // Paint back → front so the top card sits above
  const ordered = [...visible].reverse();

  return (
    <div
      className={`relative w-full max-w-[380px] mx-auto sm:max-w-[400px] ${className}`}
      style={{ minHeight: 420, aspectRatio: "3 / 4" }}
    >
      <AnimatePresence initial={false}>
        {ordered.map((item) => {
          const depth = visible.findIndex((v) => v.id === item.id);
          const isTop = depth === 0;
          return (
            <motion.div
              key={item.id}
              className="absolute inset-0"
              style={{ zIndex: 10 + (visible.length - depth) }}
              initial={{ scale: 0.92, opacity: 0, y: 24 }}
              animate={{
                scale: 1 - depth * 0.045,
                y: depth * 14,
                opacity: Math.max(0.55, 1 - depth * 0.12),
              }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              {isTop ? (
                <SwipeCard
                  disabled={disabled}
                  leftHint={item.leftHint}
                  rightHint={item.rightHint}
                  showHints={item.showHints !== false}
                  onSwipe={(dir) => onSwipeTop(dir, item)}
                >
                  {item.node}
                </SwipeCard>
              ) : (
                <div className="absolute inset-0 rounded-3xl border border-white/10 bg-[#181B26] overflow-hidden pointer-events-none shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
                  {item.node}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
