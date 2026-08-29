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
