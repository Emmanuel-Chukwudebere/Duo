import type { GameId } from "@/lib/types";
import packs from "@/packs/games.json";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomLetter(): string {
  const letters = packs.letters;
  return letters[Math.floor(Math.random() * letters.length)]!;
}

export function dealGame(gameId: GameId): unknown {
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
      // Avoid pathological pairs a bit
      if (start === end) end = randomLetter();
      return { start, end, used: [] as string[] };
    }
    case "places":
      return {
        letter: randomLetter(),
        hint: packs.placesHint,
        used: [] as string[],
      };
    default:
      return {};
  }
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
