# Duo — Midnight Lounge

> **Ephemeral long-distance date rooms for couples.**  
> Featuring low-latency WebRTC video & audio, synchronized YouTube co-watching, interactive dinner prompts, real-time mini-games, floating draggable video bubbles, and intelligent voice-activated audio ducking.

---

## 🌟 Executive Overview

**Duo** is an intimate, real-time web application engineered specifically for long-distance couples and close friends. Designed with a sleek dark-mode aesthetic (*Midnight Lounge*), Duo bridges distance by combining video calls with shared interactive experiences—without the clunky friction of standard screen-sharing apps.

### Highlights
- 📽️ **Synchronized Co-Watching**: Search, queue, and watch YouTube videos together with frame-accurate play/pause/seek sync.
- 💬 **Dinner Prompts & AI Pack Refresh**: Curated conversation starters (Would You Rather, Deep Questions, Icebreakers) backed by local fallback packs and optional Mistral AI generation.
- 🎮 **Co-op Mini Games**: Interactive turn-based games including *Word Association*, *Starts With*, *Start & End*, *Places*, and *Would You Rather*.
- 🎙️ **Voice-Activated Audio Ducking (VAD)**: Smart Web Audio engine automatically lowers YouTube/media audio when either partner speaks, ensuring clear conversation.
- 🖥️ **High-FPS Screen Share**: Share your browser window or full display directly inside the room stage.
- 📊 **Vercel Analytics Integration**: Built-in privacy-friendly visitor and date-session tracking.
- ⚡ **Dual-Path Realtime Resilience**: WebRTC DataChannel paired with Supabase Realtime Broadcast fallback for instant state synchronization even across strict networks/firewalls.

---

## 🏗️ Technical Architecture

```
                       ┌─────────────────────────┐
                       │  Supabase Realtime Hub  │
                       └───────────┬─────────────┘
                                   │
                 Signaling & State Sync Fallback (Broadcast / Presence)
                                   │
             ┌─────────────────────┴─────────────────────┐
             ▼                                           ▼
   ┌──────────────────┐  WebRTC DataChannel & Media  ┌──────────────────┐
   │   Peer A (Host)  │ ◄──────────────────────────► │  Peer B (Guest)  │
   └──────────────────┘                              └──────────────────┘
            │                                                 │
   ┌────────┴─────────┐                              ┌────────┴─────────┐
   │ Web Audio VAD    │                              │ Web Audio VAD    │
   │ Ducking Engine   │                              │ Ducking Engine   │
   └──────────────────┘                              └──────────────────┘
```

### Communication Layers
1. **Media Stream (WebRTC)**: Peer-to-peer encrypted audio, video, and screen sharing via `RTCPeerConnection` with STUN/TURN candidate negotiation.
2. **DataChannel (RTCDataChannel)**: Ultra-low latency binary message bus for real-time interactions (game turns, prompt flips, video playback triggers).
3. **Signaling & State Fallback (Supabase Realtime)**: WebSocket presence tracking for peer discovery + signal exchange (offers, answers, ICE candidates) + dual-path state broadcast fallback.

---

## 🎮 Interactive Modes

| Mode | Key Features |
| :--- | :--- |
| 🍷 **Dinner** | Curated dinner prompts, AI prompt refreshing (Mistral), YouTube background soundtrack player, floating reaction bursts. |
| 🎲 **Games** | 5 Co-op mini games: *Would You Rather*, *Word Association*, *Starts With*, *Start & End*, and *Places*. |
| 🍿 **Cinema** | Synchronized YouTube player with owner/controller toggles **or** low-latency browser screen share with preview. |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ and **npm**
- A **Supabase** account (Free Tier works out of the box—no database tables required, only Realtime presence & broadcast).

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Emmanuel-Chukwudebere/Duo.git
cd Duo
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your `.env.local` keys:
```env
# Required for Realtime signaling
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_SUPABASE_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# Optional API Keys
YOUTUBE_API_KEY=YOUR_YOUTUBE_DATA_API_KEY
MISTRAL_API_KEY=YOUR_MISTRAL_API_KEY

# Application Domain
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 4. Test Multi-User Call Locally
1. Open `http://localhost:3000` in **Tab 1** and click **Start Date**.
2. Copy the room URL (or 5-character code, e.g. `x3ebe`).
3. Open an **Incognito Window** or second browser, paste the link, and join.
4. Both tabs will establish WebRTC media and real-time state sync.

---

## 🛠️ Scripts & Building

- `npm run dev` — Launch development server
- `npm run build` — Compile production Next.js build
- `npm start` — Start production server
- `npm run lint` — Execute ESLint static analysis

---

## 🌐 Deployment (Vercel)

1. Push code to your Git repository.
2. Import project on [Vercel](https://vercel.com).
3. Set environment variables in Vercel settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (set to your Vercel URL, e.g., `https://justduo.vercel.app`)
   - Optional: `YOUTUBE_API_KEY`, `MISTRAL_API_KEY`
4. Deploy!

---

## 🔍 Troubleshooting & WebRTC Tips

- **Partner Connection Stuck on "Connecting media..."**:
  - Duo features an automatic self-healing handshake that retries signaling candidate exchanges every 2.5 seconds.
  - Ensure camera and microphone permissions are granted on both devices.
  - If on strict corporate or mobile cellular networks, TURN relay candidates automatically engage.

- **Audio Ducking Controls**:
  - Click **DUCK** on the control dock to toggle automatic voice ducking on/off.
  - Tap **Talk** at any time to temporarily lower YouTube audio volume for 2 seconds when speaking.

---

## 🔒 Security & Privacy

- Duo rooms are **ephemeral** and peer-to-peer.
- No media streams or video data are stored on servers.
- Signal broadcasts expire immediately upon transmission.
