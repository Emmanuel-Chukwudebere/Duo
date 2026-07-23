import { NextResponse } from "next/server";
import { mistralJson } from "@/lib/ai/mistral";
import { dealGame, normalizeDeal } from "@/lib/games/engine";
import type { GameId } from "@/lib/types";

const VALID: GameId[] = [
  "wyr",
  "word-association",
  "starts-with",
  "start-end",
  "places",
];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { gameId?: string };
  const gameId = body.gameId as GameId | undefined;
  if (!gameId || !VALID.includes(gameId)) {
    return NextResponse.json({ error: "Invalid gameId" }, { status: 400 });
  }

  const pack = dealGame(gameId);

  const ai = await mistralJson<{ payload: unknown }>(
    `You generate fun, PG-13 couple date game prompts. Reply JSON only: {"payload": ...}.
Game rules:
- wyr: {"a": string, "b": string}
- word-association: {"seed": string, "chain": []}
- starts-with: {"letter": "A-Z", "category": string, "used": []}
- start-end: {"start": "A-Z", "end": "A-Z", "used": []}
- places: {"letter": "A-Z", "hint": "cities, countries, landmarks", "used": []}`,
    `Generate a fresh deal for game: ${gameId}`,
  );

  if (ai.ok && ai.data?.payload) {
    return NextResponse.json({
      source: "mistral",
      model: ai.model,
      payload: normalizeDeal(gameId, ai.data.payload),
    });
  }

  // AI sometimes returns the deal at the top level without "payload"
  if (ai.ok && ai.data && typeof ai.data === "object" && !("payload" in ai.data)) {
    return NextResponse.json({
      source: "mistral",
      model: ai.model,
      payload: normalizeDeal(gameId, ai.data),
    });
  }

  return NextResponse.json({
    source: "pack",
    payload: pack,
    aiError: ai.ok ? undefined : ai.error,
  });
}
