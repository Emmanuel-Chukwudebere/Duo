"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Heart,
  Loader2,
  MapPin,
  MessageCircleQuestion,
  Sparkles,
  TextCursorInput,
  WholeWord,
  X,
  Check,
  RotateCcw,
} from "lucide-react";
import type { DuoAppMessage, GameId } from "@/lib/types";
import { dealGame, GAME_META, normalizeDeal } from "@/lib/games/engine";
import { toast } from "@/components/shell/Toast";
import { TwoToneIcon } from "@/components/ui/TwoToneIcon";
import { CardStack, type StackItem } from "./CardStack";
import type { SwipeDir } from "./SwipeCard";

const GAME_IDS = Object.keys(GAME_META) as GameId[];

const GAME_ICONS: Record<GameId, typeof Heart> = {
  wyr: MessageCircleQuestion,
  "most-likely": Sparkles,
  "couples-quiz": Heart,
  "word-association": WholeWord,
  "starts-with": TextCursorInput,
  "start-end": TextCursorInput,
  places: MapPin,
};

type Phase = "picker" | "play";

export function GamesStage({
  sendApp,
  onAppMessage,
}: {
  sendApp: (msg: DuoAppMessage) => void;
  onAppMessage: (fn: (msg: DuoAppMessage) => void) => () => void;
}) {
  const [phase, setPhase] = useState<Phase>("picker");
  const [deck, setDeck] = useState<GameId[]>(() => [...GAME_IDS]);
  const [active, setActive] = useState<GameId | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [myPick, setMyPick] = useState<"a" | "b" | null>(null);
  const [theirPick, setTheirPick] = useState<"a" | "b" | null>(null);
  const [input, setInput] = useState("");
  const [dealing, setDealing] = useState(false);
  const [wordCards, setWordCards] = useState<
    { id: string; word: string }[]
  >([]);
  const [recommend, setRecommend] = useState<{
    nextGameId: string;
    reason: string;
    newIdea?: { title: string; blurb: string };
  } | null>(null);

  useEffect(() => {
    return onAppMessage((msg) => {
      if (msg.type === "game.start") {
        setActive(msg.gameId);
        setPayload(normalizeDeal(msg.gameId, msg.payload));
        setMyPick(null);
        setTheirPick(null);
        setInput("");
        setPhase("play");
        setWordCards([]);
      }
      if (msg.type === "game.action" && msg.gameId === active) {
        const action = msg.action as {
          kind: string;
          pick?: "a" | "b";
          word?: string;
        };
        if (action.kind === "wyr-pick" && action.pick) {
          setTheirPick(action.pick);
        }
        if (action.kind === "word" && action.word && payload) {
          const chain = [...((payload.chain as string[]) || []), action.word];
          setPayload({ ...payload, chain });
          setWordCards((c) => [
            { id: `${Date.now()}-${action.word}`, word: action.word! },
            ...c,
          ]);
        }
        if (action.kind === "answer" && action.word && payload) {
          const used = [...((payload.used as string[]) || []), action.word];
          setPayload({ ...payload, used });
          setWordCards((c) => [
            { id: `${Date.now()}-${action.word}`, word: action.word! },
            ...c,
          ]);
        }
      }
      if (msg.type === "game.sync") {
        setActive(msg.gameId);
        setPayload(msg.state as Record<string, unknown>);
        setPhase("play");
      }
    });
  }, [onAppMessage, active, payload]);

  const startGame = useCallback(
    async (gameId: GameId, useAi: boolean) => {
      setDealing(true);
      let nextPayload: Record<string, unknown> = dealGame(gameId);
      if (useAi) {
        try {
          const res = await fetch("/api/ai/deal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameId }),
          });
          const data = await res.json();
          if (data.payload) {
            nextPayload = normalizeDeal(gameId, data.payload);
          }
          toast(
            data.source === "mistral"
              ? "AI dealt a fresh round"
              : data.aiError
                ? "AI offline — local pack"
                : "Pack deal",
          );
        } catch {
          toast("Using local pack");
        }
      }
      // Guarantee WYR never lands empty
      nextPayload = normalizeDeal(gameId, nextPayload);
      setActive(gameId);
      setPayload(nextPayload);
      setMyPick(null);
      setTheirPick(null);
      setRecommend(null);
      setWordCards([]);
      setPhase("play");
      sendApp({ type: "game.start", gameId, payload: nextPayload });
      setDealing(false);
    },
    [sendApp],
  );

  function reshuffleDeck() {
    const shuffled = [...GAME_IDS].sort(() => Math.random() - 0.5);
    setDeck(shuffled);
    toast("Deck reshuffled");
  }

  function onPickerSwipe(dir: SwipeDir, item: StackItem) {
    const gameId = item.id as GameId;
    if (dir === "left") {
      // Skip — send to bottom of deck
      setDeck((d) => {
        const rest = d.filter((g) => g !== gameId);
        return [...rest, gameId];
      });
      return;
    }
    // right or up = play (up = AI deal)
    void startGame(gameId, dir === "up");
  }

  function pickWyr(side: "a" | "b") {
    setMyPick(side);
    sendApp({
      type: "game.action",
      gameId: "wyr",
      action: { kind: "wyr-pick", pick: side },
    });
  }

  function onWyrSwipe(dir: SwipeDir) {
    if (dir === "left") pickWyr("a");
    else if (dir === "right") pickWyr("b");
    else if (dir === "up") void startGame("wyr", true);
  }

  function submitWord() {
    if (!active || !payload || !input.trim()) return;
    const word = input.trim();
    setInput("");
    if (active === "word-association") {
      const chain = [...((payload.chain as string[]) || []), word];
      const next = { ...payload, chain };
      setPayload(next);
      setWordCards((c) => [{ id: `${Date.now()}-${word}`, word }, ...c]);
      sendApp({
        type: "game.action",
        gameId: active,
        action: { kind: "word", word },
      });
      sendApp({ type: "game.sync", gameId: active, state: next });
    } else {
      const used = [...((payload.used as string[]) || []), word];
      const next = { ...payload, used };
      setPayload(next);
      setWordCards((c) => [{ id: `${Date.now()}-${word}`, word }, ...c]);
      sendApp({
        type: "game.action",
        gameId: active,
        action: { kind: "answer", word },
      });
      sendApp({ type: "game.sync", gameId: active, state: next });
    }
  }

  function onWordCardSwipe(dir: SwipeDir, item: StackItem) {
    if (dir === "left" || dir === "up") {
      setWordCards((c) => c.filter((w) => w.id !== item.id));
    } else {
      // keep / pin — move to end
      setWordCards((c) => {
        const found = c.find((w) => w.id === item.id);
        if (!found) return c;
        return [...c.filter((w) => w.id !== item.id), found];
      });
    }
  }

  async function askRecommend() {
    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastGame: active, mood: "playful" }),
      });
      const data = await res.json();
      setRecommend(data);
    } catch {
      toast("Recommend failed");
    }
  }

  const pickerItems: StackItem[] = useMemo(
    () =>
      deck.map((id) => {
        const meta = GAME_META[id];
        const Icon = GAME_ICONS[id];
        return {
          id,
          leftHint: "Skip",
          rightHint: "Play",
          node: (
            <div className="flex h-full flex-col justify-between p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10"
                  style={{ background: `${meta.accent}18` }}
                >
                  <TwoToneIcon icon={Icon} tone="violet" size={22} />
                </div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: meta.accent }}
                >
                  {meta.title}
                </span>
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
                  {meta.title}
                </h3>
                <p className="text-sm sm:text-base text-[#9CA3AF] leading-relaxed">
                  {meta.blurb}
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-6 text-[11px] text-[#9CA3AF]">
                  <span className="inline-flex items-center gap-1.5">
                    <X className="h-3.5 w-3.5 text-rose-300/80" />
                    Skip
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-300/80" />
                    AI · tap ✨
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-300/80" />
                    Play
                  </span>
                </div>
                <p className="text-center text-[10px] text-[#9CA3AF]/70">
                  Use the buttons below
                </p>
              </div>
            </div>
          ),
        };
      }),
    [deck],
  );

  // ——— Picker: stack of games ———
  if (phase === "picker") {
    return (
      <div className="absolute inset-0 flex flex-col p-3 sm:p-6 md:p-8 pb-24 sm:pb-8 overflow-y-auto no-scrollbar">
        <div className="mb-3 sm:mb-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <div className="text-[10px] sm:text-xs tracking-wider text-[#8A5CF5] font-medium uppercase">
              Playful mode
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Pick a game
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3AF] mt-1">
              Tap Play, Skip, or ✨ for an AI-dealt round
            </p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={reshuffleDeck}
            className="control-chip px-3 py-2 text-xs min-h-[40px] inline-flex items-center gap-1.5 shrink-0"
          >
            <TwoToneIcon icon={RotateCcw} tone="muted" size={14} />
            Shuffle
          </motion.button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-2">
          {deck.length === 0 ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={reshuffleDeck}
              className="control-chip px-5 py-3 text-sm"
            >
              Reset deck
            </motion.button>
          ) : (
            <CardStack items={pickerItems} />
          )}
        </div>

        {/* Desktop click affordances under stack */}
        <div className="mt-4 flex items-center justify-center gap-3 shrink-0">
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            disabled={!deck[0] || dealing}
            onClick={() =>
              deck[0] &&
              onPickerSwipe("left", { id: deck[0], node: null })
            }
            className="h-14 w-14 rounded-full border border-white/10 bg-[#181B26] flex items-center justify-center hover:border-rose-400/40"
            title="Skip"
          >
            <X className="h-6 w-6 text-rose-300" />
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            disabled={!deck[0] || dealing}
            onClick={() => deck[0] && void startGame(deck[0], true)}
            className="h-12 w-12 rounded-full border border-white/10 bg-[#181B26] flex items-center justify-center hover:border-violet-400/40"
            title="AI deal"
          >
            {dealing ? (
              <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
            ) : (
              <Sparkles className="h-5 w-5 text-violet-300" />
            )}
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            disabled={!deck[0] || dealing}
            onClick={() =>
              deck[0] &&
              onPickerSwipe("right", { id: deck[0], node: null })
            }
            className="h-14 w-14 rounded-full border border-white/10 bg-[#181B26] flex items-center justify-center hover:border-emerald-400/40"
            title="Play"
          >
            <Check className="h-6 w-6 text-emerald-300" />
          </motion.button>
        </div>

        {recommend ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-2xl p-3 text-sm border border-white/10 bg-[#181B26] shrink-0"
          >
            <p className="text-[#9CA3AF] text-xs uppercase tracking-wide mb-1">
              Host suggests
            </p>
            <p>{recommend.reason}</p>
          </motion.div>
        ) : null}
      </div>
    );
  }

  // ——— In play ———
  if (!active || !payload) return null;
  const meta = GAME_META[active];

  return (
    <div className="absolute inset-0 flex flex-col p-3 sm:p-6 md:p-8 pb-24 sm:pb-8 overflow-y-auto no-scrollbar">
      <div className="flex items-start justify-between gap-3 flex-wrap shrink-0 mb-3">
        <div>
          <div className="text-xs tracking-wider font-medium uppercase text-[#8A5CF5]">
            {meta.title}
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
            In play
          </h2>
        </div>
        <div className="flex gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => startGame(active, true)}
            className="control-chip px-3 py-2 text-sm min-h-[40px] inline-flex items-center gap-1.5"
          >
            <TwoToneIcon icon={Sparkles} tone="violet" size={14} />
            New
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setPhase("picker");
              setActive(null);
              setPayload(null);
              void askRecommend();
            }}
            className="control-chip px-3 py-2 text-sm min-h-[40px] inline-flex items-center gap-1.5"
          >
            <TwoToneIcon icon={ArrowLeft} tone="muted" size={14} />
            Deck
          </motion.button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-2">
        <AnimatePresence mode="wait">
          {active === "wyr" ? (
            <motion.div
              key={`wyr-${payload.a}-${payload.b}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center"
            >
              <CardStack
                items={[
                  {
                    id: `wyr-${String(payload.a).slice(0, 12)}`,
                    leftHint: "A",
                    rightHint: "B",
                    node: (
                      <div className="flex h-full flex-col p-6 sm:p-8">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">
                          Would you rather
                        </p>
                        <div className="flex-1 flex flex-col justify-center gap-3">
                          <button
                            type="button"
                            disabled={Boolean(myPick)}
                            onClick={() => pickWyr("a")}
                            className={`group text-left space-y-2 rounded-2xl border p-4 transition-colors disabled:cursor-default ${
                              myPick === "a"
                                ? "border-rose-400/50 bg-rose-400/10"
                                : "border-white/10 bg-white/[0.02] enabled:hover:border-rose-400/40 enabled:hover:bg-rose-400/[0.06]"
                            }`}
                          >
                            <span className="text-[10px] font-bold text-rose-300/90 tracking-wider">
                              A · TAP OR SWIPE LEFT
                            </span>
                            <p className="text-lg sm:text-xl font-medium leading-snug">
                              {String(payload.a ?? "")}
                            </p>
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(myPick)}
                            onClick={() => pickWyr("b")}
                            className={`group text-left space-y-2 rounded-2xl border p-4 transition-colors disabled:cursor-default ${
                              myPick === "b"
                                ? "border-emerald-400/50 bg-emerald-400/10"
                                : "border-white/10 bg-white/[0.02] enabled:hover:border-emerald-400/40 enabled:hover:bg-emerald-400/[0.06]"
                            }`}
                          >
                            <span className="text-[10px] font-bold text-emerald-300/90 tracking-wider">
                              B · TAP OR SWIPE RIGHT
                            </span>
                            <p className="text-lg sm:text-xl font-medium leading-snug">
                              {String(payload.b ?? "")}
                            </p>
                          </button>
                        </div>
                        <p className="text-center text-[11px] text-[#9CA3AF]">
                          {myPick
                            ? `You picked ${myPick.toUpperCase()}${
                                theirPick
                                  ? myPick === theirPick
                                    ? " · Match"
                                    : " · Clash"
                                  : " · waiting…"
                              }`
                            : "Swipe or use buttons below"}
                          {myPick && theirPick && myPick === theirPick ? (
                            <span className="inline-flex ml-1 align-middle">
                              <TwoToneIcon icon={Heart} tone="rose" size={12} />
                            </span>
                          ) : null}
                        </p>
                      </div>
                    ),
                  },
                  // stacked depth cards
                  {
                    id: "wyr-depth-1",
                    showHints: false,
                    node: (
                      <div className="h-full p-8 flex items-center justify-center text-[#9CA3AF] text-sm">
                        Next round waits here
                      </div>
                    ),
                  },
                  {
                    id: "wyr-depth-2",
                    showHints: false,
                    node: <div className="h-full bg-[#141722]" />,
                  },
                ]}
                onSwipeTop={(dir) => {
                  if (!myPick) onWyrSwipe(dir);
                  else if (dir === "up") void startGame("wyr", true);
                }}
                disabled={Boolean(myPick)}
              />
              <div className="mt-4 flex items-center justify-center gap-3">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  disabled={Boolean(myPick)}
                  onClick={() => pickWyr("a")}
                  className={`h-14 w-14 rounded-full border flex items-center justify-center text-sm font-bold ${
                    myPick === "a"
                      ? "border-rose-400/50 bg-rose-400/15 text-rose-200"
                      : "border-white/10 bg-[#181B26] text-rose-300"
                  }`}
                >
                  A
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => startGame("wyr", true)}
                  className="h-12 w-12 rounded-full border border-white/10 bg-[#181B26] flex items-center justify-center"
                >
                  <Sparkles className="h-5 w-5 text-violet-300" />
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  disabled={Boolean(myPick)}
                  onClick={() => pickWyr("b")}
                  className={`h-14 w-14 rounded-full border flex items-center justify-center text-sm font-bold ${
                    myPick === "b"
                      ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                      : "border-white/10 bg-[#181B26] text-emerald-300"
                  }`}
                >
                  B
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col items-center gap-4 max-w-lg"
            >
              {/* Prompt card (fixed, not swiped away) */}
              <div className="w-full max-w-[400px] rounded-3xl border border-white/10 bg-[#181B26] p-6 sm:p-7">
                {active === "most-likely" ? (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#EC4899] font-medium mb-2">
                      Who is most likely to…
                    </p>
                    <p className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
                      {String(payload.prompt)}
                    </p>
                  </>
                ) : null}
                {active === "couples-quiz" ? (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#F59E0B] font-medium mb-2">
                      Couples Quiz
                    </p>
                    <p className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
                      {String(payload.question)}
                    </p>
                  </>
                ) : null}
                {active === "word-association" ? (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF] mb-2">
                      Seed word
                    </p>
                    <p className="text-3xl font-semibold tracking-tight">
                      {String(payload.seed)}
                    </p>
                    <p className="mt-2 text-sm text-[#9CA3AF]">
                      Say a related word — it becomes a card in the stack
                    </p>
                  </>
                ) : null}
                {active === "starts-with" || active === "places" ? (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF] mb-2">
                      Starts with
                    </p>
                    <p className="text-5xl font-bold text-[#FFB35C]">
                      {String(payload.letter)}
                    </p>
                    <p className="mt-3 text-sm text-[#9CA3AF]">
                      {active === "starts-with"
                        ? `Category: ${String(payload.category)}`
                        : String(payload.hint)}
                    </p>
                  </>
                ) : null}
                {active === "start-end" ? (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF] mb-3">
                      Start &amp; end
                    </p>
                    <div className="flex items-center gap-4 text-4xl font-bold">
                      <span className="text-emerald-400">
                        {String(payload.start)}
                      </span>
                      <span className="text-white/20 text-2xl">→</span>
                      <span className="text-emerald-400">
                        {String(payload.end)}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Answer stack */}
              {wordCards.length > 0 ? (
                <CardStack
                  items={wordCards.map((w) => ({
                    id: w.id,
                    leftHint: "Toss",
                    rightHint: "Keep",
                    node: (
                      <div className="flex h-full items-center justify-center p-8">
                        <p className="text-2xl sm:text-3xl font-semibold text-center">
                          {w.word}
                        </p>
                      </div>
                    ),
                  }))}
                  onSwipeTop={onWordCardSwipe}
                  className="!max-w-[320px] !min-h-[280px] !aspect-[3/3.2]"
                />
              ) : (
                <p className="text-xs text-[#9CA3AF] text-center px-4">
                  Your answers stack as swipeable cards
                </p>
              )}

              <div className="w-full max-w-[400px] flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitWord()}
                  placeholder="Type a word…"
                  className="flex-1 bg-[#0A0B10] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8A5CF5]/40 min-h-[48px]"
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={submitWord}
                  className="px-5 rounded-2xl bg-[#8A5CF5]/20 border border-[#8A5CF5]/35 text-[#c4b5fd] text-sm font-medium min-h-[48px]"
                >
                  Send
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
