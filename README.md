# Duo — Midnight Lounge

Ephemeral long-distance date rooms: WebRTC video, YouTube co-watch, dinner prompts, word games, and smart audio ducking.

## Stack

- **Next.js** (App Router) + React + Tailwind on **Vercel**
- **Supabase Realtime** — WebRTC signaling + presence
- **WebRTC** — cam/mic/screen + DataChannel sync
- **YouTube** Data API (search) + IFrame Player (co-watch)
- **Mistral** — optional AI deals / recommendations / dinner prompts (local packs always work)

## Setup

1. Copy env template:

```bash
cp .env.example .env.local
```

2. Fill `.env.local`:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public JWT |
| `YOUTUBE_API_KEY` | Server only |
| `MISTRAL_API_KEY` | Server only, optional |
| `NEXT_PUBLIC_APP_URL` | Production: `https://justduo.vercel.app` |
| `MISTRAL_MODEL` | Optional model override |

3. Supabase: enable Realtime (default). No tables required for MVP (channel presence + broadcast).

4. Install & run:

```bash
npm install
npm run dev
```

Open two browser windows → **Start Date** in one → **Copy link** / join code in the other. Allow camera & mic.

## Scripts

- `npm run dev` — local dev
- `npm run build` — production build
- `npm start` — serve production build

## Deploy (Vercel)

1. Push repo (ensure `.env.local` is **not** committed).
2. Import project on Vercel.
3. Add the same env vars in Project Settings.
4. Deploy. Set `NEXT_PUBLIC_APP_URL` to your production URL.

## Modes

| Mode | Features |
| --- | --- |
| Dinner | Prompt cards + YouTube soundtrack |
| Games | Would You Rather, Word Association, Starts With, Start & End, Places |
| Cinema | YouTube co-watch **or** screen share + ducking |

## Security

Never commit API keys. Rotate any key that was pasted into chat or a ticket.
