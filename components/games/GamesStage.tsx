"use client";

import { useEffect, useState } from "react";
import type { DuoAppMessage, GameId } from "@/lib/types";
import { dealGame, GAME_META } from "@/lib/games/engine";
import { toast } from "@/components/shell/Toast";

const GAME_IDS = Object.keys(GAME_META) as GameId[];

export function GamesStage({
  sendApp,
  onAppMessage,
}: {
  sendApp: (msg: DuoAppMessage) => void;
  onAppMessage: (fn: (msg: DuoAppMessage) => void) => () => void;
}) {
  const [active, setActive] = useState<GameId | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [myPick, setMyPick] = useState<"a" | "b" | null>(null);
  const [theirPick, setTheirPick] = useState<"a" | "b" | null>(null);
  const [input, setInput] = useState("");
  const [recommend, setRecommend] = useState<{
    nextGameId: string;
    reason: string;
    newIdea?: { title: string; blurb: string };
  } | null>(null);

  useEffect(() => {
    return onAppMessage((msg) => {
      if (msg.type === "game.start") {
        setActive(msg.gameId);
        setPayload(msg.payload as Record<string, unknown>);
        setMyPick(null);
        setTheirPick(null);
        setInput("");
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
        }
        if (action.kind === "answer" && action.word && payload) {
          const used = [...((payload.used as string[]) || []), action.word];
          setPayload({ ...payload, used });
        }
      }
      if (msg.type === "game.sync") {
        setActive(msg.gameId);
        setPayload(msg.state as Record<string, unknown>);
      }
    });
  }, [onAppMessage, active, payload]);

  async function startGame(gameId: GameId, useAi: boolean) {
    let nextPayload: unknown = dealGame(gameId);
    if (useAi) {
      try {
        const res = await fetch("/api/ai/deal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId }),
        });
        const data = await res.json();
        if (data.payload) nextPayload = data.payload;
        toast(data.source === "mistral" ? "AI dealt a fresh round" : "Pack deal");
      } catch {
        toast("Using local pack");
      }
    }
    setActive(gameId);
    setPayload(nextPayload as Record<string, unknown>);
    setMyPick(null);
    setTheirPick(null);
    setRecommend(null);
    sendApp({ type: "game.start", gameId, payload: nextPayload });
  }

  function pickWyr(side: "a" | "b") {
    setMyPick(side);
    sendApp({
      type: "game.action",
      gameId: "wyr",
      action: { kind: "wyr-pick", pick: side },
    });
  }

  function submitWord() {
    if (!active || !payload || !input.trim()) return;
    const word = input.trim();
    setInput("");
    if (active === "word-association") {
      const chain = [...((payload.chain as string[]) || []), word];
      const next = { ...payload, chain };
      setPayload(next);
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
      sendApp({
        type: "game.action",
        gameId: active,
        action: { kind: "answer", word },
      });
      sendApp({ type: "game.sync", gameId: active, state: next });
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

  if (!active || !payload) {
    return (
      <div className="absolute inset-0 p-6 md:p-8 overflow-auto">
        <div className="mb-6">
          <div className="text-xs tracking-wider text-[#8A5CF5] font-medium uppercase">
            Playful mode
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Pick a game</h2>
          <p className="text-sm text-[#9CA3AF] mt-1">
            App deals the prompts. Talk it out together.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GAME_IDS.map((id) => {
            const meta = GAME_META[id];
            return (
              <div
                key={id}
                className="glass rounded-3xl p-5 flex flex-col gap-3 border border-white/10"
              >
                <div
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: meta.accent }}
                >
                  {meta.title}
                </div>
                <p className="text-sm text-[#9CA3AF] flex-1">{meta.blurb}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startGame(id, false)}
                    className="flex-1 py-2 rounded-2xl bg-white/10 text-sm font-medium hover:bg-white/15"
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    onClick={() => startGame(id, true)}
                    className="px-3 py-2 rounded-2xl text-sm border border-white/10 hover:bg-white/5"
                    title="Deal with AI if available"
                  >
                    ✨
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const meta = GAME_META[active];

  return (
    <div className="absolute inset-0 p-6 md:p-8 flex flex-col gap-4 overflow-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div
            className="text-xs tracking-wider font-medium uppercase"
            style={{ color: meta.accent }}
          >
            {meta.title}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">In play</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => startGame(active, true)}
            className="px-3 py-2 text-sm rounded-2xl glass hover:bg-white/10"
          >
            New round ✨
          </button>
          <button
            type="button"
            onClick={() => {
              setActive(null);
              setPayload(null);
              void askRecommend();
            }}
            className="px-3 py-2 text-sm rounded-2xl glass hover:bg-white/10"
          >
            Change game
          </button>
        </div>
      </div>

      <div className="glass rounded-3xl p-6 border border-white/10 flex-1 space-y-4">
        {active === "wyr" ? (
          <>
            <p className="text-lg font-medium">Would you rather…</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {(["a", "b"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => pickWyr(side)}
                  className={`p-5 rounded-3xl text-left border transition ${
                    myPick === side
                      ? "border-[#FF5A79] bg-[#FF5A79]/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="text-xs text-[#9CA3AF] mb-2">
                    Option {side.toUpperCase()}
                  </div>
                  <div className="text-sm font-medium">
                    {String(payload[side] ?? "")}
                  </div>
                </button>
              ))}
            </div>
            <div className="text-sm text-[#9CA3AF]">
              You: {myPick ? myPick.toUpperCase() : "—"} · Partner:{" "}
              {theirPick ? theirPick.toUpperCase() : "…"}
              {myPick && theirPick
                ? myPick === theirPick
                  ? " · Match ❤️"
                  : " · Clash — talk it out"
                : null}
            </div>
          </>
        ) : null}

        {active === "word-association" ? (
          <>
            <p className="text-sm text-[#9CA3AF]">
              Seed:{" "}
              <span className="text-[#F3F4F6] font-semibold text-lg">
                {String(payload.seed)}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {((payload.chain as string[]) || []).map((w, i) => (
                <span
                  key={`${w}-${i}`}
                  className="px-3 py-1 rounded-full bg-[#8A5CF5]/20 text-sm"
                >
                  {w}
                </span>
              ))}
            </div>
          </>
        ) : null}

        {active === "starts-with" || active === "places" ? (
          <p className="text-lg">
            Letter{" "}
            <span className="text-[#FFB35C] font-bold text-2xl">
              {String(payload.letter)}
            </span>
            {active === "starts-with" ? (
              <>
                {" "}
                · category{" "}
                <span className="font-semibold">{String(payload.category)}</span>
              </>
            ) : (
              <> · {String(payload.hint)}</>
            )}
          </p>
        ) : null}

        {active === "start-end" ? (
          <p className="text-lg">
            Starts with{" "}
            <span className="text-[#34D399] font-bold text-2xl">
              {String(payload.start)}
            </span>{" "}
            · ends with{" "}
            <span className="text-[#34D399] font-bold text-2xl">
              {String(payload.end)}
            </span>
          </p>
        ) : null}

        {active !== "wyr" ? (
          <>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {((payload.used as string[]) || (payload.chain as string[]) || []).map(
                (w, i) => (
                  <span
                    key={`${w}-${i}`}
                    className="px-3 py-1 rounded-full bg-white/10 text-sm"
                  >
                    {w}
                  </span>
                ),
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitWord()}
                placeholder="Your word…"
                className="flex-1 bg-[#0A0B10] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8A5CF5]/40"
              />
              <button
                type="button"
                onClick={submitWord}
                className="px-5 rounded-2xl bg-[#8A5CF5] text-sm font-medium"
              >
                Send
              </button>
            </div>
          </>
        ) : null}
      </div>

      {recommend ? (
        <div className="glass rounded-3xl p-4 text-sm border border-white/10">
          <div className="text-xs text-[#9CA3AF] uppercase tracking-wide mb-1">
            Host suggests
          </div>
          <p>{recommend.reason}</p>
          {recommend.newIdea ? (
            <p className="mt-2 text-[#9CA3AF]">
              New idea: <strong className="text-[#F3F4F6]">{recommend.newIdea.title}</strong>{" "}
              — {recommend.newIdea.blurb}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
