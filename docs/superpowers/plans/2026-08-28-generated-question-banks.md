# Generated Question Banks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the personal study tool into a public product where any visitor generates a custom multiple-choice interview-prep bank from a job description (+ optional CV and GitHub/portfolio), in Spanish or English, with a Ko-fi support link.

**Architecture:** Static single-file `index.html` (Vercel + Artifact) plus serverless functions in `api/`. New `api/generate.js` builds a bank via an OpenAI-compatible LLM (Groq `openai/gpt-oss-120b` by default) and optional GitHub enrichment. New shared modules `api/_llm.js` (provider resolution + call) and `api/_bank.js` (pure validation/slug/colour helpers) are unit-tested with Node's built-in `node:test`. The client gains an i18n layer, a setup screen with browser-side PDF/DOCX text extraction, localStorage bank persistence with a switcher, a per-browser daily generation cap, and a bring-your-own-key field. The hand-written 110-question bank is removed; a ~10-question embedded `DEMO_BANK` remains as an AI-down fallback.

**Tech Stack:** Vanilla JS (no framework, no build), Vercel Node serverless functions (`export default async function handler(req, res)`, global `fetch`), `node:test` for unit tests (zero dependencies), vendored `pdf.js` and `mammoth.browser.js` for client-side file parsing, Google Fonts (already used).

**Spec:** `docs/superpowers/specs/2026-08-28-generated-question-banks-design.md`

## Global Constraints

- **No build step, no framework, no runtime npm dependencies in the client.** `index.html` stays a single self-contained file that opens with a double-click.
- **Single-file client.** All client JS/CSS stays inline in `index.html`. Vendored libs are separate files under `vendor/` referenced by URL; the client must feature-detect and degrade when they 404 (Artifact build).
- **Serverless function signature:** `export default async function handler(req, res)` with `res.status(n).json(obj)` / `res.status(n).end()`. Node ≥ 18 runtime (global `fetch`). No external npm imports in `api/`.
- **Provider config via env, verbatim:** `LLM_API_KEY` (required unless caller supplies `userKey`), `LLM_BASE_URL` default `https://api.groq.com/openai/v1`, `LLM_MODEL` default `openai/gpt-oss-120b`.
- **CORS:** every `api/` function sets `Access-Control-Allow-Origin: *`, handles `OPTIONS` → `204`, rejects non-POST with `405`.
- **Error response shape (all `api/` functions):** `{ error: string, status?: number, detail?: string }`. Error codes reused across functions: `no_key`, `bad_key`, `model_not_found`, `rate_limit`, `upstream`, `upstream_unreachable`, `empty_reply`, `bad_request`, `bad_json`.
- **Language values:** exactly `"es"` and `"en"` everywhere (localStorage, request bodies, bank records).
- **localStorage keys:** `sprint-entrevista-v1` (existing progress), `sprint-lang`, `sprint-banks`, `sprint-gen-usage`, `sprint-user-key`, `grade-base` (existing).
- **Daily generation cap:** 5 per calendar day per browser; skipped entirely when `sprint-user-key` is set.
- **Default question count:** 18 (selectable 12 / 18 / 24).
- **Tests live in** `test/` and run with `node --test`. No test framework install.
- **Commit after every green step.** Conventional-commit style messages (`feat:`, `refactor:`, `test:`, `docs:`, `chore:`).

---

## File Structure

New:

| File | Responsibility |
|---|---|
| `api/_llm.js` | `resolveProvider({userKey})` → `{baseUrl, model, key}` or throws; `callChat({provider, messages, temperature, maxTokens, jsonMode})` → `{ok:true, content}` or `{ok:false, error, status, detail}`. Shared by `grade.js` and `generate.js`. |
| `api/_bank.js` | Pure helpers: `slugifyTopic`, `TOPIC_COLORS`, `clampCount`, `validateQuestions(raw, {count, fallbackTopic})` → `{topics, kept, dropped}`. No I/O. |
| `api/generate.js` | Serverless handler: parse inputs, optional GitHub enrichment, build prompt, call `_llm`, validate with `_bank`, return `{questions, topics, meta}`. |
| `test/bank.test.mjs` | Unit tests for `api/_bank.js`. |
| `test/llm.test.mjs` | Unit tests for `api/_llm.js` (fetch mocked). |
| `test/generate.test.mjs` | Unit tests for `api/generate.js` handler (fetch mocked, `res` shim). |
| `test/client.test.mjs` | Extracts helpers from `index.html` and tests `t()`, banks store, quota logic. |
| `test/helpers.mjs` | Shared test helpers: `resShim()`, `extractClientHelpers()`, `fakeLocalStorage()`. |
| `vendor/pdf.min.mjs` | Vendored pdf.js (ESM build), pinned version. |
| `vendor/pdf.worker.min.mjs` | pdf.js worker, same version. |
| `vendor/mammoth.browser.min.js` | Vendored mammoth, pinned version. |
| `vendor/README.md` | Records exact versions + source URLs + license note. |

Modified:

| File | Change |
|---|---|
| `api/grade.js` | Use `_llm.js`; accept optional `userKey`. |
| `dev-server.mjs` | Route `/api/generate`; serve `/vendor/*`; keep `/api/grade`. |
| `index.html` | i18n engine + full `STR`; `#s-setup` screen; setup-first init; home rebuilt around saved banks + switcher; `TOPICS` built at runtime from active bank; `DEMO_BANK`; Ko-fi button; API-key field in the `⚙︎ IA` panel; daily-cap logic. Remove the 110 hand-written questions. |
| `.env.example` | Document `/api/generate` (same vars, no new ones). |
| `README.md` | New "Cómo funciona" (setup → generate), daily limit, own-key, vendored libs, `/api/generate`. |

Removed: the ~110-question `TOPICS` array literal in `index.html` (structure replaced by `DEMO_BANK` + runtime banks).

## Phases

- **Phase A (Tasks 1–5):** backend + vendoring. Deliverable: `curl` against the dev server returns a validated bank; `node --test` green.
- **Phase B (Tasks 6–12):** client. Deliverable: full browser flow — set up, generate, study in all 5 modes, switch language, switch banks, Ko-fi link, own-key.

---

## Task 1: `api/_bank.js` — pure bank helpers

**Files:**
- Create: `api/_bank.js`
- Create: `test/helpers.mjs`
- Test: `test/bank.test.mjs`

**Interfaces:**
- Produces:
  - `export function slugifyTopic(s: string): string` — lowercase, strip accents, non-alnum → `-`, collapse/trim `-`, `""` → `"tema"`.
  - `export const TOPIC_COLORS: string[]` — 8 CSS colour strings.
  - `export function clampCount(n: unknown, lo=12, hi=24, dflt=18): number`.
  - `export function validateQuestions(raw: unknown, opts?: {count?: number, fallbackTopic?: string}): { topics: Array<{id:string,name:string,color:string,qs:Array<{q:string,code?:string,opts:string[],a:number,ex:string}>}>, kept: number, dropped: number }` — accepts either an array of question objects or `{questions:[...]}`; keeps only well-formed items (`q` non-empty string; `ex` non-empty string; `opts` exactly 4 distinct non-empty strings; `a` integer 0–3; `topic` string, default `fallbackTopic` or `"General"`); groups by topic; assigns `id = slugifyTopic(name)` (deduped with `-2`, `-3`… on collision) and `color` round-robin from `TOPIC_COLORS`; truncates total kept questions to `count` when given.

- [ ] **Step 1: Write `test/helpers.mjs`**

```js
// test/helpers.mjs — shared test utilities, no dependencies
import { readFileSync } from "node:fs";

export function resShim() {
  const r = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
  return r;
}

export function fakeLocalStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
  };
}

// Pull the inline <script> body out of index.html and expose named helpers
// by evaluating a slice of it in a sandbox. `names` are top-level function or
// const identifiers to return.
export function extractClientHelpers(names, sandbox = {}) {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const ctx = {
    window: {}, document: { documentElement: {}, addEventListener() {} },
    navigator: { language: "es-MX" }, localStorage: fakeLocalStorage(),
    console, structuredClone, setTimeout, clearTimeout, fetch: undefined,
    ...sandbox,
  };
  const body = `${script}\n;return {${names.join(",")}};`;
  const fn = new Function(...Object.keys(ctx), body);
  return fn(...Object.values(ctx));
}
```

- [ ] **Step 2: Write the failing test `test/bank.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { slugifyTopic, clampCount, validateQuestions, TOPIC_COLORS } from "../api/_bank.js";

test("slugifyTopic normalises accents and separators", () => {
  assert.equal(slugifyTopic("Tu proyecto: pákú Paku"), "tu-proyecto-paku-paku");
  assert.equal(slugifyTopic("   "), "tema");
  assert.equal(slugifyTopic("SQL"), "sql");
});

test("clampCount clamps and defaults", () => {
  assert.equal(clampCount(50), 24);
  assert.equal(clampCount(3), 12);
  assert.equal(clampCount("18"), 18);
  assert.equal(clampCount(undefined), 18);
});

test("validateQuestions keeps only well-formed items and groups by topic", () => {
  const raw = {
    questions: [
      { topic: "SQL", q: "¿Q1?", opts: ["a", "b", "c", "d"], a: 1, ex: "porque b" },
      { topic: "SQL", q: "¿Q2?", opts: ["a", "b", "c", "d"], a: 0, ex: "porque a" },
      { topic: "SQL", q: "bad", opts: ["a", "b", "c"], a: 0, ex: "x" },       // 3 opts
      { topic: "SQL", q: "bad", opts: ["a", "a", "c", "d"], a: 0, ex: "x" },  // dup opts
      { topic: "SQL", q: "bad", opts: ["a", "b", "c", "d"], a: 9, ex: "x" },  // a out of range
      { topic: "", q: "¿Q3?", opts: ["a", "b", "c", "d"], a: 2, ex: "porque c" },
    ],
  };
  const out = validateQuestions(raw, { count: 18, fallbackTopic: "General" });
  assert.equal(out.kept, 3);
  assert.equal(out.dropped, 3);
  const sql = out.topics.find((t) => t.name === "SQL");
  assert.equal(sql.qs.length, 2);
  assert.equal(sql.id, "sql");
  assert.ok(TOPIC_COLORS.includes(sql.color));
  assert.ok(out.topics.find((t) => t.name === "General"));
});

test("validateQuestions truncates to count across topics", () => {
  const qs = Array.from({ length: 30 }, (_, i) => ({
    topic: i % 2 ? "A" : "B", q: `q${i}`, opts: ["1", "2", "3", "4"], a: 0, ex: "e",
  }));
  const out = validateQuestions(qs, { count: 12 });
  assert.equal(out.kept, 12);
  assert.equal(out.topics.reduce((n, t) => n + t.qs.length, 0), 12);
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `node --test test/bank.test.mjs`
Expected: FAIL — `Cannot find module '../api/_bank.js'`.

- [ ] **Step 4: Write `api/_bank.js`**

```js
// api/_bank.js — pure helpers for validating and shaping generated question banks.
// No I/O, no imports. Used by api/generate.js and the unit tests.

