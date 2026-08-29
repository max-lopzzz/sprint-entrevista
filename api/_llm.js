// api/_llm.js — OpenAI-compatible provider resolution and chat call.
// Shared by api/grade.js and api/generate.js. No npm imports; uses global fetch.

export class NoKeyError extends Error {
  constructor(msg = "no_key") { super(msg); this.name = "NoKeyError"; }
}

export function resolveProvider(opts = {}) {
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "openai/gpt-oss-120b";
  const key = (opts.userKey && String(opts.userKey).trim()) || (process.env.LLM_API_KEY || "").trim();
  if (!key) throw new NoKeyError();
  return { baseUrl, model, key };
}

export async function callChat(opts) {
  const { provider, messages, temperature = 0.3, maxTokens = 700, jsonMode = false } = opts;
  const payload = { model: provider.model, messages, temperature, max_tokens: maxTokens };
  if (jsonMode) payload.response_format = { type: "json_object" };

  let upstream;
  try {
    upstream = await fetch(provider.baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, error: "upstream_unreachable", detail: String((e && e.message) || e) };
  }

  if (!upstream.ok) {
    const rawText = (await upstream.text()).slice(0, 400);
    let detail = rawText;
    try { detail = JSON.parse(rawText).error?.message || rawText; } catch (_) {}
    const s = upstream.status;
    const error = s === 401 || s === 403 ? "bad_key"
      : s === 404 ? "model_not_found"
      : s === 429 ? "rate_limit"
      : "upstream";
    console.error("[llm] upstream", s, "model=", provider.model, "detail=", detail);
    return { ok: false, error, status: s, detail };
  }

  let data;
  try { data = await upstream.json(); } catch (_) { return { ok: false, error: "empty_reply" }; }
  const content = data?.choices?.[0]?.message?.content || "";
  if (!content.trim()) return { ok: false, error: "empty_reply" };
  return { ok: true, content };
}
