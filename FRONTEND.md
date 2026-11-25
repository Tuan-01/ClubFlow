# ClubFlow — Frontend Documentation (PA#3 · Part 1)

> **Scope note:** This is **Part 1 (Member 1)** of `FRONTEND.md`. Member 2 will complete the remaining routes (`C1`, `C5`, `C6`, `C10`, `C11`) and finalize endpoint mappings in Phase 2.

---

## 1. Team

| Name | Student ID |
|---|---|
| Thôi Đặng Trường Thọ | `23127487` |
| Nguyễn Thành Tuân | `24127579` |

---

## 2. How to run it

1. **Start the mock API server** from the repository root (uses only Node.js built-in modules, no `npm install` needed; listens on `PORT`, default `3001`, and supports `MOCK_MODE=normal|slow|error|empty`):

   ```sh
   node mock/server.mjs
   ```

2. **Install dependencies and start the Vite dev server** in `client/`:

   ```sh
   cd client
   npm ci
   npm run dev
   ```

3. **Build and preview the production bundle** in `client/` (both `server.proxy` and `preview.proxy` in `client/vite.config.js` forward `/api` to `http://localhost:3001`):

   ```sh
   npm run build
   npx vite preview
   ```

---

## 3. Demo accounts

| Name in examples | Role | E-mail | Password |
|---|---|---|---|
| `exec` | Executive | `exec@clubflow.test` | `exec-demo` |
| `studentA` | Applicant | `studenta@clubflow.test` | `studenta-demo` |
| `int-content` | Interviewer | `int-content@clubflow.test` | `int-content-demo` |
| `int-comms` | Interviewer | `int-comms@clubflow.test` | `int-comms-demo` |

> **Notes:**
> - `studentA` starts with two applications in the mock seed data: `A01` (Content) and `A02` (Communications).
> - `int-content` is the Interviewer for Content, and `int-comms` is the Interviewer for Communications.

---

## 4. Routes

All routes use `BrowserRouter` (clean paths without `#`). Any unknown path renders a dedicated Not Found screen. Exact endpoint paths will be filled in once `docs/api/` is authored.

| Path | Role | Steps (C1–C11) | Endpoints called | Notes |
|---|---|---|---|---|
| `/login` | Public (all roles) | C2 | `TBD` (pending `docs/api/`) | Member 1: Sign-in with demo account, redirect to role home or original protected route, and sign-out support. |
| `/executive/campaign` | Executive | C3 | `TBD` (pending `docs/api/`) | Member 1: Campaign details, timeline, instructions, departments/positions (add/remove rows), Save as Draft, Preview Campaign, and Publish Campaign. |
| `/executive/interview-setup` | Executive | C4 | `TBD` (pending `docs/api/`) | Member 1: Assign interviewers to positions, configure available slots, choose rooms, and set campaign slot duration (`15`, `20`, or `30` minutes). |
| `/executive/applications` | Executive | C7 | `TBD` (pending `docs/api/`) | Member 1: API-driven statistics, search, filter, sort, pagination, CSV export, side-by-side CV/statement drawer, internal note, Shortlist/Reject, and link to scheduling. |
| `/executive/scheduling` | Executive | C8, C9 | `TBD` (pending `docs/api/`) | Member 1: Draft generation (`Proposed`, `Unassigned`, `Conflict`), `Edit`/`Resolve`/`+ Assign Slot`, `Save Changes`, timetable export, and `Approve & Confirm Schedule` (read-only `Confirmed` state after C9; shows a message if opened before shortlisted candidates exist). |
| `/` | Visitor (Public) | C1 | `TBD` (Phase 2 — Member 2) | **Placeholder (Member 2):** Public published campaign landing page with positions, quotas, requirements, and `Apply` prompt to sign in. |
| `/apply` | Applicant | C5 | `TBD` (Phase 2 — Member 2) | **Placeholder (Member 2):** Application form (student info, PDF CV ≤ 5 MB, statement ≤ 300 words, availability slots). |
| `/applications` | Applicant | C6 | `TBD` (Phase 2 — Member 2) | **Placeholder (Member 2):** `My applications` list showing status, confirmed interview schedule, and published result for the signed-in applicant only. |
| `/applications/A01` | Applicant | C6, C11 | `TBD` (Phase 2 — Member 2) | **Placeholder (Member 2):** Application detail view using mock seed ID `A01`, including final `Pass`/`Fail` result and notification after C11. |
| `/interviewer/interviews` | Interviewer | C10 | `TBD` (Phase 2 — Member 2) | **Placeholder (Member 2):** Assigned interviews list, assigned CVs only, and one assessment submission per interview. |
| `/executive/results` | Executive | C11 | `TBD` (Phase 2 — Member 2) | **Placeholder (Member 2):** Record final `Pass`/`Fail` result per application (with C10 interviewer assessment summary) and `Publish Results` (`after C9`; opened before schedule confirmation shows an informative message, not a blank screen). |

---

## 5. Product owner decisions

*Placeholder — links to product owner posts and the behavioral decisions we rely on (e.g., post-rejection applicant view, edge-case rules) will be documented here once confirmed during implementation.*

---

## 6. Libraries

- `react` — Core UI library for building declarative, state-driven components and shared auth/API context hooks.
- `react-dom` — Mounts and renders the React component tree into the browser DOM.
- `react-router-dom` (`BrowserRouter`) — Client-side routing supporting direct route loads, page reloads, protected-route redirects, role guards, and browser Back/Forward navigation.
- Plain CSS (via Vite) — Zero-dependency stylesheets bundled into the Vite build, reusing PA#2 design tokens (4 px spacing scale, 16 px body text, WCAG AA contrast, responsive `360`/`768`/`1280` px layouts, zero `!important`).

---

## 7. Not done

- **Pending Phase 2 (Member 2):** Steps **C1** (Visitor campaign view at `/`), **C5** (Applicant application form at `/apply`), **C6** (Applicant `My applications` at `/applications` and `/applications/A01`), **C10** (Interviewer workspace at `/interviewer/interviews`), and **C11** (Executive `Pass`/`Fail` result recording/publishing at `/executive/results`, plus Applicant result/notification at `/applications` and `/applications/A01`).
- **Phase 1 implementation in progress (Part 1 baseline):** `docs/api/` contract files, `mock/server.mjs`, `client/` source/build, and final endpoint columns in the Routes table are not yet implemented at this initial documentation step.
