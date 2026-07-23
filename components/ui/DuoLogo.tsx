import { cn } from "@/lib/cn";

/**
 * The Duo brand mark — twin glowing orbs joined by a link (the "duo").
 * Sourced from the trimmed, transparent logo asset. Renders at a fixed height;
 * width scales to the mark's ~3.5:1 aspect ratio.
 */
export function DuoLogo({
  height = 24,
  className,
  priority = false,
}: {
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/duo-logo.png"
      alt="Duo"
      height={height}
      style={{ height, width: "auto" }}
      className={cn("select-none", className)}
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
