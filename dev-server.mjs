// Servidor local para desarrollo: sirve la página estática y ejecuta la función api/grade.js.
// No hace falta para producción (eso lo hace Vercel). Útil para probar los modos con IA en local.
//
//   LLM_API_KEY=tu_key_de_groq node dev-server.mjs
//   # luego abre http://localhost:4600
//
// Sin LLM_API_KEY, /api/grade responde 503 y la página cae al modo de autoevaluación.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import gradeHandler from "./api/grade.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4600;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
};

function resShim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return res; };
  return res;
}

createServer(async (req, res) => {
  if (req.url === "/api/generate" || req.url.startsWith("/api/generate?")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      req.body = body;
      const mod = await import("./api/generate.js");
      try { await mod.default(req, resShim(res)); }
      catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: "handler_threw", detail: String(e) })); }
    });
    return;
  }
  if (req.url === "/api/grade" || req.url.startsWith("/api/grade?")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      req.body = body;
      try { await gradeHandler(req, resShim(res)); }
      catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: "handler_threw", detail: String(e) })); }
    });
    return;
  }
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const full = normalize(join(ROOT, p));
  if (!full.startsWith(ROOT)) { res.statusCode = 403; return res.end("forbidden"); }
  try {
    const buf = await readFile(full);
    res.setHeader("Content-Type", TYPES[extname(full)] || "application/octet-stream");
    res.end(buf);
  } catch { res.statusCode = 404; res.end("not found"); }
}).listen(PORT, () => {
  console.log(`dev server: http://localhost:${PORT}  (LLM_API_KEY ${process.env.LLM_API_KEY ? "set" : "NOT set"})`);
});
