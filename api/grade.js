// Serverless function (Vercel) — proxy de calificación / tutoría para "Sprint de Entrevista".
//
// El navegador NUNCA ve la API key: vive solo en las variables de entorno de Vercel.
// Compatible con cualquier proveedor con API estilo OpenAI (chat/completions).
//
// Variables de entorno:
//   LLM_API_KEY   (obligatoria)  -> Groq: https://console.groq.com/keys  (gratis, sin tarjeta)
//   LLM_BASE_URL  (opcional)     -> por defecto https://api.groq.com/openai/v1
//   LLM_MODEL     (opcional)     -> por defecto llama-3.3-70b-versatile
//
// Otros proveedores (solo cambia las env vars, no el código):
//   OpenRouter : LLM_BASE_URL=https://openrouter.ai/api/v1        LLM_MODEL=meta-llama/llama-3.3-70b-instruct:free
//   Cerebras   : LLM_BASE_URL=https://api.cerebras.ai/v1          LLM_MODEL=llama-3.3-70b
//   Gemini     : LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai   LLM_MODEL=gemini-2.0-flash
//   Ollama     : LLM_BASE_URL=http://localhost:11434/v1           LLM_MODEL=llama3.1   (solo local)

const MAX_TURNS = 24;
const MAX_CHARS = 4000;

function systemPrompt(mode, p) {
  const ref =
    `Tema: ${p.topic}\n` +
    `Pregunta / concepto: ${p.question}\n` +
    (p.code ? `Código de la pregunta:\n${p.code}\n` : "") +
    `Respuesta correcta de referencia: ${p.correct}\n` +
    `Explicación de referencia: ${p.explain}\n`;

  if (mode === "teach") {
    return (
      `Eres un ESTUDIANTE curioso y despierto. El usuario te va a ENSEÑAR un concepto ` +
      `(técnica Feynman: se aprende mejor lo que se explica a otros). Usa esta referencia para juzgar, ` +
      `pero NO la reveles tal cual salvo para corregir un error:\n\n${ref}\n` +
      `En tu PRIMERA respuesta a su explicación:\n` +
      `1) Empieza con una línea exacta: "VEREDICTO: CORRECTO" (explicación precisa y completa), ` +
      `"VEREDICTO: PARCIAL" (correcta pero incompleta o imprecisa) o "VEREDICTO: INCORRECTO" (con errores de fondo o "no sé").\n` +
      `2) En 2 a 4 frases: qué explicó bien, qué faltó o quedó impreciso frente a la referencia, y un resumen corregido de una frase.\n` +
      `3) Termina con UNA pregunta corta de estudiante curioso para que profundice.\n` +
      `En los mensajes siguientes actúa como estudiante: responde dudas, repregunta, sin volver a poner "VEREDICTO:".\n` +
      `Español, tutéalo, tono cercano y motivador. Sé conciso (máx. ~120 palabras). ` +
      `Usa **negritas** para términos clave y \`código\` para identificadores; nada de listas largas ni encabezados.`
    );
  }

  return (
    `Eres un TUTOR técnico que evalúa la respuesta de un candidato en una entrevista de prácticas. ` +
    `Tienes la solución; el candidato NO ve opciones múltiples:\n\n${ref}\n` +
    `En tu PRIMERA respuesta:\n` +
    `1) Primera línea exacta: "VEREDICTO: CORRECTO", "VEREDICTO: PARCIAL" o "VEREDICTO: INCORRECTO" ` +
    `(usa INCORRECTO también si dice que no sabe).\n` +
    `2) En 2 a 4 frases: qué acertó, qué le falta o dónde se equivocó, y la idea correcta explicada con claridad. ` +
    `Si ayuda, un ejemplo muy corto.\n` +
    `En los mensajes siguientes responde sus dudas sobre esta pregunta sin repetir "VEREDICTO:". ` +
    `Si se va del tema, reencáuzalo con amabilidad.\n` +
    `Español, tutéalo, tono cercano y motivador. Sé conciso (máx. ~120 palabras). ` +
    `Usa **negritas** para términos clave y \`código\` para identificadores; nada de listas largas ni encabezados.`
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const key = process.env.LLM_API_KEY;
  if (!key) return res.status(503).json({ error: "no_key" });

  let b;
  try {
    b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ error: "bad_request" });
  }

  const mode = b.mode === "teach" ? "teach" : "grade";
  const history = Array.isArray(b.history) ? b.history : null;
  if (!b.question || !b.correct || !history || history.length === 0) {
    return res.status(400).json({ error: "bad_request" });
  }
  if (history.length > MAX_TURNS) return res.status(400).json({ error: "too_long" });

  const msgs = [{ role: "system", content: systemPrompt(mode, b) }];
  for (const m of history) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return res.status(400).json({ error: "bad_request" });
    }
    msgs.push({ role: m.role, content: m.content.slice(0, MAX_CHARS) });
  }

  const baseUrl = (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "llama-3.3-70b-versatile";

  try {
    const upstream = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: msgs, temperature: 0.3, max_tokens: 700 }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300);
      return res.status(502).json({ error: "upstream", status: upstream.status, detail });
    }

    const data = await upstream.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "";
    if (!reply || !reply.trim()) return res.status(502).json({ error: "empty_reply" });

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(502).json({ error: "upstream_unreachable" });
  }
}
