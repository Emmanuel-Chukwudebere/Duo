# Duo MVP Design Spec

**Project:** Duo  
**Version:** MVP 1.0  
**Date:** 2026-07-22  
**Status:** Approved  
**Code name:** Duo — Midnight Lounge  

---

## 1. Vision

**Duo** is an ephemeral, zero-friction web app for couples on long-distance dates. It combines peer-to-peer video, co-watching (YouTube + screen share), smart voice-activated audio ducking, conversation prompts, and lightweight word games in a cozy dark-mode room.

### Core value drivers

- **Zero-friction onboarding:** No login, accounts, or installs. One click to create, one link to join.
- **Cozy ambient UX:** Romantic/nighttime aesthetics (“Midnight Lounge”), not productivity tools.
- **Smart media audio:** VAD lowers movie/music volume when either partner speaks.
- **Modular stage:** Dinner, Games, and Cinema modes in one room.

---

## 2. MVP scope

### In scope

| Area | Capability |
| --- | --- |
| Rooms | Create/join via short code + shareable link; max 2 peers; ephemeral TTL |
| Media | WebRTC camera, microphone, screen share (with system audio when browser allows) |
| Cinema | YouTube co-watch (search + paste URL) **or** screen share |
| Dinner | Prompt cards + YouTube mini player (soundtrack) |
| Games | Would You Rather, Word Association, Starts With…, Start & End, Places That Start With… |
| AI | Hybrid: local packs always; optional Mistral for deal / recommend / dinner prompts |
| Ducking | Auto / Off / Talk; ducks YouTube volume and screen-share audio gain |
| Deploy | Next.js app entirely on **Vercel**; signaling via **Supabase Realtime** |

### Out of scope (MVP)

- User accounts, profiles, history persistence
- Rooms with more than 2 people
- Scribble / Pictionary / canvas games
- Spotify Web Playback SDK
- Native YouTube Music SDK (use YouTube IFrame + Data API instead)
- Paid TURN as a hard dependency (document as post-MVP quality upgrade)
- Always-on chatbot, mic transcription, AI answer-judging that kills the vibe
- Third-party mini-app iframe plug-in platform (PRD FR-4.1 deferred)
- Custom long-lived Socket.io Node host (incompatible with “all on Vercel”)

---

## 3. Architecture

### 3.1 High-level

```
┌─────────────────────────────────────────────────────────┐
│  Vercel — Next.js (App Router) + React + Tailwind         │
│  /                    Landing — “Start Date”              │
│  /room/[code]         Stage shell                         │
│  /api/rooms           Optional room metadata helpers      │
│  /api/youtube/search  YouTube Data API (server key)       │
│  /api/ai/*            Mistral: deal / recommend / dinner  │
└────────────┬───────────────────────────┬──────────────────┘
             │                           │
             ▼                           ▼
   Supabase Realtime              Mistral API (free tier)
   (signaling + presence)         YouTube Data API
             │
             ▼
   Browser ↔ Browser WebRTC
   • Media: cam, mic, display (+ system audio)
   • DataChannel: games, YT sync, reactions, mode, speaking
```

### 3.2 Design principles

1. **P2P for heavy data** — Media and game/YT sync state travel peer-to-peer after connect. Servers do not relay video/audio.
2. **Vercel for app compute** — UI, YouTube search proxy, Mistral proxy. No custom always-on Node process.
3. **Supabase Realtime for glue only** — SDP/ICE, presence, join/leave. Not a media SFU.
4. **Hybrid AI** — Local JSON packs guarantee play without API keys; Mistral enriches when `MISTRAL_API_KEY` is set.
5. **Ephemeral by default** — No durable user content; room state dies with TTL / disconnect policy.

### 3.3 Scale model

Duo is many **2-person rooms**, not broadcast.

| Layer | Scale strategy |
| --- | --- |
| Video/audio | P2P; server cost ~0 per minute of call |
| Game / YT sync | WebRTC DataChannel |
| Signaling | Supabase Realtime channels per `room:{code}`; free-tier concurrent connection limits apply |
| AI | On-demand; rate-limit per IP/room; prefer packs under load |
| Search | YouTube Data API quota; debounce + short cache if needed |

**Post-MVP scale levers:** TURN (NAT traversal quality), Upstash/KV for room metadata if needed, Realtime paid tier, AI caching.

---

