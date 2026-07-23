export type StageMode = "dinner" | "games" | "cinema";

export type CinemaSource = "youtube" | "screen";

export type DuckingMode = "auto" | "off";

export type GameId =
  | "wyr"
  | "word-association"
  | "starts-with"
  | "start-end"
  | "places";

export type PeerRole = "host" | "guest";

export interface PresenceMeta {
  peerId: string;
  role: PeerRole;
  name: string;
}

/** Application DataChannel / local events */
export type DuoAppMessage =
  | { type: "mode.switch"; mode: StageMode }
  | { type: "cinema.source"; source: CinemaSource }
  | { type: "yt.load"; videoId: string; title?: string }
  | { type: "yt.play" }
  | { type: "yt.pause" }
  | { type: "yt.seek"; seconds: number }
  | { type: "yt.time"; seconds: number; playing: boolean }
  | { type: "yt.volume"; volume: number }
  | { type: "control.yt"; controllerId: string }
  | { type: "speaking"; active: boolean }
  | { type: "reaction"; emoji: string }
  | { type: "game.start"; gameId: GameId; payload: unknown }
  | { type: "game.action"; gameId: GameId; action: unknown }
  | { type: "game.sync"; gameId: GameId; state: unknown }
  | { type: "dinner.flip"; cardId: string; flipped: boolean }
  | { type: "dinner.deal"; cards: DinnerCard[] }
  | { type: "screen.start" }
  | { type: "screen.stop" };

export interface DinnerCard {
  id: string;
  kind: "wyr" | "deep" | "icebreaker";
  front: string;
  back: string;
}

export interface SignalPayload {
  type: "offer" | "answer" | "ice" | "ready";
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
}

export interface YtSearchItem {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}
