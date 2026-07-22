import { NextResponse } from "next/server";
import { mistralJson } from "@/lib/ai/mistral";
import dinnerPack from "@/packs/dinner.json";
import type { DinnerCard } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { tone?: string };
  const tone = body.tone || "cozy";

  const ai = await mistralJson<{ cards: DinnerCard[] }>(
    `Generate 3 PG-13 dinner date conversation cards for couples. JSON:
{"cards":[{"id":"string","kind":"wyr"|"deep"|"icebreaker","front":"prompt text","back":"short follow-up"}]}`,
    `Tone: ${tone}. Make them intimate, warm, not corporate.`,
  );

  if (ai?.cards?.length) {
    return NextResponse.json({ source: "mistral", cards: ai.cards });
  }

  // Shuffle pack sample
  const shuffled = [...(dinnerPack as DinnerCard[])]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  return NextResponse.json({ source: "pack", cards: shuffled });
}
