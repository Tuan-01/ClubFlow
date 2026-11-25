# ClubFlow AI Assistant Rules & Project Constraints (PA#3)

This document establishes the strict rules, architectural constraints, API contract workflow, design tokens, and QA verification procedures for AI coding assistants and team members working on **ClubFlow** for **PA#3 — Front end in React**.

---

## 1. Project Overview & Scope
- **Project**: ClubFlow — Centralized Student Club Recruitment Management System.
- **Milestone**: PA#3 — Full Main Flow in React (`C1`–`C11`) across all roles (**Visitor**, **Executive**, **Applicant**, **Interviewer**).
- **Semester Scope**:
  - One club, one active recruitment campaign at a time, and one interview date per campaign.
  - Pre-provisioned demo accounts for all 3 roles (`exec`, `studentA` with applications `A01` and `A02`, `int-content`, `int-comms` — as documented in `FRONTEND.md`).
  - **Out of Scope (*Not Building*)**: University account verification / SSO, self-service registration/password recovery, multiple clubs or concurrent campaigns, dynamic room creation, AI CV screening, audit trails, chat/payments.
- **Main Flow (`C1`–`C11`)**:
  - **C1 (Visitor)**: View published campaign details, dates, instructions, departments, and positions with quotas/requirements; `Apply` prompts sign-in.
  - **C2 (Everyone)**: Sign in with demo account, land on role home (or return to original protected route), and sign out.
  - **C3 (Executive)**: Create/configure campaign (details, opening/closing dates, instructions, departments/positions with quotas, descriptions, requirements — add/remove rows); `Save as Draft`, `Preview Campaign`, `Publish Campaign` (stay on page with inline errors if invalid).
  - **C4 (Executive)**: Interview setup: assign interviewers to one or more positions, enter available slots, select rooms from list, set one campaign slot duration (`15`, `20`, or `30` minutes).
  - **C5 (Applicant)**: Apply with fixed form (student info, PDF CV ≤ 5 MB, motivation statement ≤ 300 words, availability from club slots). Applying for a second position works (`A01` & `A02`); duplicate application for the same position opens the existing application; closed campaign shows an error and keeps entered values.
  - **C6 (Applicant)**: `My applications` — one row per own application showing CV screening status, confirmed interview time & room, and published final result.
  - **C7 (Executive)**: Application review: API-driven statistics, search (debounced or cancellable), filter, sort, pagination, CSV export; side-by-side drawer with CV & statement (list stays readable); internal note (Executive-only); `Shortlist Candidate` / `Reject` updates only that application; closing drawer preserves filters; `Continue to Interview Scheduling` enabled once ≥ 1 application is shortlisted.
  - **C8 (Executive)**: Interview scheduling: choose date, time window, and duration, then generate draft (`Proposed`, `Unassigned` with reason, or `Conflict` naming overlapping entity). `Edit`, `Resolve`, and `+ Assign Slot` update & recheck; `Save Changes` keeps draft; export timetable.
  - **C9 (Executive)**: `Approve & Confirm Schedule` summary; refused while any shortlisted application is `Unassigned` or `Conflict` (naming them) or before applications close/are reviewed; once confirmed, campaign and schedule become read-only (`Confirmed` state, editing/regeneration disabled).
  - **C10 (Interviewer)**: View only assigned interviews and CVs of assigned applications; submit one assessment per interview.
  - **C11 (Executive, then Applicant)**: Executive records `Pass` or `Fail` for each application and publishes results; Applicant sees the result on that application and receives an in-app notification.

---

## 2. Technical Stack & Architecture
- **Frontend**: React + Vite in `client/` (built output in `client/dist/`).
- **Routing**: React Router using `BrowserRouter`.
  - Every route listed in `FRONTEND.md` must render cleanly when opened directly or reloaded.
  - Unknown paths must render a dedicated Not Found screen.
  - Signed-out visits to protected routes must redirect to sign-in and return to the requested route upon sign-in.
  - Cross-role access to another role's route must be turned away.
  - Screen-to-screen navigation must use React Router links (`<a href>`) or form submission so browser Back/Forward works; never use non-link elements for navigation.
- **Shared State & Auth**:
  - Signed-in user and auth token live in one React Context, accessed through a custom hook; signing out clears both.
  - Every authenticated API request must include `Authorization: Bearer <token>`.
  - Mutations update React state directly from the API response without reloading the page.
