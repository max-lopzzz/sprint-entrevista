// api/generate.js — build a multiple-choice interview-prep bank from a job
// description (+ optional CV and GitHub/portfolio) using an OpenAI-compatible LLM.
// Same env vars as grade.js. Sensitive input is used for one request and not stored.

import { resolveProvider, callChat, NoKeyError } from "./_llm.js";
import { validateQuestions, clampCount } from "./_bank.js";

const LIMITS = { job: 8000, cv: 15000, projects: 6000, github: 6000 };
const GH_USER_RE = /^[A-Za-z0-9-]{1,39}$/;

function clip(s, n) { return (typeof s === "string" ? s : "").slice(0, n); }

export async function fetchGithubSummary(user) {
  if (!GH_USER_RE.test(user || "")) return { text: "", skipped: "invalid_user" };
  const H = { "User-Agent": "sprint-entrevista", Accept: "application/vnd.github+json" };
  let repos;
  try {
    const r = await fetch(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=15`, { headers: H });
    if (r.status === 404) return { text: "", skipped: "not_found" };
    if (r.status === 403) return { text: "", skipped: "rate_limited" };
    if (!r.ok) return { text: "", skipped: "http_" + r.status };
    repos = await r.json();
  } catch (_) {
    return { text: "", skipped: "unreachable" };
  }
  if (!Array.isArray(repos)) return { text: "", skipped: "bad_response" };

  const real = repos.filter((x) => x && !x.fork);
  const lines = real.map((x) => {
    const topics = Array.isArray(x.topics) && x.topics.length ? ` [${x.topics.join(", ")}]` : "";
    return `- ${x.name} (${x.language || "?"})${topics}: ${x.description || "—"}`;
  });

  const readmes = [];
  for (const x of real.slice(0, 4)) {
    try {
      const rr = await fetch(`https://api.github.com/repos/${user}/${x.name}/readme`, { headers: H });
      if (!rr.ok) continue;
      const j = await rr.json();
      const body = Buffer.from(j.content || "", "base64").toString("utf8").replace(/\s+/g, " ").trim();
      if (body) readmes.push(`### ${x.name}\n${body.slice(0, 800)}`);
    } catch (_) { /* skip */ }
  }

  const text = clip(
    `Repositorios:\n${lines.join("\n")}\n\nREADMEs:\n${readmes.join("\n\n")}`,
    LIMITS.github,
  );
  return { text };
}

export function buildMessages({ jobDescription, cv, projectsSummary, language, count }) {
  const langName = language === "en" ? "English" : "Spanish";
  const system =
    `You are an expert technical interviewer building a practice question bank. ` +
    `Output ONLY a JSON object: {"questions":[{"topic","q","code","opts","a","ex"}]}. ` +
    `Produce exactly ${count} questions. Rules: "opts" is an array of exactly 4 distinct ` +
    `plausible strings; "a" is the 0-based index of the single correct option; "q" is the ` +
    `question stem; "ex" is 1-3 sentences saying why the answer is correct AND how to talk ` +
    `about it in an interview; "code" is optional, include only when a snippet is needed. ` +
    `Group questions into 3-6 topics you name in the "topic" field: core skills named in ` +
    `the JOB DESCRIPTION, one "${language === "en" ? "Your project" : "Tu proyecto"}: <name>" ` +
    `topic per notable project from PROJECTS, and one behavioural/STAR topic. Target mix: ` +
    `~60% job-description technical, ~25% CV/projects specifics, ~15% behavioural. ` +
    `Write every field in ${langName}. Return JSON only, no prose, no markdown fences.`;

  const parts = [`JOB DESCRIPTION:\n${clip(jobDescription, LIMITS.job)}`];
  if (cv && cv.trim()) parts.push(`CV:\n${clip(cv, LIMITS.cv)}`);
  if (projectsSummary && projectsSummary.trim()) parts.push(`PROJECTS:\n${clip(projectsSummary, LIMITS.projects)}`);
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}

function parseQuestions(content) {
  // tolerate ```json fences and leading/trailing prose
  let s = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const first = s.indexOf("{"); const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  let b;
  try { b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (_) { return res.status(400).json({ error: "bad_request" }); }

  const language = b.language === "en" ? "en" : b.language === "es" ? "es" : null;
  if (!b.jobDescription || !String(b.jobDescription).trim() || !language) {
    return res.status(400).json({ error: "bad_request" });
  }
  const count = clampCount(b.count);

  let provider;
  try { provider = resolveProvider({ userKey: b.userKey }); }
  catch (e) { if (e instanceof NoKeyError) return res.status(503).json({ error: "no_key" }); throw e; }

  let githubSkipped;
  let projectsSummary = clip(b.projectsText, LIMITS.projects);
  if (b.githubUser) {
    const gh = await fetchGithubSummary(String(b.githubUser).trim());
    if (gh.skipped) githubSkipped = gh.skipped;
    if (gh.text) projectsSummary = clip(`${projectsSummary}\n\n${gh.text}`, LIMITS.projects + LIMITS.github);
  }

  const messages = buildMessages({ jobDescription: b.jobDescription, cv: b.cv, projectsSummary, language, count });

  // Up to one retry total: either the model didn't return valid JSON, or it
  // did but too few items survived validation (spec: retry once on <6 valid).
  let parsed = null;
  let topics = [], kept = 0, dropped = 0;
  let failReason = null; // "bad_json" | "few"
  for (let attempt = 0; attempt < 2; attempt++) {
    let msgs = messages;
    if (attempt > 0) {
      const reminder = failReason === "bad_json"
        ? "Your previous answer was not valid JSON. Reply again with ONLY the JSON object."
        : `Your previous answer only had ${kept} usable question(s) after validation (need at least 6). ` +
          `Re-check the rules: "opts" must be exactly 4 distinct non-empty strings, "a" a valid 0-based ` +
          `index, "q" and "ex" non-empty. Reply again with ONLY the JSON object containing ${count} ` +
          `well-formed questions.`;
      msgs = [...messages, { role: "user", content: reminder }];
    }
    const out = await callChat({ provider, messages: msgs, temperature: 0.4, maxTokens: 4500, jsonMode: true });
    if (!out.ok) {
      const status = out.error === "no_key" ? 503 : 502;
      return res.status(status).json({ error: out.error, status: out.status, detail: out.detail, model: provider.model });
    }
    parsed = parseQuestions(out.content);
    if (!parsed) { failReason = "bad_json"; continue; }
    ({ topics, kept, dropped } = validateQuestions(parsed, { count, fallbackTopic: "General" }));
    if (kept >= 6) { failReason = null; break; }
    failReason = "few";
  }
  if (!parsed) return res.status(502).json({ error: "bad_json" });
  if (kept < 6) return res.status(502).json({ error: "bad_json", detail: `only ${kept} valid questions` });

  return res.status(200).json({
    topics,
    meta: { model: provider.model, requested: count, returned: kept + dropped, kept, dropped, githubSkipped },
  });
}
