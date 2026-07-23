"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: Record<string, unknown>,
      ) => YtPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  destroy: () => void;
  loadVideoById: (id: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  setVolume: (v: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
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
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    // YT already mid-load
    const poll = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(poll);
        resolve();
      }
    }, 50);
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
  remoteCommand?: {
    id: number;
    kind: "play" | "pause" | "seek" | "load";
    seconds?: number;
    videoId?: string;
  } | null;
  compact?: boolean;
  /** Auto-start playback when a video is selected (needs user gesture on first click). */
  autoPlayOnLoad?: boolean;
}

export function YouTubePlayer({
  videoId,
  isController,
  duckLevel,
  onPlay,
  onPause,
  onTime,
  remoteCommand,
  compact,
  autoPlayOnLoad = true,
}: YouTubePlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const videoIdRef = useRef(videoId);
  const autoPlayRef = useRef(autoPlayOnLoad);
  const isControllerRef = useRef(isController);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const lastDuck = useRef(100);
  const lastLoadedId = useRef<string | null>(null);
  const reactId = useId().replace(/:/g, "");

  videoIdRef.current = videoId;
  autoPlayRef.current = autoPlayOnLoad;
  isControllerRef.current = isController;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;

  // Create player once — mount a disposable child div (YT replaces the element)
  useEffect(() => {
    let destroyed = false;
    let player: YtPlayer | null = null;

    void (async () => {
      await loadYtApi();
      if (destroyed || !wrapRef.current || !window.YT) return;

      // Clear previous mount node
      wrapRef.current.innerHTML = "";
      const mount = document.createElement("div");
      mount.id = `yt-mount-${reactId}`;
      mount.style.width = "100%";
      mount.style.height = "100%";
      wrapRef.current.appendChild(mount);

      const initialId = videoIdRef.current || undefined;

      player = new window.YT.Player(mount, {
        width: "100%",
        height: "100%",
        videoId: initialId,
        playerVars: {
          autoplay: initialId && autoPlayRef.current ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (e: { target: YtPlayer }) => {
            readyRef.current = true;
            playerRef.current = e.target;
            const id = videoIdRef.current;
            if (id) {
              lastLoadedId.current = id;
              try {
                if (autoPlayRef.current) {
                  e.target.loadVideoById(id);
                  // Second kick for browsers that block first autoplay
                  window.setTimeout(() => {
                    try {
                      e.target.playVideo();
                    } catch {
                      /* ignore */
                    }
                  }, 300);
                } else {
                  e.target.cueVideoById(id);
                }
              } catch {
                /* ignore */
              }
            }
            // Apply volume
            try {
              e.target.setVolume(
                Math.round(Math.max(0, Math.min(1, lastDuck.current / 100)) * 100),
              );
            } catch {
              /* ignore */
            }
          },
          onStateChange: (e: { data: number }) => {
            if (!window.YT) return;
            if (e.data === window.YT.PlayerState.PLAYING) {
              if (isControllerRef.current) onPlayRef.current?.();
            }
            if (e.data === window.YT.PlayerState.PAUSED) {
              if (isControllerRef.current) onPauseRef.current?.();
            }
          },
          onError: (e: { data: number }) => {
            console.warn("YouTube player error", e.data);
          },
        },
      });
      playerRef.current = player;
    })();

    return () => {
      destroyed = true;
      readyRef.current = false;
      lastLoadedId.current = null;
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      if (wrapRef.current) wrapRef.current.innerHTML = "";
    };
  }, [reactId]);

  // Load / play when videoId changes
  useEffect(() => {
    if (!videoId) return;
    if (lastLoadedId.current === videoId) return;

    const tryLoad = () => {
      const p = playerRef.current;
      if (!p || !readyRef.current) return false;
      try {
        lastLoadedId.current = videoId;
        if (autoPlayRef.current) {
          p.loadVideoById(videoId);
          p.playVideo();
        } else {
          p.cueVideoById(videoId);
        }
        return true;
      } catch {
        return false;
      }
    };

    if (!tryLoad()) {
      // Player not ready yet — onReady will pick up videoIdRef
      const t = window.setInterval(() => {
        if (tryLoad()) window.clearInterval(t);
      }, 100);
      return () => window.clearInterval(t);
    }
  }, [videoId]);

  // Ducking volume (0–1 → 0–100). Never fully mute unless 0.
  useEffect(() => {
    const vol = Math.round(Math.max(0, Math.min(1, duckLevel)) * 100);
    lastDuck.current = vol;
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try {
      p.setVolume(vol);
      if (vol === 0) p.mute();
      else p.unMute();
    } catch {
      /* ignore */
    }
  }, [duckLevel]);

  // Remote sync for non-controller
  useEffect(() => {
    if (!remoteCommand || isController) return;
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try {
      if (remoteCommand.kind === "play") p.playVideo();
      if (remoteCommand.kind === "pause") p.pauseVideo();
      if (remoteCommand.kind === "seek" && remoteCommand.seconds != null)
        p.seekTo(remoteCommand.seconds, true);
      if (remoteCommand.kind === "load" && remoteCommand.videoId) {
        lastLoadedId.current = remoteCommand.videoId;
        p.loadVideoById(remoteCommand.videoId);
        p.playVideo();
      }
    } catch {
      /* ignore */
    }
  }, [remoteCommand, isController]);

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
        compact
          ? "aspect-video min-h-[180px] h-[200px] sm:h-[220px]"
          : "aspect-video flex-1 min-h-[240px]"
      }`}
    >
      <div ref={wrapRef} className="absolute inset-0 w-full h-full" />
      {!videoId ? (
        <div className="absolute inset-0 flex items-center justify-center text-[#9CA3AF] text-sm pointer-events-none z-10">
          Search or paste a YouTube link
        </div>
      ) : null}
    </div>
  );
}
