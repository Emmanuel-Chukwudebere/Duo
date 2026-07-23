"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { DinnerCard, DuoAppMessage } from "@/lib/types";
import dinnerPack from "@/packs/dinner.json";
import { toast } from "@/components/shell/Toast";
import { YouTubePlayer } from "@/components/youtube/YouTubePlayer";
import { YouTubeSearch } from "@/components/youtube/YouTubeSearch";
import { TwoToneIcon } from "@/components/ui/TwoToneIcon";

export function DinnerStage({
  sendApp,
  onAppMessage,
  isYtController,
  ytVideoId,
  ytTitle,
  duckLevel,
  onLoadYoutube,
  remoteYtCommand,
  onYtEvent,
}: {
  sendApp: (msg: DuoAppMessage) => void;
  onAppMessage: (fn: (msg: DuoAppMessage) => void) => () => void;
  isYtController: boolean;
  ytVideoId: string | null;
  ytTitle: string;
  duckLevel: number;
  onLoadYoutube: (id: string, title?: string) => void;
  remoteYtCommand: {
    id: number;
    kind: "play" | "pause" | "seek" | "load";
    seconds?: number;
    videoId?: string;
  } | null;
  onYtEvent: (msg: DuoAppMessage) => void;
}) {
  const [cards, setCards] = useState<DinnerCard[]>(() =>
    (dinnerPack as DinnerCard[]).slice(0, 3),
  );
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return onAppMessage((msg) => {
      if (msg.type === "dinner.flip") {
        setFlipped((f) => ({ ...f, [msg.cardId]: msg.flipped }));
      }
      if (msg.type === "dinner.deal") {
        setCards(msg.cards);
        setFlipped({});
      }
    });
  }, [onAppMessage]);

  const flip = (id: string) => {
    const next = !flipped[id];
    setFlipped((f) => ({ ...f, [id]: next }));
    sendApp({ type: "dinner.flip", cardId: id, flipped: next });
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/dinner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: "cozy" }),
      });
      const data = await res.json();
      if (data.cards?.length) {
        setCards(data.cards);
        setFlipped({});
        sendApp({ type: "dinner.deal", cards: data.cards });
        if (data.source === "mistral") {
          toast("Fresh AI prompts ready");
        } else {
          toast(
            data.aiError
              ? "AI offline — shuffled local pack"
              : "Shuffled prompt pack",
          );
        }
      } else {
        toast("Could not refresh prompts");
      }
    } catch {
      toast("Could not refresh prompts");
    } finally {
      setLoading(false);
    }
  }, [sendApp]);

  const kindLabel = (k: DinnerCard["kind"]) =>
    k === "wyr" ? "WOULD YOU RATHER" : k === "deep" ? "DEEP QUESTION" : "ICEBREAKER";

  return (
    <div className="absolute inset-0 p-3 sm:p-6 md:p-8 flex flex-col gap-3 sm:gap-4 overflow-auto pb-24 sm:pb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap shrink-0">
        <div>
          <div className="text-[10px] sm:text-xs tracking-wider text-[#FF5A79] font-medium uppercase">
            Tonight&apos;s vibe
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Dinner &amp; Deep Talk
          </h2>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={refresh}
          disabled={loading}
          className="control-chip px-3 sm:px-4 py-2 text-xs sm:text-sm min-h-[40px] inline-flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#FF5A79]" />
          ) : (
            <TwoToneIcon icon={Sparkles} tone="rose" size={16} />
          )}
          Fresh prompts
        </motion.button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 flex-1 content-start sm:content-center">
        <AnimatePresence mode="popLayout">
          {cards.map((card, i) => (
            <motion.button
              key={card.id}
              type="button"
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 320, damping: 26 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => flip(card.id)}
              className="relative h-[180px] sm:h-[200px] w-full [perspective:1000px] text-left"
            >
              <div
                className={`prompt-card relative h-full w-full ${
                  flipped[card.id] ? "flipped" : ""
                }`}
              >
                <div className="prompt-card-face absolute inset-0 rounded-3xl p-5 flex flex-col justify-between border border-white/10 bg-[#181B26]">
                  <div>
                    <div className="text-[10px] tracking-[1px] text-[#FF5A79] font-medium">
                      {kindLabel(card.kind)}
                    </div>
                    <div className="mt-3 text-[15px] leading-snug font-medium">
                      {card.front}
                    </div>
                  </div>
                  <div className="text-[10px] text-[#9CA3AF] text-right flex items-center justify-end gap-1">
                    <TwoToneIcon icon={RefreshCw} tone="muted" size={11} />
                    Tap to flip
                  </div>
                </div>
                <div className="prompt-card-face prompt-card-back absolute inset-0 rounded-3xl p-5 flex flex-col justify-center border border-white/10 bg-[#12141D]">
                  <div className="text-center text-sm text-[#9CA3AF]">
                    {card.back}
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      <motion.div
        layout
        className="rounded-3xl p-4 space-y-3 border border-white/10 bg-[#181B26]/80"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wider text-[#9CA3AF]">
            Soundtrack · YouTube
          </div>
          {ytTitle ? (
            <div className="text-xs text-[#F3F4F6] truncate max-w-[50%]">
              {ytTitle}
            </div>
          ) : null}
        </div>
        {isYtController ? (
          <YouTubeSearch onPick={onLoadYoutube} />
        ) : (
          <p className="text-xs text-[#9CA3AF]">
            Partner controls the soundtrack — ask them to load a track.
          </p>
        )}
        <YouTubePlayer
          videoId={ytVideoId}
          isController={isYtController}
          duckLevel={duckLevel}
          compact
          remoteCommand={remoteYtCommand}
          onPlay={() => onYtEvent({ type: "yt.play" })}
          onPause={() => onYtEvent({ type: "yt.pause" })}
          onTime={(seconds, playing) =>
            onYtEvent({ type: "yt.time", seconds, playing })
          }
        />
      </motion.div>
    </div>
  );
}
