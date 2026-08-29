# Design — Public "Sprint de Entrevista" with generated question banks

Date: 2026-08-28
Status: approved for planning

## Goal

Turn the personal interview-prep tool into a public product. Any visitor can:

1. Paste a **job description** (required).
2. Optionally provide a **CV** (paste text, or drop a `.pdf` / `.docx` / `.txt` / `.md`).
3. Optionally provide **projects** (a GitHub username and/or free text).

From those inputs an LLM generates a custom multiple-choice question bank. All five
existing study modes (quiz, flashcards, mock interview, open answer, teach-the-AI)
operate on the generated bank. The UI is fully bilingual (Spanish / English). A Ko-fi
support link is shown.

The canonical deployment is `sprint-entrevista.vercel.app`. The Artifact build stays
published as a secondary, best-effort copy.

## Non-goals

- No user accounts, no server-side storage of user data. Everything the user enters
  stays in their browser except the one generation request.
- No custom domain in this scope.
- No maintenance of a large hand-written question bank (the 110-question ES bank is
  removed; a ~10-question embedded demo remains purely as an offline / AI-down fallback).
- No PDF/DOCX parsing on the server. Extraction is client-side only.

## Architecture overview

Static single-page `index.html` (served by Vercel, also published as an Artifact)
plus two serverless functions under `api/`:

- `api/generate.js` — **new.** Builds a question bank from the user's inputs.
- `api/grade.js` — existing. Gains support for a caller-supplied API key.

Client-side vendored libraries (loaded lazily, only when a file is dropped):

- `vendor/pdf.min.js` (pdf.js) — PDF text extraction.
- `vendor/mammoth.browser.min.js` (mammoth) — DOCX → text.

These live at repo paths and are served same-origin by Vercel. In the Artifact build
they 404; the client detects this and hides the file-drop affordance.

## Component: setup screen (`#s-setup`)

Shown on load when there is no active saved bank, and reachable any time via
"Nueva entrevista" / "New interview".

Fields:

| Field | Required | Notes |
|---|---|---|
| Job description | yes | textarea; generation is disabled until non-empty |
| CV | no | textarea + drop zone; see extraction below |
| GitHub username | no | plain string, e.g. `max-lopzzz` |
| Projects (free text) | no | textarea; combined with GitHub data |
| Language | n/a | ES/EN toggle, mirrors the HUD toggle, persisted |
| Question count | no | default 18; small select (12 / 18 / 24) |

Client-side file extraction (drop or file picker on the CV field):

- `.txt`, `.md` → read as text.
- `.pdf` → lazy-load `vendor/pdf.min.js`; extract text from all pages; cap at ~15k chars.
- `.docx` → lazy-load `vendor/mammoth.browser.min.js`; `convertToPlainText`.
- Extracted text is appended to the CV textarea (user can edit/trim before generating).
- On any failure (load error, parse error, unsupported type) show an inline message
  asking the user to paste the text instead. Never block on it.

"Generar" / "Generate" button:

1. Disabled while a generation is in flight.
2. Checks the per-browser daily quota (see Anti-abuse). If exhausted, shows the
   "use your own key" path instead of calling the shared backend.
3. POSTs to `api/generate` (see below). Shows an indeterminate progress state with
   rotating status lines.
4. On success: validate, persist the bank, rebuild `TOPICS`, go to home.
5. On failure: show the error detail (same pattern as `grade.js` errors) and, if no
   saved bank exists, offer "cargar ejemplo" / "load example".

## Component: `api/generate.js`

### Request

```
POST /api/generate
{
  jobDescription: string,     // required, trimmed, cap ~8k chars
  cv?: string,                // cap ~15k chars
  githubUser?: string,        // [A-Za-z0-9-]{1,39}
  projectsText?: string,      // cap ~6k chars
  language: "es" | "en",
  count?: number,             // 12..24, default 18
  userKey?: string            // optional caller-supplied provider key
}
```

