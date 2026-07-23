"use client";

import { useEffect, useState } from "react";
import { useDuoRoom } from "@/hooks/useDuoRoom";
import type { DuoAppMessage, StageMode } from "@/lib/types";
import { DinnerStage } from "@/components/dinner/DinnerStage";
import { GamesStage } from "@/components/games/GamesStage";
import { CinemaStage } from "@/components/cinema/CinemaStage";
import { ToastHost, toast } from "@/components/shell/Toast";

const MODES: { id: StageMode; label: string; short: string }[] = [
  { id: "dinner", label: "Dinner", short: "Dinner" },
  { id: "games", label: "Games", short: "Games" },
  { id: "cinema", label: "Cinema", short: "Film" },
];

export function RoomShell({ code }: { code: string }) {
  const room = useDuoRoom(code);
  const { state } = room;
  const [sessionStart] = useState(() => Date.now());
  const [timer, setTimer] = useState("0:00");
  const [reactions, setReactions] = useState<
    { id: number; emoji: string; left: number }[]
  >([]);
  const [remoteYtCommand, setRemoteYtCommand] = useState<{
    id: number;
    kind: "play" | "pause" | "seek" | "load";
    seconds?: number;
    videoId?: string;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      setTimer(`${m}:${s.toString().padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(id);
  }, [sessionStart]);

  useEffect(() => {
    if (!state.lastReaction) return;
    const id = state.lastReaction.id;
    setReactions((r) => [
      ...r,
      {
        id,
        emoji: state.lastReaction!.emoji,
        left: 20 + Math.random() * 60,
      },
    ]);
    const t = setTimeout(() => {
      setReactions((r) => r.filter((x) => x.id !== id));
    }, 1900);
    return () => clearTimeout(t);
  }, [state.lastReaction]);

  useEffect(() => {
    return room.onAppMessage((msg) => {
      if (!room.isYtController) {
        if (msg.type === "yt.play")
          setRemoteYtCommand({ id: Date.now(), kind: "play" });
        if (msg.type === "yt.pause")
          setRemoteYtCommand({ id: Date.now(), kind: "pause" });
        if (msg.type === "yt.seek")
          setRemoteYtCommand({
            id: Date.now(),
            kind: "seek",
            seconds: msg.seconds,
          });
        if (msg.type === "yt.time")
          setRemoteYtCommand({
            id: Date.now(),
            kind: "seek",
            seconds: msg.seconds,
          });
        if (msg.type === "yt.load")
          setRemoteYtCommand({
            id: Date.now(),
            kind: "load",
            videoId: msg.videoId,
          });
      }
    });
  }, [room]);

  async function copyLink() {
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const link = `${base}/room/${code}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        toast("Link copied — share with your date ❤️");
      } else {
        toast(link);
      }
    } catch {
      toast(link);
    }
  }

  function onYtEvent(msg: DuoAppMessage) {
    if (!room.isYtController) return;
    room.sendYt(msg);
  }

  return (
    <div className="min-h-dvh flex flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[calc(4.5rem+env(safe-area-inset-top))] sm:pt-20 sm:pb-28 px-3 sm:px-6 md:px-8 max-w-[1280px] mx-auto">
      <ToastHost />

      {/* Top nav — stacks / scrolls on small screens */}
      <div className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 w-[min(100%-0.75rem,960px)]">
        <div className="glass rounded-2xl sm:rounded-full shadow-2xl flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 px-2 py-2 sm:justify-between">
          <div className="flex items-center justify-between gap-2 sm:contents">
            <div className="flex items-center gap-2 pl-2 sm:pl-3 pr-1">
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-[#FF5A79] to-[#8A5CF5] flex items-center justify-center text-white font-bold text-sm shrink-0">
                D
              </div>
              <span className="font-semibold tracking-tight text-sm sm:text-base">
                Duo
              </span>
            </div>

            <div className="flex items-center gap-1.5 pr-1 sm:order-last sm:pr-2">
              <div className="px-2 sm:px-3 py-1 bg-[#0A0B10] rounded-full flex items-center gap-1.5 text-[10px] sm:text-xs">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    state.partnerPresent
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-white/20"
                  }`}
                />
                <span className="font-mono text-[#9CA3AF]">{code}</span>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-sm rounded-full hover:bg-white/10 text-[#FF5A79] font-medium min-h-[36px]"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center bg-[#0A0B10] rounded-full p-1 w-full sm:w-auto">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => room.setMode(m.id)}
                className={`mode-tab flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-full min-h-[40px] ${
                  state.mode === m.id
                    ? "active"
                    : "hover:bg-white/5 text-[#9CA3AF]"
                }`}
              >
                <span className="sm:hidden">{m.short}</span>
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3 px-0.5">
        <div className="min-w-0">
          <div className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tighter truncate">
            {state.mode === "dinner"
              ? "Dinner & Vibe"
              : state.mode === "games"
                ? "Playful Games"
                : "Cinema Stage"}
          </div>
          <div className="text-[#9CA3AF] text-xs sm:text-sm line-clamp-2">
            {state.status}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs shrink-0">
          <div className="px-2 sm:px-3 py-1 rounded-full glass max-w-[7rem] sm:max-w-none truncate">
            You
            {state.partnerPresent ? ` + ${state.partnerName}` : ""}
          </div>
          <div className="px-2 sm:px-3 py-1 rounded-full glass text-[#9CA3AF] tabular-nums">
            {timer}
          </div>
        </div>
      </div>

      {/* Stage */}
      <div
        id="stage-area"
        className="stage-surface relative flex-1 min-h-[min(58dvh,520px)] sm:min-h-[420px] rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10"
      >
        {state.mode === "dinner" ? (
          <DinnerStage
            sendApp={room.sendApp}
            onAppMessage={room.onAppMessage}
            isYtController={room.isYtController}
            ytVideoId={state.ytVideoId}
            ytTitle={state.ytTitle}
            duckLevel={room.duckLevel}
            onLoadYoutube={room.loadYoutube}
            remoteYtCommand={remoteYtCommand}
            onYtEvent={onYtEvent}
          />
        ) : null}
        {state.mode === "games" ? (
          <GamesStage
            sendApp={room.sendApp}
            onAppMessage={room.onAppMessage}
          />
        ) : null}
        {state.mode === "cinema" ? (
          <CinemaStage
            cinemaSource={state.cinemaSource}
            setCinemaSource={room.setCinemaSource}
            isYtController={room.isYtController}
            ytVideoId={state.ytVideoId}
            ytTitle={state.ytTitle}
            duckLevel={room.duckLevel}
            onLoadYoutube={room.loadYoutube}
            remoteYtCommand={remoteYtCommand}
            onYtEvent={onYtEvent}
            takeYtControl={room.takeYtControl}
            screenVideoRef={room.screenVideoRef}
            sharing={state.sharing}
            remoteSharing={state.remoteSharing}
            startScreenShare={room.startScreenShare}
            stopScreenShare={room.stopScreenShare}
          />
        ) : null}

        {/* Video bubbles — smaller on mobile, stacked bottom-right */}
        <div
          className={`video-bubble absolute z-40 bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 sm:bottom-6 sm:right-6 w-[72px] h-[72px] sm:w-[120px] sm:h-[120px] md:w-[138px] md:h-[138px] bg-slate-800 ${
            state.localSpeaking ? "speaking" : ""
          }`}
          style={{ opacity: state.camOn ? 1 : 0.4 }}
        >
          <video
            ref={room.localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-1 sm:bottom-2 inset-x-0 text-center text-[8px] sm:text-[10px] tracking-widest text-white/70">
            YOU
          </div>
        </div>
        <div
          className={`video-bubble absolute z-40 bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[5.5rem] sm:bottom-6 sm:right-[148px] md:right-[170px] w-[72px] h-[72px] sm:w-[120px] sm:h-[120px] md:w-[138px] md:h-[138px] bg-violet-950 ${
            state.remoteSpeaking ? "speaking" : ""
          }`}
        >
          <video
            ref={room.remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-1 sm:bottom-2 inset-x-0 text-center text-[8px] sm:text-[10px] tracking-widest text-white/70">
            {state.partnerPresent ? "PARTNER" : "…"}
          </div>
        </div>

        {reactions.map((r) => (
          <div
            key={r.id}
            className="reaction-float"
            style={{ left: `${r.left}%`, bottom: 100 }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Dock — horizontal scroll on narrow screens */}
      <div className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 w-[min(100%-0.75rem,640px)]">
        <div className="glass px-1.5 sm:px-2 py-1.5 sm:py-2 rounded-2xl sm:rounded-3xl flex items-center gap-0.5 sm:gap-1 shadow-2xl border border-white/10 overflow-x-auto no-scrollbar justify-start sm:justify-center">
          <button
            type="button"
            onClick={room.toggleMic}
            className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-2xl hover:bg-white/10 flex items-center justify-center text-base sm:text-lg ${
              state.micOn ? "text-[#FF5A79]" : "text-red-400"
            }`}
            title="Microphone"
          >
            {state.micOn ? "🎙" : "🔇"}
          </button>
          <button
            type="button"
            onClick={room.toggleCam}
            className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-2xl hover:bg-white/10 flex items-center justify-center text-base sm:text-lg ${
              state.camOn ? "" : "text-red-400"
            }`}
            title="Camera"
          >
            {state.camOn ? "📷" : "🚫"}
          </button>
          <button
            type="button"
            onClick={() => {
              void room.startScreenShare();
            }}
            className={`px-2.5 sm:px-3 h-10 sm:h-11 shrink-0 rounded-2xl hover:bg-white/10 text-[11px] sm:text-xs font-medium ${
              state.sharing ? "bg-[#FF5A79]/20 text-[#FF5A79]" : ""
            }`}
          >
            {state.sharing ? "Sharing" : "Share"}
          </button>

          <div className="w-px h-7 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />

          <button
            type="button"
            onClick={() =>
              room.setDuckingMode(state.duckingMode === "auto" ? "off" : "auto")
            }
            className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold rounded-full shrink-0 min-h-[32px] ${
              state.duckingMode === "auto"
                ? "bg-[#FF5A79] text-white"
                : "bg-gray-700 text-white"
            }`}
          >
            DUCK {state.duckingMode === "auto" ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={room.triggerTalk}
            className="px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs rounded-full glass hover:bg-white/10 shrink-0 min-h-[32px]"
          >
            Talk
          </button>

          <div className="w-px h-7 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />

          {["❤️", "😂", "🔥", "👏"].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => room.sendReaction(e)}
              className="w-9 h-9 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center text-base sm:text-lg hover:scale-110 active:scale-95 transition"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
