"use client";

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
      window.setTimeout(() => setMsg(null), 2400);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (!msg) return null;
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 rounded-2xl glass text-sm font-medium shadow-xl">
      {msg}
    </div>
  );
}
