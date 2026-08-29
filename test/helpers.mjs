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
  // Forgiving DOM stub: the inline script wires event listeners and does a
  // first render at top level. We only want to reach `STR`/`t`, so every DOM
  // access resolves to a chainable, callable no-op proxy.
  const domStub = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.iterator) return undefined;
      if (prop === Symbol.toPrimitive) return () => "";
      return domStub;
    },
    set() { return true; },
    apply() { return domStub; },
  });
  const document = {
    documentElement: domStub,
    body: domStub,
    addEventListener() {},
    querySelector() { return domStub; },
    querySelectorAll() { return []; },
    getElementById() { return domStub; },
    createElement() { return domStub; },
  };
  const ctx = {
    window: { scrollTo() {} }, document,
    navigator: { language: "es-MX" }, localStorage: fakeLocalStorage(),
    console, structuredClone, setTimeout, clearTimeout, fetch: undefined,
    ...sandbox,
  };
  const body = `${script}\n;return {${names.join(",")}};`;
  const fn = new Function(...Object.keys(ctx), body);
  return fn(...Object.values(ctx));
}
