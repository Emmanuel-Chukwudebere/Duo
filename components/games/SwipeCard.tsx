"use client";

import { motion } from "framer-motion";

export type SwipeDir = "left" | "right" | "up";

/**
 * A game card. Drag/swipe is intentionally NOT used — on mobile it fought page
 * scrolling. Cards are dismissed via the A/B/Skip/Play buttons, and the parent
 * CardStack's AnimatePresence still animates the card out when it leaves the
 * deck, so it feels lively without capturing touch gestures.
 */
export function SwipeCard({
  children,
  className = "",
  style,
  showHints = true,
  leftHint = "Skip",
  rightHint = "Play",
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showHints?: boolean;
  leftHint?: string;
  rightHint?: string;
}) {
  return (
    <motion.div className={`absolute inset-0 select-none ${className}`} style={style}>
      <div className="relative h-full w-full rounded-3xl border border-white/10 bg-[#181B26] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        {showHints ? (
          <>
            <div className="pointer-events-none absolute top-5 left-5 z-20 rounded-xl border-2 border-emerald-400/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300/70 rotate-[-8deg]">
              {rightHint}
            </div>
            <div className="pointer-events-none absolute top-5 right-5 z-20 rounded-xl border-2 border-rose-400/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-300/70 rotate-[8deg]">
              {leftHint}
            </div>
          </>
        ) : null}
        {children}
      </div>
    </motion.div>
  );
}
