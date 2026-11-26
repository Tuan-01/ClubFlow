## PA2  

### 2026-11-08 — Project constraints and technical brief specification
Tool: Antigravity
Asked for: Analyze the project brief and rubric to formalize AGENTS.md rules and engineering brief.md.
Kept: The 3-screen Club Executive flow, 4px spacing scale, and the identification of all 8 anti-patterns from the "Fix these" list.
Changed: Switched the suggested Tailwind CDN framework to zero-dependency plain CSS so the prototype loads completely offline and buildless.
Rejected: Rejected client-side hash routing (`/#/review`); enforced relative file navigation (`<a href="application-review.html">`) and form actions so navigation works with JavaScript turned off.

### 2026-11-08 — Screen 1: Campaign creation wizard (index.html)
Tool: Antigravity
Asked for: Build Screen 1 using our team's bespoke 4-step wizard interface with draft saving and validation.
Kept: The 4-step flow (Basic Info, Dates, Positions, Instructions), purple palette, and local draft saving via localStorage.
Changed: Upgraded base font size from 14px to 16px to pass Criterion 4; increased button heights at 360px to >= 44px for tap target compliance.
Rejected: Rejected the assistant's attempt to flatten the wizard into a generic single-page form; kept our team's step-by-step layout.

### 2026-11-08 — Screen 2: Candidate review grid and inspection drawer (application-review.html)
Tool: Antigravity
Asked for: Implement Screen 2 with candidate cards, filter bar, and side inspection drawer.
Kept: The card grid layout, realistic Vietnamese applicant profiles, status badges, and detail drawer layout.
Changed: Removed `@media (max-width: 1100px) { .layout.open #list { display: none } }` which hid the applicant list when opening the drawer; DevTools check caught this, so we changed it to vertical stacking so both list and drawer stay visible. Added explicit `<label for="q">` and `<label for="dNote">` after DevTools Accessibility audit showed unlabelled inputs.
Rejected: Rejected "Verified Student" badges because university account verification is explicitly out of project scope.

### 2026-11-08 — Screen 3: Timetable matrix and conflict scheduling (interview-scheduling.html)
Tool: Antigravity
Asked for: Implement Screen 3 interview timetable, parameters setup, and collision detection.
Kept: Parameters card (dates, 20-min slots, rooms), timetable matrix, edit drawer, and confirmation modal.
Changed: Corrected summary math: updated badges and table rows to exactly 8 Shortlisted = 6 Proposed + 1 Conflict + 1 Unassigned; at 360px DevTools showed table horizontal overflow, so we wrapped the `<table>` in a `.tbl` container with `overflow-x: auto`. Added authentic double-booking conflict for interviewer Nguyễn Thảo Vy at 09:20–09:40 AM.
Rejected: Rejected overlapping interviewers and candidates; enforced strictly distinct applicant and interviewer pools.

