"use client";

import type { CinemaSource, DuoAppMessage } from "@/lib/types";
import { YouTubePlayer } from "@/components/youtube/YouTubePlayer";
import { YouTubeSearch } from "@/components/youtube/YouTubeSearch";

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
  startScreenShare,
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
  startScreenShare: () => void;
}) {
  return (
    <div className="absolute inset-0 p-5 md:p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs tracking-wider text-[#FFB35C] font-medium uppercase">
            Cinema Stage
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            {cinemaSource === "youtube"
              ? ytTitle || "YouTube co-watch"
              : sharing
                ? "Screen share"
                : "Screen share"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#0A0B10] rounded-full p-1 border border-white/10">
            <button
              type="button"
              onClick={() => setCinemaSource("youtube")}
              className={`px-3 py-1.5 text-xs rounded-full ${
                cinemaSource === "youtube"
                  ? "bg-[#FFB35C] text-black font-semibold"
                  : "text-[#9CA3AF]"
              }`}
            >
              YouTube
            </button>
            <button
              type="button"
              onClick={() => setCinemaSource("screen")}
              className={`px-3 py-1.5 text-xs rounded-full ${
                cinemaSource === "screen"
                  ? "bg-[#FFB35C] text-black font-semibold"
                  : "text-[#9CA3AF]"
              }`}
            >
              Share screen
            </button>
          </div>
          {!isYtController ? (
            <button
              type="button"
              onClick={takeYtControl}
              className="px-3 py-1.5 text-xs rounded-full glass hover:bg-white/10"
            >
              Take YT control
            </button>
          ) : (
            <span className="text-[10px] text-[#9CA3AF]">You control YT</span>
          )}
        </div>
      </div>

      {cinemaSource === "youtube" ? (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
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
          <div className="text-[10px] text-[#9CA3AF] flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background:
                  duckLevel < 0.9 ? "#FFB35C" : "rgba(255,255,255,0.2)",
              }}
            />
            Smart audio {Math.round(duckLevel * 100)}%
          </div>
        </div>
      ) : (
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 bg-black flex items-center justify-center min-h-[240px]">
          <video
            ref={screenVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-contain"
          />
          {!sharing ? (
            <div className="relative z-10 text-center space-y-3 p-6">
              <p className="text-sm text-white/60">
                Share a tab or window (system audio on Chrome)
              </p>
              <button
                type="button"
                onClick={startScreenShare}
                className="px-5 py-2.5 rounded-full bg-[#FF5A79] text-sm font-semibold"
              >
                Start sharing
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
