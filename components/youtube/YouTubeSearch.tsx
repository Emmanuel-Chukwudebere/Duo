"use client";

import { useState } from "react";
import type { YtSearchItem } from "@/lib/types";
import { parseYouTubeVideoId } from "@/lib/youtube/parse";
import { toast } from "@/components/shell/Toast";

export function YouTubeSearch({
  onPick,
  disabled,
}: {
  onPick: (id: string, title?: string) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<YtSearchItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    const query = q.trim();
    if (!query) return;

    const asId = parseYouTubeVideoId(query);
    if (asId && (query.includes("youtube") || query.includes("youtu.be") || query.length === 11)) {
      onPick(asId);
      toast("Loaded YouTube video");
      return;
    }

    setLoading(true);
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
    } catch {
      toast("Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !disabled && search()}
          disabled={disabled}
          placeholder="Search YouTube or paste a link"
          className="flex-1 bg-[#0A0B10] border border-white/10 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-[#FFB35C]/40 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || loading}
          onClick={search}
          className="px-4 rounded-2xl bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "…" : "Search"}
        </button>
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(item.id, item.title)}
              className="flex gap-3 text-left p-2 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/10 transition disabled:opacity-50"
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
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
