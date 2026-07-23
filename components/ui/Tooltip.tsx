"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Desktop hover / focus tooltip. Hidden on coarse pointers (touch).
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

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: side === "top" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === "top" ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            className={`pointer-events-none absolute left-1/2 z-[100] hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#12141D] px-2.5 py-1 text-[11px] font-medium text-[#F3F4F6] shadow-lg md:block ${
              side === "top" ? "bottom-full mb-2" : "top-full mt-2"
            }`}
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
      </AnimatePresence>
    </span>
  );
}
