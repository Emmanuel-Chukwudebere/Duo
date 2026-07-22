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
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#FF5A79]/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#8A5CF5]/10 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg w-full text-center space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FF5A79] to-[#8A5CF5] flex items-center justify-center shadow-lg shadow-[#FF5A79]/20">
            <span className="text-white text-3xl font-bold tracking-tighter">
              D
            </span>
          </div>
          <div>
            <h1 className="text-5xl font-semibold tracking-tighter text-[#F3F4F6]">
              Duo
            </h1>
            <p className="mt-2 text-[#9CA3AF] text-sm">
              Midnight Lounge · long-distance dates, zero friction
            </p>
          </div>
        </div>

        <p className="text-[#9CA3AF] text-base leading-relaxed">
          One link. Two people. Video, YouTube co-watch, dinner prompts, word
          games, and smart audio that ducks when you talk.
        </p>

        <button
          type="button"
          onClick={startDate}
          className="w-full py-4 rounded-full bg-[#FF5A79] text-white font-semibold text-lg shadow-xl shadow-[#FF5A79]/25 hover:brightness-110 active:scale-[0.98] transition"
        >
          Start Date
        </button>

        <div className="glass rounded-3xl p-5 space-y-3 text-left">
          <div className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">
            Have a code?
          </div>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="e.g. 7k9p"
              className="flex-1 bg-[#0A0B10] border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono outline-none focus:border-[#FF5A79]/50"
            />
            <button
              type="button"
              onClick={join}
              className="px-5 rounded-2xl bg-white/10 hover:bg-white/15 text-sm font-medium transition"
            >
              Join
            </button>
          </div>
          {error ? (
            <p className="text-xs text-[#FF5A79]">{error}</p>
          ) : null}
        </div>

        <p className="text-[11px] text-[#9CA3AF]/80">
          No accounts · Ephemeral rooms · Chrome recommended for screen audio
        </p>
      </div>
    </main>
  );
}