export const TOPIC_COLORS = [
  "#3fb27f", "#c07cf0", "#f2c14e", "#5aa2f2",
  "#4bc0d9", "#f28f5a", "#e6d24a", "#f26fb3",
];

export function slugifyTopic(s) {
  const base = String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "tema";
}

export function clampCount(n, lo = 12, hi = 24, dflt = 18) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, v));
}

function isStr(x) { return typeof x === "string" && x.trim().length > 0; }

function validOne(x) {
  if (!x || typeof x !== "object") return false;
  if (!isStr(x.q) || !isStr(x.ex)) return false;
  if (!Array.isArray(x.opts) || x.opts.length !== 4) return false;
  if (!x.opts.every(isStr)) return false;
  if (new Set(x.opts.map((s) => s.trim())).size !== 4) return false;
  if (!Number.isInteger(x.a) || x.a < 0 || x.a > 3) return false;
  return true;
}

export function validateQuestions(raw, opts = {}) {
  const fallbackTopic = opts.fallbackTopic || "General";
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.questions) ? raw.questions : []);
  let kept = 0, dropped = 0;
  const byName = new Map();       // name -> { id, name, color, qs }
  const usedIds = new Set();
  let colorIdx = 0;

  for (const item of list) {
    if (opts.count && kept >= opts.count) { dropped++; continue; }
    if (!validOne(item)) { dropped++; continue; }
    const name = isStr(item.topic) ? item.topic.trim() : fallbackTopic;
    let group = byName.get(name);
    if (!group) {
      let id = slugifyTopic(name), n = 2;
      while (usedIds.has(id)) id = `${slugifyTopic(name)}-${n++}`;
      usedIds.add(id);
      group = { id, name, color: TOPIC_COLORS[colorIdx++ % TOPIC_COLORS.length], qs: [] };
      byName.set(name, group);
    }
    const q = { q: item.q.trim(), opts: item.opts.map((s) => s.trim()), a: item.a, ex: item.ex.trim() };
    if (isStr(item.code)) q.code = item.code;
    group.qs.push(q);
    kept++;
  }
  return { topics: [...byName.values()], kept, dropped };
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `node --test test/bank.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add api/_bank.js test/helpers.mjs test/bank.test.mjs
git commit -m "feat: add api/_bank.js pure validation/slug/colour helpers with tests"
```

---

## Task 2: `api/_llm.js` — provider resolution + chat call

**Files:**
- Create: `api/_llm.js`
- Test: `test/llm.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export class NoKeyError extends Error {}`
  - `export function resolveProvider(opts?: {userKey?: string}): { baseUrl: string, model: string, key: string }` — `baseUrl` = `LLM_BASE_URL` env or `https://api.groq.com/openai/v1`, trailing slashes stripped; `model` = `LLM_MODEL` env or `openai/gpt-oss-120b`; `key` = `opts.userKey` (trimmed) if non-empty else `process.env.LLM_API_KEY` (trimmed); throws `NoKeyError` if no key.
  - `export async function callChat(opts: { provider: {baseUrl,model,key}, messages: Array<{role,content}>, temperature?: number, maxTokens?: number, jsonMode?: boolean }): Promise<{ ok: true, content: string } | { ok: false, error: string, status?: number, detail?: string }>` — POSTs `${baseUrl}/chat/completions`; on non-OK maps `401|403`→`bad_key`, `404`→`model_not_found`, `429`→`rate_limit`, else `upstream`, with `detail` = provider `error.message` or raw text (≤400 chars); on network throw → `upstream_unreachable`; empty content → `empty_reply`. Adds `response_format:{type:"json_object"}` when `jsonMode`.

- [ ] **Step 1: Write the failing test `test/llm.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProvider, callChat, NoKeyError } from "../api/_llm.js";

test("resolveProvider prefers userKey, falls back to env, else throws", () => {
  const saved = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  assert.throws(() => resolveProvider(), NoKeyError);
  assert.equal(resolveProvider({ userKey: "  sk-abc " }).key, "sk-abc");
  process.env.LLM_API_KEY = "env-key";
  assert.equal(resolveProvider().key, "env-key");
  assert.equal(resolveProvider().model, "openai/gpt-oss-120b");
  if (saved === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = saved;
});

test("callChat returns content on success", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ choices: [{ message: { content: "hi" } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
  const out = await callChat({ provider: { baseUrl: "https://x/v1", model: "m", key: "k" }, messages: [] });
  assert.deepEqual(out, { ok: true, content: "hi" });
  globalThis.fetch = orig;
});

test("callChat maps 401 to bad_key with detail", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 },
  );
  const out = await callChat({ provider: { baseUrl: "https://x/v1", model: "m", key: "k" }, messages: [] });
  assert.equal(out.ok, false);
  assert.equal(out.error, "bad_key");
  assert.equal(out.status, 401);
  assert.match(out.detail, /Invalid API Key/);
  globalThis.fetch = orig;
});

test("callChat maps network throw to upstream_unreachable", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("boom"); };
  const out = await callChat({ provider: { baseUrl: "https://x/v1", model: "m", key: "k" }, messages: [] });
  assert.equal(out.error, "upstream_unreachable");
  globalThis.fetch = orig;
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/llm.test.mjs`
Expected: FAIL — `Cannot find module '../api/_llm.js'`.

- [ ] **Step 3: Write `api/_llm.js`**

```js
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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `node --test test/llm.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_llm.js test/llm.test.mjs
git commit -m "feat: add api/_llm.js provider resolution + chat call with tests"
```

---

## Task 3: Refactor `api/grade.js` onto `_llm.js` + accept `userKey`

**Files:**
- Modify: `api/grade.js` (replace lines 63–129, the `handler` and inline fetch)
- Test: `test/grade.test.mjs` (create)

**Interfaces:**
- Consumes: `resolveProvider`, `callChat`, `NoKeyError` from `api/_llm.js`.
- Produces: unchanged external contract — `POST /api/grade` with `{mode,question,code?,correct,explain,topic,history}` → `{reply}`; now also reads optional `userKey`.

- [ ] **Step 1: Write the failing test `test/grade.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/grade.js";
import { resShim } from "./helpers.mjs";

function req(body, method = "POST") { return { method, body: JSON.stringify(body) }; }

test("grade: missing fields -> 400 bad_request", async () => {
  process.env.LLM_API_KEY = "k";
  const res = resShim();
  await handler(req({ mode: "grade" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "bad_request");
});

test("grade: happy path returns reply, uses userKey when given", async () => {
  delete process.env.LLM_API_KEY;                 // force reliance on userKey
  const seen = {};
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.auth = init.headers.Authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: "VEREDICTO: CORRECTO\nBien." } }] }), { status: 200 });
  };
  const res = resShim();
  await handler(req({
    mode: "grade", question: "q", correct: "c", explain: "e", topic: "SQL",
    history: [{ role: "user", content: "hola" }], userKey: "user-123",
  }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.reply, /VEREDICTO/);
  assert.equal(seen.auth, "Bearer user-123");
  globalThis.fetch = orig;
});

test("grade: no key anywhere -> 503 no_key", async () => {
  delete process.env.LLM_API_KEY;
  const res = resShim();
  await handler(req({ mode: "grade", question: "q", correct: "c", explain: "e", topic: "t", history: [{ role: "user", content: "x" }] }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "no_key");
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/grade.test.mjs`
Expected: FAIL — happy-path test sends `Bearer user-123` but current `grade.js` ignores `userKey` and throws on missing env key.

- [ ] **Step 3: Rewrite `api/grade.js` handler**

Keep lines 1–61 (the header comment and `systemPrompt`) unchanged. Replace `const MAX_TURNS`/`MAX_CHARS` (lines 21–22) position is fine. Replace the whole `export default async function handler` (lines 63–129) with:

```js
import { resolveProvider, callChat, NoKeyError } from "./_llm.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  let b;
  try {
    b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ error: "bad_request" });
  }

  const mode = b.mode === "teach" ? "teach" : "grade";
  const history = Array.isArray(b.history) ? b.history : null;
  if (!b.question || !b.correct || !history || history.length === 0) {
    return res.status(400).json({ error: "bad_request" });
  }
  if (history.length > MAX_TURNS) return res.status(400).json({ error: "too_long" });

  const msgs = [{ role: "system", content: systemPrompt(mode, b) }];
  for (const m of history) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return res.status(400).json({ error: "bad_request" });
    }
    msgs.push({ role: m.role, content: m.content.slice(0, MAX_CHARS) });
  }

  let provider;
  try { provider = resolveProvider({ userKey: b.userKey }); }
  catch (e) { if (e instanceof NoKeyError) return res.status(503).json({ error: "no_key" }); throw e; }

  const out = await callChat({ provider, messages: msgs, temperature: 0.3, maxTokens: 700 });
  if (!out.ok) {
    const status = out.error === "no_key" ? 503 : 502;
    return res.status(status).json({ error: out.error, status: out.status, detail: out.detail, model: provider.model });
  }
  return res.status(200).json({ reply: out.content });
}
```

Move the `import` line to the top of the file (just under the header comment, before `const MAX_TURNS`).

- [ ] **Step 4: Run tests, expect pass**

Run: `node --test test/grade.test.mjs test/llm.test.mjs test/bank.test.mjs`
Expected: PASS (all).

- [ ] **Step 5: Manual smoke against a real provider (optional but recommended)**

If a Groq key is available:
```bash
LLM_API_KEY=YOUR_KEY node dev-server.mjs &
curl -s -X POST http://localhost:4600/api/grade -H 'Content-Type: application/json' \
  -d '{"mode":"grade","question":"¿WHERE vs HAVING?","correct":"WHERE antes de agrupar","explain":"HAVING filtra grupos","topic":"SQL","history":[{"role":"user","content":"WHERE filtra filas y HAVING grupos"}]}'
kill %1
```
Expected: `{"reply":"VEREDICTO: ..."}`.

- [ ] **Step 6: Commit**

```bash
git add api/grade.js test/grade.test.mjs
git commit -m "refactor: grade.js uses _llm.js and accepts userKey"
```

---

## Task 4: `api/generate.js` — build a bank from user inputs

**Files:**
- Create: `api/generate.js`
- Test: `test/generate.test.mjs`

**Interfaces:**
- Consumes: `resolveProvider`, `callChat`, `NoKeyError` from `_llm.js`; `validateQuestions`, `clampCount` from `_bank.js`.
- Produces: `POST /api/generate`:
  - Request body: `{ jobDescription: string (required), cv?: string, githubUser?: string, projectsText?: string, language: "es"|"en" (required), count?: number, userKey?: string }`.
  - `200` → `{ topics: Array<{id,name,color,qs}>, meta: { model, requested, returned, kept, dropped, githubSkipped?: string } }`.
  - Errors: `400 {error:"bad_request"}`, `503 {error:"no_key"}`, `502 {error, status?, detail?}` from `callChat` or `{error:"bad_json"}` when the model output can't be parsed after retry.
- Also exported for tests: `export function buildMessages({jobDescription,cv,projectsSummary,language,count})` (pure) and `export async function fetchGithubSummary(user)` → `{ text: string, skipped?: string }`.

- [ ] **Step 1: Write the failing test `test/generate.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import handler, { buildMessages } from "../api/generate.js";
import { resShim } from "./helpers.mjs";