## 4. Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React, Next.js App Router, Tailwind CSS, Framer Motion (micro-interactions) |
| Realtime media | WebRTC (`RTCPeerConnection`) |
| Signaling / presence | Supabase Realtime |
| Backend | Next.js Route Handlers on Vercel |
| AI | Mistral API (server-side only) |
| YouTube | IFrame Player API (client) + Data API v3 search (server) |
| Hosting | Vercel |

**Explicit non-choices for MVP:** PeerJS-as-primary architecture, Socket.io custom server, Spotify SDK, xAI/SpaceXAI (user cost constraint; Mistral free tier).

---

## 5. Room lifecycle

### 5.1 Create

1. User clicks **Start Date** on landing.
2. Client (or `/api/rooms`) generates a short room code (e.g. 4–6 alphanumeric: `7k9p`).
3. Navigate to `/room/[code]`; creator is **host**.
4. Client subscribes to Supabase Realtime channel `room:{code}` and announces presence.

### 5.2 Join

1. Guest opens `https://<app>/room/<code>`.
2. Presence count must be &lt; 2; otherwise show “Room full”.
3. Signaling exchange establishes WebRTC; DataChannel opens.

### 5.3 Roles

| Role | Defaults |
| --- | --- |
| **Host** | First joiner; default YouTube controller |
| **Guest** | Second joiner; can **Take control** of YT; either peer may start screen share |

### 5.4 Teardown

- **Inactivity:** room considered dead after **30 minutes** with no signaling/presence activity.
- **Disconnect:** **10 minutes** after both peers disconnected (or channel empty), abandon room.
- No user PII or chat logs persisted on servers. Optional ephemeral presence only.

### 5.5 Copy link

UI copies `{APP_URL}/room/{code}` with toast confirmation.

---

## 6. Signaling protocol (Supabase Realtime)

Channel: `room:{code}`.

### 6.1 Message types (signaling bus)

| Type | Payload (conceptual) | Purpose |
| --- | --- | --- |
| `presence.join` | `{ peerId, role, name? }` | Join room |
| `presence.leave` | `{ peerId }` | Leave |
| `signal.offer` | `{ sdp, from, to }` | WebRTC offer |
| `signal.answer` | `{ sdp, from, to }` | WebRTC answer |
| `signal.ice` | `{ candidate, from, to }` | ICE candidate |
| `room.full` | `{}` | Reject third joiner (client-enforced + host aware) |

**Note:** After DataChannel is open, prefer DataChannel for app state (`mode`, `yt.*`, `game.*`). Signaling channel remains for renegotiation (e.g. adding screen track) and presence.

### 6.2 Peer identity

Generate `peerId` (UUID) client-side per session tab. Display name optional (default “You” / “Partner” or placeholder like “Maya” only in demos — production defaults to “Partner”).

---

## 7. WebRTC media engine

### 7.1 Tracks

- **Camera** + **microphone** via `getUserMedia`
- **Screen** (+ **system audio** when supported) via `getDisplayMedia`
- Renegotiate when screen share starts/stops

### 7.2 UI

- Circular/soft video bubbles, draggable within stage, snap soft bounds
- Local + remote labels
- **Speaking ring** (`--accent-rose`) when VAD active (local) or `speaking: true` received (remote)

### 7.3 DataChannel application protocol

Reliable ordered channel `duo-app` (or default). JSON messages:

| Namespace | Examples |
| --- | --- |
| `mode` | `{ type: "mode.switch", mode: "dinner" \| "games" \| "cinema" }` |
| `yt` | `yt.load`, `yt.play`, `yt.pause`, `yt.seek`, `yt.rate`, `yt.time` |
| `game` | `game.start`, `game.action`, `game.reveal`, `game.end` |
| `reaction` | `{ type: "reaction", emoji }` |
| `speaking` | `{ type: "speaking", active: boolean }` |
| `control` | `{ type: "control.yt", controllerId }` |

All messages include `v: 1`, `ts`, `from` for debugging and ignore-stale logic.

---

## 8. YouTube integration (Y2)

### 8.1 Search

- **Route:** `GET` or `POST` `/api/youtube/search`
- **Auth:** `YOUTUBE_API_KEY` server-only
- **Input:** `q` (string), optional `maxResults` (default 8, max 12)
- **Output:** `{ items: [{ id, title, channelTitle, thumbnailUrl, duration? }] }`
- **Constraints:** debounce client input (~300ms); handle quota errors with friendly toast; never expose API key

### 8.2 Playback

- YouTube **IFrame Player API** on both clients
- Same `videoId` after `yt.load`
- **Host** (or current controller) is source of truth for play/pause/seek
- Guest applies events; periodic `yt.time` (e.g. every 2–5s while playing) for drift correction if skew &gt; ~500ms–1s