Validation: reject with `400 {error:"bad_request"}` if `jobDescription` missing/empty
or `language` not in the set. Clamp `count` to `[12, 24]`. Truncate over-long fields
rather than rejecting.

### GitHub enrichment (only when `githubUser` is present and syntactically valid)

- `GET https://api.github.com/users/{u}/repos?sort=pushed&per_page=15`
  with header `User-Agent: sprint-entrevista`.
  - 404 → skip enrichment, continue.
  - 403 (rate limit) → skip enrichment, set `meta.githubSkipped = "rate_limited"`.
- From each non-fork repo keep: `name`, `description`, `language`, `topics`.
- For up to the 4 most recently pushed non-fork repos:
  `GET /repos/{u}/{name}/readme`, base64-decode `content`, keep first ~800 chars.
- Assemble a compact plain-text "projects summary" (hard cap ~6k chars) and merge it
  with `projectsText`.

### LLM call

- Endpoint / model: reuse `grade.js` env resolution
  (`LLM_BASE_URL` default `https://api.groq.com/openai/v1`,
   `LLM_MODEL` default `openai/gpt-oss-120b`).
- Auth: `userKey` if provided and non-empty, else `process.env.LLM_API_KEY`.
  If neither, `503 {error:"no_key"}`.
- Request JSON mode if the provider supports it
  (`response_format: {type: "json_object"}`); still parse defensively.
- `max_tokens` ~4500, `temperature` 0.4.

System prompt (summarised):

> You are an expert technical interviewer. Given a JOB DESCRIPTION and optionally a CV
> and PROJECTS summary, produce exactly N multiple-choice questions as JSON:
> `{"questions":[{"topic","q","code?","opts":[4 strings],"a":0-3,"ex"}]}`.
> Group questions into 3–6 topics you name yourself: core skills named in the job
> description, one "Tu proyecto: <name>" / "Your project: <name>" topic per notable
> project, and one behavioural/STAR topic. Target mix ≈ 60% job-description technical,
> 25% CV/projects specifics, 15% behavioural. Exactly 4 options each, exactly one
> correct, options mutually exclusive and plausible. `ex` = 1–3 sentences: why the
> answer is right + how to talk about it in an interview. `code` only when a snippet
> is needed. Write everything in {Spanish|English}. Output JSON only.

### Response validation

Parse `questions`. Keep an item only if:

- `q` non-empty string, `ex` non-empty string,
- `opts` is an array of exactly 4 non-empty strings, all distinct,
- `a` is an integer in `[0, 3]`,
- `topic` non-empty string (fallback to `"General"` if missing).

Slugify `topic` values into stable ids; assign a rotating colour from a fixed palette.
If fewer than 6 valid items, retry the LLM call **once** with a stricter reminder.
Return:

```
200 { questions: [...valid...], meta: { model, requested, returned, kept, githubSkipped? } }
```

Errors mirror `grade.js`: `{error, status?, detail?}` with `bad_key` / `model_not_found`
/ `rate_limit` / `upstream` / `upstream_unreachable` / `empty_reply` / `bad_json`.

## Component: `api/grade.js` change

Accept optional `userKey` in the body. Use it in place of `process.env.LLM_API_KEY`
when present and non-empty. No other change.

## Component: bilingual UI

- `STR = { es: {...}, en: {...} }` object near the top of the script, one key per
  visible string. `t(key, vars?)` does lookup + `{placeholder}` interpolation, falling
  back to the `es` value then the key itself.
- `lang` stored in `localStorage["sprint-lang"]`; defaults from
  `navigator.language.startsWith("es") ? "es" : "en"`.
- A toggle in the HUD (`ES | EN`) sets `lang`, persists, re-renders the current screen.
- All literal Spanish text currently in the HTML markup moves into `STR` and is applied
  on render (elements get ids or `data-i18n` keys; a `applyI18n()` pass fills them).
- Generated banks carry their own `lang`; questions are not re-translated on toggle.
  When the UI language differs from a bank's language, show a small note on the bank.

