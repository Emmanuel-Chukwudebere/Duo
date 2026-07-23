"use client";

import { motion } from "framer-motion";
import { MonitorUp, Play, Square } from "lucide-react";
import type { CinemaSource, DuoAppMessage } from "@/lib/types";
import { YouTubePlayer } from "@/components/youtube/YouTubePlayer";
import { YouTubeSearch } from "@/components/youtube/YouTubeSearch";
import { TwoToneIcon } from "@/components/ui/TwoToneIcon";

export function CinemaStage({
  cinemaSource,
  setCinemaSource,
  isYtController,
  ytVideoId,
  ytTitle,
  duckLevel,
  onLoadYoutube,
  remoteYtCommand,
  onYtEvent,
  takeYtControl,
  screenVideoRef,
  sharing,
  remoteSharing,
  startScreenShare,
  stopScreenShare,
}: {
  cinemaSource: CinemaSource;
  setCinemaSource: (s: CinemaSource) => void;
  isYtController: boolean;
  ytVideoId: string | null;
  ytTitle: string;
  duckLevel: number;
  onLoadYoutube: (id: string, title?: string) => void;
  remoteYtCommand: {
    id: number;
    kind: "play" | "pause" | "seek" | "load";
    seconds?: number;
    videoId?: string;
  } | null;
  onYtEvent: (msg: DuoAppMessage) => void;
  takeYtControl: () => void;
  screenVideoRef: React.RefObject<HTMLVideoElement | null>;
  sharing: boolean;
  remoteSharing: boolean;
  startScreenShare: () => void;
  stopScreenShare: () => void;
}) {
  const screenActive = sharing || remoteSharing;

  return (
    <div className="absolute inset-0 p-3 sm:p-5 md:p-6 flex flex-col gap-2 sm:gap-3 min-h-0">
      <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs tracking-wider text-[#FFB35C] font-medium uppercase">
            Cinema Stage
          </div>
          <h2 className="text-base sm:text-xl font-semibold tracking-tight truncate">
            {cinemaSource === "youtube"
              ? ytTitle || "YouTube co-watch"
              : sharing
                ? "You are sharing"
                : remoteSharing
                  ? "Partner is sharing"
                  : "Screen share"}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="flex bg-[#0A0B10] rounded-full p-0.5 sm:p-1 border border-white/10">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setCinemaSource("youtube")}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs rounded-full min-h-[36px] inline-flex items-center gap-1.5 ${
                cinemaSource === "youtube"
                  ? "bg-[#FFB35C]/15 text-[#FFB35C] border border-[#FFB35C]/35"
                  : "text-[#9CA3AF] border border-transparent"
              }`}
            >
              <TwoToneIcon
                icon={Play}
                tone={cinemaSource === "youtube" ? "amber" : "muted"}
                size={14}
              />
              YouTube
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setCinemaSource("screen")}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs rounded-full min-h-[36px] inline-flex items-center gap-1.5 ${
                cinemaSource === "screen"
                  ? "bg-[#FFB35C]/15 text-[#FFB35C] border border-[#FFB35C]/35"
                  : "text-[#9CA3AF] border border-transparent"
              }`}
            >
              <TwoToneIcon
                icon={MonitorUp}
                tone={cinemaSource === "screen" ? "amber" : "muted"}
                size={14}
              />
              Screen
            </motion.button>
          </div>
          {cinemaSource === "youtube" && !isYtController ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={takeYtControl}
              className="control-chip px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs min-h-[36px]"
            >
              Take control
            </motion.button>
          ) : null}
        </div>
      </div>

      {cinemaSource === "youtube" ? (
        <div className="flex-1 flex flex-col gap-2 sm:gap-3 min-h-0 overflow-y-auto">
          {isYtController ? (
            <YouTubeSearch onPick={onLoadYoutube} />
          ) : (
            <p className="text-xs text-[#9CA3AF]">
              Watching with partner control. Take control to search.
            </p>
          )}
          <YouTubePlayer
            videoId={ytVideoId}
            isController={isYtController}
            duckLevel={duckLevel}
            remoteCommand={remoteYtCommand}
            onPlay={() => onYtEvent({ type: "yt.play" })}
            onPause={() => onYtEvent({ type: "yt.pause" })}
            onTime={(seconds, playing) =>
              onYtEvent({ type: "yt.time", seconds, playing })
            }
          />
          <div className="text-[10px] text-[#9CA3AF] flex items-center gap-2 pb-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  duckLevel < 0.9 ? "#FFB35C" : "rgba(255,255,255,0.2)",
              }}
            />
            Smart audio {Math.round(duckLevel * 100)}%
          </div>
        </div>
      ) : (
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 bg-black flex items-center justify-center min-h-[180px] sm:min-h-[240px]">
          <video
            ref={screenVideoRef}
            autoPlay
            playsInline
            muted={sharing}
            className="absolute inset-0 w-full h-full object-contain bg-black"
          />
          {!screenActive ? (
            <div className="relative z-10 text-center space-y-3 p-4 sm:p-6 max-w-sm">
              <div className="mx-auto w-12 h-12 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
                <TwoToneIcon icon={MonitorUp} tone="amber" size={24} />
              </div>
              <p className="text-sm text-white/60">
                Share a tab or window. Best on Chrome/Edge desktop. Mobile often
                blocks screen share.
              </p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={startScreenShare}
                className="px-5 py-3 rounded-full bg-[#FF5A79] text-sm font-semibold min-h-[44px] w-full sm:w-auto border border-[#FF5A79]/40"
              >
                Start sharing
              </motion.button>
            </div>
          ) : (
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              {sharing ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={stopScreenShare}
                  className="px-3 py-2 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-xs font-semibold min-h-[36px] inline-flex items-center gap-1.5"
                >
                  <TwoToneIcon icon={Square} tone="rose" size={12} />
                  Stop share
                </motion.button>
              ) : (
                <span className="px-3 py-1.5 rounded-full bg-black/70 border border-white/10 text-[10px] text-white/80">
                  Live from partner
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
