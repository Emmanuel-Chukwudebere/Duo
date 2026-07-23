"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

let pushToast: ((msg: string) => void) | null = null;

export function toast(message: string) {
  pushToast?.(message);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    pushToast = (m) => {
      setMsg(m);
      window.setTimeout(() => setMsg(null), 2600);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return (
    <AnimatePresence>
      {msg ? (
        <motion.div
          key={msg}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 rounded-2xl glass text-sm font-medium border border-white/10 max-w-[min(90vw,24rem)] text-center"
        >
          {msg}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
