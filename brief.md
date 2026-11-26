# ClubFlow — PA#3 Assistant Brief

Prompts given to the coding assistant in chronological order for Milestone PA#3 (Front end in React).

---

## Prompt 1 — Update `AGENTS.md` for PA#3

```text
Read PA3/PA3-rubric.pdf, PA3/ClubFlow-final-project-brief.pdf, and PA2/AGENTS.md.
Update AGENTS.md at the repo root for PA#3:
- Stack: React + Vite in client/, React Router (BrowserRouter), plain CSS bundled in build (reuse PA#2 4px spacing, 16px body font, WCAG AA contrast, 0 !important), and zero-dependency Node.js mock in mock/.
- Vite proxy: forward /api to http://localhost:3001 in server.proxy and preview.proxy.
- Never List: NEVER edit docs/api/ or mock/ without permission; NEVER use absolute http://localhost:3001 URLs in client/; NEVER hardcode API data or counts in components; NEVER skip loading, error (with in-page Retry), or empty states; NEVER skip visible <label>s, inline/400 field errors, or double-submit guards; NEVER re-introduce any "Fix these" bugs (mismatched dates, wrong titles/h1, drawer hiding list, overlapping applicant/interviewer, "verified" text, template footers).
- QA checks: 0 horizontal scroll & >= 44px tap targets at 360/768/1280px, 0 W3C HTML errors, and all 4 MOCK_MODE modes.
Only edit AGENTS.md.
```

---

## Prompt 2 — Create `FRONTEND.md` (Part 1)

```text
Read PA3/PA3-rubric.pdf ("What FRONTEND.md must contain") and PA3/contract-check-README.md.
Create FRONTEND.md in English in Folder PA3 (Part 1 for Member 1; Member 2 will finish the remaining routes later):
1. Team: Thôi Đặng Trường Thọ (23127487), Nguyễn Thành Tuân (24127579).
2. How to run it: `node mock/server.mjs`, then in `client/`: `npm ci`, `npm run dev`, `npm run build`, `npx vite preview`.
3. Demo accounts table (`Name in examples | Role | E-mail | Password`):
   - `exec` | Executive | `exec@clubflow.test` | `exec-demo`
   - `studentA` | Applicant | `studenta@clubflow.test` | `studenta-demo` (has A01, A02)
   - `int-content` | Interviewer | `int-content@clubflow.test` | `int-content-demo`
   - `int-comms` | Interviewer | `int-comms@clubflow.test` | `int-comms-demo`
4. Routes table (`Path | Role | Steps (C1-C11) | Endpoints called | Notes`): add `/login` (C2), `/executive/campaign` (C3), `/executive/interview-setup` (C4), `/executive/applications` (C7), `/executive/scheduling` (C8, C9), plus placeholder notes for Member 2's routes (`/`, `/apply`, `/applications`, `/applications/A01`, `/interviewer/interviews`).
5. Product owner decisions: placeholder.
6. Libraries: `react`, `react-dom`, `react-router-dom` (BrowserRouter), plain CSS via Vite (1-line reason each).
7. Not done: note C1, C5, C6, C10, C11 are pending Phase 2 (Member 2).
```

---

## Prompt 3 — Write the API Contract (`docs/api/`)

