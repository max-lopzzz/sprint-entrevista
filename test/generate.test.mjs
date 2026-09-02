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

test("generate: retries once when first output has too few valid questions, then 200", async () => {
  process.env.LLM_API_KEY = "k";
  const orig = globalThis.fetch;
  const tooFew = JSON.stringify({
    questions: [
      { topic: "SQL", q: "Q1", opts: ["a", "b", "c", "d"], a: 0, ex: "porque sí" },
      { topic: "SQL", q: "Q2", opts: ["a", "b", "c", "d"], a: 1, ex: "porque sí" },
    ],
  });
  let call = 0;
  globalThis.fetch = mockFetch([
    ["chat/completions", () => {
      call++;
      const content = call === 1 ? tooFew : okQuestions;
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }],
  ]);
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "Analista", language: "es" }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(call, 2);
  assert.equal(res.body.meta.kept, 18);
  globalThis.fetch = orig;
});

test("generate: too few valid questions on both attempts -> 502 bad_json", async () => {
  process.env.LLM_API_KEY = "k";
  const orig = globalThis.fetch;
  const tooFew = JSON.stringify({
    questions: [{ topic: "SQL", q: "Q1", opts: ["a", "b", "c", "d"], a: 0, ex: "porque sí" }],
  });
  let call = 0;
  globalThis.fetch = mockFetch([
    ["chat/completions", () => { call++; return new Response(JSON.stringify({ choices: [{ message: { content: tooFew } }] }), { status: 200 }); }],
  ]);
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "Analista", language: "es" }) }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, "bad_json");
  assert.equal(call, 2);
  globalThis.fetch = orig;
});

test("generate: long projectsText does not crowd out the GitHub summary", async () => {
  process.env.LLM_API_KEY = "k";
  const orig = globalThis.fetch;
  const bigProjects = "PROYECTOX ".repeat(600); // ~6000 chars, well over the 3000 half-budget
  const repoLine = "SENTINEL_REPO_TOKEN";
  let sentBody = "";
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("api.github.com") && u.includes("/repos?")) {
      return new Response(JSON.stringify([{ name: repoLine, language: "Python", fork: false, description: "d", topics: [] }]), { status: 200 });
    }
    if (u.includes("api.github.com") && u.includes("/readme")) return new Response("", { status: 404 });
    if (u.includes("chat/completions")) {
      sentBody = init.body;
      return new Response(JSON.stringify({ choices: [{ message: { content: okQuestions } }] }), { status: 200 });
    }
    throw new Error("unexpected url " + u);
  };
  const res = resShim();
  await handler({ method: "POST", body: JSON.stringify({ jobDescription: "Analista", language: "es", githubUser: "octocat", projectsText: bigProjects }) }, res);
  assert.equal(res.statusCode, 200);
  assert.match(sentBody, /SENTINEL_REPO_TOKEN/); // GitHub summary survived alongside the long projectsText
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