- **Styling**: Plain CSS bundled into the Vite build (no unapproved external CSS frameworks or CDNs; zero `!important`).
- **Mock Server**: Zero-dependency Node.js server in `mock/server.mjs` using only Node built-in modules (`node:http`, `node:fs`, etc.), seeded from `mock/data/`, listening on `PORT` (default `3001`), keeping changes in memory, logging `METHOD /path STATUS` per request, accepting deterministic tokens (`token-<userId>`) across restarts, and implementing all 4 `MOCK_MODE` modes (`normal`, `slow`, `error`, `empty`).
- **Vite Proxy**: `client/vite.config.js` MUST forward `/api` to `http://localhost:3001` in **both** `server.proxy` and `preview.proxy` so `npm run dev` and `npx vite preview` reach the mock (and Express in PA#4) seamlessly.
- **Dependencies**: Do not add any new npm package without explicit user approval.

---

## 3. API Contract & Data Rules (`docs/api/`)
- **Contract-First**: `docs/api/README.md` and per-resource files in `docs/api/` are the single source of truth and are committed before any frontend code that calls them.
- **Strict Adherence**:
  - Call **only** endpoints, query parameters, request bodies, and response fields documented in `docs/api/`.
  - If an endpoint or field appears missing or mismatched, **stop and report it** — do not invent endpoints or modify `docs/api/` or `mock/` on your own.
  - If an authorized change to `docs/api/` or `mock/` is made later, document it in the `## Changes` section of the affected contract file (date, what changed, why).
- **Relative Paths Only**: All `fetch`/HTTP calls in `client/` MUST use relative `/api/...` paths (never `http://localhost:3001/...`).
- **Zero Hardcoded Data**: Campaigns, positions, applications, interviewers, slots, rooms, schedules, assessments, notifications, and summary counts MUST come from or be computed from API responses.
- **Required Screen States**: Every screen that loads data MUST handle:
  1. **Loading** (`MOCK_MODE=slow`): clear loading state, no blank screen.
  2. **Error** (`MOCK_MODE=error`): clear error message with an **in-page Retry button** that re-fetches without reloading the page.
  3. **Empty** (`MOCK_MODE=empty`): explicit empty-state message and `0` counts (never an error or blank area).
- **Request Discipline**: One request per resource loaded; no repeated polling loops while waiting; search inputs must debounce or cancel in-flight requests rather than sending a request per keystroke.

---

## 4. Forms & Validation Standards
Applies to all main-flow forms (sign-in, campaign builder C3, interview setup C4, application form C5, internal note C7, scheduling & slot edit C8, assessment C10, result C11):
- Every `<input>`, `<select>`, and `<textarea>` MUST have a visible `<label>` associated with it (`htmlFor`/`id` or wrapping), including fields inside dynamic position rows.
- Validate against contract limits before sending; after the first submit attempt, show **one inline error message per invalid field** next to the field and linked so `Tab`/assistive tech reaches the message with the field.
- Map API `400` field-level validation errors onto the matching fields.
- Retain all user-entered form values after validation or API errors.
- Guard every submit button against double-submission while a request is in flight.
- **Application Form (C5)**: Reject non-PDF files, files `> 5 MB`, and motivation statements `> 300 words` client-side before sending.

---

## 5. Design System & Tokens (Reused from PA#2)
- **Spacing Scale**: `4px` (`0.25rem`), `8px` (`0.5rem`), `12px` (`0.75rem`), `16px` (`1rem`), `20px` (`1.25rem`), `24px` (`1.5rem`), `32px` (`2rem`), `40px` (`2.5rem`), `48px` (`3rem`). Never use arbitrary pixel magic numbers (e.g., `13px`, `27px`).
- **Typography**:
  - Minimum **`16px` (`1rem`)** on `body` and paragraph text.
  - Metadata/badge text must be at least `12px` and remain legible.
- **Contrast Ratio**: All body text, labels, buttons, and interactive elements MUST pass **WCAG AA (≥ 4.5:1)** contrast against their backgrounds.
- **Visual Hierarchy**: Exactly one visually dominant primary call to action / header per screen.

---

## 6. Responsive, Semantic & Accessibility Standards
- **Breakpoints**: `360px` (mobile), `768px` (tablet), `1280px` (desktop).
- **Horizontal Scroll**: **0 horizontal scroll** at `360px`, `768px`, and `1280px`. Wide data tables must scroll inside their own wrapper (`overflow-x: auto`).
- **Tap Targets**: At `360px`, standalone buttons, form controls, and independent links MUST have a minimum height of **`44px`** (`min-height: 44px`).
- **Landmarks & Headings**:
  - Use semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`.
  - **Exactly one `<h1>`** per screen, with its own accurate screen title.
  - Strict heading hierarchy (`<h1>` → `<h2>` → `<h3>`); never skip heading levels.
- **Interactive Controls**:
  - Use `<a href>` / React Router `<Link>` for navigation; `<button type="button" | "submit">` for actions. Never use clickable `<div>` or `<span>`.
- **Media**: Meaningful `alt` on `<img>`; `aria-hidden="true"` on decorative SVGs.
- **HTML Validity**: Rendered DOM HTML of main screens must pass the **W3C Nu HTML Checker with 0 errors**.
- **Text Wrapping**: Long Vietnamese names and role titles must wrap naturally without overflowing cards or viewports.

---

## 7. Project "Never List" (Strict Prohibitions)
AI assistants and team members MUST NEVER:
1. **NEVER edit `docs/api/` or `mock/` without explicit permission.**
2. **NEVER use absolute `http://localhost:3001` URLs in `client/`** (always use relative `/api/...` paths).
3. **NEVER hardcode API data or summary counts in components** (all lists, details, and counts must come from or be computed from API data).
4. **NEVER skip loading, error (with in-page Retry), or empty states** on any data screen.
5. **NEVER skip visible `<label>`s, inline/400 field errors, or double-submit guards** on forms.
6. **NEVER re-introduce any "Fix these" bugs**:
   - Mismatched dates across screens (maintain one consistent timeline across all screens).
   - Wrong page titles, top-bar labels, or `<h1>`s (each screen must have its own accurate title and single `<h1>`).
   - Review drawer covering or hiding the application list (both list and drawer must stay readable at every width).
   - Mismatched summary/footer counts (counts must mathematically match the rows returned by the API).
   - Fake `Conflict` rows/banners (every conflict must represent a real time overlap of applicant, interviewer, or room).
   - Overlapping applicants and interviewers (keep applicant and interviewer people strictly distinct).
   - `"Verified"` text or badges (e.g., `"Verified Student"`, `"100% verified"`, `"Verified Attachments"`, `"verified student credentials"` — out of scope).
   - Template footer text (no `"© 2025 ClubFlow"`, `"Privacy Policy"`, `"Terms of Service"`, or `"Support Center"`).
7. **NEVER use `!important`** in custom CSS, fixed container widths without `max-width: 100%`, or `overflow-x: hidden` on `html`/`body` to hide overflow.
8. **NEVER use Lorem Ipsum**, clickable `<div>`s, or skipped heading levels.
9. **NEVER commit `node_modules/`**; always rebuild `client/dist/` after the final frontend change.

---

## 8. Quality Assurance & Verification Checklist
Before declaring any task complete, verify all of the following:

### 1. Build, Preview & Contract Verification
- Run `npm run build` in `client/` so `client/dist/` is up to date.
- Start `node mock/server.mjs` and `npx vite preview` (in `client/`), and confirm `/api` proxies to `http://localhost:3001`.
- Verify every example in `docs/api/` against a freshly started `node mock/server.mjs` (`node contract-check.mjs` or `curl -i`).
- Run `git diff -- docs/api mock` after every AI edit to confirm no unapproved changes to contract or mock files.

### 2. All 4 `MOCK_MODE` Modes
Restart `node mock/server.mjs` in each mode and test all data screens:
- `MOCK_MODE=normal`: ~150 ms responses, full C1–C11 flow works end-to-end (`A01` and `A02` stay independent).
- `MOCK_MODE=slow`: ~2 s delay shows explicit loading states without duplicate requests in the mock log.
- `MOCK_MODE=error`: 500 error responses display clear error UI + working in-page **Retry** button (recovers without page reload once mock returns to `normal`).
- `MOCK_MODE=empty`: empty `[]` lists display empty-state messages and `0` counts.

### 3. Routing, Auth & Console Layout Checks (`360px`, `768px`, `1280px`)
- Open every route in `FRONTEND.md` directly and reload; verify signed-out redirect-and-return, role protection, sign-out cleanup, and 404 screen.
- In browser DevTools Console at `360px`, `768px`, and `1280px`:
```javascript
// Must evaluate to false (0 horizontal scroll):
document.documentElement.scrollWidth > document.documentElement.clientWidth

// Must return [] (no element overflows right edge):
[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth)

// Must match simulated viewport width (e.g. 360):
document.documentElement.clientWidth
```
- Verify standalone buttons and links at `360px` have computed height `>= 44px`, and body/button text meets WCAG AA (`>= 4.5:1`).

### 4. W3C HTML Validation
- Copy the rendered `<html>` from DevTools for each main screen and check it in [W3C Nu HTML Checker](https://validator.w3.org/nu/) — verify **0 errors**.
