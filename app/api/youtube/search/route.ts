import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  const maxResults = Math.min(
    12,
    Math.max(1, Number(searchParams.get("maxResults") || 8)),
  );

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("q", q);
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 } });
    if (!res.ok) {
      const text = await res.text();
      console.error("YouTube API error", res.status, text);
      return NextResponse.json(
        { error: "YouTube search failed", detail: res.status },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      items?: {
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
      }[];
    };

    const items = (data.items || [])
      .map((item) => {
        const id = item.id?.videoId;
        if (!id) return null;
        return {
          id,
          title: item.snippet?.title || "Untitled",
          channelTitle: item.snippet?.channelTitle || "",
          thumbnailUrl:
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            "",
        };
      })
      .filter(Boolean);

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Search request failed" }, { status: 500 });
  }
}
