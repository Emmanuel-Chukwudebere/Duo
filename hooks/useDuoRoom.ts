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
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
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
  // Fixed transceivers in a deterministic order → identical m-line order on both
  // peers, forever. Tracks are swapped via replaceTrack (no renegotiation), which
  // prevents the "m-line order doesn't match" error that broke video + made screen
  // share blink, and lets camera/screen start & stop without a fresh offer.
  const transceiversRef = useRef<{
    camAudio: RTCRtpTransceiver;
    camVideo: RTCRtpTransceiver;
    screenVideo: RTCRtpTransceiver;
    screenAudio: RTCRtpTransceiver;
  } | null>(null);

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
      el.muted = false;
      void el.play().catch(() => undefined);
    }
    track.onunmute = () => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = cam;
        void remoteVideoRef.current.play().catch(() => undefined);
      }
    };
  }, []);

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
          // The actual video arrives on the screen transceiver (ontrack); this
          // just flips the stage to cinema so the incoming frame has somewhere to go.
          update({
            remoteSharing: true,
            mode: "cinema",
            cinemaSource: "screen",
          });
        }
        if (msg.type === "screen.stop") {
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

    // Pre-create a FIXED set of transceivers in a deterministic order on BOTH
    // peers. This locks the SDP m-line order so renegotiation can never fail with
    // "m-line order doesn't match". Tracks are attached later via replaceTrack —
    // which needs NO renegotiation — so camera and screen share start/stop
    // without a fresh offer (this is what stops the screen-share blinking).
    const camAudio = pc.addTransceiver("audio", { direction: "sendrecv" });
    const camVideo = pc.addTransceiver("video", {
      direction: "sendrecv",
      // Prioritize a smooth, low-latency face-cam over resolution: when bandwidth
      // is tight, drop resolution (not framerate) so the partner sees fluid motion
      // instead of a laggy, buffered feed. Cap bitrate so cam never starves screen.
      sendEncodings: [
        {
          maxBitrate: 800_000,
          maxFramerate: 30,
          scaleResolutionDownBy: 1,
          networkPriority: "high",
        },
      ],
    });
    const screenVideo = pc.addTransceiver("video", { direction: "sendrecv" });
    const screenAudio = pc.addTransceiver("audio", { direction: "sendrecv" });
    transceiversRef.current = { camAudio, camVideo, screenVideo, screenAudio };

    // Attach any already-acquired local camera tracks immediately.
    const local = localStreamRef.current;
    if (local) {
      const a = local.getAudioTracks()[0];
      const v = local.getVideoTracks()[0];
      if (a) void camAudio.sender.replaceTrack(a).catch(() => undefined);
      if (v) void camVideo.sender.replaceTrack(v).catch(() => undefined);
    }
    // Re-attach an in-progress screen share (e.g. after a PC rebuild).
    const screen = screenStreamRef.current;
    if (screen) {
      const sv = screen.getVideoTracks()[0];
      const sa = screen.getAudioTracks()[0];
      if (sv) void screenVideo.sender.replaceTrack(sv).catch(() => undefined);
      if (sa) void screenAudio.sender.replaceTrack(sa).catch(() => undefined);
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

    // Route incoming tracks by WHICH transceiver received them — reliable and
    // order-stable, unlike guessing from a "screen expected" flag.
    pc.ontrack = (ev) => {
      const tr = ev.transceiver;
      const t = transceiversRef.current;
      const track = ev.track;

      const isScreen =
        !!t && (tr === t.screenVideo || tr === t.screenAudio);

      if (isScreen) {
        const rs = remoteScreenStreamRef.current;
        // Clear stale tracks of the same kind, then add the fresh one.
        rs.getTracks()
          .filter((x) => x.kind === track.kind)
          .forEach((x) => rs.removeTrack(x));
        rs.addTrack(track);
        // A muted screen-video track means the sharer stopped (replaceTrack null).
        const hasLiveScreen = rs
          .getVideoTracks()
          .some((x) => x.readyState === "live" && !x.muted);
        track.onmute = () => update({ remoteSharing: rs.getVideoTracks().some((x) => !x.muted) });
        track.onunmute = () => {
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = rs;
            void screenVideoRef.current.play().catch(() => undefined);
          }
          update({ remoteSharing: true, mode: "cinema", cinemaSource: "screen" });
        };
        if (track.kind === "video" && screenVideoRef.current) {
          screenVideoRef.current.srcObject = rs;
          void screenVideoRef.current.play().catch(() => undefined);
        }
        if (hasLiveScreen) {
          update({ remoteSharing: true, mode: "cinema", cinemaSource: "screen" });
        }
        return;
      }

      // Otherwise it's the camera/mic.
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
      // Camera tracks are attached to fixed transceivers via replaceTrack in
      // startLocalMedia/ensurePc — no addTrack here, so m-line order stays stable.

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
      ensurePc();
      // Attach camera/mic to their fixed transceivers (no renegotiation churn).
      const tx = transceiversRef.current;
      if (tx) {
        const a = stream.getAudioTracks()[0];
        const v = stream.getVideoTracks()[0];
        if (a) await tx.camAudio.sender.replaceTrack(a).catch(() => undefined);
        if (v) await tx.camVideo.sender.replaceTrack(v).catch(() => undefined);
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

          // Ensure local camera tracks are on their transceivers before answering
          // (replaceTrack, so it never alters the m-line order set by the offer).
          const tx = transceiversRef.current;
          const local = localStreamRef.current;
          if (tx && local) {
            const a = local.getAudioTracks()[0];
            const v = local.getVideoTracks()[0];
            if (a && tx.camAudio.sender.track !== a)
              await tx.camAudio.sender.replaceTrack(a).catch(() => undefined);
            if (v && tx.camVideo.sender.track !== v)
              await tx.camVideo.sender.replaceTrack(v).catch(() => undefined);
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

  const stopScreenShare = useCallback(() => {
    // Detach from the fixed screen transceivers via replaceTrack(null) — no
    // removeTrack, so NO renegotiation and no m-line churn.
    const tx = transceiversRef.current;
    if (tx) {
      void tx.screenVideo.sender.replaceTrack(null).catch(() => undefined);
      void tx.screenAudio.sender.replaceTrack(null).catch(() => undefined);
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
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
      sendApp({ type: "screen.start" });
      sendApp({ type: "mode.switch", mode: "cinema" });
      sendApp({ type: "cinema.source", source: "screen" });

      bindLocalScreenPreview();
      requestAnimationFrame(() => {
        bindLocalScreenPreview();
        window.setTimeout(() => bindLocalScreenPreview(), 50);
        window.setTimeout(() => bindLocalScreenPreview(), 200);
        window.setTimeout(() => bindLocalScreenPreview(), 500);
      });

      // Swap the screen tracks onto their fixed transceivers — replaceTrack means
      // the partner sees it flow WITHOUT a renegotiation (no blinking).
      ensurePc();
      const tx = transceiversRef.current;
      if (tx) {
        const sv = screen.getVideoTracks()[0];
        const sa = screen.getAudioTracks()[0];
        if (sv) await tx.screenVideo.sender.replaceTrack(sv).catch(() => undefined);
        if (sa) await tx.screenAudio.sender.replaceTrack(sa).catch(() => undefined);
      }
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
    ensurePc,
    sendApp,
    stopScreenShare,
    update,
  ]);

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
    loadYoutube,
    takeYtControl,
    sendYt,
    sendApp,
    onAppMessage,
    setDuckingMode,
    triggerTalk,
    sendReaction,
    resync,
    isYtController,
    duckLevel: state.duckLevel,
    bindLocalScreenPreview,
    getLocalScreenStream: () => screenStreamRef.current,
    getRemoteScreenStream: () => remoteScreenStreamRef.current,
  };
}
