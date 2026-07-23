"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Desktop hover / focus tooltip. Hidden on coarse pointers (touch).
 *
 * Rendered in a portal at the document body and positioned with fixed
 * coordinates measured from the trigger. This is what keeps it from being
 * clipped behind the dock's `overflow-x-auto`, the stage's `overflow-hidden`,
 * or any ancestor stacking context — the previous absolute version was trapped
 * inside those and hid behind neighbouring elements.
 */
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      x: r.left + r.width / 2,
      y: side === "top" ? r.top : r.bottom,
    });
  };

  const show = () => {
    place();
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {mounted && coords
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.span
                  role="tooltip"
                  initial={{ opacity: 0, y: side === "top" ? 4 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: side === "top" ? 4 : -4 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: "fixed",
                    left: coords.x,
                    top: coords.y,
                    transform: `translate(-50%, ${
                      side === "top" ? "calc(-100% - 8px)" : "8px"
                    })`,
                  }}
                  className="pointer-events-none z-[9999] hidden whitespace-nowrap rounded-lg border border-white/10 bg-[#12141D] px-2.5 py-1 text-[11px] font-medium text-[#F3F4F6] shadow-lg md:block"
                >
                  {label}
                  <span
                    className={`absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 border-white/10 bg-[#12141D] ${
                      side === "top"
                        ? "top-full -mt-1 border-b border-r"
                        : "bottom-full -mb-1 border-l border-t"
                    }`}
                  />
                </motion.span>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </span>
  );
}
