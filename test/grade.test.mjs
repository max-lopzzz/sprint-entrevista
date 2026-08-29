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