```text
Read AGENTS.md, FRONTEND.md, PA3/PA3-rubric.pdf ("The contract"), PA3/contract-check-README.md, and PA3/ClubFlow-final-project-brief.pdf.
Write the English API contract in `docs/api/` in Folder PA3 covering steps C1–C11 BEFORE any mock or front-end code:
- `README.md`: base path `/api`, Bearer auth, one consistent error shape (`{"error": {"code", "message", "fields"}}`), status codes (`200, 201, 400, 401, 403, 404, 409, 500`), and full Endpoint Table.
- Ordered resource files (`01-auth.md`, `02-campaigns.md`, `03-applications.md`, `04-scheduling.md`, `05-interviews-and-results.md`) so `contract-check.mjs` runs cleanly top-to-bottom on a fresh mock.
- Document roles, params, field limits (PDF <= 5MB, statement <= 300 words, duration 15/20/30), error responses (400 per-field, 401, 403, 404, 409), runnable `http`/`curl` examples with `{{token:exec|studentA|int-content|int-comms}}`, and `## Changes` at the end of each file.
- Use one consistent timeline (`2026-11-10`–`2026-11-30`, interview `2026-12-07`), distinct applicants/interviewers, and no "verified" text.
```

---

## Prompt 4 — Build the Mock Server and Seed Data (`mock/`)

```text
Read AGENTS.md, FRONTEND.md, `docs/api/`, and PA3/contract-check.mjs.
Implement `mock/server.mjs` and `mock/data/*.json` in Folder PA3 WITHOUT editing `docs/api/`:
- Use ONLY Node.js built-in modules (`node:http`, `node:fs`, `node:path`), port `process.env.PORT || 3001`, log `METHOD PATH STATUS` per request.
- Load seed JSON into memory (reset on restart). Pre-seed `studentA` with `A01` (Content) and `A02` (Communications); keep applicants/interviewers distinct, single timeline, Vietnamese names, no "verified".
- Support `MOCK_MODE`: `normal` (~150ms), `slow` (2s), `error` (500 with contract error shape except login), `empty` (`[]` for all lists/nested arrays, counts `0`).
- Issue restart-safe tokens (`token-u-...`), enforce 401/403 role & ownership checks, validate multipart PDF uploads natively, and pass `node PA3/contract-check.mjs --base http://localhost:3001`.
```

---

## Prompt 5 — Fix `contract-check.mjs` Failures in `05-interviews-and-results.md`

```text
Fix the two contract-check.mjs failures (`05-interviews-and-results.md:301` GET `/api/results` where `items[2..5].assessment` is `null`, and `05-interviews-and-results.md:554` GET `/api/applications/mine` where `applications[2].interview` is `null`), document the fix in `## Changes`, and update `AI-LOG.md` and `brief.md`.
```

---

## Prompt 6 — Initialize React Client, Proxy, CSS, AuthContext & Login (Task 5 · Step C2)

```text
Read AGENTS.md, FRONTEND.md, `docs/api/01-auth.md`, and PA2/styles.css.
Initialize React + Vite (JSX) with `react-router-dom` (`BrowserRouter`) in `client/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Proxy `/api` to `http://localhost:3001` in both `server.proxy` and `preview.proxy` in `client/vite.config.js`.
- Port PA2/styles.css tokens + loading/error/empty/inline-error styles + >=44px tap targets at 360px.
- Build relative `/api` client (Bearer token, AbortSignal, `{status, message, fields}` errors), `AuthContext` + `useAuth()`, `ProtectedRoute` (redirect to `/login` and back, role check), and 404 screen.
- Build semantic Layout (landmarks, `<Link>`, unique `<title>` and single `<h1>`, no template footer), Login screen (C2, visible `<label>`s, demo quick-fill, sign-out), and stub routes for Member 2 (`/`, `/apply`, `/applications`, `/applications/:id`, `/interviewer/interviews`).
```

---

## Prompt 7 — Build Executive Screens C3 & C4 (Workflow Prompt 6)

```text
Read AGENTS.md, `docs/api/02-campaigns.md`, and PA2/index.html.
Build Executive C3 (`/executive/campaign`) and C4 (`/executive/interview-setup`) in `client/src/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Include Loading, Error + in-page Retry, Empty states, unique `<title>` & `<h1>`, and responsive layout (360/768/1280px).
- C3: campaign form with dynamic department/position rows (add/remove), `Save as Draft`, `Preview Campaign`, and `Publish Campaign`. Show visible `<label>`s, inline + API 400 per-field errors (reachable via Tab, including inside position rows), keep values on error, and block double submit.
- C4: assign interviewers to positions, manage slots, select rooms, and pick slot duration (`15`, `20`, or `30` min). Lock both screens as read-only if schedule is Confirmed.
```

---

## Prompt 8 — Build Executive Application Review (Step C7 · Workflow Prompt 7)

```text
Read AGENTS.md, `docs/api/03-applications.md`, and PA2/application-review.html.
Build Step C7 (`/executive/applications`) in `client/src/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Fetch `GET /api/applications` with Loading, Error + Retry, and Empty states (KPI counts computed from API, `0` when empty).
- Include debounced search (350ms + AbortController), filters, sort, pagination, and `Export CSV`.
- Show review drawer beside the list (both readable at 360/768/1280px) with CV, statement, internal note, and `Shortlist Candidate` / `Reject`. Decisions update only that application (A01 vs A02 stay independent) without reload and keep active filters when closing the drawer.
- Enable `Continue to Interview Scheduling` `<Link>` once >= 1 application is shortlisted.
```

---

## Prompt 9 — Build Executive Interview Scheduling & Confirmation (Steps C8–C9 · Workflow Prompt 8)

```text
Read AGENTS.md, `docs/api/04-scheduling.md`, and PA2/interview-scheduling.html.
Build Steps C8 & C9 (`/executive/scheduling`) in `client/src/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Fetch `GET /api/schedule` with Loading, Error + Retry, Empty states, `.table-wrap` horizontal scroll wrapper, and API-computed summary counters.
- Parameter form + `Generate Draft`, displaying `Proposed`, `Unassigned` (with reason), and `Conflict` (naming real overlap).
- Support `Edit`/`Resolve`/`+ Assign Slot` modal, `Save Changes`, and `Export Timetable`.
- `Approve & Confirm Schedule` (C9): show summary; refuse confirmation if any row is `Unassigned` or `Conflict` (naming them); once confirmed, show `Confirmed` state and disable editing/saving/regeneration.
```
