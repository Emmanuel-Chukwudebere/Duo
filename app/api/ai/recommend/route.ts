import { NextResponse } from "next/server";
import { mistralJson } from "@/lib/ai/mistral";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    lastGame?: string;
    mood?: string;
  };

  const fallback = {
    nextGameId: "word-association",
    reason: "Keep the energy light with a quick word chain.",
    newIdea: {
      title: "Two Truths & a Lie",
      blurb: "Each share three statements — spot the lie.",
    },
  };

  const ai = await mistralJson<typeof fallback>(
    `You are a cozy date-night game host for couples. Reply JSON:
{"nextGameId":"wyr"|"word-association"|"starts-with"|"start-end"|"places","reason":string,"newIdea":{"title":string,"blurb":string}}
Prefer known nextGameId games. newIdea can be any talk game idea.`,
    `Last game: ${body.lastGame || "none"}. Mood: ${body.mood || "cozy"}. Suggest next.`,
  );

  if (ai.ok && ai.data) {
    return NextResponse.json({ ...ai.data, source: "mistral", model: ai.model });
  }

  return NextResponse.json({
    ...fallback,
    source: "pack",
    aiError: ai.ok ? undefined : ai.error,
  });
}
