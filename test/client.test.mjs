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
