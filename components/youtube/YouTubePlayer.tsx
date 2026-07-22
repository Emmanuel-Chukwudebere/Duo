"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: Record<string, unknown>,
      ) => YtPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  destroy: () => void;
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  setVolume: (v: number) => void;
  getVolume: () => number;
}

let apiPromise: Promise<void> | null = null;

function loadYtApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  });
  return apiPromise;
}

export interface YouTubePlayerProps {
  videoId: string | null;
  isController: boolean;
  duckLevel: number;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (seconds: number) => void;
  onTime?: (seconds: number, playing: boolean) => void;
  /** Apply remote commands */
  remoteCommand?: {
    id: number;
    kind: "play" | "pause" | "seek" | "load";
    seconds?: number;
    videoId?: string;
  } | null;
  compact?: boolean;
}

export function YouTubePlayer({
  videoId,
  isController,
  duckLevel,
  onPlay,
  onPause,
  onSeek,
  onTime,
  remoteCommand,
  compact,
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const lastDuck = useRef(100);

  useEffect(() => {
    let destroyed = false;
    void (async () => {
      await loadYtApi();
      if (destroyed || !hostRef.current || !window.YT) return;
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        videoId: videoId || undefined,
        playerVars: {
          autoplay: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (videoId) playerRef.current?.loadVideoById(videoId);
          },
          onStateChange: (e: { data: number }) => {
            if (!isController || !window.YT) return;
            if (e.data === window.YT.PlayerState.PLAYING) onPlay?.();
            if (e.data === window.YT.PlayerState.PAUSED) onPause?.();
          },
        },
      });
    })();
    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      readyRef.current = false;
    };
    // init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readyRef.current || !playerRef.current || !videoId) return;
    try {
      playerRef.current.loadVideoById(videoId);
    } catch {
      /* ignore */
    }
  }, [videoId]);

  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    const vol = Math.round(Math.max(0, Math.min(1, duckLevel)) * 100);
    if (vol !== lastDuck.current) {
      lastDuck.current = vol;
      try {
        playerRef.current.setVolume(vol);
      } catch {
        /* ignore */
      }
    }
  }, [duckLevel]);

  useEffect(() => {
    if (!remoteCommand || isController || !playerRef.current || !readyRef.current)
      return;
    const p = playerRef.current;
    try {
      if (remoteCommand.kind === "play") p.playVideo();
      if (remoteCommand.kind === "pause") p.pauseVideo();
      if (remoteCommand.kind === "seek" && remoteCommand.seconds != null)
        p.seekTo(remoteCommand.seconds, true);
      if (remoteCommand.kind === "load" && remoteCommand.videoId)
        p.loadVideoById(remoteCommand.videoId);
    } catch {
      /* ignore */
    }
  }, [remoteCommand, isController]);

  // Controller time sync ticks
  useEffect(() => {
    if (!isController) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current || !window.YT) return;
      try {
        const st = p.getPlayerState();
        const playing = st === window.YT.PlayerState.PLAYING;
        onTime?.(p.getCurrentTime(), playing);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isController, onTime]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-black border border-white/10 ${
        compact ? "aspect-video max-h-48" : "aspect-video flex-1 min-h-[240px]"
      }`}
    >
      <div ref={hostRef} className="absolute inset-0 w-full h-full" />
      {!videoId ? (
        <div className="absolute inset-0 flex items-center justify-center text-[#9CA3AF] text-sm pointer-events-none">
          Search or paste a YouTube link
        </div>
      ) : null}
    </div>
  );
}
