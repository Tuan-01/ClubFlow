# ClubFlow API Contract (`PA#3` / `PA#4`)

This directory is the single source of truth for the **ClubFlow** REST API covering the full main flow (**C1–C11**) across all roles (**Visitor**, **Executive**, **Applicant**, **Interviewer**).

- **Base path**: `/api` (relative paths only in the React client; proxied to `http://localhost:3001` in development and preview).
- **Content type**: `application/json` for all JSON requests and responses, `multipart/form-data` for CV PDF uploads (`POST /api/applications`), `application/pdf` for CV downloads, and `text/csv; charset=utf-8` for CSV exports.
- **Canonical campaign timeline** (shared across all screens and roles):
  - **Opening date**: `2026-11-10`
  - **Closing date**: `2026-11-30`
  - **Interview date**: `2026-12-07`
- **Role separation**: Applicants (`Nguyễn Minh Anh`, `Lê Thu Hà`, `Phạm Quốc Bảo`, `Đỗ Đức Thắng`, `Vũ Mai Linh`, `Bùi Quang Huy`, `Ngô Khánh Vy`), Interviewers (`Trần Gia Huy`, `Hoàng Thảo Vy`, `Phạm Minh Đức`), and Executive (`Lê Minh Khôi`) are strictly distinct people.

---

## Authentication

All protected endpoints require a Bearer token in the HTTP `Authorization` header:

```text
Authorization: Bearer <token>
```

Tokens are obtained from `POST /api/auth/login` using the demo accounts defined in `FRONTEND.md`:
- `exec` (`exec@clubflow.test`) — role `executive`
- `studentA` (`studenta@clubflow.test`) — role `applicant` (owns seed applications `A01` and `A02`)
- `int-content` (`int-content@clubflow.test`) — role `interviewer` (Content & Design)
- `int-comms` (`int-comms@clubflow.test`) — role `interviewer` (Communications & Events)

In `contract-check.mjs` examples, `{{token:<name>}}` substitutes the token returned by `POST /api/auth/login` for that demo account.

---

## Consistent Error Shape

Every error response (`400`, `401`, `403`, `404`, `409`, `500`) uses this single JSON envelope:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable explanation of the problem.",
    "fields": {
      "fieldName": "Per-field validation or conflict detail."
    }
  }
}
```

- `error.code`: uppercase snake-case error identifier (e.g., `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `DUPLICATE_APPLICATION`, `CAMPAIGN_CLOSED`, `SCHEDULE_INCOMPLETE`, `SCHEDULE_CONFIRMED`, `INTERNAL_ERROR`).
- `error.message`: clear summary suitable for display.
- `error.fields`: map of field path to inline error message (`{}` when the error is not tied to specific fields). For dynamic campaign position rows, keys use bracket notation such as `positions[0].quota`.

---

## HTTP Status Codes

| Status | Meaning | When used |
|---|---|---|
| `200` | OK | Successful read, update, publish, close, confirm, or export |
| `201` | Created | New application submitted (`C5`) or interview assessment submitted (`C10`) |
| `400` | Bad Request | Missing required fields, invalid formats/dates/durations, PDF > 5 MB or wrong MIME type, statement > 300 words |
| `401` | Unauthorized | Missing/invalid Bearer token or invalid login credentials |
| `403` | Forbidden | Authenticated user's role or resource ownership does not permit the action |
| `404` | Not Found | Referenced campaign, application, assignment, or notification does not exist |
| `409` | Conflict | Business-rule state conflict (duplicate application, closed campaign, incomplete/conflicting schedule confirmation, read-only after confirmation, duplicate assessment, pending results on publish) |
| `500` | Internal Server Error | Unexpected server error or `MOCK_MODE=error` simulation (returns the standard error shape) |

---

## Endpoint Table

All paths are relative to the server origin and begin with `/api`. Resource files are numbered in alphabetical execution order for `contract-check.mjs` on a freshly started mock.

