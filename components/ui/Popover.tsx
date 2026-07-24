"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

/**
 * A small popover anchored to a trigger. The menu is rendered in a BODY PORTAL
 * with fixed positioning measured from the trigger, so it can't be clipped by
 * the dock's `overflow-x-auto` (an in-flow absolute menu was invisible on
 * mobile — the reported "clicking More does nothing"). Opens above the trigger
 * and dismisses on outside-click or Escape.
 */
export function Popover({
  trigger,
  children,
  align = "center",
  label,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "center" | "right";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Final, viewport-clamped top-left of the menu (px, fixed positioning).
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const place = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const t = trigger.getBoundingClientRect();
    const MARGIN = 8;
    const vw = window.innerWidth;
    // Menu dimensions (fall back to a sensible default before first paint).
    const mw = menu?.offsetWidth || 208;
    const mh = menu?.offsetHeight || 200;

    // Preferred horizontal anchor, then clamp so it never leaves the viewport.
    let left =
      align === "right"
        ? t.right - mw // right edge aligned to trigger's right
        : t.left + t.width / 2 - mw / 2; // centered on trigger
    left = Math.min(Math.max(MARGIN, left), vw - mw - MARGIN);

    // Open above the trigger; if not enough room, open below.
    const above = t.top - mh - MARGIN;
    const top = above >= MARGIN ? above : t.bottom + MARGIN;

    setPos({ left, top });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Re-measure once the menu has painted (real width/height known).
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="inline-flex shrink-0"
      >
        {trigger(open)}
      </button>
      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={menuRef}
                  role="menu"
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  style={{
                    position: "fixed",
                    left: pos?.left ?? -9999,
                    top: pos?.top ?? -9999,
                    visibility: pos ? "visible" : "hidden",
                  }}
                  className="z-[9999] min-w-[13rem] max-w-[calc(100vw-1rem)] rounded-2xl border border-white/12 bg-[#181B26] p-1.5 shadow-2xl ring-1 ring-black/40"
                >
                  {children(() => setOpen(false))}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

/** A single row inside a Popover menu. */
export function PopoverItem({
  icon,
  label,
  hint,
  onClick,
  active,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.06] ${
        active ? "text-white" : "text-[#D1D5DB]"
      }`}
    >
      {icon ? <span className="shrink-0 text-[#9CA3AF]">{icon}</span> : null}
      <span className="flex-1 font-medium">{label}</span>
      {hint ? <span className="text-[11px] text-[#9CA3AF]">{hint}</span> : null}
    </button>
  );
}
