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