### 2026-11-08 — Responsive audit and accessibility verification
Tool: Antigravity
Asked for: Run responsive audits at 360px, 768px, 1280px and W3C Nu HTML Checker across all three pages.
Kept: Semantic landmark tags (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`) and 4px-based spacing variables.
Changed: Fixed button tap targets below 44px on mobile viewports; verified `document.documentElement.scrollWidth > document.documentElement.clientWidth === false` at 360px; added missing heading level `<h2>Submitted Applications</h2>` in `application-review.html` after audit caught skipped level `<h1> -> <h3>`.
Rejected: Rejected any use of `overflow-x: hidden` on `body` or wrappers to cheat scroll checks, adhering strictly to Never List rule 4.

### 2026-11-09 — Pure CSS step navigation upgrade and static fallback
Tool: Antigravity
Asked for: Fix index.html wizard display when JavaScript is disabled in DevTools so it stays a 4-step wizard without stacking all panels.
Kept: The 4-step wizard flow, progress indicators, Next/Back buttons, and Publish button on Step 4.
Changed: Replaced JS-dependent step display and `<noscript>` full-page unrolling with a pure CSS radio toggle system (`#step-1` to `#step-4` with `:checked`), allowing step switching without JavaScript; removed the last remaining `!important` declaration in `application-review.html` to reach 0 `!important` across the repository.
Rejected: Rejected keeping the old `<noscript>` fallback style that dumped all 4 steps into a long vertical stack, preserving the authentic step-by-step UX when tested with JavaScript disabled.  

## PA#3

### 2026-11-25 - Update AGENTS.md rules for React and API contract  
Tool: Antigravity  
Asked for: Update AGENTS.md from PA#2 static HTML rules to PA#3 React + Vite + API contract architecture and Never List  
Kept: Semantic HTML standards, 4px spacing scale, WCAG AA contrast, 360/768/1280px breakpoints, and PA#2 "Fix these" prohibitions  
Changed: None  
Rejected: None  

### 2026-11-25 — Draft FRONTEND.md (Part 1) and map C11 Executive route
Tool: Antigravity
Asked for: Create `FRONTEND.md` in English covering team details, run commands, demo accounts, initial `BrowserRouter` routes (`C2`, `C3`, `C4`, `C7`, `C8`, `C9`) with Phase 2 placeholders, library choices, and pending steps.
Kept: Team roster, demo account table (`exec`, `studentA`, `int-content`, `int-comms`), `BrowserRouter` route structure, and the Member 1 / Member 2 task split.
Changed: Checking the draft against step C11 in `PA3-rubric.pdf` showed that no Executive route was assigned to record `Pass`/`Fail` decisions or publish results (only `/applications/A01` was mapped to C11, while `/executive/scheduling` turns read-only after C9). Added `/executive/results` (noted as `after C9` with a fallback message when opened early) to the `Routes` table and updated the `Not done` section before authoring `docs/api/`.
Rejected: Rejected placing C11 result entry inside `/executive/applications` or `/executive/scheduling`, as doing so would mix CV screening (`C7`) and the read-only confirmed schedule (`C9`) with final result publication.

### 2026-11-25 — Write the REST API contract in docs/api/
Tool: Antigravity
Asked for: Author the English API contract in `docs/api/` (`README.md` and `01-auth.md` through `05-interviews-and-results.md`) covering steps C1–C11 prior to building `mock/` or `client/`, formatted for `contract-check.mjs`.
Kept: Base path `/api`, Bearer token scheme matching the `FRONTEND.md` demo accounts, single error shape (`{"error": {"code", "message", "fields"}}`), 31 endpoints across the 5 numbered resource files, consistent campaign dates (`2026-11-10` to `2026-11-30`, interview `2026-12-07`), distinct applicant and interviewer pools, and `## Changes` sections.
Changed: None; reviewed `docs/api/README.md` and `01-auth.md` against `PA3-rubric.pdf` ("The contract") and `contract-check-README.md` (status codes, error schema, role permissions, and `{{token:...}}` syntax). Automated verification against `contract-check.mjs` is deferred until `mock/server.mjs` is written.
Rejected: None.

### 2026-11-25 — Implement in-memory mock server and seed data (mock/)
Tool: Antigravity
Asked for: Build `mock/server.mjs` and `mock/data/*.json` using only Node built-in modules to match `docs/api/` across all four `MOCK_MODE` settings, without altering `docs/api/`.
Kept: Zero-dependency Node server (`node:http`, `node:fs`, `node:path`, `node:url`), `mock/data/` seed JSON (`users.json`, `campaign.json`, `interviewSetup.json`, `applications.json`) with distinct applicant and interviewer records, `MOCK_MODE` handling (`normal`, `slow`, `error`, `empty`), and deterministic `token-<userId>` tokens.
Changed: None; verified via `git status` that `docs/api/` remained untouched and checked `mock/server.mjs` imports and `mock/data/users.json` seed separation. Local execution of `contract-check.mjs` against `http://localhost:3001` is left to run outside the sandbox before committing `mock/`.
Rejected: None.

### 2026-11-25 — Fix array-item shape examples in 05-interviews-and-results.md
Tool: Antigravity
Asked for: Resolve the two `contract-check.mjs` failures reported on `GET /api/results` (`05-interviews-and-results.md:301`) and `GET /api/applications/mine` (`05-interviews-and-results.md:554`), and log the change in `## Changes`.
Kept: Mock server behavior returning `assessment: null` for unassessed candidates (`A03`–`A06`) and `interview: null` for rejected application `A09`.
Changed: `contract-check.mjs` failed because both contract examples showed only the first array element (`A01`, with non-null `assessment` and `interview` objects) followed by `, …`, causing trailing `null` items (`items[2..5]` and `applications[2]`) to mismatch the first element's object shape. Updated `05-interviews-and-results.md` to show `A01`, `A02`, and `A03` (`assessment: null`, followed by `, …`) for `GET /api/results`, and `A01`, `A02`, and `A09` (`interview: null`) for `GET /api/applications/mine`, with a matching note under `## Changes`.
Rejected: Rejected fabricating fake assessments for `A03`–`A06` or an interview for rejected `A09` in `mock/server.mjs` just to match an incomplete example template.

### 2026-11-25 — Initialize React client, Vite proxy, CSS tokens, AuthContext & Login (Task 5 · Step C2)
Tool: Antigravity
Asked for:
```text
Read AGENTS.md, FRONTEND.md, `docs/api/01-auth.md`, and PA2/styles.css.
Initialize React + Vite (JSX) with `react-router-dom` (`BrowserRouter`) in `client/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Proxy `/api` to `http://localhost:3001` in both `server.proxy` and `preview.proxy` in `client/vite.config.js`.
- Port PA2/styles.css tokens + loading/error/empty/inline-error styles + >=44px tap targets at 360px.
- Build relative `/api` client (Bearer token, AbortSignal, `{status, message, fields}` errors), `AuthContext` + `useAuth()`, `ProtectedRoute` (redirect to `/login` and back, role check), and 404 screen.
- Build semantic Layout (landmarks, `<Link>`, unique `<title>` and single `<h1>`, no template footer), Login screen (C2, visible `<label>`s, demo quick-fill, sign-out), and stub routes for Member 2 (`/`, `/apply`, `/applications`, `/applications/:id`, `/interviewer/interviews`).
```
Kept: React 19 + Vite + `BrowserRouter` scaffold, `server.proxy` and `preview.proxy` forwarding `/api` to `http://localhost:3001`, PA#2 CSS design tokens (4px spacing scale, 16px body text, WCAG AA contrast, 0 `!important`, >=44px tap targets), relative `/api` client with Bearer token and `AbortSignal`, `ProtectedRoute` redirect-and-return and role guard, semantic `Layout` landmarks, `NotFoundPage`, `LoginPage` (C2) with 4 demo quick-fill accounts and inline validation, and Member 2 stub routes.
Changed: Fixed three defects caught during Task 5 verification:
1. `client/src/context/AuthContext.jsx`: Added `skipRestoreTokenRef` in `login()` (and cleared it in `retrySession()`/`logout()`) so `useEffect([token, restoreAttempt])` no longer fires a redundant `GET /api/auth/me` immediately after `POST /api/auth/login` already returned the user (preventing a duplicate 2s loading flash under `MOCK_MODE=slow` and avoiding a false 500 session-error block under `MOCK_MODE=error`).
2. `client/src/components/Layout.jsx`: Added a `signingOut` in-flight guard and `disabled` state to the topbar `Sign Out` button to prevent duplicate `POST /api/auth/logout` requests on rapid double-clicks.
3. `client/src/styles/index.css` & `client/src/pages/LoginPage.jsx`: Added `.badge-wrap` (`white-space: normal; overflow-wrap: anywhere; max-width: 100%`) on the `Return to ...` badge and changed `.alert-content` `min-width` to `min(200px, 100%)` to prevent horizontal overflow on narrow `360px` viewports.
Rejected: Rejected firing a redundant `GET /api/auth/me` after `POST /api/auth/login` already resolved the user, leaving the topbar `Sign Out` button unguarded against double-submission, and keeping `white-space: nowrap` without width bounds on dynamic redirect-path badges at `360px`.

### 2026-11-25 — Build Executive C3 & C4 screens (Prompt 6)
Tool: Antigravity
Asked for:
```text
Read AGENTS.md, `docs/api/02-campaigns.md`, and PA2/index.html.
Build Executive C3 (`/executive/campaign`) and C4 (`/executive/interview-setup`) in `client/src/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Include Loading, Error + in-page Retry, Empty states, unique `<title>` & `<h1>`, and responsive layout (360/768/1280px).
- C3: campaign form with dynamic department/position rows (add/remove), `Save as Draft`, `Preview Campaign`, and `Publish Campaign`. Show visible `<label>`s, inline + API 400 per-field errors (reachable via Tab, including inside position rows), keep values on error, and block double submit.
- C4: assign interviewers to positions, manage slots, select rooms, and pick slot duration (`15`, `20`, or `30` min). Lock both screens as read-only if schedule is Confirmed.
```
Kept: `ExecutiveCampaignPage` (`/executive/campaign`, step C3) with dynamic position rows, `Save as Draft`, `Preview Campaign`, `Publish Campaign`, and inline/400 validation; `ExecutiveInterviewSetupPage` (`/executive/interview-setup`, step C4) with slot duration (`15`/`20`/`30`), room selection, interviewer position/slot checkboxes, and custom slot input; Loading/Error (with in-page Retry)/Empty states; read-only lock when schedule is Confirmed; and responsive CSS with `>=44px` tap targets and 0 `!important`.
Changed: Fixed three defects found during C3/C4 verification:
1. `client/src/pages/ExecutiveInterviewSetupPage.jsx`: Filtered `iv.positionIds` against `setup.positions` and `selectedRoomIds` against `setup.rooms` inside `setupToFormState` so removing a campaign position in C3 no longer leaves a hidden stale position ID that blocks saving C4.
2. `client/src/pages/ExecutiveInterviewSetupPage.jsx`: Handled `Enter` via `onKeyDown` on the custom slot input (`iv-${ivIdx}-custom-slot`) to add the custom slot instead of accidentally submitting the outer interview-setup form.
3. `client/src/pages/ExecutiveCampaignPage.jsx`: Compared `publishedAt` and `draftSavedAt` timestamps for the campaign summary stat card so published campaigns display `Published` instead of `Saved / Draft` when an older `draftSavedAt` exists.
Rejected: Rejected keeping unpruned stale `positionIds` in C4 form state after C3 edits, allowing `Enter` inside the custom-slot input to trigger full-form submission, and prioritizing an older `draftSavedAt` over `publishedAt` in the C3 status card.

### 2026-11-26 — Build Executive Application Review (Step C7 · Prompt 7)
Tool: Antigravity
Asked for:
```text
Read AGENTS.md, `docs/api/03-applications.md`, and PA2/application-review.html.
Build Step C7 (`/executive/applications`) in `client/src/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Fetch `GET /api/applications` with Loading, Error + Retry, and Empty states (KPI counts computed from API, `0` when empty).
- Include debounced search (350ms + AbortController), filters, sort, pagination, and `Export CSV`.
- Show review drawer beside the list (both readable at 360/768/1280px) with CV, statement, internal note, and `Shortlist Candidate` / `Reject`. Decisions update only that application (A01 vs A02 stay independent) without reload and keep active filters when closing the drawer.
- Enable `Continue to Interview Scheduling` `<Link>` once >= 1 application is shortlisted.
```
Kept: `ExecutiveApplicationsPage` (`/executive/applications`, step C7) with API-computed KPI cards, 350ms debounced search with `AbortController`, position/status filters, sorting, pagination (`pageSize=5`), CSV export, side-by-side review drawer (PDF CV viewer/download, statement, internal note, independent `Shortlist Candidate`/`Reject` updates preserving active filters), `Close Applications` action, read-only schedule lock, and `Continue to Interview Scheduling` `<Link>` gated on `shortlisted >= 1`.
Changed: Fixed three defects found during C7 verification:
1. `client/src/pages/ExecutiveApplicationsPage.jsx`: Reset `detail` to `null` and `noteDraft` to `''` when switching `selectedId` so the drawer header no longer displays the previous applicant's name and contact details while loading or if fetching the newly selected application fails.
2. `client/src/styles/index.css`: Updated `.review-layout` base to `minmax(0, 1fr)`, added `min-width: 0` on `.review-layout > *`, and added `overflow-wrap: anywhere` on `.quote-box` to prevent overflow at `360px` (while keeping `.review-layout.drawer-open` scoped at `>= 1280px` so the list uses full width when the drawer is closed).
3. `client/src/pages/ExecutiveApplicationsPage.jsx`: Guarded `aria-describedby="scheduling-gate-hint"` on the disabled `Continue to Interview Scheduling` button so it only references `#scheduling-gate-hint` when that hint element is actually rendered (`!canSchedule && !isLoading && !loadError`).
Rejected: Rejected keeping stale `detail` visible in the drawer header during application switches, keeping an empty 40% right column at `1280px` when the drawer is closed, and pointing `aria-describedby` to an unmounted hint ID during loading/error states.

### 2026-11-26 — Build Executive Interview Scheduling & Confirmation (Steps C8–C9 · Prompt 8)
Tool: Antigravity
Asked for:
```text
Read AGENTS.md, `docs/api/04-scheduling.md`, and PA2/interview-scheduling.html.
Build Steps C8 & C9 (`/executive/scheduling`) in `client/src/` in Folder PA3 (do NOT edit `docs/api/` or `mock/`):
- Fetch `GET /api/schedule` with Loading, Error + Retry, Empty states, `.table-wrap` horizontal scroll wrapper, and API-computed summary counters.
- Parameter form + `Generate Draft`, displaying `Proposed`, `Unassigned` (with reason), and `Conflict` (naming real overlap).
- Support `Edit`/`Resolve`/`+ Assign Slot` modal, `Save Changes`, and `Export Timetable`.
- `Approve & Confirm Schedule` (C9): show summary; refuse confirmation if any row is `Unassigned` or `Conflict` (naming them); once confirmed, show `Confirmed` state and disable editing/saving/regeneration.
```
Kept: `ExecutiveSchedulingPage` (`/executive/scheduling`, steps C8–C9) with Loading/Error (with Retry)/Empty states, parameter form + `Generate Draft`, API-computed summary cards (`totalShortlisted`, `proposedCount`, `conflictCount`, `unassignedCount`), `Needs Attention` list naming conflicts/unassigned reasons, `.table-wrap` scrollable timetable, `Edit`/`Resolve`/`+ Assign Slot` drawer, `Save Changes`, `Export Timetable`, and `Approve & Confirm Schedule` modal locking the schedule to `Confirmed` read-only.
Changed: Fixed five defects caught during C8/C9 review:
1. `client/src/pages/ExecutiveSchedulingPage.jsx`: Added `GET /api/interview-setup` alongside `GET /api/schedule` on load because `GET /api/schedule` does not return `interviewers` or `rooms`, populating the drawer selects with selected rooms and position-eligible interviewers (fixing broken `Edit`/`Resolve`/`+ Assign Slot` dropdowns).
2. `client/src/styles/index.css`: Updated `.sched-layout` to `grid-template-columns: minmax(0, 1fr)` with `.sched-layout > * { min-width: 0; }` so `.table-wrap` scrolls horizontally without expanding the grid and causing page overflow at `360px`/`768px`.
3. `client/src/pages/ExecutiveSchedulingPage.jsx`: Handled `summary.totalShortlisted === 0` (`MOCK_MODE=empty` or before shortlisting) by disabling `Generate Draft` and displaying a clear empty-state message with a `<Link>` to `/executive/applications`.
4. `client/src/pages/ExecutiveSchedulingPage.jsx`: Added client-side validation (`validateGenerateParams`) before calling `POST /api/schedule/generate` and cleared field-level `genErrors` on input change.
5. `client/src/pages/ExecutiveSchedulingPage.jsx`: Handled `onCancel` on `<dialog>` so pressing `Esc` keeps `showConfirmDialog` state in sync, and added a `<Link to="/executive/applications">` inside the `409` error alert when applications still need closing or screening.
Rejected: Rejected reading non-existent `schedule.interviewers`/`schedule.rooms` fields from `/api/schedule`, letting `.data-table` stretch `.sched-layout` past `360px`, leaving `Generate Draft` enabled with `0` shortlisted applicants, skipping client-side validation on generate parameters, and letting native `<dialog>` `Esc` dismissal desync React state.

