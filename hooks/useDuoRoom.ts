"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, roomChannelName } from "@/lib/supabase/client";
import { encodeAppMessage, decodeAppMessage } from "@/lib/webrtc/messages";
import type {
  CinemaSource,
  DuoAppMessage,
  DuckingMode,
  PeerRole,
  StageMode,
} from "@/lib/types";
import { VadDuckingEngine } from "@/lib/audio/vad-ducking";

// STUN-only default. This connects peers on the SAME network, but cross-network
// calls (partners on different devices behind NATs) need a TURN relay, which is
// fetched at runtime from /api/turn (Cloudflare or any env-configured provider).
// The old hard-coded openrelay.metered.ca TURN server is dead — it returned zero
// relay candidates, which is exactly why cross-device calls hung at "connecting".
const DEFAULT_ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 4,
};

// Shared-video bitrate ceilings (receiver data ≈ rate × watch-time):
//   ultra ≈ ~55MB/hr · saver ≈ ~90MB/hr · hd ≈ ~450MB/hr
const SCREEN_BITRATE = {
  ultra: 120_000,
  saver: 200_000,
  hd: 1_000_000,
} as const;

/** Fetch ICE servers (incl. TURN relay) from the server. Falls back to STUN-only. */
async function fetchIceConfig(): Promise<RTCConfiguration> {
  try {
    const res = await fetch("/api/turn", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as {
        iceServers?: RTCIceServer[];
        relay?: boolean;
        warning?: string;
      };
      if (data.warning) console.warn("[duo] TURN:", data.warning);
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return { iceServers: data.iceServers, iceCandidatePoolSize: 4 };
      }
    }
  } catch (e) {
    console.warn("[duo] Failed to fetch ICE config, using STUN-only", e);
  }
  return DEFAULT_ICE;
}

type SignalMsg = {
  type: "offer" | "answer" | "ice" | "ready";
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
};

export interface DuoRoomState {
  peerId: string;
  role: PeerRole;
  partnerPresent: boolean;
  partnerName: string;
  mode: StageMode;
  cinemaSource: CinemaSource;
  connection: RTCPeerConnectionState | "idle";
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  remoteSharing: boolean;
  /** Bumps when local screen stream is set/cleared so UI can re-bind the preview video */
  screenPreviewKey: number;
  ytControllerId: string;
  ytVideoId: string | null;
  ytTitle: string;
  duckingMode: DuckingMode;
  duckLevel: number;
  localSpeaking: boolean;
  remoteSpeaking: boolean;
  partnerMicOn: boolean;
  partnerCamOn: boolean;
  lastReaction: { emoji: string; id: number } | null;
  status: string;
  /** True when the browser blocked audible playback of the partner's stream
   * (mobile autoplay policy) — UI shows a "Tap to hear/see partner" prompt. */
  audioBlocked: boolean;
  /** Shared-video quality tier:
   *  "ultra" ≈120kbps (~55MB/hr), "saver" ≈200kbps (~90MB/hr), "hd" ≈1Mbps (~450MB/hr). */
  screenQuality: "ultra" | "saver" | "hd";
}

