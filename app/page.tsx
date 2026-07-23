"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateRoomCode, isValidRoomCode } from "@/lib/room/code";

export default function LandingPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  function startDate() {
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
    router.push(`/room/${code}`);
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 sm:px-6 py-10 relative overflow-hidden pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-1/4 left-1/4 w-56 sm:w-72 h-56 sm:h-72 rounded-full bg-[#FF5A79]/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 sm:w-80 h-64 sm:h-80 rounded-full bg-[#8A5CF5]/10 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg w-full text-center space-y-6 sm:space-y-8">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-gradient-to-br from-[#FF5A79] to-[#8A5CF5] flex items-center justify-center shadow-lg shadow-[#FF5A79]/20">
            <span className="text-white text-2xl sm:text-3xl font-bold tracking-tighter">
              D
            </span>
          </div>
          <div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tighter text-[#F3F4F6]">
              Duo
            </h1>
            <p className="mt-2 text-[#9CA3AF] text-xs sm:text-sm px-2">
              Midnight Lounge · long-distance dates, zero friction
            </p>
          </div>
        </div>

        <p className="text-[#9CA3AF] text-sm sm:text-base leading-relaxed px-1">
          One link. Two people. Video, YouTube co-watch, dinner prompts, word
          games, and smart audio that ducks when you talk.
        </p>

        <button
          type="button"
          onClick={startDate}
          className="w-full py-3.5 sm:py-4 min-h-[48px] rounded-full bg-[#FF5A79] text-white font-semibold text-base sm:text-lg shadow-xl shadow-[#FF5A79]/25 hover:brightness-110 active:scale-[0.98] transition"
        >
          Start Date
        </button>

        <div className="glass rounded-3xl p-4 sm:p-5 space-y-3 text-left">
          <div className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">
            Have a code?
          </div>
          <div className="flex flex-col xs:flex-row gap-2 sm:flex-row">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="e.g. 7k9p"
              className="flex-1 bg-[#0A0B10] border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono outline-none focus:border-[#FF5A79]/50 min-h-[48px]"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={join}
              className="px-5 rounded-2xl bg-white/10 hover:bg-white/15 text-sm font-medium transition min-h-[48px] sm:min-w-[5.5rem]"
            >
              Join
            </button>
          </div>
          {error ? (
            <p className="text-xs text-[#FF5A79]">{error}</p>
          ) : null}
        </div>

        <p className="text-[11px] text-[#9CA3AF]/80 px-2">
          No accounts · Ephemeral rooms · Chrome desktop best for screen share
        </p>
      </div>
    </main>
  );
}
