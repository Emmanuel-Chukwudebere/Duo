import { NextResponse } from "next/server";
import { mistralJson } from "@/lib/ai/mistral";
import { dealGame } from "@/lib/games/engine";
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

  if (ai?.payload) {
    return NextResponse.json({ source: "mistral", payload: ai.payload });
  }

  return NextResponse.json({ source: "pack", payload: dealGame(gameId) });
}