export function useDuoRoom(roomCode: string) {
  const [state, setState] = useState<DuoRoomState>(() => {
    const peerId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      peerId,
      role: "host",
      partnerPresent: false,
      partnerName: "Partner",
      mode: "dinner",
      cinemaSource: "youtube",
      connection: "idle",
      micOn: true,
      camOn: true,
      sharing: false,
      remoteSharing: false,
      screenPreviewKey: 0,
      ytControllerId: peerId,
      ytVideoId: null,
      ytTitle: "",
      duckingMode: "auto",
      duckLevel: 1,
      localSpeaking: false,
      remoteSpeaking: false,
      partnerMicOn: true,
      partnerCamOn: true,
      lastReaction: null,
      status: "Connecting…",
      audioBlocked: false,
      screenQuality: "saver",
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Hidden <video> that plays a picked local file; captureStream() feeds the
  // screen transceivers so sharing a video reuses the screen-share pipeline.
  const fileVideoElRef = useRef<HTMLVideoElement | null>(null);
  const fileObjectUrlRef = useRef<string | null>(null);
  // iOS-fallback video-file capture: canvas draw loop + WebAudio for audio.
  const fileCanvasRafRef = useRef<number>(0);
  const fileAudioCtxRef = useRef<AudioContext | null>(null);
  // Lazily created on the client only. `new MediaStream()` does not exist during
  // server-side render, so initializing these inline would 500 the room page on a
  // direct link/QR load (exactly how a partner joins). All consumers of these refs
  // run client-side (effects + event handlers), after this guard has populated them.
  const remoteCamStreamRef = useRef<MediaStream>(null as unknown as MediaStream);
  const remoteScreenStreamRef = useRef<MediaStream>(null as unknown as MediaStream);
  if (typeof window !== "undefined") {
    if (!remoteCamStreamRef.current) remoteCamStreamRef.current = new MediaStream();
    if (!remoteScreenStreamRef.current)
      remoteScreenStreamRef.current = new MediaStream();
  }
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const isInitiatorRef = useRef(false);
  const vadRef = useRef<VadDuckingEngine | null>(null);
  const peerIdRef = useRef(state.peerId);
  const partnerIdRef = useRef<string | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const appHandlers = useRef(new Set<(msg: DuoAppMessage) => void>());
  const processedMsgIdsRef = useRef<Set<string>>(new Set());
  const iceConfigRef = useRef<RTCConfiguration>(DEFAULT_ICE);
  // The MediaStream id of the partner's screen share (from their screen.start).
  // ontrack routes by stream identity — race-proof, unlike a boolean flag which
  // mis-routed the screen into the camera bubble when messages/tracks raced.
  const remoteScreenStreamIdRef = useRef<string | null>(null);
  // Fallback flag for peers that don't send a streamId (older clients).
  const expectRemoteScreenRef = useRef(false);
  // Screen-share senders, created once via addTrack. To stop we replaceTrack(null)
  // and to restart replaceTrack(track) — never removeTrack — so the SDP m-line
  // ORDER never changes after the first share (removeTrack reordering m-lines was
  // the original "m-line order doesn't match" bug).
  const screenSendersRef = useRef<{
    video: RTCRtpSender | null;
    audio: RTCRtpSender | null;
  }>({ video: null, audio: null });
  // The msid (stream id) the peer's ontrack sees for our screen share. Set at the
  // first addTrack; reused for later shares (replaceTrack keeps the original msid).
  const screenMsidRef = useRef<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  const update = useCallback((patch: Partial<DuoRoomState>) => {
    setState((s) => {
      const next = { ...s, ...patch };
      stateRef.current = next;
      return next;
    });
  }, []);

  // Show "Connecting media…" only while NOT already connected. Renegotiations
  // (e.g. screen share start/stop, late offers) fire offer/answer exchanges after
  // the call is up — without this guard the status text flips back to "Connecting…"
  // forever even though the peer connection is healthy, making it look broken.
  const setConnectingStatus = useCallback(() => {
    if (pcRef.current?.connectionState === "connected") return;
    update({ status: "Connecting media…" });
  }, [update]);

  const broadcastSignal = useCallback((payload: SignalMsg) => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({
      type: "broadcast",
      event: "signal",
      payload,
    });
  }, []);

  const attachRemoteCam = useCallback((track: MediaStreamTrack) => {
    const cam = remoteCamStreamRef.current;
    if (!cam.getTracks().some((t) => t.id === track.id)) {
      cam.getTracks()
        .filter((t) => t.kind === track.kind)
        .forEach((t) => cam.removeTrack(t));
      cam.addTrack(track);
    }
    const el = remoteVideoRef.current;
    if (el) {
      if (el.srcObject !== cam) {
        el.srcObject = cam;
      }
      // Mobile autoplay policy: an UNMUTED play() without a prior user gesture
      // rejects with NotAllowedError and renders NOTHING (no video either). So
      // always start muted+inline so the picture shows, then TRY to unmute. If
      // that fails, flag audioBlocked so the UI can offer a tap-to-unmute.
      el.playsInline = true;
      el.muted = true;
      void el
        .play()
        .then(() => {
          const p = el.play();
          el.muted = false;
          return p;
        })
        .then(() => {
          // Unmuted playback succeeded (desktop or already-interacted mobile).
          if (stateRef.current.audioBlocked) update({ audioBlocked: false });
        })
        .catch(() => {
          // Unmuted blocked — keep muted so video still shows, prompt for a tap.
          el.muted = true;
          void el.play().catch(() => undefined);
          if (!stateRef.current.audioBlocked) update({ audioBlocked: true });
        });
    }
    track.onunmute = () => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = cam;
        void remoteVideoRef.current.play().catch(() => undefined);
      }
    };
  }, [update]);

  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    if (!remoteDescSetRef.current) return;
    const queued = iceQueueRef.current.splice(0);
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        console.warn("ice add failed", e);
      }
    }
  }, []);

  const sendApp = useCallback((msg: DuoAppMessage) => {
    const msgWithId = {
      ...msg,
      _id: `${peerIdRef.current}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    // 1. Send over WebRTC DataChannel if open
    const dc = dcRef.current;
    let sentViaDc = false;
    if (dc && dc.readyState === "open") {
      try {
        dc.send(encodeAppMessage(msgWithId));
        sentViaDc = true;
      } catch {
        /* ignore */
      }
    }

    // 2. Fallback / broadcast via Supabase Realtime so messages are guaranteed to reach peer
    const ch = channelRef.current;
    if (ch) {
      void ch.send({
        type: "broadcast",
        event: "app-message",
        payload: { from: peerIdRef.current, msg: msgWithId },
      });
    }
  }, []);

  const onAppMessage = useCallback((fn: (msg: DuoAppMessage) => void) => {
    appHandlers.current.add(fn);
    return () => {
      appHandlers.current.delete(fn);
    };
  }, []);

  const dispatchApp = useCallback(
    (msg: DuoAppMessage & { _id?: string }, fromRemote: boolean) => {
      if (msg._id) {
        if (processedMsgIdsRef.current.has(msg._id)) return;
        processedMsgIdsRef.current.add(msg._id);
        if (processedMsgIdsRef.current.size > 200) {
          const arr = Array.from(processedMsgIdsRef.current);
          processedMsgIdsRef.current = new Set(arr.slice(50));
        }
      }

      if (fromRemote) {
        if (msg.type === "room.sync_request") {
          sendApp({
            type: "room.sync_state",
            mode: stateRef.current.mode,
            cinemaSource: stateRef.current.cinemaSource,
            ytVideoId: stateRef.current.ytVideoId,
            ytTitle: stateRef.current.ytTitle,
            partnerMicOn: stateRef.current.micOn,
            partnerCamOn: stateRef.current.camOn,
          });
        }
        if (msg.type === "room.sync_state") {
          update({
            mode: msg.mode,
            cinemaSource: msg.cinemaSource,
            ytVideoId: msg.ytVideoId,
            ytTitle: msg.ytTitle,
            ...(msg.partnerMicOn !== undefined ? { partnerMicOn: msg.partnerMicOn } : {}),
            ...(msg.partnerCamOn !== undefined ? { partnerCamOn: msg.partnerCamOn } : {}),
          });
        }
        if (msg.type === "media.state") {
          update({
            partnerMicOn: msg.micOn,
            partnerCamOn: msg.camOn,
          });
        }
        if (msg.type === "mode.switch") update({ mode: msg.mode });
        if (msg.type === "cinema.source") update({ cinemaSource: msg.source });
        if (msg.type === "yt.load")
          update({ ytVideoId: msg.videoId, ytTitle: msg.title || "" });
        if (msg.type === "control.yt")
          update({ ytControllerId: msg.controllerId });
        if (msg.type === "speaking") {
          update({ remoteSpeaking: msg.active });
          vadRef.current?.setRemoteSpeaking(msg.active);
        }
        if (msg.type === "reaction") {
          update({
            lastReaction: { emoji: msg.emoji, id: Date.now() },
          });
        }
        if (msg.type === "screen.start") {
          // Record which inbound stream id is the screen so ontrack routes it to
          // the cinema surface (not the camera bubble). Also set the fallback flag.
          if (msg.streamId) remoteScreenStreamIdRef.current = msg.streamId;
          expectRemoteScreenRef.current = true;
          update({
            remoteSharing: true,
            mode: "cinema",
            cinemaSource: "screen",
          });
        }
        if (msg.type === "screen.stop") {
          remoteScreenStreamIdRef.current = null;
          expectRemoteScreenRef.current = false;
          // Sender detached via replaceTrack(null); clear our view of it. Don't
          // stop() the remote tracks — the transceiver is reused for the next share.
          remoteScreenStreamRef.current
            .getTracks()
            .forEach((t) => remoteScreenStreamRef.current.removeTrack(t));
          if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
          update({ remoteSharing: false });
        }
      }
      for (const h of appHandlers.current) h(msg);
    },
    [sendApp, update],
  );

  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dcRef.current = dc;
      dc.binaryType = "arraybuffer";
      dc.onopen = () => {
        update({ status: "Connected with partner" });
        sendApp({ type: "room.sync_request" });
      };
      dc.onclose = () => {
        if (partnerIdRef.current) {
          update({ status: "Partner link dropped — reconnecting…" });
        }
      };
      dc.onmessage = (ev) => {
        const msg = decodeAppMessage(String(ev.data));
        if (msg) dispatchApp(msg, true);
      };
    },
    [dispatchApp, sendApp, update],
  );

  const ensurePc = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(iceConfigRef.current);
    pcRef.current = pc;
    remoteDescSetRef.current = false;
    iceQueueRef.current = [];

    // Add local camera tracks with addTrack (NOT addTransceiver). addTrack makes
    // the browser create a correctly-directioned sendrecv transceiver and, on the
    // answering side, associate the local track with the offer's m-line so BOTH
    // peers actually SEND. (The previous addTransceiver-on-both-peers design
    // negotiated but sent 0 bytes — connected yet black.)
    const local = localStreamRef.current;
    if (local) {
      for (const track of local.getTracks()) {
        const has = pc.getSenders().some((s) => s.track?.id === track.id);
        if (!has) pc.addTrack(track, local);
      }
    }

    pc.onnegotiationneeded = () => {
      if (
        isInitiatorRef.current &&
        partnerIdRef.current &&
        pc.signalingState === "stable" &&
        !makingOffer.current
      ) {
        void createAndSendOffer();
      }
    };

    // Route incoming tracks by STREAM IDENTITY (race-proof): the sender added the
    // screen tracks to a stream whose id it signalled via screen.start. If this
    // track belongs to that stream → screen; else → camera. Falls back to the
    // expect-flag only when no streamId was signalled (older clients).
    pc.ontrack = (ev) => {
      const track = ev.track;
      const streamId = ev.streams[0]?.id;
      const isScreen =
        (remoteScreenStreamIdRef.current != null &&
          streamId === remoteScreenStreamIdRef.current) ||
        (remoteScreenStreamIdRef.current == null && expectRemoteScreenRef.current);

      if (isScreen) {
        const screen = remoteScreenStreamRef.current;
        screen
          .getTracks()
          .filter((t) => t.kind === track.kind)
          .forEach((t) => screen.removeTrack(t));
        screen.addTrack(track);
        expectRemoteScreenRef.current = false;
        if (track.kind === "video" && screenVideoRef.current) {
          screenVideoRef.current.srcObject = screen;
          void screenVideoRef.current.play().catch(() => undefined);
        }
        update({
          remoteSharing: true,
          mode: "cinema",
          cinemaSource: "screen",
        });
        return;
      }

      // Camera / mic.
      attachRemoteCam(track);
      if (track.kind === "video") update({ status: "Connected with partner" });
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      update({ connection: st });
      if (st === "connected") {
        update({ status: "Connected with partner" });
      } else if (st === "connecting") {
        update({ status: "Connecting media…" });
      } else if (st === "failed") {
        update({ status: "Connection failed — retrying network…" });
        try {
          void pc.restartIce();
        } catch {
          /* ignore */
        }
      } else if (st === "disconnected") {
        update({ status: "Partner disconnected…" });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === "connected" ||
        pc.iceConnectionState === "completed"
      ) {
        update({ status: "Connected with partner" });
      }
      if (pc.iceConnectionState === "failed") {
        update({ status: "Network blocked — retrying ICE…" });
        try {
          void pc.restartIce();
        } catch {
          /* ignore */
        }
      }
    };

    pc.onicecandidate = (ev) => {
      const to = partnerIdRef.current;
      if (!to) return;
      broadcastSignal({
        type: "ice",
        from: peerIdRef.current,
        to,
        candidate: ev.candidate ? ev.candidate.toJSON() : null,
      });
    };

    pc.ondatachannel = (ev) => {
      setupDataChannel(ev.channel);
    };

    return pc;
  }, [attachRemoteCam, broadcastSignal, setupDataChannel, update]);

  /** Explicit offer */
  const createAndSendOffer = useCallback(async () => {
    const pc = ensurePc();
    const to = partnerIdRef.current;
    if (!to || makingOffer.current) return;
    if (pc.signalingState !== "stable") return;

    try {
      makingOffer.current = true;
      // Make sure local camera tracks are attached before offering (addTrack).
      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) {
          const has = pc.getSenders().some((s) => s.track?.id === track.id);
          if (!has) pc.addTrack(track, local);
        }
      }

      if (isInitiatorRef.current && !dcRef.current) {
        const dc = pc.createDataChannel("duo-app", { ordered: true });
        setupDataChannel(dc);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      broadcastSignal({
        type: "offer",
        from: peerIdRef.current,
        to,
        sdp: pc.localDescription ?? offer,
      });
      setConnectingStatus();
    } catch (e) {
      console.error("createOffer failed", e);
      update({ status: "Could not start call — retrying…" });
    } finally {
      makingOffer.current = false;
    }
  }, [broadcastSignal, ensurePc, setConnectingStatus, setupDataChannel, update]);

  const startLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Constrain capture to 720p/30 — smaller frames encode faster and cut the
        // partner-cam latency. Ideal (not exact) so devices pick their best match.
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      localStreamRef.current = stream;
      // Tell the encoder this is a talking-head: favor smooth motion over crispness,
      // which meaningfully reduces the partner-cam latency the user reported.
      const camTrack = stream.getVideoTracks()[0];
      if (camTrack) {
        try {
          camTrack.contentHint = "motion";
        } catch {
          /* optional */
        }
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play().catch(() => undefined);
      }
      const pc = ensurePc();
      // Attach camera/mic via addTrack so both peers actually send media.
      for (const track of stream.getTracks()) {
        const already = pc.getSenders().some((s) => s.track?.id === track.id);
        if (!already) pc.addTrack(track, stream);
      }
      vadRef.current = new VadDuckingEngine();
      await vadRef.current.attachMic(stream);
      vadRef.current.subscribe((level, speaking) => {
        update({ duckLevel: level, localSpeaking: speaking });
        sendApp({ type: "speaking", active: speaking });
      });

      if (partnerIdRef.current) {
        update({ status: "Partner here — connecting media…" });
        if (isInitiatorRef.current) {
          void createAndSendOffer();
        } else {
          broadcastSignal({
            type: "ready",
            from: peerIdRef.current,
            to: partnerIdRef.current,
          });
        }
      } else {
        update({ status: "Camera ready — share the link" });
      }
    } catch (e) {
      console.error(e);
      update({ status: "Camera/mic permission denied" });
    }
  }, [
    broadcastSignal,
    createAndSendOffer,
    ensurePc,
    sendApp,
    update,
  ]);

  const handleSignal = useCallback(
    async (msg: SignalMsg) => {
      if (msg.from === peerIdRef.current) return;
      if (msg.to && msg.to !== peerIdRef.current) return;

      partnerIdRef.current = msg.from;
      const pc = ensurePc();

      try {
        if (msg.type === "ready") {
          if (isInitiatorRef.current) {
            void createAndSendOffer();
          }
          return;
        }

        if (msg.type === "offer" && msg.sdp) {
          const offerCollision =
            makingOffer.current || pc.signalingState !== "stable";
          const polite = !isInitiatorRef.current;
          ignoreOffer.current = !polite && offerCollision;
          if (ignoreOffer.current) return;

          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }),
              pc.setRemoteDescription(msg.sdp),
            ]);
          } else {
            await pc.setRemoteDescription(msg.sdp);
          }
          remoteDescSetRef.current = true;
          await flushIce(pc);

          // Attach local camera tracks BEFORE answering so the answer advertises
          // sendrecv and this peer actually sends media (addTrack, not transceiver).
          const local = localStreamRef.current;
          if (local) {
            for (const track of local.getTracks()) {
              const has = pc.getSenders().some((s) => s.track?.id === track.id);
              if (!has) pc.addTrack(track, local);
            }
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          broadcastSignal({
            type: "answer",
            from: peerIdRef.current,
            to: msg.from,
            sdp: pc.localDescription ?? answer,
          });
          setConnectingStatus();
        } else if (msg.type === "answer" && msg.sdp) {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(msg.sdp);
            remoteDescSetRef.current = true;
            await flushIce(pc);
            setConnectingStatus();
          }
        } else if (msg.type === "ice") {
          if (msg.candidate) {
            if (!remoteDescSetRef.current) {
              iceQueueRef.current.push(msg.candidate);
            } else {
              try {
                await pc.addIceCandidate(msg.candidate);
              } catch (e) {
                if (!ignoreOffer.current) console.warn(e);
              }
            }
          }
        }
      } catch (e) {
        console.error("signal error", e);
        update({ status: "Signaling error — retrying connection…" });
      }
    },
    [
      broadcastSignal,
      createAndSendOffer,
      ensurePc,
      flushIce,
      setConnectingStatus,
      update,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const peerId = peerIdRef.current;

    async function join() {
      try {
        // Load ICE servers (incl. TURN relay) before any PeerConnection is built,
        // so cross-network peers have a relay path from the very first offer.
        iceConfigRef.current = await fetchIceConfig();
        if (cancelled) return;

        const supabase = getSupabaseBrowserClient();
        const channel = supabase.channel(roomChannelName(roomCode), {
          config: {
            broadcast: { self: false, ack: false },
            presence: { key: peerId },
          },
        });
        channelRef.current = channel;

        channel.on("broadcast", { event: "signal" }, ({ payload }) => {
          void handleSignal(payload as SignalMsg);
        });

        channel.on("broadcast", { event: "app-message" }, ({ payload }) => {
          if (
            payload &&
            typeof payload === "object" &&
            "msg" in payload &&
            "from" in payload
          ) {
            if (payload.from !== peerIdRef.current) {
              dispatchApp(
                payload.msg as DuoAppMessage & { _id?: string },
                true,
              );
            }
          }
        });

        channel.on("presence", { event: "sync" }, () => {
          const stateMap = channel.presenceState() as Record<
            string,
            { peerId: string; role: PeerRole; name: string }[]
          >;
          const peers = Object.values(stateMap).flat();
          const unique = new Map<string, (typeof peers)[0]>();
          for (const p of peers) unique.set(p.peerId, p);
          const list = [...unique.values()];
          const others = list.filter((p) => p.peerId !== peerId);

          if (others.length > 1) {
            update({ status: "Room full (2 max)" });
            return;
          }

          if (others[0]) {
            const partnerId = others[0].peerId;
            partnerIdRef.current = partnerId;
            isInitiatorRef.current = peerId < partnerId;
            const isHost =
              list.find((p) => p.peerId === peerId)?.role === "host";

            update({
              partnerPresent: true,
              partnerName: others[0].name || "Partner",
              role: isHost ? "host" : "guest",
              status: localStreamRef.current
                ? "Partner joined — connecting media…"
                : "Partner joined — starting camera…",
            });

            ensurePc();
            sendApp({ type: "room.sync_request" });

            if (localStreamRef.current) {
              if (isInitiatorRef.current) {
                window.setTimeout(() => {
                  if (!cancelled && partnerIdRef.current === partnerId) {
                    void createAndSendOffer();
                  }
                }, 300);
              } else {
                broadcastSignal({
                  type: "ready",
                  from: peerId,
                  to: partnerId,
                });
              }
            }
          } else {
            partnerIdRef.current = null;
            isInitiatorRef.current = false;
            remoteDescSetRef.current = false;
            update({
              partnerPresent: false,
              status: localStreamRef.current
                ? "Camera ready — share the link"
                : "Waiting for partner…",
            });
          }
        });

        const subStatus = await new Promise<string>((resolve) => {
          void channel.subscribe((status) => {
            if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") {
              resolve(status);
            }
          });
        });

        if (cancelled) return;
        if (subStatus !== "SUBSCRIBED") {
          update({ status: "Realtime channel error — check Supabase keys" });
          return;
        }

        const existing = channel.presenceState();
        const count = Object.keys(existing).length;
        const role: PeerRole = count === 0 ? "host" : "guest";
        update({
          role,
          ytControllerId: role === "host" ? peerId : state.ytControllerId,
        });

        await channel.track({
          peerId,
          role,
          name: "You",
        });

        update({
          status:
            role === "host"
              ? "Room open — share the link"
              : "Joined — connecting…",
        });

        await startLocalMedia();
      } catch (e) {
        console.error(e);
        update({
          status:
            e instanceof Error ? e.message : "Failed to connect to room",
        });
      }
    }

    void join();

    return () => {
      cancelled = true;
      vadRef.current?.detach();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        dcRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
      dcRef.current = null;
      if (channelRef.current) {
        void getSupabaseBrowserClient().removeChannel(channelRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Heartbeat / self-healing signaling retry when partner present but media not connected
  useEffect(() => {
    let retryCount = 0;
    const interval = setInterval(() => {
      if (!partnerIdRef.current) {
        retryCount = 0;
        return;
      }
      const pc = pcRef.current;
      const connState = pc?.connectionState;

      if (connState === "connected") {
        retryCount = 0;
        return;
      }

      retryCount++;

      // After ~9s of failed connection, tear down PC completely and start fresh.
      // This fixes the case where an answer was lost and the PC is stuck
      // in "have-local-offer" signaling state forever.
      if (retryCount > 3 && pc) {
        try { pc.close(); } catch { /* ignore */ }
        pcRef.current = null;
        dcRef.current = null;
        remoteDescSetRef.current = false;
        iceQueueRef.current = [];
        makingOffer.current = false;
        ignoreOffer.current = false;
        update({ status: "Retrying connection…" });
      }

      if (isInitiatorRef.current) {
        // createAndSendOffer calls ensurePc() which will create a fresh PC
        // if we just tore it down above
        if (!makingOffer.current) {
          void createAndSendOffer();
        }
      } else {
        // Non-initiator: ensure PC exists and send ready signal
        ensurePc();
        broadcastSignal({
          type: "ready",
          from: peerIdRef.current,
          to: partnerIdRef.current,
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [broadcastSignal, createAndSendOffer, ensurePc, update]);

  // Re-bind remote video element if ref mounts late
  useEffect(() => {
    const cam = remoteCamStreamRef.current;
    if (remoteVideoRef.current && cam.getTracks().length > 0) {
      if (remoteVideoRef.current.srcObject !== cam) {
        remoteVideoRef.current.srcObject = cam;
      }
      void remoteVideoRef.current.play().catch(() => undefined);
    }
  });

  // The FIRST user interaction anywhere in the room is a valid gesture to unmute
  // the partner's audio (mobile autoplay policy). This makes audio "just work"
  // after the user's first tap without them having to find a special button.
  useEffect(() => {
    const onFirstGesture = () => {
      const el = remoteVideoRef.current;
      if (el && el.srcObject) {
        el.muted = false;
        void el
          .play()
          .then(() => {
            if (stateRef.current.audioBlocked) update({ audioBlocked: false });
          })
          .catch(() => {
            el.muted = true;
            void el.play().catch(() => undefined);
          });
      }
    };
    window.addEventListener("pointerdown", onFirstGesture);
    window.addEventListener("touchstart", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [update]);

  const setMode = useCallback(
    (mode: StageMode) => {
      update({ mode });
      sendApp({ type: "mode.switch", mode });
    },
    [sendApp, update],
  );

  const setCinemaSource = useCallback(
    (source: CinemaSource) => {
      update({ cinemaSource: source });
      sendApp({ type: "cinema.source", source });
    },
    [sendApp, update],
  );

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    update({ micOn: track.enabled });
    sendApp({
      type: "media.state",
      micOn: track.enabled,
      camOn: stateRef.current.camOn,
    });
  }, [sendApp, update]);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    update({ camOn: track.enabled });
    sendApp({
      type: "media.state",
      micOn: stateRef.current.micOn,
      camOn: track.enabled,
    });
  }, [sendApp, update]);

  const bindLocalScreenPreview = useCallback(() => {
    const el = screenVideoRef.current;
    const stream = screenStreamRef.current;
    if (!el || !stream) return false;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.muted = true;
    el.playsInline = true;
    void el.play().catch(() => undefined);
    return true;
  }, []);

  // Push a screen/video stream to the peer. First time: addTrack (needs one
  // renegotiation). Subsequent shares: replaceTrack onto the SAME senders (no
  // renegotiation, no m-line reorder). Applies the data-saver bitrate cap.
  const pushScreenStream = useCallback(
    async (stream: MediaStream) => {
      const pc = ensurePc();
      const sv = stream.getVideoTracks()[0] || null;
      const sa = stream.getAudioTracks()[0] || null;
      const senders = screenSendersRef.current;

      // Remember the msid the peer will see (set once, at first addTrack).
      if (!screenMsidRef.current) screenMsidRef.current = stream.id;

      if (senders.video) {
        await senders.video.replaceTrack(sv).catch(() => undefined);
      } else if (sv) {
        senders.video = pc.addTrack(sv, stream);
      }
      if (senders.audio) {
        await senders.audio.replaceTrack(sa).catch(() => undefined);
      } else if (sa) {
        senders.audio = pc.addTrack(sa, stream);
      }

      // Tell the peer which inbound stream id is the screen (race-proof routing).
      sendApp({ type: "screen.start", streamId: screenMsidRef.current });

      // Apply the current quality cap to the screen video sender.
      if (senders.video) {
        try {
          const params = senders.video.getParameters();
          if (!params.encodings || params.encodings.length === 0)
            params.encodings = [{}];
          params.encodings[0]!.maxBitrate =
            SCREEN_BITRATE[stateRef.current.screenQuality] ?? SCREEN_BITRATE.saver;
          void senders.video.setParameters(params).catch(() => undefined);
        } catch {
          /* ignore */
        }
      }

      // Sharer re-offers so the new sendrecv screen m-line is negotiated.
      if (isInitiatorRef.current || partnerIdRef.current) {
        void createAndSendOffer();
      }
    },
    [createAndSendOffer, ensurePc, sendApp],
  );

  const stopScreenShare = useCallback(() => {
    // Detach via replaceTrack(null) on the persistent senders — no removeTrack,
    // so NO m-line reorder. The senders stay for the next share.
    const senders = screenSendersRef.current;
    void senders.video?.replaceTrack(null).catch(() => undefined);
    void senders.audio?.replaceTrack(null).catch(() => undefined);
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    // Tear down the iOS canvas-capture loop + WebAudio graph, if used.
    if (fileCanvasRafRef.current) {
      cancelAnimationFrame(fileCanvasRafRef.current);
      fileCanvasRafRef.current = 0;
    }
    if (fileAudioCtxRef.current) {
      void fileAudioCtxRef.current.close().catch(() => undefined);
      fileAudioCtxRef.current = null;
    }
    // Tear down a shared video file, if that's what was playing.
    if (fileVideoElRef.current) {
      try {
        fileVideoElRef.current.pause();
        fileVideoElRef.current.removeAttribute("src");
        fileVideoElRef.current.load();
      } catch {
        /* ignore */
      }
      fileVideoElRef.current = null;
    }
    if (fileObjectUrlRef.current) {
      URL.revokeObjectURL(fileObjectUrlRef.current);
      fileObjectUrlRef.current = null;
    }
    if (screenVideoRef.current) {
      const remoteScreen = remoteScreenStreamRef.current;
      if (remoteScreen.getVideoTracks().length > 0) {
        screenVideoRef.current.srcObject = remoteScreen;
        screenVideoRef.current.muted = false;
        void screenVideoRef.current.play().catch(() => undefined);
      } else {
        screenVideoRef.current.srcObject = null;
      }
    }
    update({ sharing: false, screenPreviewKey: Date.now() });
    sendApp({ type: "screen.stop" });
  }, [sendApp, update]);

  const startScreenShare = useCallback(async () => {
    // getDisplayMedia does not exist in mobile browsers — screen capture from a
    // phone is impossible on the web. Tell the user instead of silently failing.
    if (!navigator.mediaDevices?.getDisplayMedia) {
      update({
        status: "Screen sharing works on desktop only — your partner can share to you",
      });
      return;
    }
    try {
      if (screenStreamRef.current) stopScreenShare();
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
        } as MediaTrackConstraints,
        audio: true,
      });
      screenStreamRef.current = screen;
      const videoTrack = screen.getVideoTracks()[0];
      if (videoTrack) {
        try {
          videoTrack.contentHint = "detail";
        } catch {
          /* optional */
        }
      }

      update({
        sharing: true,
        cinemaSource: "screen",
        mode: "cinema",
        status: "Sharing screen — preview active",
        screenPreviewKey: Date.now(),
      });
      // screen.start (with the msid) is sent by pushScreenStream below.
      sendApp({ type: "mode.switch", mode: "cinema" });
      sendApp({ type: "cinema.source", source: "screen" });

      bindLocalScreenPreview();
      requestAnimationFrame(() => {
        bindLocalScreenPreview();
        window.setTimeout(() => bindLocalScreenPreview(), 50);
        window.setTimeout(() => bindLocalScreenPreview(), 200);
        window.setTimeout(() => bindLocalScreenPreview(), 500);
      });

      await pushScreenStream(screen);
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
          update({ cinemaSource: "youtube" });
        };
      }
    } catch {
      update({ status: "Screen share cancelled" });
    }
  }, [
    bindLocalScreenPreview,
    pushScreenStream,
    sendApp,
    stopScreenShare,
    update,
  ]);

  // Share a picked local VIDEO FILE by capturing its playback and streaming it to
  // the partner over the screen transceivers (Approach A: capped live stream — no
  // server, no full-file transfer; data ≈ bitrate × watch-time). Works phone→phone.
  const shareVideoFile = useCallback(
    async (file: File) => {
      try {
        if (screenStreamRef.current) stopScreenShare();

        const url = URL.createObjectURL(file);
        fileObjectUrlRef.current = url;

        const vid = document.createElement("video");
        vid.src = url;
        vid.playsInline = true;
        vid.loop = false;
        vid.muted = false;
        fileVideoElRef.current = vid;

        await new Promise<void>((resolve, reject) => {
          vid.onloadedmetadata = () => resolve();
          vid.onerror = () => reject(new Error("Could not read that video"));
        });
        await vid.play().catch(() => undefined);

        // 1) Try native element captureStream (desktop/Android — carries audio).
        type Capturable = HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };
        const cap = vid as Capturable;
        let stream: MediaStream | null =
          cap.captureStream?.() ?? cap.mozCaptureStream?.() ?? null;

        // 2) iOS Safari has no element captureStream → CANVAS fallback: draw video
        //    frames to a canvas and capture that (video track), plus best-effort
        //    WebAudio for the audio track (may be silent on iOS — picture still works).
        if (!stream || stream.getVideoTracks().length === 0) {
          const canvas = document.createElement("canvas");
          canvas.width = vid.videoWidth || 1280;
          canvas.height = vid.videoHeight || 720;
          const cctx = canvas.getContext("2d");
          const draw = () => {
            if (!fileVideoElRef.current) return;
            try {
              cctx?.drawImage(vid, 0, 0, canvas.width, canvas.height);
            } catch {
              /* frame not ready */
            }
            fileCanvasRafRef.current = requestAnimationFrame(draw);
          };
          draw();
          type CanvasCap = HTMLCanvasElement & {
            captureStream?: (fps?: number) => MediaStream;
          };
          const canvasStream = (canvas as CanvasCap).captureStream?.(30);
          if (!canvasStream) throw new Error("captureStream unsupported");
          stream = canvasStream;
          // Best-effort audio via WebAudio (iOS may yield silence — acceptable).
          try {
            const Ctx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
            const actx = new Ctx();
            fileAudioCtxRef.current = actx;
            if (actx.state === "suspended") await actx.resume();
            const src = actx.createMediaElementSource(vid);
            const dest = actx.createMediaStreamDestination();
            src.connect(dest);
            src.connect(actx.destination); // keep it audible locally
            const at = dest.stream.getAudioTracks()[0];
            if (at) stream.addTrack(at);
          } catch {
            /* audio capture unsupported — share video only */
          }
        }
        screenStreamRef.current = stream;

        update({
          sharing: true,
          cinemaSource: "screen",
          mode: "cinema",
          status: "Sharing a video — partner is watching",
          screenPreviewKey: Date.now(),
        });
        // screen.start (with the msid) is sent by pushScreenStream below.
        sendApp({ type: "mode.switch", mode: "cinema" });
        sendApp({ type: "cinema.source", source: "screen" });

        bindLocalScreenPreview();
        requestAnimationFrame(() => {
          bindLocalScreenPreview();
          window.setTimeout(() => bindLocalScreenPreview(), 200);
          window.setTimeout(() => bindLocalScreenPreview(), 600);
        });

        await pushScreenStream(stream);
        // When the file finishes, stop sharing and go back to YouTube.
        vid.onended = () => {
          stopScreenShare();
          update({ cinemaSource: "youtube" });
        };
      } catch (e) {
        // Clean up a half-open attempt.
        if (fileCanvasRafRef.current) {
          cancelAnimationFrame(fileCanvasRafRef.current);
          fileCanvasRafRef.current = 0;
        }
        if (fileAudioCtxRef.current) {
          void fileAudioCtxRef.current.close().catch(() => undefined);
          fileAudioCtxRef.current = null;
        }
        if (fileObjectUrlRef.current) {
          URL.revokeObjectURL(fileObjectUrlRef.current);
          fileObjectUrlRef.current = null;
        }
        fileVideoElRef.current = null;
        update({
          status:
            e instanceof Error && e.message === "captureStream unsupported"
              ? "This browser can't share a video file — try Chrome, Safari 11+, or Android"
              : "Couldn't share that video",
        });
      }
    },
    [bindLocalScreenPreview, pushScreenStream, sendApp, stopScreenShare, update],
  );

  // Live-adjust the shared-video sender bitrate without renegotiation.
  const setScreenQuality = useCallback(
    (quality: "ultra" | "saver" | "hd") => {
      update({ screenQuality: quality });
      const sender = screenSendersRef.current.video;
      if (!sender) return;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0]!.maxBitrate = SCREEN_BITRATE[quality];
        params.encodings[0]!.maxFramerate = 30;
        void sender.setParameters(params).catch(() => undefined);
      } catch {
        /* setParameters unsupported — ignore */
      }
    },
    [update],
  );

  const loadYoutube = useCallback(
    (videoId: string, title?: string) => {
      update({ ytVideoId: videoId, ytTitle: title || "" });
      sendApp({ type: "yt.load", videoId, title });
    },
    [sendApp, update],
  );

  const takeYtControl = useCallback(() => {
    update({ ytControllerId: peerIdRef.current });
    sendApp({ type: "control.yt", controllerId: peerIdRef.current });
  }, [sendApp, update]);

  const sendYt = useCallback(
    (msg: DuoAppMessage) => {
      sendApp(msg);
      dispatchApp(msg, false);
    },
    [dispatchApp, sendApp],
  );

  // Live WebRTC diagnostics for the on-screen Connection info panel. Lets us see,
  // from the ACTUAL failing device, whether relay candidates exist and whether
  // inbound video/audio bytes are really arriving — instead of guessing.
  const getDiagnostics = useCallback(async () => {
    const pc = pcRef.current;
    const remoteCam = remoteCamStreamRef.current;
    const base = {
      partnerPresent: stateRef.current.partnerPresent,
      role: stateRef.current.role,
      isInitiator: isInitiatorRef.current,
      connection: pc?.connectionState ?? "no-pc",
      ice: pc?.iceConnectionState ?? "no-pc",
      signaling: pc?.signalingState ?? "no-pc",
      dataChannel: dcRef.current?.readyState ?? "none",
      remoteCamTracks: remoteCam?.getTracks().length ?? 0,
      remoteVideoDims: remoteVideoRef.current
        ? `${remoteVideoRef.current.videoWidth}x${remoteVideoRef.current.videoHeight}`
        : "no-el",
      remoteMuted: remoteVideoRef.current?.muted ?? null,
    };
    if (!pc) return { ...base, note: "No peer connection yet" };

    let inboundVideo = 0;
    let inboundAudio = 0;
    let candidatePair = "";
    let localType = "";
    let remoteType = "";
    try {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "video")
          inboundVideo += r.bytesReceived || 0;
        if (r.type === "inbound-rtp" && r.kind === "audio")
          inboundAudio += r.bytesReceived || 0;
        if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
          candidatePair = "succeeded";
        }
      });
      stats.forEach((r) => {
        if (r.type === "local-candidate" && candidatePair && !localType)
          localType = r.candidateType || "";
        if (r.type === "remote-candidate" && candidatePair && !remoteType)
          remoteType = r.candidateType || "";
      });
    } catch {
      /* getStats unsupported */
    }
    return {
      ...base,
      inboundVideoBytes: inboundVideo,
      inboundAudioBytes: inboundAudio,
      videoFlowing: inboundVideo > 0,
      audioFlowing: inboundAudio > 0,
      candidatePair: candidatePair || "none-succeeded",
      pathUsingRelay: localType === "relay" || remoteType === "relay",
      localCandidateType: localType || "?",
      remoteCandidateType: remoteType || "?",
    };
  }, []);

  const setDuckingMode = useCallback(
    (mode: DuckingMode) => {
      update({ duckingMode: mode });
      if (!vadRef.current) {
        vadRef.current = new VadDuckingEngine();
        vadRef.current.subscribe((level, speaking) => {
          update({ duckLevel: level, localSpeaking: speaking });
        });
      }
      vadRef.current.setEnabled(mode === "auto");
    },
    [update],
  );

  const triggerTalk = useCallback(() => {
    if (!vadRef.current) {
      vadRef.current = new VadDuckingEngine();
      vadRef.current.subscribe((level, speaking) => {
        update({ duckLevel: level, localSpeaking: speaking });
      });
    }
    vadRef.current.forceDuck(2200);
    sendApp({ type: "speaking", active: true });
    window.setTimeout(() => {
      sendApp({ type: "speaking", active: false });
    }, 2000);
    update({ localSpeaking: true, status: "Talk — media ducked" });
    window.setTimeout(() => {
      update({ localSpeaking: false });
    }, 2200);
  }, [sendApp, update]);

  const sendReaction = useCallback(
    (emoji: string) => {
      update({ lastReaction: { emoji, id: Date.now() } });
      sendApp({ type: "reaction", emoji });
    },
    [sendApp, update],
  );

  // Called from a user gesture (tap) to satisfy the mobile autoplay policy and
  // turn the partner's audio on. Clears the audioBlocked prompt on success.
  const unmuteRemote = useCallback(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.muted = false;
    void el
      .play()
      .then(() => update({ audioBlocked: false }))
      .catch(() => {
        el.muted = true;
        void el.play().catch(() => undefined);
      });
  }, [update]);

  const resync = useCallback(() => {
    if (partnerIdRef.current) {
      update({ status: "Re-syncing with partner…" });

      // Full teardown — restartIce() alone can't recover a stuck
      // signalingState (e.g. "have-local-offer" from a lost answer).
      try { pcRef.current?.close(); } catch { /* ignore */ }
      pcRef.current = null;
      dcRef.current = null;
      remoteDescSetRef.current = false;
      iceQueueRef.current = [];
      makingOffer.current = false;
      ignoreOffer.current = false;

      if (isInitiatorRef.current) {
        void createAndSendOffer();
      } else {
        ensurePc();
        broadcastSignal({
          type: "ready",
          from: peerIdRef.current,
          to: partnerIdRef.current,
        });
      }
      sendApp({ type: "room.sync_request" });
    } else {
      update({ status: "Waiting for partner…" });
    }
  }, [broadcastSignal, createAndSendOffer, ensurePc, sendApp, update]);

  const isYtController = state.ytControllerId === state.peerId;

  return {
    state,
    localVideoRef,
    remoteVideoRef,
    screenVideoRef,
    setMode,
    setCinemaSource,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    shareVideoFile,
    setScreenQuality,
    loadYoutube,
    takeYtControl,
    sendYt,
    sendApp,
    onAppMessage,
    setDuckingMode,
    triggerTalk,
    sendReaction,
    unmuteRemote,
    getDiagnostics,
    resync,
    isYtController,
    duckLevel: state.duckLevel,
    bindLocalScreenPreview,
    getLocalScreenStream: () => screenStreamRef.current,
    getRemoteScreenStream: () => remoteScreenStreamRef.current,
  };
}