const okQuestions = JSON.stringify({
  questions: Array.from({ length: 18 }, (_, i) => ({
    topic: i < 12 ? "SQL" : "Comportamiento",
    q: `Pregunta ${i}`, opts: ["a", "b", "c", "d"], a: i % 4, ex: "porque sí",
  })),
});

function mockFetch(map) {
  return async (url) => {
    for (const [frag, resp] of map) if (String(url).includes(frag)) return resp();
    throw new Error("unexpected url " + url);
  };
}

test("generate: rejects missing jobDescription", async () => {
  process.env.LLM_API_KEY = "k";
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ language: "es" }) }, res);
  assert.equal(res.statusCode, 400);
});

test("generate: rejects bad language", async () => {
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "x", language: "fr" }) }, res);
  assert.equal(res.statusCode, 400);
});

test("buildMessages puts job description and language in the prompt", () => {
  const msgs = buildMessages({ jobDescription: "Analista de datos", language: "en", count: 12 });
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[1].content, /Analista de datos/);
  assert.match(msgs[0].content, /English/i);
  assert.match(msgs[0].content, /12/);
});

test("generate: happy path returns validated topics + meta", async () => {
  process.env.LLM_API_KEY = "k";
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetch([
    ["chat/completions", () => new Response(JSON.stringify({ choices: [{ message: { content: okQuestions } }] }), { status: 200 })],
  ]);
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "Analista", language: "es", count: 18 }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.meta.kept, 18);
  assert.ok(res.body.topics.find((t) => t.name === "SQL"));
  globalThis.fetch = orig;
});

test("generate: retries once when first output is unparseable, then 200", async () => {
  process.env.LLM_API_KEY = "k";
  const orig = globalThis.fetch;
  let call = 0;
  globalThis.fetch = mockFetch([
    ["chat/completions", () => {
      call++;
      const content = call === 1 ? "not json at all" : okQuestions;
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }],
  ]);
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "Analista", language: "es" }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(call, 2);
  globalThis.fetch = orig;
});

test("generate: unparseable twice -> 502 bad_json", async () => {
  process.env.LLM_API_KEY = "k";
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetch([
    ["chat/completions", () => new Response(JSON.stringify({ choices: [{ message: { content: "nope" } }] }), { status: 200 })],
  ]);
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "Analista", language: "es" }) }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, "bad_json");
  globalThis.fetch = orig;
});

test("generate: github 403 sets meta.githubSkipped and still succeeds", async () => {
  process.env.LLM_API_KEY = "k";
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetch([
    ["api.github.com", () => new Response("rate limited", { status: 403 })],
    ["chat/completions", () => new Response(JSON.stringify({ choices: [{ message: { content: okQuestions } }] }), { status: 200 })],
  ]);
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "Analista", language: "es", githubUser: "octocat" }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.meta.githubSkipped, "rate_limited");
  globalThis.fetch = orig;
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/generate.test.mjs`
Expected: FAIL — `Cannot find module '../api/generate.js'`.

- [ ] **Step 3: Write `api/generate.js`**

```js
// api/generate.js — build a multiple-choice interview-prep bank from a job
// description (+ optional CV and GitHub/portfolio) using an OpenAI-compatible LLM.
// Same env vars as grade.js. Sensitive input is used for one request and not stored.

import { resolveProvider, callChat, NoKeyError } from "./_llm.js";
import { validateQuestions, clampCount } from "./_bank.js";

const LIMITS = { job: 8000, cv: 15000, projects: 6000, github: 6000 };
const GH_USER_RE = /^[A-Za-z0-9-]{1,39}$/;

function clip(s, n) { return (typeof s === "string" ? s : "").slice(0, n); }

export async function fetchGithubSummary(user) {
  if (!GH_USER_RE.test(user || "")) return { text: "", skipped: "invalid_user" };
  const H = { "User-Agent": "sprint-entrevista", Accept: "application/vnd.github+json" };
  let repos;
  try {
    const r = await fetch(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=15`, { headers: H });
    if (r.status === 404) return { text: "", skipped: "not_found" };
    if (r.status === 403) return { text: "", skipped: "rate_limited" };
    if (!r.ok) return { text: "", skipped: "http_" + r.status };
    repos = await r.json();
  } catch (_) {
    return { text: "", skipped: "unreachable" };
  }
  if (!Array.isArray(repos)) return { text: "", skipped: "bad_response" };

  const real = repos.filter((x) => x && !x.fork);
  const lines = real.map((x) => {
    const topics = Array.isArray(x.topics) && x.topics.length ? ` [${x.topics.join(", ")}]` : "";
    return `- ${x.name} (${x.language || "?"})${topics}: ${x.description || "—"}`;
  });

  const readmes = [];
  for (const x of real.slice(0, 4)) {
    try {
      const rr = await fetch(`https://api.github.com/repos/${user}/${x.name}/readme`, { headers: H });
      if (!rr.ok) continue;
      const j = await rr.json();
      const body = Buffer.from(j.content || "", "base64").toString("utf8").replace(/\s+/g, " ").trim();
      if (body) readmes.push(`### ${x.name}\n${body.slice(0, 800)}`);
    } catch (_) { /* skip */ }
  }

  const text = clip(
    `Repositorios:\n${lines.join("\n")}\n\nREADMEs:\n${readmes.join("\n\n")}`,
    LIMITS.github,
  );
  return { text };
}

export function buildMessages({ jobDescription, cv, projectsSummary, language, count }) {
  const langName = language === "en" ? "English" : "Spanish";
  const system =
    `You are an expert technical interviewer building a practice question bank. ` +
    `Output ONLY a JSON object: {"questions":[{"topic","q","code","opts","a","ex"}]}. ` +
    `Produce exactly ${count} questions. Rules: "opts" is an array of exactly 4 distinct ` +
    `plausible strings; "a" is the 0-based index of the single correct option; "q" is the ` +
    `question stem; "ex" is 1-3 sentences saying why the answer is correct AND how to talk ` +
    `about it in an interview; "code" is optional, include only when a snippet is needed. ` +
    `Group questions into 3-6 topics you name in the "topic" field: core skills named in ` +
    `the JOB DESCRIPTION, one "${language === "en" ? "Your project" : "Tu proyecto"}: <name>" ` +
    `topic per notable project from PROJECTS, and one behavioural/STAR topic. Target mix: ` +
    `~60% job-description technical, ~25% CV/projects specifics, ~15% behavioural. ` +
    `Write every field in ${langName}. Return JSON only, no prose, no markdown fences.`;

  const parts = [`JOB DESCRIPTION:\n${clip(jobDescription, LIMITS.job)}`];
  if (cv && cv.trim()) parts.push(`CV:\n${clip(cv, LIMITS.cv)}`);
  if (projectsSummary && projectsSummary.trim()) parts.push(`PROJECTS:\n${clip(projectsSummary, LIMITS.projects)}`);
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}

