"use client";

import { useEffect, useState } from "react";
import { useDuoRoom } from "@/hooks/useDuoRoom";
import type { DuoAppMessage, StageMode } from "@/lib/types";
import { DinnerStage } from "@/components/dinner/DinnerStage";
import { GamesStage } from "@/components/games/GamesStage";
import { CinemaStage } from "@/components/cinema/CinemaStage";
import { ToastHost, toast } from "@/components/shell/Toast";

const MODES: { id: StageMode; label: string }[] = [
  { id: "dinner", label: "Dinner" },
  { id: "games", label: "Games" },
  { id: "cinema", label: "Cinema" },
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

  function copyLink() {
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const link = `${base}/room/${code}`;
    void navigator.clipboard.writeText(link).then(
      () => toast("Link copied — share with your date ❤️"),
      () => toast(link),
    );
  }

  function onYtEvent(msg: DuoAppMessage) {
    if (!room.isYtController) return;
    room.sendYt(msg);
  }

  return (
    <div className="min-h-dvh flex flex-col pb-28 pt-20 px-4 md:px-8 max-w-[1280px] mx-auto">
      <ToastHost />

      {/* Top nav */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(100%-1rem,960px)]">
        <div className="glass rounded-full shadow-2xl flex flex-wrap items-center gap-2 px-2 py-2 justify-between">
          <div className="flex items-center gap-2 pl-3 pr-2">
            <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-[#FF5A79] to-[#8A5CF5] flex items-center justify-center text-white font-bold text-sm">
              D
            </div>
            <span className="font-semibold tracking-tight hidden sm:inline">
              Duo
            </span>
          </div>

          <div className="flex items-center bg-[#0A0B10] rounded-full p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => room.setMode(m.id)}
                className={`mode-tab px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full ${
                  state.mode === m.id ? "active" : "hover:bg-white/5 text-[#9CA3AF]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pr-2">
            <div className="px-3 py-1 bg-[#0A0B10] rounded-full flex items-center gap-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  state.partnerPresent ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                }`}
              />
              <span className="font-mono text-[#9CA3AF]">{code}</span>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-full hover:bg-white/10 text-[#FF5A79] font-medium"
            >
              Copy link
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <div className="text-2xl md:text-3xl font-semibold tracking-tighter">
            {state.mode === "dinner"
              ? "Dinner & Vibe"
              : state.mode === "games"
                ? "Playful Games"
                : "Cinema Stage"}
          </div>
          <div className="text-[#9CA3AF] text-sm">{state.status}</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1 rounded-full glass">
            You
            {state.partnerPresent ? ` + ${state.partnerName}` : ""}
          </div>
          <div className="px-3 py-1 rounded-full glass text-[#9CA3AF]">
            {timer}
          </div>
        </div>
      </div>

      {/* Stage */}
      <div
        id="stage-area"
        className="stage-surface relative flex-1 min-h-[420px] rounded-3xl overflow-hidden border border-white/10"
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
            startScreenShare={room.startScreenShare}
          />
        ) : null}

        {/* Video bubbles */}
        <div
          className={`video-bubble absolute bottom-6 right-6 z-40 w-[120px] h-[120px] md:w-[138px] md:h-[138px] bg-slate-800 ${
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
          <div className="absolute bottom-2 inset-x-0 text-center text-[10px] tracking-widest text-white/70">
            YOU
          </div>
        </div>
        <div
          className={`video-bubble absolute bottom-6 right-[148px] md:right-[170px] z-40 w-[120px] h-[120px] md:w-[138px] md:h-[138px] bg-violet-950 ${
            state.remoteSpeaking ? "speaking" : ""
          }`}
        >
          <video
            ref={room.remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 inset-x-0 text-center text-[10px] tracking-widest text-white/70">
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

      {/* Dock */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
        <div className="glass px-2 py-2 rounded-3xl flex items-center gap-1 shadow-2xl border border-white/10">
          <button
            type="button"
            onClick={room.toggleMic}
            className={`w-11 h-11 rounded-2xl hover:bg-white/10 flex items-center justify-center text-lg ${
              state.micOn ? "text-[#FF5A79]" : "text-red-400"
            }`}
            title="Microphone"
          >
            {state.micOn ? "🎙" : "🔇"}
          </button>
          <button
            type="button"
            onClick={room.toggleCam}
            className={`w-11 h-11 rounded-2xl hover:bg-white/10 flex items-center justify-center text-lg ${
              state.camOn ? "" : "text-red-400"
            }`}
            title="Camera"
          >
            {state.camOn ? "📷" : "🚫"}
          </button>
          <button
            type="button"
            onClick={room.startScreenShare}
            className="px-3 h-11 rounded-2xl hover:bg-white/10 text-xs font-medium"
          >
            Share
          </button>

          <div className="w-px h-7 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={() =>
              room.setDuckingMode(state.duckingMode === "auto" ? "off" : "auto")
            }
            className={`px-3 py-1 text-xs font-semibold rounded-full ${
              state.duckingMode === "auto"
                ? "bg-[#FF5A79] text-white"
                : "bg-gray-700 text-white"
            }`}
          >
            DUCK {state.duckingMode === "auto" ? "AUTO" : "OFF"}
          </button>
          <button
            type="button"
            onClick={room.triggerTalk}
            className="px-3 py-1 text-xs rounded-full glass hover:bg-white/10"
          >
            Talk
          </button>

          <div className="w-px h-7 bg-white/10 mx-1" />

          {["❤️", "😂", "🔥", "👏"].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => room.sendReaction(e)}
              className="w-9 h-9 flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
