const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

/** Prefer widely available free/cheap models; first match that works wins. */
const MODELS = [
  process.env.MISTRAL_MODEL,
  "mistral-small-latest",
  "open-mistral-nemo",
  "mistral-small-2503",
  "ministral-8b-latest",
].filter(Boolean) as string[];

export type MistralResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; error: string; status?: number };

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  // Strip markdown fences if model ignores json_object mode
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Model returned non-JSON content");
  }
}

export async function mistralJson<T>(
  system: string,
  user: string,
): Promise<MistralResult<T>> {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      error: "MISTRAL_API_KEY is not set on the server",
    };
  }

  let lastError = "Unknown Mistral error";

  for (const model of MODELS) {
    try {
      const res = await fetch(MISTRAL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          // Some models reject response_format; retry without below
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${system}\n\nAlways reply with a single valid JSON object only. No markdown.`,
            },
            { role: "user", content: user },
          ],
        }),
      });

      if (res.status === 400) {
        // Retry without response_format for older models
        const res2 = await fetch(MISTRAL_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.7,
            messages: [
              {
                role: "system",
                content: `${system}\n\nAlways reply with a single valid JSON object only. No markdown.`,
              },
              { role: "user", content: user },
            ],
          }),
        });
        if (!res2.ok) {
          lastError = `Mistral ${model}: ${res2.status} ${await res2.text()}`;
          continue;
        }
        const data2 = (await res2.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content2 = data2.choices?.[0]?.message?.content;
        if (!content2) {
          lastError = `Empty content from ${model}`;
          continue;
        }
        return {
          ok: true,
          data: extractJsonObject(content2) as T,
          model,
        };
      }

      if (!res.ok) {
        lastError = `Mistral ${model}: ${res.status} ${await res.text()}`;
        // 401/403 won't work on other models either
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: lastError, status: res.status };
        }
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = `Empty content from ${model}`;
        continue;
      }
      return {
        ok: true,
        data: extractJsonObject(content) as T,
        model,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, error: lastError };
}

/** Convenience: returns data or null (for pack fallbacks). */
export async function mistralJsonOrNull<T>(
  system: string,
  user: string,
): Promise<T | null> {
  const result = await mistralJson<T>(system, user);
  return result.ok ? result.data : null;
}