function parseQuestions(content) {
  // tolerate ```json fences and leading/trailing prose
  let s = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const first = s.indexOf("{"); const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  let b;
  try { b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (_) { return res.status(400).json({ error: "bad_request" }); }

  const language = b.language === "en" ? "en" : b.language === "es" ? "es" : null;
  if (!b.jobDescription || !String(b.jobDescription).trim() || !language) {
    return res.status(400).json({ error: "bad_request" });
  }
  const count = clampCount(b.count);

  let provider;
  try { provider = resolveProvider({ userKey: b.userKey }); }
  catch (e) { if (e instanceof NoKeyError) return res.status(503).json({ error: "no_key" }); throw e; }

  let githubSkipped;
  let projectsSummary = clip(b.projectsText, LIMITS.projects);
  if (b.githubUser) {
    const gh = await fetchGithubSummary(String(b.githubUser).trim());
    if (gh.skipped) githubSkipped = gh.skipped;
    if (gh.text) projectsSummary = clip(`${projectsSummary}\n\n${gh.text}`, LIMITS.projects + LIMITS.github);
  }

  const messages = buildMessages({ jobDescription: b.jobDescription, cv: b.cv, projectsSummary, language, count });

  let parsed = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const msgs = attempt === 0 ? messages
      : [...messages, { role: "user", content: "Your previous answer was not valid JSON. Reply again with ONLY the JSON object." }];
    const out = await callChat({ provider, messages: msgs, temperature: 0.4, maxTokens: 4500, jsonMode: true });
    if (!out.ok) {
      const status = out.error === "no_key" ? 503 : 502;
      return res.status(status).json({ error: out.error, status: out.status, detail: out.detail, model: provider.model });
    }
    parsed = parseQuestions(out.content);
  }
  if (!parsed) return res.status(502).json({ error: "bad_json" });

  const { topics, kept, dropped } = validateQuestions(parsed, { count, fallbackTopic: language === "en" ? "General" : "General" });
  if (kept < 6) return res.status(502).json({ error: "bad_json", detail: `only ${kept} valid questions` });

  return res.status(200).json({
    topics,
    meta: { model: provider.model, requested: count, returned: kept + dropped, kept, dropped, githubSkipped },
  });
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `node --test test/`
Expected: PASS (all suites: bank, llm, grade, generate).

- [ ] **Step 5: Commit**

```bash
git add api/generate.js test/generate.test.mjs
git commit -m "feat: add api/generate.js — LLM-built question bank with GitHub enrichment"
```

---

## Task 5: Vendor `pdf.js` + `mammoth`, wire `dev-server.mjs`

**Files:**
- Create: `vendor/pdf.min.mjs`, `vendor/pdf.worker.min.mjs`, `vendor/mammoth.browser.min.js`, `vendor/README.md`
- Modify: `dev-server.mjs`

**Interfaces:**
- Produces: static assets served at `/vendor/*` by both Vercel (automatic) and `dev-server.mjs`; `/api/generate` routed in the dev server.

- [ ] **Step 1: Download the vendored libraries (pinned versions)**

```bash
mkdir -p vendor
curl -sL -o vendor/pdf.min.mjs        https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs
curl -sL -o vendor/pdf.worker.min.mjs https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs
curl -sL -o vendor/mammoth.browser.min.js https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js
ls -l vendor
```
Expected: three non-empty files (pdf ~300–400 KB, worker ~1 MB, mammoth ~300 KB).

- [ ] **Step 2: Write `vendor/README.md`**

```markdown
# Vendored libraries

Downloaded, not built. Loaded lazily in the browser only when the user drops a file.

| File | Package | Version | Source | License |
|---|---|---|---|---|
| pdf.min.mjs | pdfjs-dist | 4.7.76 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs | Apache-2.0 |
| pdf.worker.min.mjs | pdfjs-dist | 4.7.76 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs | Apache-2.0 |
| mammoth.browser.min.js | mammoth | 1.8.0 | https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js | BSD-2-Clause |

To update: re-download at a new pinned version and update this table.
```

- [ ] **Step 3: Verify pdf.js ESM shape**

Run: `node -e "import('./vendor/pdf.min.mjs').then(m=>console.log(Object.keys(m).slice(0,12)))"`
Expected: includes `getDocument` and `GlobalWorkerOptions`.

- [ ] **Step 4: Modify `dev-server.mjs`**

The current file serves static files from `ROOT` and routes `/api/grade`. Add a `/api/generate` route (mirror the grade block) and confirm `/vendor/*` is covered by the existing static handler (it is — `vendor/` is under `ROOT`). Concretely, in the request handler, above the `/api/grade` block add:

```js
  if (req.url === "/api/generate" || req.url.startsWith("/api/generate?")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      req.body = body;
      const mod = await import("./api/generate.js");
      try { await mod.default(req, resShim(res)); }
      catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: "handler_threw", detail: String(e) })); }
    });
    return;
  }
```

Add `.mjs` and `.wasm` to the `TYPES` map: `".mjs": "text/javascript; charset=utf-8"`, `".wasm": "application/wasm"`.

- [ ] **Step 5: Manual verify**

```bash
LLM_API_KEY=dummy node dev-server.mjs &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4600/vendor/mammoth.browser.min.js   # 200
curl -s -X POST http://localhost:4600/api/generate -H 'Content-Type: application/json' -d '{"language":"es"}'   # {"error":"bad_request"}
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add vendor dev-server.mjs
git commit -m "chore: vendor pdf.js + mammoth; route /api/generate in dev server"
```

---

## Task 6: i18n engine + full `STR` dictionary in `index.html`

**Files:**
- Modify: `index.html` (add i18n block near the top of `<script>`, before `const TOPICS`; add `ES|EN` toggle to the `.hud`; convert every user-visible literal)
- Test: `test/client.test.mjs` (create; extend in later tasks)

**Interfaces:**
- Produces (inside the inline script, extractable by tests):
  - `const STR = { es: {...}, en: {...} }`
  - `function t(key, vars)` — `STR[lang][key] ?? STR.es[key] ?? key`, with `{name}` interpolation from `vars`.
  - `let lang` — from `localStorage["sprint-lang"]`, default `navigator.language.startsWith("es") ? "es" : "en"`.
  - `function setLang(next)` — set, persist, `applyI18n()`, re-render current screen.
  - `function applyI18n()` — for every `[data-i18n]` element set `textContent = t(key)`; for every `[data-i18n-ph]` set `placeholder`; update `<html lang>`; update the toggle's pressed state.

- [ ] **Step 1: Write the failing test `test/client.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { extractClientHelpers } from "./helpers.mjs";

test("t(): interpolates and falls back es -> key", () => {
  const { t, STR } = extractClientHelpers(["t", "STR"], { });
  // requires that the script sets `lang` to "es" by default under navigator es-MX
  assert.equal(typeof STR.es.setup_title, "string");
  assert.equal(typeof STR.en.setup_title, "string");
  assert.equal(t("__missing_key__"), "__missing_key__");
});

test("STR: es and en have identical key sets", () => {
  const { STR } = extractClientHelpers(["STR"]);
  const es = Object.keys(STR.es).sort();
  const en = Object.keys(STR.en).sort();
  assert.deepEqual(es, en);
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/client.test.mjs`
Expected: FAIL — `STR`/`t` not defined (or key mismatch).

- [ ] **Step 3: Add the i18n block to `index.html`**

Immediately after `<script>` opens and any existing `"use strict"`/helpers but before `const TOPICS`, insert:

```js
/* ============================================================
   I18N
   ============================================================ */
const STR = {
  es: {
    brand: "Sprint de Entrevista",
    nav_lang: "EN",
    support_kofi: "Invítame un café",
    // HUD / common
    level: "Nv", xp: "XP", mute: "Silenciar sonido", reset: "Reiniciar progreso",
    back_home: "← Inicio", back_exit: "← Salir", next: "Siguiente →", finish_see: "Ver resultado",
    // Home
    home_new_interview: "Nueva entrevista",
    home_switch_bank: "Cambiar banco",
    home_bank_lang_note: "Este banco está en {lang}.",
    home_mastery: "Dominio por tema",
    home_foot: "Tu progreso se guarda solo en este navegador.",
    // Modes
    mode_practice_t: "Práctica por tema", mode_practice_d: "Elige un tema y responde con explicación inmediata. 3 vidas por ronda.",
    mode_flash_t: "Flashcards", mode_flash_d: "Repaso rápido pregunta → concepto.",
    mode_mock_t: "Entrevista simulada", mode_mock_d: "Preguntas mezcladas, 10 min, sin pistas. Reporte al final.",
    mode_open_t: "Respuesta abierta", mode_open_d: "Contestas con tus palabras, sin ver opciones. Una IA te califica y explica.",
    mode_teach_t: "Enséñale a la IA", mode_teach_d: "Explicas el concepto como si dieras clase. La IA hace de alumno y evalúa.",
    // Picker
    picker_practice_title: "Elige un tema", picker_practice_sub: "Cada ronda te da 3 vidas. Falla y pierdes una; llega a cero y termina la ronda.",
    picker_flash_title: "¿Qué quieres repasar?", picker_flash_sub: "Mira la pregunta, intenta responder mentalmente y voltea la tarjeta.",
    picker_open_title: "¿Sobre qué tema quieres que te pregunten?", picker_open_sub: "Verás solo la pregunta. Responde con tus palabras (o di \"no sé\") y la IA te califica. Puedes repreguntar.",
    picker_teach_title: "¿Qué tema quieres enseñar?", picker_teach_sub: "Se te da un concepto y se lo explicas a la IA como si dieras clase.",
    picker_all: "Todos los temas",
    // Quiz
    quiz_correct: "Correcto", quiz_wrong: "Incorrecto",
    lives: "Vidas", streak: "Racha",
    // Flashcards
    fc_face_q: "Pregunta", fc_face_a: "Respuesta", fc_knew: "La sabía", fc_review: "Repasar",
    // Open answer / teach
    oa_answer_ph: "Escribe tu respuesta…", oa_explain_ph: "Explica el concepto con tus palabras…",
    oa_send_answer: "Responder", oa_send_explain: "Explicar", oa_send_more: "Enviar",
    oa_followup_ph: "Pregunta lo que quieras sobre esto… o pulsa Siguiente",
    oa_idk: "No sé",
    oa_ai_cfg: "⚙︎ IA",
    oa_cfg_url_label: "URL de tu backend (deploy en Vercel) — para usar la IA fuera de esa URL",
    oa_cfg_key_label: "API key propia (opcional) — se guarda solo en este navegador",
    oa_cfg_save: "Guardar", oa_cfg_saved: "Guardado", oa_cfg_cleared: "Borrado",
    oa_teach_intro: "Explica el concepto con tus palabras, como si dieras clase. La IA hará de alumno: te preguntará si algo no queda claro y al final evaluará tu explicación.",
    verdict_correcto: "CORRECTO", verdict_parcial: "PARCIAL", verdict_incorrecto: "INCORRECTO",
    ref_answer: "Respuesta correcta:", ref_reference: "Referencia:",
    oa_reveal_self: "Te muestro la respuesta modelo para que te autoevalúes.",
    oa_reveal_self_teach: "Te muestro la explicación de referencia para que compares con la tuya.",
    provider_detail: "Detalle del proveedor: {detail}",
    // Results
    result_kicker_practice: "Resultado", result_kicker_mock: "Entrevista simulada",
    result_kicker_open: "Respuesta abierta", result_kicker_teach: "Enséñale a la IA",
    result_again: "Otra ronda", result_home: "Inicio",
    result_by_topic: "Por tema", result_to_review: "Para repasar",
    r_correct: "Correctas", r_partial: "Parciales", r_xp: "XP ganada", r_time: "Tiempo", r_best: "Mejor",
    // Setup
    setup_title: "Crea tu banco de preguntas",
    setup_sub: "Pega la descripción del empleo. Opcionalmente añade tu CV y tus proyectos: las preguntas se adaptan a ti.",
    setup_job_label: "Descripción del empleo",
    setup_job_ph: "Pega aquí la vacante: responsabilidades, requisitos, tecnologías…",
    setup_cv_label: "CV (opcional)",
    setup_cv_ph: "Pega el texto de tu CV, o suelta un archivo .pdf / .docx / .txt aquí.",
    setup_cv_drop: "Soltar archivo o hacer clic",
    setup_cv_parsing: "Leyendo archivo…",
    setup_cv_parsed: "Texto extraído de {file} — revísalo y edítalo si hace falta.",
    setup_cv_parsefail: "No se pudo leer el archivo. Pega el texto a mano.",
    setup_cv_nofile: "La lectura de archivos no está disponible aquí. Pega el texto del CV.",
    setup_projects_label: "Proyectos (opcional)",
    setup_gh_ph: "Usuario de GitHub (p. ej. tu-usuario)",
    setup_projects_ph: "O describe tus proyectos: qué son, con qué los hiciste, tu rol.",
    setup_count_label: "Número de preguntas",
    setup_generate: "Generar preguntas",
    setup_generating: "Generando tu banco…",
    setup_gen_status_1: "Leyendo la vacante…",
    setup_gen_status_2: "Revisando tu CV y proyectos…",
    setup_gen_status_3: "Redactando preguntas…",
    setup_gen_status_4: "Puliendo opciones y explicaciones…",
    setup_limit_reached: "Llegaste al límite de {n} generaciones por hoy en este navegador. Añade tu propia API key en ⚙︎ IA para seguir sin límite.",
    setup_need_backend: "Configura la URL del backend en ⚙︎ IA (o abre la versión de Vercel) para generar preguntas.",
    setup_error: "No se pudo generar: {detail}",
    setup_load_demo: "Cargar ejemplo",
    setup_demo_loaded: "Banco de ejemplo cargado.",
    lang_es: "español", lang_en: "inglés",
  },
  en: {
    brand: "Interview Sprint",
    nav_lang: "ES",
    support_kofi: "Buy me a coffee",
    level: "Lv", xp: "XP", mute: "Mute sound", reset: "Reset progress",
    back_home: "← Home", back_exit: "← Exit", next: "Next →", finish_see: "See results",
    home_new_interview: "New interview",
    home_switch_bank: "Switch bank",
    home_bank_lang_note: "This bank is in {lang}.",
    home_mastery: "Mastery by topic",
    home_foot: "Your progress is saved only in this browser.",
    mode_practice_t: "Practice by topic", mode_practice_d: "Pick a topic and answer with instant explanations. 3 lives per round.",
    mode_flash_t: "Flashcards", mode_flash_d: "Fast review: question → concept.",
    mode_mock_t: "Mock interview", mode_mock_d: "Mixed questions, 10 min, no hints. Report at the end.",
    mode_open_t: "Open answer", mode_open_d: "Answer in your own words, no options shown. An AI grades and explains.",
    mode_teach_t: "Teach the AI", mode_teach_d: "Explain the concept as if teaching a class. The AI plays student and evaluates.",
    picker_practice_title: "Pick a topic", picker_practice_sub: "Each round gives you 3 lives. Miss one and you lose a life; hit zero and the round ends.",
    picker_flash_title: "What do you want to review?", picker_flash_sub: "Read the question, answer in your head, then flip the card.",
    picker_open_title: "What topic should we quiz you on?", picker_open_sub: "You'll see only the question. Answer in your own words (or say \"I don't know\") and the AI grades it. You can ask follow-ups.",
    picker_teach_title: "What topic do you want to teach?", picker_teach_sub: "You're given a concept and you explain it to the AI as if teaching a class.",
    picker_all: "All topics",
    quiz_correct: "Correct", quiz_wrong: "Incorrect",
    lives: "Lives", streak: "Streak",
    fc_face_q: "Question", fc_face_a: "Answer", fc_knew: "I knew it", fc_review: "Review",
    oa_answer_ph: "Type your answer…", oa_explain_ph: "Explain the concept in your own words…",
    oa_send_answer: "Answer", oa_send_explain: "Explain", oa_send_more: "Send",
    oa_followup_ph: "Ask anything about this… or press Next",
    oa_idk: "I don't know",
    oa_ai_cfg: "⚙︎ AI",
    oa_cfg_url_label: "Your backend URL (Vercel deploy) — to use the AI outside that URL",
    oa_cfg_key_label: "Your own API key (optional) — stored only in this browser",
    oa_cfg_save: "Save", oa_cfg_saved: "Saved", oa_cfg_cleared: "Cleared",
    oa_teach_intro: "Explain the concept in your own words, as if teaching a class. The AI will play student: it asks when something is unclear and evaluates your explanation at the end.",
    verdict_correcto: "CORRECT", verdict_parcial: "PARTIAL", verdict_incorrecto: "INCORRECT",
    ref_answer: "Correct answer:", ref_reference: "Reference:",
    oa_reveal_self: "Here's the model answer so you can self-assess.",
    oa_reveal_self_teach: "Here's the reference explanation to compare with yours.",
    provider_detail: "Provider detail: {detail}",
    result_kicker_practice: "Result", result_kicker_mock: "Mock interview",
    result_kicker_open: "Open answer", result_kicker_teach: "Teach the AI",
    result_again: "Another round", result_home: "Home",
    result_by_topic: "By topic", result_to_review: "To review",
    r_correct: "Correct", r_partial: "Partial", r_xp: "XP earned", r_time: "Time", r_best: "Best",
    setup_title: "Build your question bank",
    setup_sub: "Paste the job description. Optionally add your CV and projects — the questions adapt to you.",
    setup_job_label: "Job description",
    setup_job_ph: "Paste the posting: responsibilities, requirements, technologies…",
    setup_cv_label: "CV (optional)",
    setup_cv_ph: "Paste your CV text, or drop a .pdf / .docx / .txt file here.",
    setup_cv_drop: "Drop a file or click",
    setup_cv_parsing: "Reading file…",
    setup_cv_parsed: "Text extracted from {file} — review and edit if needed.",
    setup_cv_parsefail: "Couldn't read the file. Paste the text manually.",
    setup_cv_nofile: "File reading isn't available here. Paste your CV text.",
    setup_projects_label: "Projects (optional)",
    setup_gh_ph: "GitHub username (e.g. your-handle)",
    setup_projects_ph: "Or describe your projects: what they are, what you built them with, your role.",
    setup_count_label: "Number of questions",
    setup_generate: "Generate questions",
    setup_generating: "Building your bank…",
    setup_gen_status_1: "Reading the posting…",
    setup_gen_status_2: "Reviewing your CV and projects…",
    setup_gen_status_3: "Writing questions…",
    setup_gen_status_4: "Polishing options and explanations…",
    setup_limit_reached: "You've hit the limit of {n} generations today in this browser. Add your own API key in ⚙︎ AI to continue without limits.",
    setup_need_backend: "Set the backend URL in ⚙︎ AI (or open the Vercel version) to generate questions.",
    setup_error: "Couldn't generate: {detail}",
    setup_load_demo: "Load example",
    setup_demo_loaded: "Example bank loaded.",
    lang_es: "Spanish", lang_en: "English",
  },
};

let lang = (() => {
  try { const v = localStorage.getItem("sprint-lang"); if (v === "es" || v === "en") return v; } catch (e) {}
  return (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
})();

function t(key, vars) {
  let s = (STR[lang] && STR[lang][key]) ?? STR.es[key] ?? key;
  if (vars) for (const k in vars) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
  return s;
}

function applyI18n() {
  document.documentElement.setAttribute("lang", lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", t(el.dataset.i18nPh)); });
  const tg = document.getElementById("langToggle");
  if (tg) tg.textContent = t("nav_lang");
}

function setLang(next) {
  lang = next === "en" ? "en" : "es";
  try { localStorage.setItem("sprint-lang", lang); } catch (e) {}
  applyI18n();
  if (typeof rerenderCurrent === "function") rerenderCurrent();
}
```

- [ ] **Step 4: Add the language toggle to the HUD**

In the `.hud` block in the markup, next to `#muteBtn`/`#resetBtn`, add:

```html
<button class="icon-btn" id="langToggle" title="ES / EN">EN</button>
```

Wire it in the EVENTOS section:

```js
$("#langToggle").addEventListener("click", () => setLang(lang === "es" ? "en" : "es"));
```

- [ ] **Step 5: Convert existing markup literals to `data-i18n`**

For every static Spanish string in the markup (hero eyebrow, mode cards `<h3>`/`<p>`, section labels, picker titles, button labels, results labels, footer), add `data-i18n="<key>"` using the keys above and delete the literal text (leave the element empty; `applyI18n()` fills it). For inputs/text>areas, use `data-i18n-ph`. Add `applyI18n()` to the INIT section before the first render. Dynamic strings built in JS (`openPicker`, `renderQuestion`, `showResult`, `fallbackReveal`, `renderOpen`, mode wiring) switch from literals to `t("...")`.

Define `rerenderCurrent()` in the SCREENS section:

```js
let currentScreen = "s-home";
function rerenderCurrent() {
  if (currentScreen === "s-home") renderHome();
  else if (currentScreen === "s-setup") renderSetup();
  // other screens are transient; re-render on next entry
}
```
Set `currentScreen` inside the existing `show(id)` helper.

- [ ] **Step 6: Run tests, expect pass**

Run: `node --test test/client.test.mjs`
Expected: PASS (2 tests) — `STR.es`/`STR.en` key sets match; `t()` falls back.

- [ ] **Step 7: Manual verify in the browser**

```bash
LLM_API_KEY=dummy node dev-server.mjs
```
Open `http://localhost:4600`. Click the `EN` toggle: every visible string flips to English, `<html lang>` becomes `en`, reload keeps English. Toggle back to `ES`.

- [ ] **Step 8: Commit**

```bash
git add index.html test/client.test.mjs
git commit -m "feat: bilingual UI (es/en) with STR dictionary, t(), and language toggle"
```

---

## Task 7: Setup screen `#s-setup` + client-side file extraction

**Files:**
- Modify: `index.html` (new `<section id="s-setup">` markup; `SETUP` script section; `FILE EXTRACTION` script section)

**Interfaces:**
- Consumes: `t`, `lang`, `applyI18n`; `/api/generate` (via `gradeEndpoint`-style base resolution — reuse `aiBase()`); `addBank`, `setActiveBank`, `buildTopicsFromBank` (Task 8 — declared there; Task 7 calls them and they must exist, so Task 8 is a prerequisite for Step 6 here; implement Steps 1–5 first, wire Step 6 after Task 8).
- Produces:
  - `function renderSetup()` — fills the setup screen, applies i18n, sets the generate button enabled state.
  - `async function extractFileText(file): Promise<string>` — `.txt/.md` via `file.text()`; `.pdf` via lazy `import("/vendor/pdf.min.mjs")`; `.docx` via lazy-injected `<script src="/vendor/mammoth.browser.min.js">` then `window.mammoth.convertToPlainText`; throws on unsupported/failed.
  - `let fileSupport` — `true` until a vendor load fails, then `false` (hides the drop zone).

- [ ] **Step 1: Add the setup screen markup**

After the HUD, before `#s-home`, add:

```html
<section class="screen" id="s-setup">
  <p class="eyebrow" data-i18n="brand"></p>
  <h1 id="setupTitle" data-i18n="setup_title" style="font-size:1.7rem;font-weight:800;margin:.3rem 0 .2rem"></h1>
  <p class="lede" data-i18n="setup_sub"></p>

  <label class="setup-label" data-i18n="setup_job_label" for="jobInput"></label>
  <textarea id="jobInput" class="setup-ta" rows="6" data-i18n-ph="setup_job_ph"></textarea>

  <details class="setup-more">
    <summary data-i18n="setup_cv_label"></summary>
    <div id="cvDrop" class="setup-drop"><span data-i18n="setup_cv_drop"></span>
      <input id="cvFile" type="file" accept=".pdf,.docx,.txt,.md" hidden>
    </div>
    <p id="cvFileMsg" class="setup-filemsg"></p>
    <textarea id="cvInput" class="setup-ta" rows="6" data-i18n-ph="setup_cv_ph"></textarea>
  </details>

  <details class="setup-more">
    <summary data-i18n="setup_projects_label"></summary>
    <input id="ghInput" class="setup-inp" type="text" autocomplete="off" spellcheck="false" data-i18n-ph="setup_gh_ph">
    <textarea id="projInput" class="setup-ta" rows="4" data-i18n-ph="setup_projects_ph"></textarea>
  </details>

  <div class="setup-row">
    <label data-i18n="setup_count_label" for="countSel"></label>
    <select id="countSel"><option>12</option><option selected>18</option><option>24</option></select>
  </div>

  <div class="setup-actions">
    <button class="btn primary" id="genBtn" data-i18n="setup_generate"></button>
  </div>
  <p id="setupMsg" class="setup-msg"></p>
</section>
```

Add CSS near the other screen styles (scale to match the existing dark theme; reuse `--surface`, `--line`, `--accent`, `--radius`): `.setup-label`, `.setup-ta`, `.setup-inp` (full-width, `#0b0e13` bg, `1px solid var(--line-strong)`, radius 11px, padding 11px 13px, `font-family:inherit`), `.setup-more summary` (cursor pointer, mono, `color:var(--muted)`, padding 8px 0), `.setup-drop` (dashed border, centered, padding 18px, `cursor:pointer`), `.setup-row` (flex, gap 10, align center, margin 14px 0), `.setup-msg` (`color:var(--faint)`, small), `.setup-msg.err` (`color:var(--bad)`).

- [ ] **Step 2: Add the `FILE EXTRACTION` script section**

```js
/* ============================================================
   FILE EXTRACTION (lazy; degrades when vendor libs 404)
   ============================================================ */
let fileSupport = true;
let _pdfLib = null, _mammothLoaded = null;

async function loadPdfLib() {
  if (_pdfLib) return _pdfLib;
  const mod = await import("/vendor/pdf.min.mjs");
  mod.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  _pdfLib = mod;
  return mod;
}
function loadMammoth() {
  if (_mammothLoaded) return _mammothLoaded;
  _mammothLoaded = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/mammoth.browser.min.js";
    s.onload = () => resolve(window.mammoth);
    s.onerror = () => reject(new Error("mammoth load failed"));
    document.head.appendChild(s);
  });
  return _mammothLoaded;
}

async function extractFileText(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return (await file.text()).slice(0, 20000);
  if (name.endsWith(".pdf")) {
    const pdfjs = await loadPdfLib();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    let out = "";
    for (let p = 1; p <= doc.numPages && out.length < 15000; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      out += tc.items.map((i) => i.str).join(" ") + "\n";
    }
    return out.slice(0, 15000);
  }
  if (name.endsWith(".docx")) {
    const m = await loadMammoth();
    const buf = await file.arrayBuffer();
    const r = await m.convertToPlainText({ arrayBuffer: buf });
    return String(r.value || "").slice(0, 15000);
  }
  throw new Error("unsupported");
}
```

- [ ] **Step 3: Add the `SETUP` script section (render + wiring, no generate call yet)**

```js
/* ============================================================
   SETUP
   ============================================================ */
function renderSetup() {
  applyI18n();
  const drop = $("#cvDrop");
  if (drop) drop.style.display = fileSupport ? "" : "none";
  updateGenEnabled();
}
function updateGenEnabled() {
  const btn = $("#genBtn");
  if (btn) btn.disabled = !$("#jobInput").value.trim();
}
function bindSetupOnce() {
  if (bindSetupOnce._done) return; bindSetupOnce._done = true;
  $("#jobInput").addEventListener("input", updateGenEnabled);
  const file = $("#cvFile"), drop = $("#cvDrop"), msg = $("#cvFileMsg");
  drop.addEventListener("click", () => file.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) handleCvFile(e.dataTransfer.files[0]); });
  file.addEventListener("change", () => { if (file.files[0]) handleCvFile(file.files[0]); });
  $("#genBtn").addEventListener("click", runGeneration);
}
async function handleCvFile(f) {
  const msg = $("#cvFileMsg");
  msg.textContent = t("setup_cv_parsing");
  try {
    const text = await extractFileText(f);
    const cur = $("#cvInput").value.trim();
    $("#cvInput").value = cur ? cur + "\n\n" + text : text;
    msg.textContent = t("setup_cv_parsed", { file: f.name });
  } catch (e) {
    if (String(e.message).includes("load failed") || e.name === "TypeError") { fileSupport = false; $("#cvDrop").style.display = "none"; msg.textContent = t("setup_cv_nofile"); }
    else msg.textContent = t("setup_cv_parsefail");
  }
}
```

- [ ] **Step 4: Add `runGeneration()` (calls `/api/generate`, defers bank handling to Task 8)**

```js
const GEN_ENDPOINT = () => aiBase() + "/api/generate";
let genStatusTimer = null;

async function runGeneration() {
  const btn = $("#genBtn"), msg = $("#setupMsg");
  msg.className = "setup-msg"; msg.textContent = "";

  const cap = checkGenQuota();            // Task 9; returns {ok} or {ok:false,reason}
  if (!cap.ok) { msg.className = "setup-msg err"; msg.textContent = t("setup_limit_reached", { n: cap.limit }); return; }

  const payload = {
    jobDescription: $("#jobInput").value.trim(),
    cv: $("#cvInput").value.trim() || undefined,
    githubUser: $("#ghInput").value.trim() || undefined,
    projectsText: $("#projInput").value.trim() || undefined,
    language: lang,
    count: Number($("#countSel").value),
    userKey: userKey() || undefined,       // Task 9
  };

  btn.disabled = true;
  const orig = btn.textContent;
  let step = 1; btn.textContent = t("setup_generating");
  msg.textContent = t("setup_gen_status_1");
  genStatusTimer = setInterval(() => { step = step % 4 + 1; msg.textContent = t("setup_gen_status_" + step); }, 2500);

  try {
    const r = await fetch(GEN_ENDPOINT(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.topics)) {
      const detail = j.detail || j.error || ("HTTP " + r.status);
      throw new Error(detail);
    }
    bumpGenQuota();                        // Task 9
    const bank = addBank({                 // Task 8
      title: payload.jobDescription.slice(0, 48),
      lang: payload.language,
      topics: j.topics,
      sourceHint: payload.githubUser ? "github:" + payload.githubUser : "job",
    });
    setActiveBank(bank.id);                // Task 8
    buildTopicsFromActive();              // Task 8
    renderHome(); show("s-home");
  } catch (e) {
    msg.className = "setup-msg err";
    msg.textContent = t("setup_error", { detail: String(e.message).slice(0, 200) });
    if (!banksList().length) showDemoOffer();   // Task 8
  } finally {
    clearInterval(genStatusTimer);
    btn.disabled = false; btn.textContent = orig;
  }
}
```

- [ ] **Step 5: Manual verify (mocked backend)**

Start the dev server. In the browser console, stub the endpoint:
```js
const _f = window.fetch;
window.fetch = (u, o) => String(u).includes("/api/generate")
  ? Promise.resolve(new Response(JSON.stringify({ topics: [{ id:"sql", name:"SQL", color:"#4bc0d9", qs:[{q:"¿Q?",opts:["a","b","c","d"],a:0,ex:"e"}] }], meta:{} }), { status:200 }))
  : _f(u, o);
```
Fill the job field → Generate button enables → click → status lines rotate → lands on home showing an "SQL" topic. Drop a `.txt` file on the CV drop zone → its text appears in the CV textarea.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: setup screen with job/CV/projects inputs and client-side PDF/DOCX extraction"
```

---

## Task 8: Bank persistence, runtime `TOPICS`, home rebuild, demo fallback

**Files:**
- Modify: `index.html` (`BANKS` script section; delete the 110-question `TOPICS` literal; add `DEMO_BANK`; rebuild `renderHome`; setup-first `INIT`)
- Test: `test/client.test.mjs` (extend)

**Interfaces:**
- Produces:
  - `function loadBanksStore()` / `saveBanksStore(store)` — `localStorage["sprint-banks"]` = `{ activeId, banks: [...] }`; tolerant of missing/corrupt (returns `{activeId:null,banks:[]}`).
  - `function banksList(): Bank[]`, `function activeBank(): Bank|null`.
  - `function addBank({title,lang,topics,sourceHint}): Bank` — assigns `id = "b" + <8-char base36 hash of title+Date.now()>`, `createdAt = Date.now()`; prefixes every `topic.id` with `id + "-"` so mastery keys never collide across banks; pushes and saves; returns the stored bank.
  - `function setActiveBank(id)`, `function deleteBank(id)`.
  - `let TOPICS` (was `const`) — `function buildTopicsFromActive()` sets `TOPICS = activeBank() ? activeBank().topics : []`.
  - `const DEMO_BANK` — `{ es:{topics:[...10 q...]}, en:{topics:[...10 q...]} }`, generic "data analyst intern".
  - `function showDemoOffer()` — renders a "load example" button on the setup screen that calls `loadDemo()`.
  - `function loadDemo()` — `addBank` from `DEMO_BANK[lang]`, activate, go home.

- [ ] **Step 1: Extend `test/client.test.mjs`**

```js
test("banks store: add prefixes topic ids and persists; delete removes", () => {
  const api = extractClientHelpers(
    ["loadBanksStore","saveBanksStore","addBank","setActiveBank","deleteBank","activeBank","banksList","buildTopicsFromActive"],
  );
  const b = api.addBank({ title: "Data analyst", lang: "en", topics: [{ id: "sql", name: "SQL", color: "#000", qs: [] }], sourceHint: "job" });
  assert.match(b.id, /^b[a-z0-9]{6,}$/);
  assert.match(b.topics[0].id, new RegExp("^" + b.id + "-sql$"));
  api.setActiveBank(b.id);
  assert.equal(api.activeBank().id, b.id);
  api.buildTopicsFromActive();
  assert.equal(api.banksList().length, 1);
  api.deleteBank(b.id);
  assert.equal(api.banksList().length, 0);
  assert.equal(api.activeBank(), null);
});

test("DEMO_BANK has 8-12 valid questions per language", () => {
  const { DEMO_BANK } = extractClientHelpers(["DEMO_BANK"]);
  for (const L of ["es", "en"]) {
    const qs = DEMO_BANK[L].topics.flatMap((t) => t.qs);
    assert.ok(qs.length >= 8 && qs.length <= 12, L + " count " + qs.length);
    for (const q of qs) {
      assert.equal(q.opts.length, 4);
      assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < 4);
      assert.ok(q.q && q.ex);
    }
  }
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/client.test.mjs`
Expected: FAIL — helpers not defined.

- [ ] **Step 3: Replace the `TOPICS` literal with `DEMO_BANK` + the `BANKS` section**

Delete the entire `const TOPICS = [ ... ];` array literal. Replace with:

```js
let TOPICS = [];

const DEMO_BANK = {
  es: { topics: [
    { id: "sql", name: "SQL", color: "#4bc0d9", qs: [
      { q: "¿Diferencia entre INNER JOIN y LEFT JOIN?", opts: ["INNER trae solo coincidencias; LEFT trae todas las filas de la izquierda y NULL donde no hay match", "Son iguales", "LEFT solo funciona con índices", "INNER conserva filas sin match"], a: 0, ex: "LEFT JOIN preserva la tabla izquierda completa; útil para ver qué registros no tienen correspondencia. En entrevista, menciona un caso: clientes sin pedidos." },
      { q: "¿WHERE vs HAVING?", opts: ["WHERE filtra filas antes de agrupar; HAVING filtra grupos después de GROUP BY", "HAVING es más rápido", "WHERE no permite AND", "Son intercambiables"], a: 0, ex: "HAVING opera sobre agregados (COUNT, SUM). Ejemplo: HAVING COUNT(*) > 5." },
      { q: "¿Qué hace GROUP BY?", opts: ["Agrupa filas con el mismo valor para aplicar agregados por grupo", "Ordena el resultado", "Elimina duplicados de una columna", "Une dos tablas"], a: 0, ex: "Cada grupo produce una fila; las columnas del SELECT deben estar agregadas o en el GROUP BY." },
    ]},
    { id: "python", name: "Python", color: "#4bc0d9", qs: [
      { q: "¿Lista vs tupla?", opts: ["La lista es mutable; la tupla es inmutable", "La tupla es más lenta siempre", "La lista no admite duplicados", "No hay diferencia"], a: 0, ex: "Usa tupla para datos fijos (coordenadas, registros) y como clave de diccionario." },
      { q: "¿Qué hace dict.get('k', 0)?", opts: ["Devuelve el valor de 'k' o 0 si no existe, sin lanzar KeyError", "Borra la clave 'k'", "Siempre devuelve 0", "Lanza KeyError"], a: 0, ex: "Evita try/except para accesos con valor por defecto." },
      { q: "¿Qué imprime [x*x for x in range(4)]?", opts: ["[0, 1, 4, 9]", "[1, 4, 9, 16]", "[0, 1, 2, 3]", "range(4)"], a: 0, ex: "List comprehension: eleva al cuadrado 0..3." },
      { q: "¿Para qué sirve pandas?", opts: ["Manipular datos tabulares (DataFrame): filtrar, agrupar, unir, resumir", "Graficar mapas", "Servir páginas web", "Entrenar redes neuronales"], a: 0, ex: "df.groupby(...).agg(...) es el equivalente a GROUP BY de SQL." },
    ]},
    { id: "datos", name: "Análisis de datos", color: "#3fb27f", qs: [
      { q: "¿Qué caracteriza a un buen KPI?", opts: ["Es medible, accionable y está alineado a un objetivo", "Tiene muchos decimales", "Cambia de definición seguido", "Solo lo entiende el analista"], a: 0, ex: "Si nadie puede influir en el número o nadie lo revisa, sobra." },
      { q: "'Dos variables suben juntas, luego una causa la otra.' ¿Qué falla?", opts: ["Confunde correlación con causalidad; puede haber un tercer factor o azar", "Nada", "Faltan colores", "El tamaño de muestra no importa"], a: 0, ex: "Antes de afirmar causa: controla variables, revisa el mecanismo, compara con un grupo de control." },
      { q: "Antes de analizar datos nuevos, ¿qué haces primero?", opts: ["Explorar y limpiar: nulos, duplicados, tipos, rangos imposibles, atípicos", "Sacar conclusiones", "Hacer el reporte final", "Borrar filas con cualquier nulo sin mirar"], a: 0, ex: "Documentar qué se limpió y por qué da credibilidad al resultado." },
    ]},
  ]},
  en: { topics: [
    { id: "sql", name: "SQL", color: "#4bc0d9", qs: [
      { q: "INNER JOIN vs LEFT JOIN?", opts: ["INNER returns only matches; LEFT returns all left rows with NULLs where there is no match", "They are identical", "LEFT needs indexes", "INNER keeps unmatched rows"], a: 0, ex: "LEFT JOIN keeps the whole left table — handy to find rows with no match, e.g. customers with no orders." },
      { q: "WHERE vs HAVING?", opts: ["WHERE filters rows before grouping; HAVING filters groups after GROUP BY", "HAVING is faster", "WHERE can't use AND", "Interchangeable"], a: 0, ex: "HAVING works on aggregates, e.g. HAVING COUNT(*) > 5." },
      { q: "What does GROUP BY do?", opts: ["Groups rows sharing a value so aggregates are computed per group", "Sorts the result", "Removes duplicates from a column", "Joins two tables"], a: 0, ex: "Each group yields one row; SELECT columns must be aggregated or in the GROUP BY." },
    ]},
    { id: "python", name: "Python", color: "#4bc0d9", qs: [
      { q: "List vs tuple?", opts: ["List is mutable; tuple is immutable", "Tuple is always slower", "List forbids duplicates", "No difference"], a: 0, ex: "Use a tuple for fixed data and as a dict key." },
      { q: "What does dict.get('k', 0) do?", opts: ["Returns the value for 'k', or 0 if missing, without raising KeyError", "Deletes 'k'", "Always returns 0", "Raises KeyError"], a: 0, ex: "Avoids try/except for defaulted lookups." },
      { q: "What does [x*x for x in range(4)] print?", opts: ["[0, 1, 4, 9]", "[1, 4, 9, 16]", "[0, 1, 2, 3]", "range(4)"], a: 0, ex: "List comprehension squaring 0..3." },
      { q: "What is pandas for?", opts: ["Working with tabular data (DataFrame): filter, group, join, summarise", "Drawing maps", "Serving web pages", "Training neural nets"], a: 0, ex: "df.groupby(...).agg(...) is SQL's GROUP BY." },
    ]},
    { id: "data", name: "Data analysis", color: "#3fb27f", qs: [
      { q: "What makes a good KPI?", opts: ["Measurable, actionable, aligned to a goal", "Many decimals", "Redefined often", "Only the analyst understands it"], a: 0, ex: "If no one can move the number or no one reviews it, drop it." },
      { q: "'Two variables rise together, so one causes the other.' What's wrong?", opts: ["Confuses correlation with causation; a third factor or chance may explain it", "Nothing", "Needs more colours", "Sample size is irrelevant"], a: 0, ex: "Before claiming cause: control variables, check the mechanism, compare against a control group." },
      { q: "Before analysing a new dataset, what comes first?", opts: ["Explore and clean: nulls, duplicates, types, impossible ranges, outliers", "Draw conclusions", "Build the final report", "Drop any row with a null unseen"], a: 0, ex: "Documenting what you cleaned and why gives the result credibility." },
    ]},
  ]},
};

/* ============================================================
   BANKS
   ============================================================ */
function loadBanksStore() {
  try {
    const p = JSON.parse(localStorage.getItem("sprint-banks") || "");
    if (p && Array.isArray(p.banks)) return { activeId: p.activeId || null, banks: p.banks };
  } catch (e) {}
  return { activeId: null, banks: [] };
}
function saveBanksStore(s) { try { localStorage.setItem("sprint-banks", JSON.stringify(s)); } catch (e) {} }
function banksList() { return loadBanksStore().banks; }
function activeBank() { const s = loadBanksStore(); return s.banks.find((b) => b.id === s.activeId) || null; }

function _hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h).toString(36).slice(0, 6).padStart(6, "0"); }

