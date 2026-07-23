"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CameraOff,
  Clapperboard,
  Copy,
  Flame,
  Gamepad2,
  Hand,
  Heart,
  Laugh,
  Mic,
  MicOff,
  MonitorUp,
  PartyPopper,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useDuoRoom } from "@/hooks/useDuoRoom";
import type { DuoAppMessage, StageMode } from "@/lib/types";
import { DinnerStage } from "@/components/dinner/DinnerStage";
import { GamesStage } from "@/components/games/GamesStage";
import { CinemaStage } from "@/components/cinema/CinemaStage";
import { ToastHost, toast } from "@/components/shell/Toast";
import { TwoToneIcon } from "@/components/ui/TwoToneIcon";

const MODES: {
  id: StageMode;
  label: string;
  short: string;
  icon: typeof UtensilsCrossed;
  tone: "rose" | "violet" | "amber";
}[] = [
  { id: "dinner", label: "Dinner", short: "Dinner", icon: UtensilsCrossed, tone: "rose" },
  { id: "games", label: "Games", short: "Games", icon: Gamepad2, tone: "violet" },
  { id: "cinema", label: "Cinema", short: "Film", icon: Clapperboard, tone: "amber" },
];

const REACTIONS = [
  { id: "heart", icon: Heart, tone: "rose" as const, emoji: "❤️" },
  { id: "laugh", icon: Laugh, tone: "amber" as const, emoji: "😂" },
  { id: "fire", icon: Flame, tone: "rose" as const, emoji: "🔥" },
  { id: "party", icon: PartyPopper, tone: "violet" as const, emoji: "🎉" },
];

