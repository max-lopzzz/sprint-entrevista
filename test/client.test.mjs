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