function addBank({ title, lang, topics, sourceHint }) {
  const s = loadBanksStore();
  const id = "b" + _hash(String(title) + Date.now());
  const bank = {
    id, title: String(title || "").trim() || "Banco", lang: lang === "en" ? "en" : "es",
    createdAt: Date.now(), sourceHint: sourceHint || "job",
    topics: topics.map((tp) => ({ id: id + "-" + tp.id, name: tp.name, color: tp.color, qs: tp.qs })),
  };
  s.banks.push(bank); s.activeId = id; saveBanksStore(s);
  return bank;
}
function setActiveBank(id) { const s = loadBanksStore(); if (s.banks.some((b) => b.id === id)) { s.activeId = id; saveBanksStore(s); } }
function deleteBank(id) {
  const s = loadBanksStore();
  s.banks = s.banks.filter((b) => b.id !== id);
  if (s.activeId === id) s.activeId = s.banks.length ? s.banks[s.banks.length - 1].id : null;
  saveBanksStore(s);
}
function buildTopicsFromActive() { const b = activeBank(); TOPICS = b ? b.topics : []; }
function loadDemo() {
  const src = DEMO_BANK[lang] || DEMO_BANK.es;
  const b = addBank({ title: t("setup_load_demo"), lang, topics: src.topics, sourceHint: "demo" });
  setActiveBank(b.id); buildTopicsFromActive();
  toast(t("setup_demo_loaded")); renderHome(); show("s-home");
}
function showDemoOffer() {
  const msg = $("#setupMsg");
  const btn = document.createElement("button");
  btn.className = "btn"; btn.style.marginTop = "10px";
  btn.textContent = t("setup_load_demo");
  btn.addEventListener("click", loadDemo);
  msg.appendChild(document.createElement("br"));
  msg.appendChild(btn);
}
```

- [ ] **Step 4: Rebuild `renderHome` around the active bank**

In `renderHome`, before rendering the topic grid: `buildTopicsFromActive();`. If `!activeBank()`, `show("s-setup"); renderSetup(); return;`. Render a header line with `activeBank().title` and, when `activeBank().lang !== lang`, a note `t("home_bank_lang_note", { lang: t("lang_" + activeBank().lang) })`. Add two controls above the mastery grid:

```js
// "Nueva entrevista" button
const nb = $("#newBankBtn"); nb.textContent = t("home_new_interview");
nb.onclick = () => { show("s-setup"); renderSetup(); };
// bank switcher (only when >1)
const sw = $("#bankSwitch");
const list = banksList();
if (list.length > 1) {
  sw.style.display = "";
  sw.innerHTML = "";
  list.forEach((b) => { const o = document.createElement("option"); o.value = b.id; o.textContent = b.title; if (b.id === activeBank().id) o.selected = true; sw.appendChild(o); });
  sw.onchange = () => { setActiveBank(sw.value); renderHome(); };
} else sw.style.display = "none";
```

Add the matching markup in `#s-home` (a `<button id="newBankBtn">` and `<select id="bankSwitch">`) in the section label row.