| Method | Path | Allowed Roles | Step(s) | File |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | Public | C2 | [01-auth.md](01-auth.md) |
| `GET` | `/api/auth/me` | Executive, Applicant, Interviewer | C2 | [01-auth.md](01-auth.md) |
| `POST` | `/api/auth/logout` | Executive, Applicant, Interviewer | C2 | [01-auth.md](01-auth.md) |
| `GET` | `/api/campaign/public` | Public (Visitor, all roles) | C1, C3, C5 | [02-campaigns.md](02-campaigns.md) |
| `GET` | `/api/campaign` | Executive | C3 | [02-campaigns.md](02-campaigns.md) |
| `PUT` | `/api/campaign/draft` | Executive | C3 | [02-campaigns.md](02-campaigns.md) |
| `POST` | `/api/campaign/publish` | Executive | C3 | [02-campaigns.md](02-campaigns.md) |
| `POST` | `/api/campaign/close` | Executive | C5, C9 | [02-campaigns.md](02-campaigns.md) |
| `GET` | `/api/interview-setup` | Executive | C4, C8 | [02-campaigns.md](02-campaigns.md) |
| `PUT` | `/api/interview-setup` | Executive | C4 | [02-campaigns.md](02-campaigns.md) |
| `GET` | `/api/applications/mine` | Applicant | C5, C6, C11 | [03-applications.md](03-applications.md) |
| `POST` | `/api/applications` | Applicant | C5 | [03-applications.md](03-applications.md) |
| `GET` | `/api/applications` | Executive | C7 | [03-applications.md](03-applications.md) |
| `GET` | `/api/applications/export` | Executive | C7 | [03-applications.md](03-applications.md) |
| `GET` | `/api/applications/:id` | Executive, Applicant (own), Interviewer (assigned) | C6, C7, C10, C11 | [03-applications.md](03-applications.md) |
| `GET` | `/api/applications/:id/cv` | Executive, Applicant (own), Interviewer (assigned) | C6, C7, C10 | [03-applications.md](03-applications.md) |
| `PATCH` | `/api/applications/:id/note` | Executive | C7 | [03-applications.md](03-applications.md) |
| `PATCH` | `/api/applications/:id/decision` | Executive | C7 | [03-applications.md](03-applications.md) |
| `GET` | `/api/schedule` | Executive | C8, C9 | [04-scheduling.md](04-scheduling.md) |
| `POST` | `/api/schedule/generate` | Executive | C8 | [04-scheduling.md](04-scheduling.md) |
| `PATCH` | `/api/schedule/assignments/:id` | Executive | C8 | [04-scheduling.md](04-scheduling.md) |
| `PUT` | `/api/schedule` | Executive | C8 | [04-scheduling.md](04-scheduling.md) |
| `GET` | `/api/schedule/export` | Executive | C8 | [04-scheduling.md](04-scheduling.md) |
| `POST` | `/api/schedule/confirm` | Executive | C9 | [04-scheduling.md](04-scheduling.md) |
| `GET` | `/api/interviews/mine` | Interviewer | C10 | [05-interviews-and-results.md](05-interviews-and-results.md) |
| `POST` | `/api/interviews/:id/assessment` | Interviewer (assigned) | C10 | [05-interviews-and-results.md](05-interviews-and-results.md) |
| `GET` | `/api/results` | Executive | C11 | [05-interviews-and-results.md](05-interviews-and-results.md) |
| `PATCH` | `/api/results/:applicationId` | Executive | C11 | [05-interviews-and-results.md](05-interviews-and-results.md) |
| `POST` | `/api/results/publish` | Executive | C11 | [05-interviews-and-results.md](05-interviews-and-results.md) |
| `GET` | `/api/notifications` | Applicant, Executive, Interviewer (own) | C11 | [05-interviews-and-results.md](05-interviews-and-results.md) |
| `PATCH` | `/api/notifications/:id/read` | Applicant, Executive, Interviewer (own) | C11 | [05-interviews-and-results.md](05-interviews-and-results.md) |

---

## Changes

- `2026-11-25`: Initial API contract authored covering steps C1–C11 before mock or React client implementation.
