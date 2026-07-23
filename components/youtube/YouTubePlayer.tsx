"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

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
  loadVideoById: (
    id: string | { videoId: string; startSeconds?: number },
  ) => void;
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
  isMuted: () => boolean;
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
    const poll = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(poll);
        resolve();
      }
    }, 40);
  });
  return apiPromise;
}

function forcePlay(p: YtPlayer) {
  try {
    // Autoplay policies: start muted, then unmute
    p.mute();
    p.playVideo();
    window.setTimeout(() => {
      try {
        p.unMute();
        p.playVideo();
      } catch {
        /* ignore */
      }
    }, 250);
    window.setTimeout(() => {
      try {
        p.playVideo();
      } catch {
        /* ignore */
      }
    }, 600);
  } catch {
    /* ignore */
  }
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
    kind: "play" | "pause" | "seek" | "load" | "sync";
    seconds?: number;
    videoId?: string;
    playing?: boolean;
  } | null;
  compact?: boolean;
  autoPlayOnLoad?: boolean;
  /** Unique key prefix so Dinner vs Cinema don't fight one shared instance */
  instanceId?: string;
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
  instanceId = "yt",
}: YouTubePlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const videoIdRef = useRef(videoId);
  const duckRef = useRef(duckLevel);
  const isControllerRef = useRef(isController);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const lastRemoteId = useRef<number | null>(null);
  const pendingRemote = useRef<YouTubePlayerProps["remoteCommand"] | null>(null);
  const reactId = useId().replace(/:/g, "");
  const [playing, setPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  videoIdRef.current = videoId;
  duckRef.current = duckLevel;
  isControllerRef.current = isController;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;

  const applyDuck = useCallback((p: YtPlayer, level: number) => {
    const vol = Math.round(Math.max(0, Math.min(1, level)) * 100);
    try {
      p.setVolume(vol);
      if (vol === 0) p.mute();
      else if (p.isMuted?.()) {
        /* keep muted only if volume 0 */
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Recreate player whenever videoId changes — reliable autoplay (same path as Film)
  useEffect(() => {
    let destroyed = false;
    let player: YtPlayer | null = null;

    // No video: clear
    if (!videoId) {
      readyRef.current = false;
      setPlayerReady(false);
      setPlaying(false);
      if (wrapRef.current) wrapRef.current.innerHTML = "";
      playerRef.current = null;
      return;
    }

    void (async () => {
      await loadYtApi();
      if (destroyed || !wrapRef.current || !window.YT) return;

      wrapRef.current.innerHTML = "";
      const mount = document.createElement("div");
      mount.id = `yt-${instanceId}-${reactId}-${videoId}`;
      mount.style.width = "100%";
      mount.style.height = "100%";
      wrapRef.current.appendChild(mount);

      player = new window.YT.Player(mount, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          autoplay: autoPlayOnLoad ? 1 : 0,
          mute: autoPlayOnLoad ? 1 : 0, // required for autoplay in most browsers
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (e: { target: YtPlayer }) => {
            if (destroyed) return;
            readyRef.current = true;
            playerRef.current = e.target;
            setPlayerReady(true);
            applyDuck(e.target, duckRef.current);
            // Apply any remote command that arrived before the player was ready
            // (e.g. the follower loaded the page mid-playback).
            if (!isControllerRef.current && pendingRemote.current) {
              const cmd = pendingRemote.current;
              pendingRemote.current = null;
              window.setTimeout(() => applyRemote(cmd), 300);
            }
            if (autoPlayOnLoad) {
              forcePlay(e.target);
              // Unmute after start so dinner soundtrack is audible
              window.setTimeout(() => {
                try {
                  e.target.unMute();
                  applyDuck(e.target, duckRef.current);
                  e.target.playVideo();
                } catch {
                  /* ignore */
                }
              }, 400);
            }
          },
          onStateChange: (e: { data: number }) => {
            if (!window.YT || destroyed) return;
            if (e.data === window.YT.PlayerState.PLAYING) {
              setPlaying(true);
              if (isControllerRef.current) onPlayRef.current?.();
            }
            if (
              e.data === window.YT.PlayerState.PAUSED ||
              e.data === window.YT.PlayerState.ENDED
            ) {
              setPlaying(false);
              if (e.data === window.YT.PlayerState.PAUSED && isControllerRef.current) {
                onPauseRef.current?.();
              }
            }
          },
          onError: (e: { data: number }) => {
            console.warn("YouTube error", e.data);
            setPlaying(false);
          },
        },
      });
      playerRef.current = player;
    })();

    return () => {
      destroyed = true;
      readyRef.current = false;
      setPlayerReady(false);
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      if (wrapRef.current) wrapRef.current.innerHTML = "";
    };
  }, [videoId, autoPlayOnLoad, instanceId, reactId, applyDuck]);

  // Ducking
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    applyDuck(p, duckLevel);
  }, [duckLevel, applyDuck]);

  const applyRemote = useCallback(
    (cmd: NonNullable<YouTubePlayerProps["remoteCommand"]>) => {
      const p = playerRef.current;
      if (!p || !readyRef.current) return;
      try {
        if (cmd.kind === "play") forcePlay(p);
        if (cmd.kind === "pause") p.pauseVideo();
        if (cmd.kind === "seek" && cmd.seconds != null)
          p.seekTo(cmd.seconds, true);
        if (cmd.kind === "load" && cmd.videoId) {
          p.loadVideoById(cmd.videoId);
          forcePlay(p);
        }
        if (cmd.kind === "sync") {
          // Periodic reconcile from the controller's heartbeat: only seek when
          // drift is real (>1.5s) to avoid stutter, and match play/pause state.
          if (cmd.seconds != null) {
            const here = p.getCurrentTime();
            if (Math.abs(here - cmd.seconds) > 1.5) p.seekTo(cmd.seconds, true);
          }
          if (cmd.playing === true && p.getPlayerState() !== window.YT?.PlayerState.PLAYING)
            forcePlay(p);
          if (cmd.playing === false && p.getPlayerState() === window.YT?.PlayerState.PLAYING)
            p.pauseVideo();
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Remote commands (follower). If the player isn't ready yet, stash the command
  // and apply it on onReady — otherwise the first play/load is dropped forever and
  // the follower stays paused until they click play manually.
  useEffect(() => {
    if (!remoteCommand || isController) return;
    if (lastRemoteId.current === remoteCommand.id) return;
    lastRemoteId.current = remoteCommand.id;
    if (!playerRef.current || !readyRef.current) {
      pendingRemote.current = remoteCommand;
      return;
    }
    applyRemote(remoteCommand);
  }, [remoteCommand, isController, applyRemote]);

  useEffect(() => {
    if (!isController) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current || !window.YT) return;
      try {
        const st = p.getPlayerState();
        const isPlaying = st === window.YT.PlayerState.PLAYING;
        onTime?.(p.getCurrentTime(), isPlaying);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isController, onTime]);

  function togglePlay() {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try {
      if (playing) {
        p.pauseVideo();
      } else {
        forcePlay(p);
        p.unMute();
        applyDuck(p, duckRef.current);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-black border border-white/10 ${
        compact
          ? "w-full min-h-[200px] h-[220px] sm:h-[240px]"
          : "aspect-video flex-1 min-h-[260px]"
      }`}
    >
      <div
        ref={wrapRef}
        className="absolute inset-0 w-full h-full [&>iframe]:!w-full [&>iframe]:!h-full"
      />
      {!videoId ? (
        <div className="absolute inset-0 flex items-center justify-center text-[#9CA3AF] text-sm pointer-events-none z-10">
          Search or paste a YouTube link
        </div>
      ) : null}

      {/* Manual play fallback — always works with user click */}
      {videoId && isController ? (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white hover:bg-black/85"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="h-4 w-4" fill="currentColor" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
          )}
        </button>
      ) : null}

      {videoId && !playerReady ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-xs text-white/70">
          Loading player…
        </div>
      ) : null}
    </div>
  );
}