### 8.3 Entry points

- **Paste URL:** parse `youtube.com/watch?v=`, `youtu.be/`, shorts if feasible
- **Search results:** tap item → `yt.load`

### 8.4 Stage placement

| Mode | Presentation |
| --- | --- |
| **Dinner** | Mini / collapsible soundtrack player; prompts remain primary |
| **Cinema** | Large stage player; primary co-watch surface |

### 8.5 Cinema sources toggle

Cinema stage offers:

1. **YouTube** — co-watch player + search  
2. **Share screen** — WebRTC display track for non-YouTube content (Netflix, local files, etc.)

---

## 9. Smart audio ducking

### 9.1 Goal

When either partner speaks, lower “date media” volume smoothly so conversation is audible without manual scrubbing.

### 9.2 Inputs

- Local mic AnalyserNode / RMS (threshold e.g. speech above ~-35 dBFS for &gt; 80ms)
- Remote `speaking` flag over DataChannel (so guest speech ducks host’s YT/screen audio)

### 9.3 Outputs

| Media | Duck method |
| --- | --- |
| YouTube | IFrame API `setVolume` (0–100); map 100% → 25% when ducked |
| Screen-share audio | Web Audio `GainNode` on the remote/local playback graph |

### 9.4 Ramp timing (PRD)

- **Duck:** 1.0 → 0.25 over **~120ms** when speech detected  
- **Restore:** hold **~1200ms** continuous silence, then 0.25 → 1.0 over **~350ms**

### 9.5 Manual controls

- **AUTO** — VAD-driven (default on)  
- **OFF** — lock full volume  
- **Talk** — force duck immediately (manual)  
- Visualizer (especially Cinema): level bar + “VAD active”

---

## 10. Stage modes

### 10.1 Shell layout

```
[ Logo ]     [ Dinner | Games | Cinema ]     [ code ] [ Copy link ]
                         STAGE
              (mode content + YT or share)
         [ local bubble ] [ remote bubble ]
[ Mic ] [ Cam ] [ Share ] [ Ducking ] [ Reactions ]
```

Design tokens: Midnight Lounge palette from product PRD (`--bg-midnight`, `--accent-rose`, glass, `rounded-3xl`, floating dock).

### 10.2 Dinner & Vibe

- Prompt cards: Would You Rather / Deep Question / Icebreaker  
- Flip/reveal synced via DataChannel  
- Local packs + optional `POST /api/ai/dinner`  
- YouTube mini player for ambient soundtrack  

### 10.3 Games

App deals content (letter, category, prompt). Soft timer; pass/blank; no harsh AI rejection of answers.

| Game | Core loop |
| --- | --- |
| **Would You Rather** | Shared prompt → each picks A/B → reveal match/clash |
| **Word Association** | Seed word → alternating related words → stall/repeat ends round |
| **Starts With…** | Letter + category → alternating valid names |
| **Start & End** | Starts with L1 and ends with L2 → alternating |
| **Places That Start With…** | Letter → place names only |

**Game picker UI** lists these five. After a round, optional AI recommend card.

**Deferred:** Scribble/Pictionary.

### 10.4 Cinema

- Source toggle: YouTube | Screen share  
- Large viewport, transport controls for controller  
- Ducking visualizer available  
- Floating bubbles retained  

---

## 11. AI (Mistral hybrid)

### 11.1 Provider

- **Primary:** Mistral (`MISTRAL_API_KEY`)  
- Server-only calls from Route Handlers  
- Interface `AiProvider` so a future provider can be swapped without rewriting stages  

### 11.2 Routes

| Route | Purpose | Fallback |
| --- | --- | --- |
| `POST /api/ai/deal` | Generate next round for a known game type | Local pack RNG |
| `POST /api/ai/recommend` | Suggest next game + optional new game idea | Static rotation list |
| `POST /api/ai/dinner` | Fresh prompt cards (tone: cozy/playful/deep) | Local dinner packs |

### 11.3 Behavior rules

- AI is a **quiet host** (deals cards, suggests games), not a third participant.  
- Do **not** use AI for live speech transcription or aggressive answer validation in MVP.  
- Unknown “new game ideas” from recommend are **suggestion-only** unless a state machine exists.  
- On missing key or API error → silent fallback to packs; optional dev log.

### 11.4 Rate limiting

Light in-memory or edge-friendly limit per IP (e.g. N requests/minute) to protect free tier.

---

