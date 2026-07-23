import type { GameId } from "@/lib/types";
import packs from "@/packs/games.json";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomLetter(): string {
  const letters = packs.letters;
  return letters[Math.floor(Math.random() * letters.length)]!;
}

/** Normalize AI / pack payloads so UI always gets expected keys. */
export function normalizeDeal(
  gameId: GameId,
  raw: unknown,
): Record<string, unknown> {
  const fallback = dealGameRaw(gameId) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;

  if (gameId === "wyr") {
    // Accept a/b, A/B, optionA/optionB, options: [a,b]
    let a =
      o.a ??
      o.A ??
      o.optionA ??
      o.option_a ??
      (Array.isArray(o.options) ? (o.options as unknown[])[0] : undefined);
    let b =
      o.b ??
      o.B ??
      o.optionB ??
      o.option_b ??
      (Array.isArray(o.options) ? (o.options as unknown[])[1] : undefined);
    // Nested payload
    if ((!a || !b) && o.payload && typeof o.payload === "object") {
      return normalizeDeal(gameId, o.payload);
    }
    a = typeof a === "string" && a.trim() ? a.trim() : fallback.a;
    b = typeof b === "string" && b.trim() ? b.trim() : fallback.b;
    return { a, b };
  }

  if (gameId === "word-association") {
    const seed =
      (typeof o.seed === "string" && o.seed) ||
      (typeof o.word === "string" && o.word) ||
      fallback.seed;
    const chain = Array.isArray(o.chain) ? o.chain : [];
    return { seed, chain };
  }

  if (gameId === "starts-with") {
    return {
      letter: String(o.letter || fallback.letter).slice(0, 1).toUpperCase(),
      category: String(o.category || fallback.category),
      used: Array.isArray(o.used) ? o.used : [],
    };
  }

  if (gameId === "start-end") {
    return {
      start: String(o.start || fallback.start).slice(0, 1).toUpperCase(),
      end: String(o.end || fallback.end).slice(0, 1).toUpperCase(),
      used: Array.isArray(o.used) ? o.used : [],
    };
  }

  if (gameId === "places") {
    return {
      letter: String(o.letter || fallback.letter).slice(0, 1).toUpperCase(),
      hint: String(o.hint || fallback.hint),
      used: Array.isArray(o.used) ? o.used : [],
    };
  }

  if (gameId === "most-likely") {
    return {
      prompt: String(o.prompt || fallback.prompt),
    };
  }

  if (gameId === "couples-quiz") {
    return {
      question: String(o.question || fallback.question),
    };
  }

  return { ...fallback, ...o };
}

function dealGameRaw(gameId: GameId): unknown {
  switch (gameId) {
    case "wyr": {
      const p = pick(packs.wyr);
      return { a: p.a, b: p.b };
    }
    case "word-association":
      return { seed: pick(packs.wordAssociationSeeds), chain: [] as string[] };
    case "starts-with":
      return {
        letter: randomLetter(),
        category: pick(packs.categories),
        used: [] as string[],
      };
    case "start-end": {
      let start = randomLetter();
      let end = randomLetter();
      if (start === end) end = randomLetter();
      return { start, end, used: [] as string[] };
    }
    case "places":
      return {
        letter: randomLetter(),
        hint: packs.placesHint,
        used: [] as string[],
      };
    case "most-likely":
      return {
        prompt: pick(packs.mostLikely),
      };
    case "couples-quiz":
      return {
        question: pick(packs.couplesQuiz),
      };
    default:
      return {};
  }
}

export function dealGame(gameId: GameId): Record<string, unknown> {
  return normalizeDeal(gameId, dealGameRaw(gameId));
}

export const GAME_META: Record<
  GameId,
  { title: string; blurb: string; accent: string }
> = {
  wyr: {
    title: "Would You Rather",
    blurb: "Pick A or B — reveal together",
    accent: "#FF5A79",
  },
  "most-likely": {
    title: "Most Likely To…",
    blurb: "Vote who is most likely to do it",
    accent: "#EC4899",
  },
  "couples-quiz": {
    title: "Who Knows Who Better?",
    blurb: "Guess your partner's secret answer",
    accent: "#F59E0B",
  },
  "word-association": {
    title: "Word Association",
    blurb: "Chain related words until someone stalls",
    accent: "#8A5CF5",
  },
  "starts-with": {
    title: "Starts With…",
    blurb: "Name things in a category starting with a letter",
    accent: "#FFB35C",
  },
  "start-end": {
    title: "Start & End",
    blurb: "Starts with one letter, ends with another",
    accent: "#34D399",
  },
  places: {
    title: "Places That Start With…",
    blurb: "Cities, countries, landmarks",
    accent: "#60A5FA",
  },
};
