"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Film, Maximize2, MonitorUp, Play, Square } from "lucide-react";
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
  screenPreviewKey,
  startScreenShare,
  stopScreenShare,
  bindLocalScreenPreview,
  getLocalScreenStream,
  getRemoteScreenStream,
  shareVideoFile,
  screenQuality,
  setScreenQuality,
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
    kind: "play" | "pause" | "seek" | "load" | "sync";
    seconds?: number;
    videoId?: string;
    playing?: boolean;
  } | null;
  onYtEvent: (msg: DuoAppMessage) => void;
  takeYtControl: () => void;
  screenVideoRef: React.RefObject<HTMLVideoElement | null>;
  sharing: boolean;
  remoteSharing: boolean;
  screenPreviewKey: number;
  startScreenShare: () => void;
  stopScreenShare: () => void;
  bindLocalScreenPreview: () => boolean;
  getLocalScreenStream: () => MediaStream | null;
  getRemoteScreenStream: () => MediaStream;
  shareVideoFile: (file: File) => void;
  screenQuality: "ultra" | "saver" | "hd";
  setScreenQuality: (q: "ultra" | "saver" | "hd") => void;
}) {
  const screenActive = sharing || remoteSharing;
  const localVideoEl = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Let a mobile viewer blow the partner's shared screen up to fullscreen (and
  // rotate to landscape where supported) — small inline video is unwatchable.
  async function enterFullscreen() {
    const node = localVideoEl.current;
    if (!node) return;
    try {
      type IosVideo = HTMLVideoElement & {
        webkitEnterFullscreen?: () => void;
      };
      const el = node as IosVideo;
      if (node.requestFullscreen) {
        await node.requestFullscreen();
      } else if (el.webkitEnterFullscreen) {
        // iOS Safari only fullscreens the <video> element itself.
        el.webkitEnterFullscreen();
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      await orientation?.lock?.("landscape").catch(() => undefined);
    } catch {
      /* fullscreen/orientation not permitted — ignore */
    }
  }

  // Merge callback ref + external ref so we can re-bind when the element mounts
  function setScreenVideoNode(node: HTMLVideoElement | null) {
    localVideoEl.current = node;
    // write through to hook ref
    (screenVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
      node;
    if (node) {
      // Prefer local share preview when we are the sharer
      if (sharing) {
        const local = getLocalScreenStream();
        if (local) {
          node.srcObject = local;
          node.muted = true;
          void node.play().catch(() => undefined);
          return;
        }
        bindLocalScreenPreview();
      } else if (remoteSharing) {
        const remote = getRemoteScreenStream();
        if (remote.getVideoTracks().length > 0) {
          node.srcObject = remote;
          node.muted = false;
          void node.play().catch(() => undefined);
        }
      }
    }
  }

  // Re-attach whenever share state flips or stream key changes
  useEffect(() => {
    if (cinemaSource !== "screen") return;
    const node = localVideoEl.current;
    if (!node) return;

    if (sharing) {
      const local = getLocalScreenStream();
      if (local) {
        if (node.srcObject !== local) node.srcObject = local;
        node.muted = true;
        void node.play().catch(() => undefined);
      } else {
        bindLocalScreenPreview();
      }
      return;
    }

    if (remoteSharing) {
      const remote = getRemoteScreenStream();
      if (remote.getVideoTracks().length > 0) {
        if (node.srcObject !== remote) node.srcObject = remote;
        node.muted = false;
        void node.play().catch(() => undefined);
      }
    }
  }, [
    cinemaSource,
    sharing,
    remoteSharing,
    screenPreviewKey,
    bindLocalScreenPreview,
    getLocalScreenStream,
    getRemoteScreenStream,
  ]);

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
                  : "Share a video or screen"}
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
                icon={Film}
                tone={cinemaSource === "screen" ? "amber" : "muted"}
                size={14}
              />
              Share
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
        <div className="flex-1 flex flex-col gap-2 sm:gap-3 min-h-0 overflow-y-auto no-scrollbar">
          {isYtController ? (
            <YouTubeSearch activeVideoId={ytVideoId} onPick={onLoadYoutube} />
          ) : (
            <p className="text-xs text-[#9CA3AF]">
              Watching with partner control. Take control to search.
            </p>
          )}
          <YouTubePlayer
            key={`cinema-${ytVideoId || "empty"}`}
            instanceId="cinema"
            videoId={ytVideoId}
            isController={isYtController}
            duckLevel={duckLevel}
            autoPlayOnLoad
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
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 bg-black flex items-center justify-center min-h-[220px] sm:min-h-[320px] mb-2">
          <video
            ref={setScreenVideoNode}
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
                Watch together: share a video from your phone, or your screen
                (screen share is desktop only).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) shareVideoFile(f);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-3 rounded-full bg-[#FF5A79] text-sm font-semibold min-h-[44px] border border-[#FF5A79]/40 inline-flex items-center justify-center gap-1.5"
                >
                  <TwoToneIcon icon={Film} tone="rose" size={16} />
                  Share a video
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void startScreenShare()}
                  className="px-5 py-3 rounded-full bg-white/[0.06] border border-white/12 text-sm font-medium min-h-[44px] inline-flex items-center justify-center gap-1.5 hover:bg-white/[0.1] transition-colors"
                >
                  <TwoToneIcon icon={MonitorUp} tone="muted" size={16} />
                  Share screen
                </motion.button>
              </div>
              <p className="text-[11px] text-white/40">
                Videos stream at ~55–90 MB/hr (Data-saver) — far less than sending
                the file.
              </p>
            </div>
          ) : (
            <>
              <div className="absolute top-3 left-3 z-10 flex gap-2">
                <span className="px-2.5 py-1 rounded-full bg-black/70 border border-white/10 text-[10px] font-medium text-white/90">
                  {sharing ? "You · live preview" : "Partner · live"}
                </span>
              </div>
              <div className="absolute top-3 right-3 z-10 flex gap-2">
                {sharing ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        // Cycle: ultra → saver → hd → ultra
                        setScreenQuality(
                          screenQuality === "ultra"
                            ? "saver"
                            : screenQuality === "saver"
                              ? "hd"
                              : "ultra",
                        )
                      }
                      className="px-3 py-2 rounded-full bg-black/70 border border-white/15 text-white text-xs font-semibold min-h-[36px] inline-flex items-center gap-1.5 hover:bg-black/85"
                      title="Data quality — tap to cycle Ultra → Saver → HD"
                    >
                      {screenQuality === "hd"
                        ? "HD"
                        : screenQuality === "ultra"
                          ? "Ultra-saver"
                          : "Saver"}
                      <span className="text-white/50 font-normal">
                        {screenQuality === "hd"
                          ? "~450MB/hr"
                          : screenQuality === "ultra"
                            ? "~55MB/hr"
                            : "~90MB/hr"}
                      </span>
                    </button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={stopScreenShare}
                      className="px-3 py-2 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-xs font-semibold min-h-[36px] inline-flex items-center gap-1.5"
                    >
                      <TwoToneIcon icon={Square} tone="rose" size={12} />
                      Stop share
                    </motion.button>
                  </>
                ) : (
                  <>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => void enterFullscreen()}
                      className="px-3 py-2 rounded-full bg-black/70 border border-white/15 text-white text-xs font-semibold min-h-[36px] inline-flex items-center gap-1.5 hover:bg-black/85"
                      aria-label="Fullscreen"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      Fullscreen
                    </motion.button>
                    <span className="hidden sm:inline px-3 py-1.5 rounded-full bg-black/70 border border-white/10 text-[10px] text-white/80">
                      Live from partner
                    </span>
                  </>
                )}
              </div>
              {sharing ? (
                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[10px] text-white/50 bg-black/50 px-3 py-1 rounded-full">
                  Partner sees this screen · preview is muted for you
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
