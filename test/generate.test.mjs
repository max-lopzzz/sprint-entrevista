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
