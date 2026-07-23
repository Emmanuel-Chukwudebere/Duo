"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { HeartHandshake, Link2, Sparkles } from "lucide-react";
import { generateRoomCode, isValidRoomCode } from "@/lib/room/code";
import { TwoToneIcon } from "@/components/ui/TwoToneIcon";

export default function LandingPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function startDate() {
    setBusy(true);
    const code = generateRoomCode(5);
    router.push(`/room/${code}`);
  }

  function join() {
    const code = joinCode.trim().toLowerCase();
    if (!isValidRoomCode(code)) {
      setError("Enter a valid room code (4–8 letters/numbers).");
      return;
    }
    setError("");
    setBusy(true);
    router.push(`/room/${code}`);
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 sm:px-6 py-10 relative overflow-hidden pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-md w-full text-center space-y-7"
      >
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, type: "spring", stiffness: 320, damping: 22 }}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#FF5A79]/12 border border-[#FF5A79]/30 flex items-center justify-center"
          >
            <TwoToneIcon icon={HeartHandshake} tone="rose" size={28} />
          </motion.div>
          <div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tighter text-[#F3F4F6]">
              Duo
            </h1>
            <p className="mt-2 text-[#9CA3AF] text-xs sm:text-sm">
              Midnight Lounge · private date rooms
            </p>
          </div>
        </div>

        <p className="text-[#9CA3AF] text-sm sm:text-base leading-relaxed">
          One link. Two people. Video, YouTube co-watch, dinner prompts, word
          games, and audio that ducks when you talk.
        </p>

        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          disabled={busy}
          onClick={startDate}
          className="w-full py-3.5 sm:py-4 min-h-[48px] rounded-full bg-[#FF5A79] text-white font-semibold text-base sm:text-lg border border-[#FF5A79]/50 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Sparkles className="w-[18px] h-[18px] text-white/90" strokeWidth={1.75} />
          <span>Start Date</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="glass rounded-3xl p-4 sm:p-5 space-y-3 text-left border border-white/10"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">
            <TwoToneIcon icon={Link2} tone="muted" size={14} />
            Have a code?
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="e.g. 7k9p"
              className="flex-1 bg-[#0A0B10] border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono outline-none focus:border-[#FF5A79]/40 min-h-[48px] transition-colors"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={join}
              disabled={busy}
              className="px-5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-sm font-medium min-h-[48px] sm:min-w-[5.5rem] transition-colors"
            >
              Join
            </motion.button>
          </div>
          {error ? <p className="text-xs text-[#FF5A79]">{error}</p> : null}
        </motion.div>

        <p className="text-[11px] text-[#9CA3AF]/80">
          No accounts · Ephemeral · justduo.vercel.app
        </p>
      </motion.div>
    </main>
  );
}
