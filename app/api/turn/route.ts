import { NextResponse } from "next/server";

/**
 * Returns the ICE server list the browser should use for WebRTC.
 *
 * Cross-network calls (partners on different devices / NATs) REQUIRE a working
 * TURN relay — STUN alone only connects peers on the same network. The old
 * hard-coded `openrelay.metered.ca` server is dead (0 relay candidates), which
 * is why calls got stuck at "connecting to media" across devices.
 *
 * Priority:
 *   1. Cloudflare Realtime TURN — mints short-lived credentials per request.
 *   2. Generic static TURN via env (TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL)
 *      so any provider (Twilio, metered.ca paid, self-hosted coturn) drops in.
 *   3. STUN-only fallback (same-network calls still work; a warning is flagged).
 */

const STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

// Do not cache — Cloudflare credentials are short-lived and minted per request.
export const dynamic = "force-dynamic";

async function cloudflareIceServers(): Promise<RTCIceServer[] | null> {
  const keyId = process.env.CLOUDFLARE_TURN_TOKEN_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  if (!keyId || !apiToken) return null;

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        // ~2h TTL — comfortably longer than any single date-night session.
        body: JSON.stringify({ ttl: 7200 }),
      },
    );
    if (!res.ok) {
      console.error("Cloudflare TURN mint failed", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    const ice = data.iceServers;
    if (!ice) return null;
    // Cloudflare returns an array of ICE servers (docs); normalize defensively.
    const servers = Array.isArray(ice) ? ice : [ice];
    // Drop port-53 URLs — Cloudflare docs warn browsers block port 53, so those
    // TURN/STUN URLs time out. Filtering avoids slow ICE gathering.
    return servers.map((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      const filtered = urls.filter((u) => !u.includes(":53"));
      return { ...s, urls: filtered.length > 0 ? filtered : urls };
    });
  } catch (e) {
    console.error("Cloudflare TURN mint error", e);
    return null;
  }
}

function staticTurnFromEnv(): RTCIceServer[] | null {
  const urls = process.env.TURN_URLS?.trim();
  if (!urls) return null;
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  return [
    {
      urls: urls.split(",").map((u) => u.trim()).filter(Boolean),
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    },
  ];
}

export async function GET() {
  const cf = await cloudflareIceServers();
  if (cf) {
    return NextResponse.json({ iceServers: [...STUN, ...cf], relay: true });
  }

  const staticTurn = staticTurnFromEnv();
  if (staticTurn) {
    return NextResponse.json({ iceServers: [...STUN, ...staticTurn], relay: true });
  }

  // No TURN configured — same-network calls work, cross-network calls will not.
  return NextResponse.json({
    iceServers: STUN,
    relay: false,
    warning:
      "No TURN relay configured. Cross-network (different-device) calls will fail. " +
      "Set CLOUDFLARE_TURN_TOKEN_ID + CLOUDFLARE_TURN_API_TOKEN, or TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL.",
  });
}
