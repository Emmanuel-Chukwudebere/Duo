"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Link2, Sparkles } from "lucide-react";
import { generateRoomCode, isValidRoomCode } from "@/lib/room/code";
import { TwoToneIcon } from "@/components/ui/TwoToneIcon";
import { DuoLogo } from "@/components/ui/DuoLogo";

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
            className="flex items-center justify-center"
          >
            <DuoLogo height={52} priority />
          </motion.div>
          <div>
            <h1 className="sr-only">Duo</h1>
            <p className="text-[#9CA3AF] text-xs sm:text-sm">
              Date nights, anywhere · private rooms for two
            </p>
          </div>
        </div>

        <p className="text-[#9CA3AF] text-sm sm:text-base leading-relaxed">
          One link. Two people. Video, YouTube co-watch, dinner prompts, word
          games, and audio that ducks when you talk.
        </p>

        {/* Path 1 — start a new room */}
        <div className="space-y-1.5">
          <motion.button
            type="button"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            disabled={busy}
            onClick={startDate}
            className="w-full py-3.5 sm:py-4 min-h-[48px] rounded-full bg-[#FF5A79] text-white font-semibold text-base sm:text-lg border border-[#FF5A79]/50 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-[18px] h-[18px] text-white/90" strokeWidth={1.75} />
            <span>Create a room</span>
          </motion.button>
          <p className="text-[11px] text-[#9CA3AF]/80">
            We&apos;ll make a private link — share it with your partner to invite them.
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] uppercase tracking-widest text-[#9CA3AF]/70">
            or
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        {/* Path 2 — join with a code your partner sent */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="glass rounded-3xl p-4 sm:p-5 space-y-3 text-left border border-white/10"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">
            <TwoToneIcon icon={Link2} tone="muted" size={14} />
            Got a code from your partner?
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="Enter room code (e.g. 7k9p)"
              aria-label="Room code"
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
          <p className="text-[11px] text-[#9CA3AF]/70">
            Or just open the link they sent you — no code needed.
          </p>
          {error ? <p className="text-xs text-[#FF5A79]">{error}</p> : null}
        </motion.div>

        <p className="text-[11px] text-[#9CA3AF]/80">
          No accounts · Ephemeral · justduo.vercel.app
        </p>
      </motion.div>
    </main>
  );
}