- [ ] **Step 5: Setup-first INIT**

Replace the INIT tail:

```js
applyI18n();
renderHud();
if (activeBank()) { buildTopicsFromActive(); renderHome(); show("s-home"); }
else { renderSetup(); show("s-setup"); }
```

`bindSetupOnce()` must be called once during INIT too.

- [ ] **Step 6: Run tests, expect pass**

Run: `node --test test/`
Expected: PASS (all suites).

- [ ] **Step 7: Manual verify full flow**

Start dev server (with a real `LLM_API_KEY` if available, else use the console stub from Task 7). Fresh browser profile / cleared storage:
1. App opens on the setup screen.
2. Generate (real or stubbed) → lands on home with the generated topics, mastery `0/N`.
3. Play one **Practice** round, one **Flashcards**, start a **Mock**, do one **Open answer** (falls back to reveal if no key), one **Teach**.
4. "Nueva entrevista" → generate a second bank → switcher appears → switch back and forth.
5. Reload → last active bank restored, progress kept.
6. Force an error (stub `/api/generate` to 502) with no banks → "Load example" appears → loads the demo.

- [ ] **Step 8: Commit**

```bash
git add index.html test/client.test.mjs
git commit -m "feat: localStorage bank persistence, runtime TOPICS, bank switcher, demo fallback; remove static bank"
```