export function RoomShell({ code }: { code: string }) {
  const room = useDuoRoom(code);
  const { state } = room;
  const [sessionStart] = useState(() => Date.now());
  const [timer, setTimer] = useState("0:00");
  const [reactions, setReactions] = useState<
    { id: number; kind: string; left: number }[]
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
    const kind =
      REACTIONS.find((r) => r.emoji === state.lastReaction!.emoji)?.id ||
      "heart";
    setReactions((r) => [
      ...r,
      { id, kind, left: 20 + Math.random() * 60 },
    ]);
    const t = setTimeout(() => {
      setReactions((r) => r.filter((x) => x.id !== id));
    }, 1700);
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
      (typeof window !== "undefined" ? window.location.origin : "https://justduo.vercel.app");
    const link = `${base.replace(/\/$/, "")}/room/${code}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        toast("Link copied — share with your date");
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

  const title =
    state.mode === "dinner"
      ? "Dinner & Vibe"
      : state.mode === "games"
        ? "Playful Games"
        : "Cinema Stage";

  return (
    <div className="min-h-dvh flex flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] sm:pt-20 sm:pb-28 px-3 sm:px-6 md:px-8 max-w-[1280px] mx-auto">
      <ToastHost />

      <div className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 w-[min(100%-0.75rem,960px)]">
        <motion.div
          layout
          className="glass rounded-2xl sm:rounded-full flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 px-2 py-2 sm:justify-between border border-white/10"
        >
          <div className="flex items-center justify-between gap-2 sm:contents">
            <div className="flex items-center gap-2 pl-2 sm:pl-3 pr-1">
              <div className="w-8 h-8 rounded-xl bg-[#FF5A79]/12 border border-[#FF5A79]/25 flex items-center justify-center shrink-0">
                <TwoToneIcon icon={Heart} tone="rose" size={16} />
              </div>
              <span className="font-semibold tracking-tight text-sm sm:text-base">
                Duo
              </span>
            </div>

            <div className="flex items-center gap-1.5 pr-1 sm:order-last sm:pr-2">
              <div className="px-2 sm:px-3 py-1 bg-[#0A0B10] rounded-full flex items-center gap-1.5 text-[10px] sm:text-xs border border-white/8">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    state.partnerPresent ? "bg-emerald-400" : "bg-white/25"
                  }`}
                />
                <span className="font-mono text-[#9CA3AF]">{code}</span>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={copyLink}
                className="control-chip px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-sm font-medium min-h-[36px] inline-flex items-center gap-1.5 text-[#FF5A79]"
              >
                <TwoToneIcon icon={Copy} tone="rose" size={14} />
                <span className="hidden xs:inline sm:inline">Copy</span>
              </motion.button>
            </div>
          </div>

          <div className="flex items-center justify-center bg-[#0A0B10] rounded-full p-1 w-full sm:w-auto border border-white/6">
            {MODES.map((m) => {
              const active = state.mode === m.id;
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  layout
                  whileTap={{ scale: 0.97 }}
                  onClick={() => room.setMode(m.id)}
                  className={`mode-tab flex-1 sm:flex-none px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-medium rounded-full min-h-[40px] inline-flex items-center justify-center gap-1.5 border border-transparent ${
                    active ? "active" : "text-[#9CA3AF] hover:bg-white/[0.04]"
                  }`}
                >
                  <TwoToneIcon
                    icon={m.icon}
                    tone={active ? m.tone : "muted"}
                    size={15}
                  />
                  <span className="sm:hidden">{m.short}</span>
                  <span className="hidden sm:inline">{m.label}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>

      <div className="flex items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3 px-0.5">
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.h1
              key={state.mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tighter truncate"
            >
              {title}
            </motion.h1>
          </AnimatePresence>
          <p className="text-[#9CA3AF] text-xs sm:text-sm line-clamp-2 mt-0.5">
            {state.status}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs shrink-0">
          <div className="px-2 sm:px-3 py-1 rounded-full glass max-w-[7rem] sm:max-w-none truncate border border-white/8">
            You
            {state.partnerPresent ? ` + partner` : ""}
          </div>
          <div className="px-2 sm:px-3 py-1 rounded-full glass text-[#9CA3AF] tabular-nums border border-white/8">
            {timer}
          </div>
        </div>
      </div>

      <div
        id="stage-area"
        className="stage-surface relative flex-1 min-h-[min(58dvh,520px)] sm:min-h-[420px] rounded-2xl sm:rounded-3xl overflow-hidden"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={state.mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
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
          </motion.div>
        </AnimatePresence>

        <motion.div
          layout
          className={`video-bubble absolute z-40 bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 sm:bottom-6 sm:right-6 w-[72px] h-[72px] sm:w-[120px] sm:h-[120px] md:w-[132px] md:h-[132px] ${
            state.localSpeaking ? "speaking" : ""
          }`}
          style={{ opacity: state.camOn ? 1 : 0.45 }}
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
        </motion.div>
        <motion.div
          layout
          className={`video-bubble absolute z-40 bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[5.5rem] sm:bottom-6 sm:right-[148px] md:right-[160px] w-[72px] h-[72px] sm:w-[120px] sm:h-[120px] md:w-[132px] md:h-[132px] ${
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
        </motion.div>

        {reactions.map((r) => {
          const meta = REACTIONS.find((x) => x.id === r.kind) || REACTIONS[0]!;
          return (
            <div
              key={r.id}
              className="reaction-float"
              style={{ left: `${r.left}%`, bottom: 100 }}
            >
              <TwoToneIcon icon={meta.icon} tone={meta.tone} size={28} />
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 w-[min(100%-0.75rem,640px)]">
        <motion.div
          layout
          className="glass px-1.5 sm:px-2 py-1.5 sm:py-2 rounded-2xl sm:rounded-3xl flex items-center gap-0.5 sm:gap-1 border border-white/10 overflow-x-auto no-scrollbar justify-start sm:justify-center"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={room.toggleMic}
            className="dock-btn w-10 h-10 sm:w-11 sm:h-11 shrink-0"
            title="Microphone"
          >
            <TwoToneIcon
              icon={state.micOn ? Mic : MicOff}
              tone={state.micOn ? "rose" : "muted"}
              size={20}
            />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={room.toggleCam}
            className="dock-btn w-10 h-10 sm:w-11 sm:h-11 shrink-0"
            title="Camera"
          >
            <TwoToneIcon
              icon={state.camOn ? Camera : CameraOff}
              tone={state.camOn ? "default" : "muted"}
              size={20}
            />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => void room.startScreenShare()}
            className="dock-btn h-10 sm:h-11 px-2.5 sm:px-3 shrink-0 gap-1.5 text-[11px] sm:text-xs font-medium text-[#9CA3AF]"
            data-active={state.sharing}
          >
            <TwoToneIcon
              icon={MonitorUp}
              tone={state.sharing ? "amber" : "muted"}
              size={18}
            />
            <span className="hidden sm:inline">
              {state.sharing ? "Sharing" : "Share"}
            </span>
          </motion.button>

          <div className="w-px h-7 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() =>
              room.setDuckingMode(state.duckingMode === "auto" ? "off" : "auto")
            }
            className="control-chip px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold shrink-0 min-h-[32px] inline-flex items-center gap-1"
            data-active={state.duckingMode === "auto"}
          >
            <TwoToneIcon
              icon={state.duckingMode === "auto" ? Volume2 : VolumeX}
              tone={state.duckingMode === "auto" ? "rose" : "muted"}
              size={14}
            />
            DUCK
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={room.triggerTalk}
            className="control-chip px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs shrink-0 min-h-[32px] inline-flex items-center gap-1"
          >
            <TwoToneIcon icon={Hand} tone="amber" size={14} />
            Talk
          </motion.button>

          <div className="w-px h-7 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />

          {REACTIONS.map((r) => (
            <motion.button
              key={r.id}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => room.sendReaction(r.emoji)}
              className="dock-btn w-9 h-9 shrink-0"
              title={r.id}
            >
              <TwoToneIcon icon={r.icon} tone={r.tone} size={18} />
            </motion.button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