## 12. API surface summary

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/rooms` | Optional: create code + timestamp (if not pure client RNG) |
| GET/POST | `/api/youtube/search` | YouTube search proxy |
| POST | `/api/ai/deal` | Game round content |
| POST | `/api/ai/recommend` | Next game recommendation |
| POST | `/api/ai/dinner` | Dinner prompts |

---

## 13. Environment variables

| Variable | Where | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Yes |
| `YOUTUBE_API_KEY` | Server only | Yes for search |
| `MISTRAL_API_KEY` | Server only | No (packs work without) |
| `NEXT_PUBLIC_APP_URL` | Client | Recommended (copy link) |

Never prefix secrets with `NEXT_PUBLIC_`.

---

## 14. UI / design system (Midnight Lounge)

### Colors

- `--bg-midnight`: `#0A0B10`  
- `--bg-surface`: `#12141D`  
- `--bg-glass`: `rgba(255,255,255,0.04)`  
- `--accent-rose`: `#FF5A79`  
- `--accent-amber`: `#FFB35C`  
- `--accent-violet`: `#8A5CF5`  
- `--text-primary`: `#F3F4F6`  
- `--text-secondary`: `#9CA3AF`  
- `--border-subtle`: `rgba(255,255,255,0.08)`  

### Patterns

- Cards: `rounded-3xl`; pills: `rounded-full`  
- Floating chrome: glass + `backdrop-blur-xl`  
- Warm ambient shadows  
- Reactions: floating emoji particles  
- Card flips: 3D perspective where applicable  

---

## 15. Non-functional targets

| Target | Goal |
| --- | --- |
| DataChannel feel | Interactive &lt; ~50ms when peers well connected (best-effort, network-dependent) |
| Ducking response | Trigger under ~100ms after speech threshold |
| Bundle | Keep app JS lean; accept YouTube iframe as heavy third party |
| Browsers | Chrome/Edge best for system-audio capture; YT + cams work on Safari/Firefox with known limitations |
| Privacy | No account; no durable message store; keys server-side |

---

## 16. Module map (implementation guide)

```
app/
  page.tsx                 # Landing
  room/[code]/page.tsx    # Room shell
  api/youtube/search/route.ts
  api/ai/deal/route.ts
  api/ai/recommend/route.ts
  api/ai/dinner/route.ts
  api/rooms/route.ts       # optional
components/
  shell/                   # Nav, dock, bubbles
  dinner/
  games/
  cinema/
  youtube/                 # Player, search UI
lib/
  webrtc/                  # PC, tracks, datachannel codec
  signaling/supabase.ts
  audio/vad-ducking.ts
  games/                   # state machines + packs
  ai/mistral.ts
  youtube/parse.ts
packs/
  dinner.json
  games/*.json
```

---

## 17. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Symmetric NAT / failed P2P | Detect connection failure UI; document free TURN later |
| YouTube API quota | Debounce, limit results, cache, graceful error |
| Mistral free-tier limits | Packs fallback, rate limit |
| Supabase free connection caps | One channel per room; disconnect cleanly on unmount |
| YT iframe autoplay policies | User gesture to start; host initiates play |
| Sync drift on YT | Periodic time snapshots + seek if skew large |
| Screen share without system audio (Safari) | Prefer YT path for shared audio; show browser tip |

---

## 18. Success criteria (MVP done when)

1. Two browsers can join the same room code and see/hear each other (cam/mic).  
2. YouTube search works; both can co-watch with host control and basic sync.  
3. Screen share works on Chromium with visible remote view.  
4. Ducking AUTO reduces YT (and share audio when present) on speech / Talk.  
5. Dinner cards flip and sync.  
6. All five word games playable with app-dealt prompts; packs work with AI off.  
7. Mistral routes enrich content when key present.  
8. Deployed on Vercel with Supabase Realtime configured; Midnight Lounge UI present.

---

## 19. Decisions log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Deliverable | Next.js MVP, not static HTML | Real rooms + WebRTC |
| Hosting | Vercel only for app | User requirement |
| Signaling | Supabase Realtime | Vercel-compatible; PRD-aligned |
| AI | Mistral hybrid | Free tier; packs offline |
| Music / co-watch | YouTube Y2 (search + embed) | Free, embeddable, API key available |
| Spotify | Deferred | Premium/OAuth cost |
| Games | Five talk games; no Scribble | Scope control |
| Scale | P2P-first 1:1 rooms | Correct cost model for Duo |

---

## 20. Next step

Implementation plan via writing-plans skill: ordered tasks for scaffold → signaling → WebRTC → YT → ducking → modes → AI → deploy.
