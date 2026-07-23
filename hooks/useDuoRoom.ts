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
  /** Partner is sending a screen track */
  remoteSharing: boolean;
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
      remoteSharing: false,
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
  const remoteCamStreamRef = useRef<MediaStream>(new MediaStream());
  const remoteScreenStreamRef = useRef<MediaStream>(new MediaStream());
  const screenSendersRef = useRef<RTCRtpSender[]>([]);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const politeRef = useRef(false);
  const vadRef = useRef<VadDuckingEngine | null>(null);
  const peerIdRef = useRef(state.peerId);
  const partnerIdRef = useRef<string | null>(null);
  const appHandlers = useRef(new Set<(msg: DuoAppMessage) => void>());
  /** Next remote video track should be treated as screen share */
  const expectRemoteScreenRef = useRef(false);

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
        if (msg.type === "screen.start") {
          expectRemoteScreenRef.current = true;
          update({
            remoteSharing: true,
            mode: "cinema",
            cinemaSource: "screen",
          });
        }
        if (msg.type === "screen.stop") {
          expectRemoteScreenRef.current = false;
          remoteScreenStreamRef.current.getTracks().forEach((t) => {
            remoteScreenStreamRef.current.removeTrack(t);
            t.stop();
          });
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
          }
          update({ remoteSharing: false });
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
      const track = ev.track;
      track.onunmute = () => {
        /* ensure playback after renegotiation */
      };

      if (track.kind === "audio") {
        // Prefer attaching remote mic audio to the cam stream (bubble)
        const cam = remoteCamStreamRef.current;
        if (!cam.getAudioTracks().includes(track)) {
          // Screen-share audio often arrives after screen video — if we already
          // have mic audio and expect/have screen, put extra audio on screen stream
          if (
            cam.getAudioTracks().length > 0 &&
            (expectRemoteScreenRef.current ||
              remoteScreenStreamRef.current.getVideoTracks().length > 0)
          ) {
            const screen = remoteScreenStreamRef.current;
            if (!screen.getAudioTracks().includes(track)) screen.addTrack(track);
            if (screenVideoRef.current) {
              screenVideoRef.current.srcObject = screen;
              void screenVideoRef.current.play().catch(() => undefined);
            }
          } else {
            cam.addTrack(track);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = cam;
              void remoteVideoRef.current.play().catch(() => undefined);
            }
          }
        }
        return;
      }

      if (track.kind === "video") {
        const cam = remoteCamStreamRef.current;
        const hasCamVideo = cam.getVideoTracks().length > 0;
        const isScreen =
          expectRemoteScreenRef.current ||
          hasCamVideo ||
          track.contentHint === "detail" ||
          track.contentHint === "text";

        if (!hasCamVideo && !expectRemoteScreenRef.current) {
          cam.addTrack(track);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = cam;
            void remoteVideoRef.current.play().catch(() => undefined);
          }
        } else {
          // Replace prior screen video tracks
          const screen = remoteScreenStreamRef.current;
          screen.getVideoTracks().forEach((t) => {
            screen.removeTrack(t);
            t.stop();
          });
          screen.addTrack(track);
          expectRemoteScreenRef.current = false;
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = screen;
            void screenVideoRef.current.play().catch(() => undefined);
          }
          update({
            remoteSharing: true,
            mode: "cinema",
            cinemaSource: "screen",
          });
        }

        track.onended = () => {
          if (isScreen || remoteScreenStreamRef.current.getVideoTracks().includes(track)) {
            remoteScreenStreamRef.current.getTracks().forEach((t) => {
              remoteScreenStreamRef.current.removeTrack(t);
            });
            if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
            update({ remoteSharing: false });
          }
        };
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

  const stopScreenShare = useCallback(() => {
    const pc = pcRef.current;
    for (const sender of screenSendersRef.current) {
      try {
        pc?.removeTrack(sender);
      } catch {
        /* ignore */
      }
    }
    screenSendersRef.current = [];
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    // Only clear stage video if we're not still showing remote share
    if (!expectRemoteScreenRef.current && screenVideoRef.current) {
      const remoteScreen = remoteScreenStreamRef.current;
      if (remoteScreen.getVideoTracks().length === 0) {
        screenVideoRef.current.srcObject = null;
      } else {
        screenVideoRef.current.srcObject = remoteScreen;
      }
    }
    update({ sharing: false });
    sendApp({ type: "screen.stop" });
  }, [sendApp, update]);

  const startScreenShare = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      update({
        status: "Screen share is not supported on this browser/device",
      });
      return;
    }

    try {
      // Stop previous share cleanly
      if (screenStreamRef.current) {
        stopScreenShare();
      }

      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Prefer higher detail for desktop content
          frameRate: { ideal: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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

      // Local preview immediately (works even without a peer)
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = screen;
        void screenVideoRef.current.play().catch(() => undefined);
      }

      const pc = ensurePc();
      const senders: RTCRtpSender[] = [];
      for (const track of screen.getTracks()) {
        senders.push(pc.addTrack(track, screen));
      }
      screenSendersRef.current = senders;

      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
          update({ cinemaSource: "youtube", status: "Screen share ended" });
          sendApp({ type: "mode.switch", mode: "cinema" });
          sendApp({ type: "cinema.source", source: "youtube" });
        };
      }

      // Tell peer the next video track is screen, then renegotiate if needed
      sendApp({ type: "screen.start" });
      sendApp({ type: "mode.switch", mode: "cinema" });
      sendApp({ type: "cinema.source", source: "screen" });

      // Force offer if negotiationneeded didn't fire (some browsers)
      if (partnerIdRef.current && pc.signalingState === "stable") {
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
          console.error("screen renegotiation failed", e);
        } finally {
          makingOffer.current = false;
        }
      }

      update({
        sharing: true,
        cinemaSource: "screen",
        mode: "cinema",
        status: partnerIdRef.current
          ? "Sharing screen with partner"
          : "Sharing screen (waiting for partner to see it)",
      });
    } catch (e) {
      console.error(e);
      const name = e instanceof Error ? e.name : "";
      update({
        status:
          name === "NotAllowedError"
            ? "Screen share permission denied or cancelled"
            : "Screen share failed — try Chrome/Edge desktop",
      });
    }
  }, [ensurePc, sendApp, stopScreenShare, update]);

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
    stopScreenShare,
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