---

## Task 9: Daily generation cap + bring-your-own-key

**Files:**
- Modify: `index.html` (`QUOTA` script section; API-key field in the `#oaCfg` panel; plumb `userKey` into `aiGrade` and `runGeneration`)
- Test: `test/client.test.mjs` (extend)

**Interfaces:**
- Produces:
  - `const GEN_LIMIT = 5`
  - `function genQuota()` → `{ day: "YYYY-MM-DD", count: n }` from `localStorage["sprint-gen-usage"]` (resets when `day` differs from today).
  - `function checkGenQuota()` → `{ ok: true }` when `userKey()` is set OR `count < GEN_LIMIT`; else `{ ok: false, limit: GEN_LIMIT }`.
  - `function bumpGenQuota()` — increments today's count (no-op when `userKey()` set).
  - `function userKey()` → `localStorage["sprint-user-key"]` trimmed, or `""`.
  - `aiGrade` payload gains `userKey: userKey() || undefined`.

- [ ] **Step 1: Extend `test/client.test.mjs`**

```js
test("quota: resets on new day, blocks at limit, bypassed by userKey", () => {
  const ls = (await import("./helpers.mjs")).fakeLocalStorage();
  const api = extractClientHelpers(
    ["genQuota","checkGenQuota","bumpGenQuota","userKey","GEN_LIMIT"], { localStorage: ls },
  );
  assert.equal(api.checkGenQuota().ok, true);
  for (let i = 0; i < api.GEN_LIMIT; i++) api.bumpGenQuota();
  assert.equal(api.checkGenQuota().ok, false);
  ls.setItem("sprint-user-key", "sk-abc");
  assert.equal(api.checkGenQuota().ok, true);   // key bypasses
});
```
(If top-level `await` in the test file is awkward, make the test `async` and `import` helpers at the top instead.)

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/client.test.mjs`
Expected: FAIL — quota helpers not defined.

- [ ] **Step 3: Add the `QUOTA` script section**

```js
/* ============================================================
   QUOTA + USER KEY
   ============================================================ */
