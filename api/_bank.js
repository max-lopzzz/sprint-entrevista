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
