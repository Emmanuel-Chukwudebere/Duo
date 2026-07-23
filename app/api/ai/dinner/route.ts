import { NextResponse } from "next/server";
import { mistralJson } from "@/lib/ai/mistral";
import dinnerPack from "@/packs/dinner.json";
import type { DinnerCard } from "@/lib/types";

function shufflePack(n = 3): DinnerCard[] {
  return [...(dinnerPack as DinnerCard[])]
    .sort(() => Math.random() - 0.5)
    .slice(0, n)
    .map((c, i) => ({ ...c, id: `${c.id}-${Date.now()}-${i}` }));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { tone?: string };
  const tone = body.tone || "cozy";

  const ai = await mistralJson<{ cards: DinnerCard[] }>(
    `Generate 3 PG-13 dinner date conversation cards for couples. JSON:
{"cards":[{"id":"string","kind":"wyr"|"deep"|"icebreaker","front":"prompt text","back":"short follow-up"}]}
Keep front under 140 characters. Warm, intimate, not corporate.`,
    `Tone: ${tone}. Make them fresh and specific.`,
  );

  if (ai.ok && Array.isArray(ai.data?.cards) && ai.data.cards.length > 0) {
    const cards = ai.data.cards.map((c, i) => ({
      id: c.id || `ai-${Date.now()}-${i}`,
      kind: (["wyr", "deep", "icebreaker"].includes(c.kind)
        ? c.kind
        : "icebreaker") as DinnerCard["kind"],
      front: String(c.front || "").slice(0, 220),
      back: String(c.back || "Talk it through together.").slice(0, 160),
    }));
    return NextResponse.json({
      source: "mistral",
      model: ai.model,
      cards,
    });
  }

  return NextResponse.json({
    source: "pack",
    cards: shufflePack(3),
    aiError: ai.ok ? undefined : ai.error,
  });
}

/** Health check — packs always work; AI uses key when present. */
export async function GET() {
  const hasKey = Boolean(process.env.MISTRAL_API_KEY?.trim());
  return NextResponse.json({
    configured: true,
    aiKey: hasKey,
    models: hasKey ? "ready" : "pack-fallback",
  });
}
