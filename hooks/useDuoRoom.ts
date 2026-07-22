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

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
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
  ytControllerId: string;
  ytVideoId: string | null;
  ytTitle: string;
  duckingMode: DuckingMode;
  duckLevel: number;
  localSpeaking: boolean;
  remoteSpeaking: boolean;
  lastReaction: { emoji: string; id: number } | null;
  status: string;
}

export function useDuoRoom(roomCode: string) {
  const [state, setState] = useState<DuoRoomState>(() => {
    const peerId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}`;
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
      ytControllerId: peerId,
      ytVideoId: null,
      ytTitle: "",
      duckingMode: "auto",
      duckLevel: 1,
      localSpeaking: false,
      remoteSpeaking: false,
      lastReaction: null,
      status: "Connecting…",
    };
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const politeRef = useRef(false);
  const vadRef = useRef<VadDuckingEngine | null>(null);
  const peerIdRef = useRef(state.peerId);
  const partnerIdRef = useRef<string | null>(null);
  const appHandlers = useRef(new Set<(msg: DuoAppMessage) => void>());

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  const update = useCallback((patch: Partial<DuoRoomState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const sendApp = useCallback((msg: DuoAppMessage) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(encodeAppMessage(msg));
    }
  }, []);

  const onAppMessage = useCallback((fn: (msg: DuoAppMessage) => void) => {
    appHandlers.current.add(fn);
    return () => {
      appHandlers.current.delete(fn);
    };
  }, []);

  const dispatchApp = useCallback(
    (msg: DuoAppMessage, fromRemote: boolean) => {
      if (fromRemote) {
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
      }
      for (const h of appHandlers.current) h(msg);
    },
    [update],
  );

  const ensurePc = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(ICE);
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      // Screen tracks often lack video in same stream labeling; attach all
      if (screenVideoRef.current && ev.track.kind === "video") {
        // Prefer displaying remote composite in remote bubble; screen stage uses same remote stream
        screenVideoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      update({ connection: pc.connectionState });
      if (pc.connectionState === "connected") {
        update({ status: "Connected" });
      }
    };

    pc.onicecandidate = (ev) => {
      const ch = channelRef.current;
      const to = partnerIdRef.current;
      if (!ch || !to) return;
      void ch.send({
        type: "broadcast",
        event: "signal",
        payload: {
          type: "ice",
          from: peerIdRef.current,
          to,
          candidate: ev.candidate ? ev.candidate.toJSON() : null,
        },
      });
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current = true;
        await pc.setLocalDescription(await pc.createOffer());
        const ch = channelRef.current;
        const to = partnerIdRef.current;
        if (ch && to && pc.localDescription) {
          void ch.send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "offer",
              from: peerIdRef.current,
              to,
              sdp: pc.localDescription,
            },
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        makingOffer.current = false;
      }
    };

    return pc;
  }, [update]);

  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dcRef.current = dc;
      dc.onopen = () => update({ status: "Data channel open" });
      dc.onmessage = (ev) => {
        const msg = decodeAppMessage(String(ev.data));
        if (msg) dispatchApp(msg, true);
      };
    },
    [dispatchApp, update],
  );

  const startLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = ensurePc();
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
      vadRef.current = new VadDuckingEngine();
      await vadRef.current.attachMic(stream);
      vadRef.current.subscribe((level, speaking) => {
        update({ duckLevel: level, localSpeaking: speaking });
        sendApp({ type: "speaking", active: speaking });
      });
      update({ status: "Camera ready — waiting for partner" });
    } catch (e) {
      console.error(e);
      update({ status: "Camera/mic permission denied" });
    }
  }, [ensurePc, sendApp, update]);

  useEffect(() => {
    let cancelled = false;
    const peerId = peerIdRef.current;

    async function join() {
      try {
        const supabase = getSupabaseBrowserClient();
        const channel = supabase.channel(roomChannelName(roomCode), {
          config: { presence: { key: peerId } },
        });
        channelRef.current = channel;

        channel.on("presence", { event: "sync" }, () => {
          const stateMap = channel.presenceState() as Record<
            string,
            { peerId: string; role: PeerRole; name: string }[]
          >;
          const peers = Object.values(stateMap).flat();
          const others = peers.filter((p) => p.peerId !== peerId);
          if (others.length > 1) {
            update({ status: "Room full" });
            return;
          }
          if (others[0]) {
            partnerIdRef.current = others[0].peerId;
            politeRef.current = peerId > others[0].peerId;
            const isHost =
              peers.find((p) => p.peerId === peerId)?.role === "host";
            update({
              partnerPresent: true,
              partnerName: others[0].name || "Partner",
              role: isHost ? "host" : "guest",
              status: "Partner joined — connecting…",
            });
            // Host creates data channel
            const hostPeer = peers.reduce((a, b) =>
              a.peerId < b.peerId ? a : b,
            );
            const amInitiator = hostPeer.peerId === peerId;
            const pc = ensurePc();
            if (amInitiator && !dcRef.current) {
              const dc = pc.createDataChannel("duo-app");
              setupDataChannel(dc);
            }
          } else {
            partnerIdRef.current = null;
            update({ partnerPresent: false, status: "Waiting for partner…" });
          }
        });

        channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
          const msg = payload as {
            type: string;
            from: string;
            to?: string;
            sdp?: RTCSessionDescriptionInit;
            candidate?: RTCIceCandidateInit | null;
          };
          if (msg.to && msg.to !== peerId) return;
          if (msg.from === peerId) return;

          const pc = ensurePc();
          partnerIdRef.current = msg.from;

          try {
            if (msg.type === "offer" && msg.sdp) {
              const offerCollision =
                makingOffer.current || pc.signalingState !== "stable";
              ignoreOffer.current = !politeRef.current && offerCollision;
              if (ignoreOffer.current) return;
              await pc.setRemoteDescription(msg.sdp);
              await pc.setLocalDescription(await pc.createAnswer());
              void channel.send({
                type: "broadcast",
                event: "signal",
                payload: {
                  type: "answer",
                  from: peerId,
                  to: msg.from,
                  sdp: pc.localDescription,
                },
              });
            } else if (msg.type === "answer" && msg.sdp) {
              await pc.setRemoteDescription(msg.sdp);
            } else if (msg.type === "ice" && msg.candidate) {
              try {
                await pc.addIceCandidate(msg.candidate);
              } catch (e) {
                if (!ignoreOffer.current) console.error(e);
              }
            }
          } catch (e) {
            console.error("signal error", e);
          }
        });

        const pc = ensurePc();
        pc.ondatachannel = (ev) => setupDataChannel(ev.channel);

        await channel.subscribe(async (status) => {
          if (status !== "SUBSCRIBED" || cancelled) return;
          // First presence wins host
          const existing = channel.presenceState();
          const count = Object.keys(existing).length;
          const role: PeerRole = count === 0 ? "host" : "guest";
          if (role === "guest" && count >= 1) {
            // check full after track
          }
          update({
            role,
            ytControllerId: role === "host" ? peerId : state.ytControllerId,
          });
          await channel.track({
            peerId,
            role,
            name: role === "host" ? "You" : "You",
          });
          update({
            status:
              role === "host"
                ? "Room open — share the link"
                : "Joined — connecting…",
          });
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
      dcRef.current?.close();
      pcRef.current?.close();
      pcRef.current = null;
      if (channelRef.current) {
        void getSupabaseBrowserClient().removeChannel(channelRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

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
  }, [update]);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    update({ camOn: track.enabled });
  }, [update]);

  const startScreenShare = useCallback(async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      screenStreamRef.current = screen;
      const pc = ensurePc();
      const videoTrack = screen.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc
          .getSenders()
          .find((s) => s.track?.kind === "video");
        // Add as extra track rather than replace cam when possible
        pc.addTrack(videoTrack, screen);
        for (const at of screen.getAudioTracks()) {
          pc.addTrack(at, screen);
        }
        videoTrack.onended = () => {
          update({ sharing: false, cinemaSource: "youtube" });
        };
      }
      update({ sharing: true, cinemaSource: "screen", mode: "cinema" });
      sendApp({ type: "mode.switch", mode: "cinema" });
      sendApp({ type: "cinema.source", source: "screen" });
    } catch (e) {
      console.error(e);
      update({ status: "Screen share cancelled" });
    }
  }, [ensurePc, sendApp, update]);

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
      vadRef.current?.setEnabled(mode === "auto");
    },
    [update],
  );

  const triggerTalk = useCallback(() => {
    vadRef.current?.forceDuck();
  }, []);

  const sendReaction = useCallback(
    (emoji: string) => {
      update({ lastReaction: { emoji, id: Date.now() } });
      sendApp({ type: "reaction", emoji });
    },
    [sendApp, update],
  );

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
    loadYoutube,
    takeYtControl,
    sendYt,
    sendApp,
    onAppMessage,
    setDuckingMode,
    triggerTalk,
    sendReaction,
    isYtController,
    duckLevel: state.duckLevel,
  };
}
