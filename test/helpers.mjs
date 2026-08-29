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
