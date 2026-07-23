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
import { Tooltip } from "@/components/ui/Tooltip";

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

  const connected =
    state.connection === "connected" ||
    state.status.toLowerCase().includes("connected");

  return (
    <div className="min-h-dvh flex flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-28 px-3 sm:px-6 md:px-8 max-w-[1280px] mx-auto">
      <ToastHost />

      {/* Sticky (not fixed overlay) so content never crops under the nav */}
      <header className="sticky top-0 z-50 -mx-3 sm:-mx-6 md:-mx-8 px-3 sm:px-6 md:px-8 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 bg-[#0A0B10]/90 backdrop-blur-md">
        <motion.div
          layout
          className="glass rounded-2xl flex flex-col gap-2 px-2 py-2 border border-white/10 max-w-[960px] mx-auto"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 pl-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#FF5A79]/12 border border-[#FF5A79]/25 flex items-center justify-center shrink-0">
                <TwoToneIcon icon={Heart} tone="rose" size={16} />
              </div>
              <span className="font-semibold tracking-tight text-sm sm:text-base">
                Duo
              </span>
            </div>

            <div className="flex items-center gap-1.5 pr-1 shrink-0">
              <div className="px-2 sm:px-3 py-1 bg-[#0A0B10] rounded-full flex items-center gap-1.5 text-[10px] sm:text-xs border border-white/8">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    connected
                      ? "bg-emerald-400"
                      : state.partnerPresent
                        ? "bg-amber-400"
                        : "bg-white/25"
                  }`}
                />
                <span className="font-mono text-[#9CA3AF]">{code}</span>
              </div>
              <Tooltip label="Copy room invite link">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={copyLink}
                  className="control-chip px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-sm font-medium min-h-[36px] inline-flex items-center gap-1.5 text-[#FF5A79]"
                >
                  <TwoToneIcon icon={Copy} tone="rose" size={14} />
                  <span className="hidden sm:inline">Copy</span>
                </motion.button>
              </Tooltip>
            </div>
          </div>

          <div className="flex items-center justify-center bg-[#0A0B10] rounded-full p-1 w-full border border-white/6">
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
      </header>

      <div className="flex items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3 mt-1 px-0.5">
        <div className="min-w-0 flex-1">
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
          <p
            className={`text-xs sm:text-sm line-clamp-2 mt-0.5 ${
              connected
                ? "text-emerald-400/90"
                : state.partnerPresent
                  ? "text-amber-300/90"
                  : "text-[#9CA3AF]"
            }`}
          >
            {state.status}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs shrink-0">
          <div className="px-2 sm:px-3 py-1 rounded-full glass truncate border border-white/8">
            {state.partnerPresent
              ? connected
                ? "You + partner"
                : "Partner joining…"
              : "Just you"}
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
            // Not muted — partner audio comes through this element
            className="w-full h-full object-cover bg-[#0A0B10]"
          />
          {!state.partnerPresent || !connected ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#12141D]/80">
              <span className="text-[9px] sm:text-[10px] text-white/40 tracking-wider px-2 text-center">
                {state.partnerPresent ? "…" : "WAIT"}
              </span>
            </div>
          ) : null}
          <div className="absolute bottom-1 sm:bottom-2 inset-x-0 text-center text-[8px] sm:text-[10px] tracking-widest text-white/70">
            {connected ? "PARTNER" : state.partnerPresent ? "LINKING" : "…"}
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

      {/* Duck level chip when talking */}
      {state.localSpeaking || room.duckLevel < 0.95 ? (
        <div className="fixed bottom-[4.75rem] left-1/2 -translate-x-1/2 z-40 pointer-events-none hidden sm:block">
          <div className="rounded-full border border-white/10 bg-[#12141D]/95 px-3 py-1 text-[10px] text-[#FFB35C] tabular-nums">
            Media {Math.round(room.duckLevel * 100)}%
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 w-[min(100%-0.75rem,640px)]">
        <motion.div
          layout
          className="glass px-1.5 sm:px-2 py-1.5 sm:py-2 rounded-2xl sm:rounded-3xl flex items-center gap-0.5 sm:gap-1 border border-white/10 overflow-x-auto no-scrollbar justify-start sm:justify-center"
        >
          <Tooltip label={state.micOn ? "Mute microphone" : "Unmute microphone"}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={room.toggleMic}
              className="dock-btn w-10 h-10 sm:w-11 sm:h-11 shrink-0"
              aria-label="Microphone"
            >
              <TwoToneIcon
                icon={state.micOn ? Mic : MicOff}
                tone={state.micOn ? "rose" : "muted"}
                size={20}
              />
            </motion.button>
          </Tooltip>
          <Tooltip label={state.camOn ? "Turn camera off" : "Turn camera on"}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={room.toggleCam}
              className="dock-btn w-10 h-10 sm:w-11 sm:h-11 shrink-0"
              aria-label="Camera"
            >
              <TwoToneIcon
                icon={state.camOn ? Camera : CameraOff}
                tone={state.camOn ? "default" : "muted"}
                size={20}
              />
            </motion.button>
          </Tooltip>
          <Tooltip
            label={
              state.sharing
                ? "Screen sharing is on"
                : "Share your screen (Chrome desktop)"
            }
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => void room.startScreenShare()}
              className="dock-btn h-10 sm:h-11 px-2.5 sm:px-3 shrink-0 gap-1.5 text-[11px] sm:text-xs font-medium text-[#9CA3AF]"
              data-active={state.sharing}
              aria-label="Share screen"
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
          </Tooltip>

          <div className="w-px h-7 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />

          <Tooltip
            label={
              state.duckingMode === "auto"
                ? "Auto-duck media when someone speaks (on)"
                : "Auto-duck is off — use Talk to lower volume"
            }
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                const next =
                  state.duckingMode === "auto" ? "off" : "auto";
                room.setDuckingMode(next);
                toast(
                  next === "auto"
                    ? "Auto ducking on"
                    : "Auto ducking off — Talk still works",
                );
              }}
              className="control-chip px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold shrink-0 min-h-[32px] inline-flex items-center gap-1"
              data-active={state.duckingMode === "auto"}
              aria-label="Toggle auto ducking"
            >
              <TwoToneIcon
                icon={state.duckingMode === "auto" ? Volume2 : VolumeX}
                tone={state.duckingMode === "auto" ? "rose" : "muted"}
                size={14}
              />
              DUCK
            </motion.button>
          </Tooltip>
          <Tooltip label="Lower YouTube/media for 2 seconds so you can talk">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                room.triggerTalk();
                toast("Media ducked — go ahead and talk");
              }}
              className={`control-chip px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs shrink-0 min-h-[32px] inline-flex items-center gap-1 ${
                state.localSpeaking
                  ? "border-[#FFB35C]/40 bg-[#FFB35C]/15 text-[#FFB35C]"
                  : ""
              }`}
              aria-label="Talk — duck media"
            >
              <TwoToneIcon icon={Hand} tone="amber" size={14} />
              Talk
            </motion.button>
          </Tooltip>

          <div className="w-px h-7 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />

          {REACTIONS.map((r) => (
            <Tooltip
              key={r.id}
              label={
                r.id === "heart"
                  ? "Send heart"
                  : r.id === "laugh"
                    ? "Send laugh"
                    : r.id === "fire"
                      ? "Send fire"
                      : "Send cheers"
              }
            >
              <motion.button
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => room.sendReaction(r.emoji)}
                className="dock-btn w-9 h-9 shrink-0"
                aria-label={r.id}
              >
                <TwoToneIcon icon={r.icon} tone={r.tone} size={18} />
              </motion.button>
            </Tooltip>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
