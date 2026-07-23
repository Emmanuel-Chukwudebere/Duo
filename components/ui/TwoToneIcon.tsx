"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "rose" | "amber" | "violet" | "muted" | "emerald" | "default";

const TONE: Record<Tone, { stroke: string; fill: string }> = {
  rose: { stroke: "text-[#FF5A79]", fill: "text-[#FF5A79]/20" },
  amber: { stroke: "text-[#FFB35C]", fill: "text-[#FFB35C]/20" },
  violet: { stroke: "text-[#8A5CF5]", fill: "text-[#8A5CF5]/20" },
  emerald: { stroke: "text-emerald-400", fill: "text-emerald-400/20" },
  muted: { stroke: "text-[#9CA3AF]", fill: "text-white/10" },
  default: { stroke: "text-[#F3F4F6]", fill: "text-white/12" },
};

/**
 * Two-tone Lucide icon: soft filled layer + crisp stroke layer.
 */
export function TwoToneIcon({
  icon: Icon,
  tone = "default",
  size = 20,
  className,
  strokeWidth = 1.75,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon
        size={size}
        strokeWidth={0}
        absoluteStrokeWidth
        className={cn("absolute inset-0", t.fill)}
        fill="currentColor"
      />
      <Icon
        size={size}
        strokeWidth={strokeWidth}
        absoluteStrokeWidth
        className={cn("relative", t.stroke)}
      />
    </span>
  );
}