const GEN_LIMIT = 5;
function _today() { return new Date().toISOString().slice(0, 10); }
function userKey() { try { return (localStorage.getItem("sprint-user-key") || "").trim(); } catch (e) { return ""; } }
function genQuota() {
  let q; try { q = JSON.parse(localStorage.getItem("sprint-gen-usage") || ""); } catch (e) {}
  if (!q || q.day !== _today()) q = { day: _today(), count: 0 };
  return q;
}
function checkGenQuota() {
  if (userKey()) return { ok: true };
  return genQuota().count < GEN_LIMIT ? { ok: true } : { ok: false, limit: GEN_LIMIT };
}
function bumpGenQuota() {
  if (userKey()) return;
  const q = genQuota(); q.count++;
  try { localStorage.setItem("sprint-gen-usage", JSON.stringify(q)); } catch (e) {}
}
```

- [ ] **Step 4: Add the API-key field to the `#oaCfg` panel**

In the `#oaCfg` markup (created earlier for the backend URL), add below the URL row:

```html
<label class="ai-cfg-label" data-i18n="oa_cfg_key_label" for="oaKeyInput"></label>
<input id="oaKeyInput" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…">
```

In the cfg save handler, also persist the key:

```js
const k = $("#oaKeyInput").value.trim();
try { if (k) localStorage.setItem("sprint-user-key", k); else localStorage.removeItem("sprint-user-key"); } catch (e) {}
```
And when opening the panel, prefill: `$("#oaKeyInput").value = userKey();`

- [ ] **Step 5: Plumb `userKey` into grade calls**

In `aiGrade(payload)` (the function that POSTs to `/api/grade`), add `userKey: userKey() || undefined` to the JSON body it sends. `runGeneration` (Task 7) already includes it.

- [ ] **Step 6: Run tests, expect pass**

Run: `node --test test/`
Expected: PASS (all).

- [ ] **Step 7: Manual verify**

- With no key: generate 5 times (stub the endpoint to 200 quickly), 6th attempt shows `setup_limit_reached`.
- Open `⚙︎ IA`, enter any string as key, save. Generate again → allowed (quota bypassed). Network tab shows `userKey` in the request body for both `/api/generate` and `/api/grade`.
- Clear the key → limit re-applies next day boundary (or clear `sprint-gen-usage` to re-test).

- [ ] **Step 8: Commit**

```bash
git add index.html test/client.test.mjs
git commit -m "feat: 5/day per-browser generation cap with bring-your-own-key bypass"
```

---

## Task 10: Ko-fi support button

**Files:**
- Modify: `index.html` (HUD + results screen; `STR` keys already added in Task 6)

**Interfaces:**
- Produces: an anchor `#kofiBtn` / `.kofi-link` to `https://ko-fi.com/P5P61TI6BS`, label `☕ ` + `t("support_kofi")`, `target="_blank" rel="noopener"`. No external script.

- [ ] **Step 1: Add the HUD link**

In `.hud`, after the icon buttons:

```html
<a class="kofi-link" id="kofiBtn" href="https://ko-fi.com/P5P61TI6BS" target="_blank" rel="noopener"></a>
```

CSS:

```css
.kofi-link{font-family:"IBM Plex Mono",monospace;font-size:.74rem;color:#72a4f2;border:1px solid #72a4f2;border-radius:999px;padding:3px 9px;text-decoration:none;white-space:nowrap}
.kofi-link:hover{background:#72a4f2;color:#0b0e13}
@media (max-width:520px){ .kofi-link{display:none} }
```

- [ ] **Step 2: Add it to the results screen**

In `#s-result`'s `.cta-row`, add a second anchor with the same class/href so it also shows after a round (visible on mobile there).

- [ ] **Step 3: Fill the label in `applyI18n()`**

Extend `applyI18n()`:

```js
document.querySelectorAll(".kofi-link").forEach((a) => { a.textContent = "☕ " + t("support_kofi"); });
```

- [ ] **Step 4: Manual verify**

Reload. HUD shows "☕ Invítame un café"; toggle to EN → "☕ Buy me a coffee". Click opens `https://ko-fi.com/P5P61TI6BS` in a new tab. Finish a round → the link also appears on the results screen.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: Ko-fi support link in the header and results screen"
```

---

## Task 11: Docs — README + .env.example

**Files:**
- Modify: `README.md`, `.env.example`

- [ ] **Step 1: Update `.env.example`**

Add a note that the same three vars power `/api/generate`; no new vars. Keep existing content.

```
# Estas mismas variables alimentan /api/grade y /api/generate.
# LLM_API_KEY es obligatoria salvo que el usuario pegue su propia key en la app (⚙︎ IA).
```

- [ ] **Step 2: Rewrite the top of `README.md`**

Replace the "Contenido" + "Modos" sections with:

```markdown
## Cómo funciona

1. Pega la **descripción del empleo** (obligatorio).
2. Opcional: pega tu **CV** o suelta un `.pdf` / `.docx` / `.txt` (se lee en tu navegador, no se sube).
3. Opcional: tu **usuario de GitHub** y/o una descripción de tus proyectos.
4. La IA genera un banco de preguntas de opción múltiple adaptado a ti, en español o inglés.

Luego practicas con 5 modos: práctica por tema, flashcards, entrevista simulada,
respuesta abierta (la IA califica lo que escribes) y "enséñale a la IA" (técnica Feynman).

Los bancos y el progreso se guardan solo en tu navegador. Límite de 5 generaciones por
día por navegador; añade tu propia API key en ⚙︎ IA para quitar el límite.

## Idiomas

Interfaz en español e inglés (botón ES/EN). Cada banco queda en el idioma en que se generó.
```

Update the "Deploy en Vercel" section to mention `api/generate.js` deploys automatically
alongside `api/grade.js`, same env vars, and that `vendor/` is served as static assets.
Remove references to the removed 110-question bank.

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: document the generate flow, languages, daily limit, own-key"
```

---

## Task 12: Full integration pass + deploy

**Files:** none (verification + release)

- [ ] **Step 1: Run the whole test suite**

Run: `node --test test/`
Expected: PASS across `bank`, `llm`, `grade`, `generate`, `client`.

- [ ] **Step 2: Syntax-check every shipped JS**

```bash
node --check api/_llm.js && node --check api/_bank.js && node --check api/grade.js && node --check api/generate.js && node --check dev-server.mjs
node -e "const h=require('fs').readFileSync('index.html','utf8');new Function(h.match(/<script>([\s\S]*)<\/script>/)[1]);console.log('index.html JS OK')"
```

- [ ] **Step 3: Real end-to-end on the dev server (needs a Groq key)**

```bash
LLM_API_KEY=YOUR_GROQ_KEY node dev-server.mjs
```
In the browser at `http://localhost:4600`:
- Paste a real job description (e.g. the CEMEX posting). Generate → a bank with 3–6 topics appears within ~20 s.
- Add a GitHub username → regenerate → at least one "Tu proyecto: X" topic appears (or `meta.githubSkipped` logged if rate-limited).
- Drop a real PDF CV → text lands in the CV field → generate → CV-specific questions appear.
- Switch to EN, generate → questions come back in English.
- Run one round of each of the 5 modes on a generated bank; open-answer and teach reach the AI and return a verdict.
- `node --test test/` still green.

- [ ] **Step 4: Push and confirm Vercel**

```bash
git status            # clean
git push origin main
```
After Vercel redeploys (~1 min):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://sprint-entrevista.vercel.app/
curl -s -o /dev/null -w "%{http_code}\n" https://sprint-entrevista.vercel.app/vendor/mammoth.browser.min.js
curl -s -X POST https://sprint-entrevista.vercel.app/api/generate -H 'Content-Type: application/json' \
  -d '{"jobDescription":"Data analyst intern, SQL and Power BI","language":"en","count":12}' | head -c 300
```
Expected: `200`, `200`, and a JSON body with `"topics"`.

- [ ] **Step 5: Republish the Artifact**

Copy `index.html` to the scratchpad path used for the Artifact and republish (same URL). Verify in the published Artifact: setup screen loads; file-drop zone is hidden (vendor 404) but paste works; generating requires the backend URL in `⚙︎ IA`; Ko-fi link works.

- [ ] **Step 6: Final commit / tag (optional)**

```bash
git commit --allow-empty -m "chore: public generated-bank release"
git push origin main
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| Setup screen: job / CV / GitHub / projects / language / count | 7 (markup + wiring), 6 (i18n), 8 (persist result) |
| Client-side `.txt/.md/.pdf/.docx` extraction, degrade on Artifact | 7 (`extractFileText`, `fileSupport`) |
| `api/generate.js` — inputs, validation, clamp | 4 |
| GitHub enrichment (repos + READMEs, 403/404 handling, `githubSkipped`) | 4 (`fetchGithubSummary`) |
| LLM prompt + JSON mode + one retry + `bad_json` | 4 (`buildMessages`, retry loop, `parseQuestions`) |
| Response validation (4 opts, distinct, `a` range, topic grouping, slug ids, colours, truncate to count, <6 → error) | 1 (`validateQuestions`) + 4 (call) |
| `api/grade.js` accepts `userKey` | 3 |
| Shared provider resolution/call | 2 (`_llm.js`), 3 (grade uses it) |
| Bilingual UI: `STR`, `t()`, `lang`, toggle, `applyI18n`, generated bank keeps its language + note | 6 |
| Bank persistence `sprint-banks` `{activeId,banks[]}`, title from job desc, switcher, delete, slug-prefixed topic ids | 8 |
| Runtime `TOPICS`, setup-first init | 8 |
| `DEMO_BANK` (es+en) fallback via "load example" | 8 |
| Anti-abuse: 5/day per browser, own-key bypass, own-key field in `⚙︎ IA`, `userKey` to both endpoints | 9 |
| Server-side best-effort IP throttle | Noted in spec as best-effort; **not implemented** (unreliable on serverless; Groq rate-limit is the real backstop) — acceptable per spec wording, no task |
| Ko-fi styled link (no external script), header + results | 10 |
| Files: `api/generate.js`, `vendor/*`, i18n, setup; modified `grade.js`, `dev-server.mjs`, `index.html`, `.env.example`, `README.md`; removed 110 Qs | 1–11 |
| Risks: JSON reliability, GitHub rate limit, vendor size, Artifact degradation, key abuse, CV privacy | Handled in 4/7/8/9; CV-privacy note added to README in 11 |

Gap accepted: the server-side per-IP throttle from the spec's Anti-abuse section is intentionally not built (serverless instances don't share memory; it would be theatre). The client cap + own-key + provider rate-limit cover the intent. Flag to the user at review.

**2. Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N". Every code step has real code. Cross-task references (`addBank`, `checkGenQuota`, `userKey`, `buildTopicsFromActive`, `showDemoOffer`) are all defined in Tasks 8–9 and called from Task 7; Task 7 Step 4 notes the ordering dependency (implement 7.1–7.3, then 8, then wire 7.4).

**3. Type consistency:** `validateQuestions` returns `{topics, kept, dropped}` — consumed that way in Task 4. `callChat` returns `{ok, content}` / `{ok:false,error,status,detail}` — matched in Tasks 3 and 4. Bank record shape `{id,title,lang,createdAt,sourceHint,topics:[{id,name,color,qs}]}` — consistent across Tasks 7, 8. `t(key, vars)` signature consistent. `aiBase()` reused for both `/api/grade` and `/api/generate` base URLs. `topic.qs[i]` shape `{q,code?,opts,a,ex}` identical to the pre-existing quiz/flashcard/mock code, so all five modes work on generated banks unchanged.
