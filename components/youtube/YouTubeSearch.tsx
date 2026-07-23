"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Search, X } from "lucide-react";
import type { YtSearchItem } from "@/lib/types";
import { parseYouTubeVideoId } from "@/lib/youtube/parse";
import { toast } from "@/components/shell/Toast";
import { TwoToneIcon } from "@/components/ui/TwoToneIcon";

export function YouTubeSearch({
  onPick,
  disabled,
  /** When a video is playing, hide result list until user searches again */
  activeVideoId,
}: {
  onPick: (id: string, title?: string) => void;
  disabled?: boolean;
  activeVideoId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<YtSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Hide results once a video is selected / playing
  useEffect(() => {
    if (activeVideoId) {
      setShowResults(false);
    }
  }, [activeVideoId]);

  async function search() {
    const query = q.trim();
    if (!query) return;

    const asId = parseYouTubeVideoId(query);
    if (
      asId &&
      (query.includes("youtube") ||
        query.includes("youtu.be") ||
        query.length === 11)
    ) {
      setItems([]);
      setShowResults(false);
      onPick(asId);
      toast("Loaded YouTube video");
      return;
    }

    setLoading(true);
    setShowResults(true);
    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(query)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Search failed");
        setItems([]);
        return;
      }
      setItems(data.items || []);
      if (!(data.items || []).length) toast("No results");
    } catch {
      toast("Search failed");
    } finally {
      setLoading(false);
    }
  }

  function pick(id: string, title?: string) {
    setItems([]);
    setShowResults(false);
    onPick(id, title);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <TwoToneIcon icon={Search} tone="muted" size={16} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !disabled && search()}
            onFocus={() => {
              if (items.length > 0) setShowResults(true);
            }}
            disabled={disabled}
            placeholder="Search YouTube or paste a link"
            className="w-full bg-[#0A0B10] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#FFB35C]/35 disabled:opacity-50 min-h-[44px] transition-colors"
          />
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          disabled={disabled || loading}
          onClick={search}
          className="px-4 rounded-2xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] text-sm font-medium disabled:opacity-50 min-h-[44px] min-w-[4.5rem] inline-flex items-center justify-center"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#FFB35C]" />
          ) : (
            "Search"
          )}
        </motion.button>
      </div>

      {showResults && items.length > 0 ? (
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
              Results
            </span>
            <button
              type="button"
              onClick={() => {
                setShowResults(false);
                setItems([]);
              }}
              className="text-[10px] text-[#9CA3AF] hover:text-white inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Close
            </button>
          </div>
          <div className="grid gap-1.5 max-h-40 overflow-y-auto pr-1">
            {items.map((item, i) => (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                disabled={disabled}
                onClick={() => pick(item.id, item.title)}
                className="flex gap-3 text-left p-2 rounded-2xl hover:bg-white/[0.04] border border-transparent hover:border-white/10 transition disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="w-20 h-12 object-cover rounded-lg bg-black/40"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <div className="text-xs text-[#9CA3AF] truncate">
                    {item.channelTitle}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
