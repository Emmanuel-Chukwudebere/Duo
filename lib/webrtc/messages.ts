import type { DuoAppMessage } from "@/lib/types";

export function encodeAppMessage(msg: DuoAppMessage): string {
  return JSON.stringify({ v: 1, ts: Date.now(), ...msg });
}

export function decodeAppMessage(raw: string): DuoAppMessage | null {
  try {
    const data = JSON.parse(raw) as DuoAppMessage & { v?: number };
    if (!data || typeof data !== "object" || !("type" in data)) return null;
    return data;
  } catch {
    return null;
  }
}