## Component: bank persistence & home

`localStorage["sprint-banks"]` = JSON:

```
{
  activeId: string | null,
  banks: [
    { id, title, lang, createdAt, sourceHint, topics: [ { id, name, color, qs: [...] } ] }
  ]
}
```

- `title` derived from the job description (first ~40 chars) or user-editable later.
- Home screen: header with active bank title + language note, the mastery grid for
  that bank's topics, a "Nueva entrevista" button, and a compact `<select>` bank
  switcher when `banks.length > 1`.
- On load: if `activeId` resolves to a bank, build `TOPICS` from it and show home;
  else show `#s-setup`.
- XP/mastery (`state.mastered`, `state.seen`, keyed by topic id) accumulate across
  banks; topic ids are slug-prefixed with a short bank hash to avoid collisions.
- Delete-bank action in the switcher (confirm first).

### Embedded demo fallback

A `DEMO_BANK` constant holding ~10 questions for a generic "data analyst intern" role,
with an `es` and an `en` variant (the active `lang` picks which). Only surfaced when
generation fails and no saved bank exists, via a "load example" button. Not shown
otherwise.

## Component: anti-abuse

- `localStorage["sprint-gen-usage"]` = `{ day: "YYYY-MM-DD", count: n }`.
  Limit: **5 generations per calendar day** per browser. On exceed, the Generate
  button explains the limit and points to "use your own key".
- Own-key: reuse the `⚙︎ IA` panel. Add a field "API key (optional)" stored in
  `localStorage["sprint-user-key"]`. When set, it is sent as `userKey` to both
  `api/generate` and `api/grade`, and the daily limit is not enforced.
- Server-side: best-effort per-IP throttle in `generate.js` (in-memory; unreliable
  across serverless instances — treated as a speed bump, not a guarantee). Groq's own
  rate limiting is the real backstop and never bills.

## Component: Ko-fi

A styled anchor button, label "☕ " + `t("support_kofi")`, linking to
`https://ko-fi.com/P5P61TI6BS` (`target="_blank" rel="noopener"`). Placed in the HUD
(compact) and on the results screen. No external script. The floating official widget
is not used (blocked by the Artifact CSP; inconsistent across builds).

## Files

New:

- `api/generate.js`
- `vendor/pdf.min.js`, `vendor/pdf.worker.min.js` (as needed), `vendor/mammoth.browser.min.js`
- `docs/superpowers/specs/2026-08-28-generated-question-banks-design.md` (this file)

Modified:

- `index.html` — i18n system, `#s-setup` screen, setup-first init, home rebuilt around
  saved banks, `TOPICS` becomes runtime-built, Ko-fi button, own-key field.
- `api/grade.js` — optional `userKey`.
- `.env.example`, `README.md` — document `/api/generate`, the daily limit, own-key,
  vendored libs.
- `dev-server.mjs` — route `/api/generate` to the new handler; serve `/vendor/*`.

Removed:

- The ~110 hand-written questions in `TOPICS` (structure kept; replaced by `DEMO_BANK`
  + runtime banks).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Free 120B model returns invalid/short JSON | JSON mode + defensive parse + per-item validation + one retry; UI tolerates < N questions |
| GitHub unauth rate limit (60/h per shared IP) | Enrichment is optional and skippable; `projectsText` is the fallback; `meta.githubSkipped` surfaced |
| Vendored libs add ~1 MB | Lazy-loaded only on file drop; not on the critical path |
| Artifact build can't serve `/vendor` or external Ko-fi script | Feature-detect; hide file-drop; Ko-fi is a plain link; Vercel is canonical |
| Shared key abuse on a public site | Daily per-browser cap + own-key path + Groq rate limit (no billing) |
| User pastes sensitive CV data | Sent only to the generation endpoint; not stored server-side; documented in the UI |

## Open questions

None blocking. Question count default (18) and daily limit (5) are picked as sane
starting values and easy to tune later.
