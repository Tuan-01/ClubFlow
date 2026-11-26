# 03 — Applications & CV Screening (`C5`, `C6`, `C7`)

Manages applicant submissions (`C5`), applicant `My applications` tracking (`C6`), Executive application review with statistics, search/filter/sort/pagination, CSV export, internal notes, and Shortlist/Reject decisions (`C7`), plus closing the campaign before scheduling.

> **Routing note for Express / Mock:** Static routes `/api/applications/mine` and `/api/applications/export` must be registered/matched before parameterized `/api/applications/:id`.

---

## `GET /api/applications/mine`

- **Allowed roles**: `applicant`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns only the signed-in applicant's applications (`A01` and `A02` in seed data for `studentA`). `interview` stays `null` until the schedule is confirmed (`C9`), `finalResult` stays `"pending"` until results are published (`C11`), and `internalNote` is never included. In `MOCK_MODE=empty`, `applications` is `[]`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): caller is not an Applicant.

### Example — Applicant lists own applications (`200 OK`)

```http
GET /api/applications/mine
Authorization: Bearer {{token:studentA}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "applications": [
    {
      "id": "A01",
      "campaignId": "camp-2026-fall",
      "positionId": "pos-content",
      "positionTitle": "Content Team Specialist",
      "department": "Media & Communications",
      "submittedAt": "…",
      "screeningStatus": "submitted",
      "interview": null,
      "finalResult": "pending",
      "resultPublishedAt": null
    },
    …
  ]
}
```

### Example — Executive denied applicant-only list (`403 Forbidden`)

```http
GET /api/applications/mine
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only Applicants may access their own applications list.",
    "fields": {}
  }
}
```

---

## `POST /api/applications`

- **Allowed roles**: `applicant`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`multipart/form-data`)**:
  - `positionId` (`string`, required): valid position ID from the active published campaign.
  - `fullName` (`string`, required, 1–100 chars): applicant full name.
  - `studentId` (`string`, required, 6–15 alphanumeric chars, e.g. `S20241001`).
  - `email` (`string`, required): valid e-mail address.
  - `phone` (`string`, required, 8–15 chars).
  - `major` (`string`, required, 1–100 chars).
  - `yearOfStudy` (`integer`, required, `1`–`6`).
  - `motivationStatement` (`string`, required, **1 to 300 words**).
  - `availabilitySlots` (`string[]`, required, at least 1 slot — send repeated `-F availabilitySlots=...` fields).
  - `cv` (`file`, required): **PDF only** (`application/pdf` and `%PDF` header), **maximum 5 MB (`5242880` bytes)**.
- **Success response (`201 Created`)**: Creates a separate application record for the chosen position without affecting the applicant's other applications.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): missing required fields, non-PDF file, CV > 5 MB, or motivation statement > 300 words.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): caller is not an Applicant.
  - `409 Conflict` (`DUPLICATE_APPLICATION`): applicant already applied to `positionId` in this campaign (client uses `GET /api/applications/mine` to open the existing application).
  - `409 Conflict` (`CAMPAIGN_CLOSED`): campaign is closed or not published.

### Example — Submit application for an additional position (`201 Created`)

```sh
curl -i http://localhost:3001/api/applications \
  -H "Authorization: Bearer {{token:studentA}}" \
  -F positionId=pos-design \
  -F "fullName=Nguyễn Minh Anh" \
  -F studentId=S20241001 \
  -F email=studenta@clubflow.test \
  -F phone=0912345678 \
  -F "major=Business IT" \
  -F yearOfStudy=2 \
  -F "motivationStatement=I enjoy designing event visuals and posters for student activities and want to contribute to Creative Arts this semester." \
  -F availabilitySlots=10:20-10:40 \
  -F availabilitySlots=10:40-11:00 \
  -F "cv=@{{file:cv-studenta.pdf:200KB}};type=application/pdf"
```

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "application": {
    "id": "…",
    "campaignId": "camp-2026-fall",
    "positionId": "pos-design",
    "positionTitle": "Design & Media Specialist",
    "department": "Creative Arts",
    "fullName": "Nguyễn Minh Anh",
    "studentId": "S20241001",
    "email": "studenta@clubflow.test",
    "phone": "0912345678",
    "major": "Business IT",
    "yearOfStudy": 2,
    "motivationStatement": "…",
    "wordCount": 19,
    "availabilitySlots": ["10:20-10:40", "10:40-11:00"],
    "cvFileName": "cv-studenta.pdf",
    "cvFileSizeBytes": 204800,
    "cvUrl": "…",
    "submittedAt": "…",
    "screeningStatus": "submitted",
    "interview": null,
    "finalResult": "pending",
    "resultPublishedAt": null
  }
}
```

### Example — Duplicate application for same position (`409 Conflict`)

```sh
curl -i http://localhost:3001/api/applications \
  -H "Authorization: Bearer {{token:studentA}}" \
  -F positionId=pos-content \
  -F "fullName=Nguyễn Minh Anh" \
  -F studentId=S20241001 \
  -F email=studenta@clubflow.test \
  -F phone=0912345678 \
  -F "major=Business IT" \
  -F yearOfStudy=2 \
  -F "motivationStatement=Applying again for Content Team Specialist." \
  -F availabilitySlots=09:00-09:20 \
  -F "cv=@{{file:cv-studenta.pdf:200KB}};type=application/pdf"
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "DUPLICATE_APPLICATION",
    "message": "You have already submitted an application for this position.",
    "fields": {
      "positionId": "An existing application (A01) already exists for Content Team Specialist."
    }
  }
}
```

### Example — Reject CV over 5 MB and statement over 300 words (`400 Bad Request`)

```sh
curl -i http://localhost:3001/api/applications \
  -H "Authorization: Bearer {{token:studentA}}" \
  -F positionId=pos-events \
  -F "fullName=Nguyễn Minh Anh" \
  -F studentId=S20241001 \
  -F email=studenta@clubflow.test \
  -F phone=0912345678 \
  -F "major=Business IT" \
  -F yearOfStudy=2 \
  -F "motivationStatement=I am writing to apply for the Event Operations Coordinator role because I have organized student club workshops, welcome weeks, cultural festivals, charity drives, academic seminars, and orientation camps across campus. During my first year I coordinated venue booking, stage logistics, sound checks, volunteer shifts, check-in desks, safety briefings, sponsor booths, and post-event equipment return for more than twelve student events. These experiences taught me how to stay calm under tight schedules, resolve unexpected room changes, communicate clearly with speakers and faculty advisors, and keep every team member informed before, during, and after each activity. I also learned how important structured planning checklists and shared timelines are when multiple subcommittees prepare simultaneously for a major campus program. At Student Activities Board I hope to support the Logistics and Planning team by preparing run-of-show documents, tracking vendor delivery times, setting up registration tables, assisting emcees backstage, and ensuring every participant has a smooth and welcoming experience from arrival until closing. Furthermore, I enjoy collaborating across departments such as Media, Content, and Design so promotional booths match the stage schedule and every announcement reaches attendees on time. I am comfortable balancing coursework with weekly club meetings and weekend event operations, and I always follow through on assigned responsibilities. Outside logistics, I have trained ten new freshmen volunteers in equipment inventory tracking and emergency contact procedures, which reduced setup delays during our faculty orientation week. Joining SAB would give me the chance to grow my operational leadership while helping deliver memorable campus experiences for fellow students throughout the academic year. In addition, I have prepared backup contingency plans for rainy weather outdoor booths, managed microphone batteries and projector adapters between concurrent sessions, coordinated refreshment deliveries for guest speakers, and documented post-event lessons learned so future organizing teams can avoid repeated bottlenecks. Thank you very much for considering my application and reviewing my attached curriculum vitae and available interview slots for this upcoming recruitment campaign." \
  -F availabilitySlots=09:00-09:20 \
  -F "cv=@{{file:oversize-cv.pdf:6MB}};type=application/pdf"
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Application validation failed.",
    "fields": {
      "motivationStatement": "Motivation statement must not exceed 300 words.",
      "cv": "CV file must not exceed 5 MB."
    }
  }
}
```

---

## `GET /api/applications`

- **Allowed roles**: `executive`
- **Query parameters**:
  - `search` (`string`, optional): case-insensitive match on applicant name, studentId, email, or application ID.
  - `positionId` (`string`, optional): filter by position ID (`all` or omitted returns all positions).
  - `status` (`string`, optional): `all` | `submitted` | `shortlisted` | `rejected` (default `all`).
  - `sortBy` (`string`, optional): `submittedAt` | `applicantName` | `positionTitle` | `status` (default `submittedAt`).
  - `sortOrder` (`string`, optional): `asc` | `desc` (default `desc`).
  - `page` (`integer`, optional, `>= 1`, default `1`).
  - `pageSize` (`integer`, optional, `1`–`50`, default `10`).
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns dynamically computed `statistics`, `pagination`, and matching `applications` rows. In `MOCK_MODE=empty`, `applications` is `[]` and all counts in `statistics` and `pagination` are `0`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): non-Executive caller.

### Example — Executive lists applications with statistics (`200 OK`)

```http
GET /api/applications?status=all&sortBy=submittedAt&sortOrder=asc&page=1&pageSize=10
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "statistics": {
    "totalApplications": 9,
    "uniqueApplicants": 7,
    "pendingReview": 4,
    "shortlisted": 4,
    "rejected": 1
  },
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 9,
    "totalPages": 1
  },
  "applications": [
    {
      "id": "A01",
      "campaignId": "camp-2026-fall",
      "positionId": "pos-content",
      "positionTitle": "Content Team Specialist",
      "department": "Media & Communications",
      "fullName": "Nguyễn Minh Anh",
      "studentId": "S20241001",
      "email": "studenta@clubflow.test",
      "phone": "0912345678",
      "major": "Business IT",
      "yearOfStudy": 2,
      "submittedAt": "…",
      "screeningStatus": "submitted",
      "internalNote": "…"
    },
    …
  ]
}
```

---

## `GET /api/applications/export`

- **Allowed roles**: `executive`
- **Query parameters**: `search`, `positionId`, `status`, `sortBy`, `sortOrder` (same as `GET /api/applications`).
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns `text/csv; charset=utf-8` attachment with filtered application rows.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)

### Example — Export filtered applications CSV (`200 OK`)

```http
GET /api/applications/export?status=all
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: text/csv; charset=utf-8
```

---

## `GET /api/applications/:id`

- **Allowed roles**: `executive`, `applicant` (own application only), `interviewer` (assigned application only)
- **Path parameters**: `id` (`string`, required, e.g. `A01`)
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**:
  - Returns the full application record (`application`).
  - `internalNote` is included **only** when the caller is `executive`; it is omitted for `applicant` and `interviewer`.
  - `interview` is `null` for `applicant` until schedule confirmation (`C9`); `finalResult` is `"pending"` until results are published (`C11`).
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): applicant requesting another student's application or interviewer requesting an unassigned application.
  - `404 Not Found` (`NOT_FOUND`): application `:id` does not exist.

### Example — Executive opens application detail (`200 OK`)

```http
GET /api/applications/A01
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "application": {
    "id": "A01",
    "campaignId": "camp-2026-fall",
    "positionId": "pos-content",
    "positionTitle": "Content Team Specialist",
    "department": "Media & Communications",
    "fullName": "Nguyễn Minh Anh",
    "studentId": "S20241001",
    "email": "studenta@clubflow.test",
    "phone": "0912345678",
    "major": "Business IT",
    "yearOfStudy": 2,
    "motivationStatement": "…",
    "wordCount": 38,
    "availabilitySlots": ["09:00-09:20", "09:40-10:00", "10:20-10:40"],
    "cvFileName": "NguyenMinhAnh_CV_2026.pdf",
    "cvFileSizeBytes": 1433600,
    "cvUrl": "/api/applications/A01/cv",
    "submittedAt": "…",
    "screeningStatus": "submitted",
    "internalNote": "…",
    "interview": null,
    "finalResult": "pending",
    "resultPublishedAt": null
  }
}
```

### Example — Applicant opens own application detail without internalNote (`200 OK`)

```http
GET /api/applications/A01
Authorization: Bearer {{token:studentA}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "application": {
    "id": "A01",
    "campaignId": "camp-2026-fall",
    "positionId": "pos-content",
    "positionTitle": "Content Team Specialist",
    "department": "Media & Communications",
    "fullName": "Nguyễn Minh Anh",
    "studentId": "S20241001",
    "email": "studenta@clubflow.test",
    "phone": "0912345678",
    "major": "Business IT",
    "yearOfStudy": 2,
    "motivationStatement": "…",
    "wordCount": 38,
    "availabilitySlots": ["09:00-09:20", "09:40-10:00", "10:20-10:40"],
    "cvFileName": "NguyenMinhAnh_CV_2026.pdf",
    "cvFileSizeBytes": 1433600,
    "cvUrl": "/api/applications/A01/cv",
    "submittedAt": "…",
    "screeningStatus": "submitted",
    "interview": null,
    "finalResult": "pending",
    "resultPublishedAt": null
  }
}
```

### Example — Non-existent application (`404 Not Found`)

```http
GET /api/applications/A99
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": {
    "code": "NOT_FOUND",
    "message": "Application A99 was not found.",
    "fields": {}
  }
}
```

---

## `GET /api/applications/:id/cv`

- **Allowed roles**: `executive`, `applicant` (own application only), `interviewer` (assigned application only)
- **Path parameters**: `id` (`string`, required)
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Streams the PDF file with `Content-Type: application/pdf`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): caller does not own or is not assigned to `:id`.
  - `404 Not Found` (`NOT_FOUND`): application `:id` does not exist.

### Example — Executive downloads applicant CV (`200 OK`)

```http
GET /api/applications/A01/cv
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
```

---

## `PATCH /api/applications/:id/note`

- **Allowed roles**: `executive`
- **Path parameters**: `id` (`string`, required)
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `internalNote` (`string`, required, max 1000 chars; empty string `""` clears the note).
- **Success response (`200 OK`)**: Updates only `:id`'s Executive-only `internalNote`.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): `internalNote` missing or exceeds 1000 chars.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `404 Not Found` (`NOT_FOUND`)
  - `409 Conflict` (`SCHEDULE_CONFIRMED`): applications are read-only after schedule confirmation.

### Example — Save Executive internal note (`200 OK`)

```http
PATCH /api/applications/A01/note
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "internalNote": "Strong writing portfolio; clear alignment with SAB Content goals."
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "application": {
    "id": "A01",
    "campaignId": "camp-2026-fall",
    "positionId": "pos-content",
    "positionTitle": "Content Team Specialist",
    "department": "Media & Communications",
    "fullName": "Nguyễn Minh Anh",
    "studentId": "S20241001",
    "email": "studenta@clubflow.test",
    "phone": "0912345678",
    "major": "Business IT",
    "yearOfStudy": 2,
    "motivationStatement": "…",
    "wordCount": 38,
    "availabilitySlots": ["09:00-09:20", "09:40-10:00", "10:20-10:40"],
    "cvFileName": "NguyenMinhAnh_CV_2026.pdf",
    "cvFileSizeBytes": 1433600,
    "cvUrl": "/api/applications/A01/cv",
    "submittedAt": "…",
    "screeningStatus": "submitted",
    "internalNote": "Strong writing portfolio; clear alignment with SAB Content goals.",
    "interview": null,
    "finalResult": "pending",
    "resultPublishedAt": null
  }
}
```

---

## `PATCH /api/applications/:id/decision`

- **Allowed roles**: `executive`
- **Path parameters**: `id` (`string`, required)
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `decision` (`string`, required): `"shortlisted"` or `"rejected"`.
- **Success response (`200 OK`)**: Updates **only** the targeted `:id` application (e.g., shortlisting `A01` does not alter `A02`) and returns updated `application` and recalculated `statistics`.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): `decision` is not `"shortlisted"` or `"rejected"`.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `404 Not Found` (`NOT_FOUND`)
  - `409 Conflict` (`SCHEDULE_CONFIRMED`): screening decisions are locked after schedule confirmation.

### Example — Shortlist A01 only (`200 OK`)

```http
PATCH /api/applications/A01/decision
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "decision": "shortlisted"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "application": {
    "id": "A01",
    "campaignId": "camp-2026-fall",
    "positionId": "pos-content",
    "positionTitle": "Content Team Specialist",
    "department": "Media & Communications",
    "fullName": "Nguyễn Minh Anh",
    "studentId": "S20241001",
    "email": "studenta@clubflow.test",
    "phone": "0912345678",
    "major": "Business IT",
    "yearOfStudy": 2,
    "motivationStatement": "…",
    "wordCount": 38,
    "availabilitySlots": ["09:00-09:20", "09:40-10:00", "10:20-10:40"],
    "cvFileName": "NguyenMinhAnh_CV_2026.pdf",
    "cvFileSizeBytes": 1433600,
    "cvUrl": "/api/applications/A01/cv",
    "submittedAt": "…",
    "screeningStatus": "shortlisted",
    "internalNote": "…",
    "interview": null,
    "finalResult": "pending",
    "resultPublishedAt": null
  },
  "statistics": {
    "totalApplications": 9,
    "uniqueApplicants": 7,
    "pendingReview": 3,
    "shortlisted": 5,
    "rejected": 1
  }
}
```

### Example — Shortlist A02 separately (`200 OK`)

```http
PATCH /api/applications/A02/decision
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "decision": "shortlisted"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "application": {"id": "A02", "screeningStatus": "shortlisted", …},
  "statistics": {"totalApplications": 9, "uniqueApplicants": 7, "pendingReview": 2, "shortlisted": 6, "rejected": 1}
}
```

### Example — Complete screening on remaining pending applications (`200 OK`)

```http
PATCH /api/applications/A07/decision
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "decision": "rejected"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "application": {"id": "A07", "screeningStatus": "rejected", …},
  "statistics": {"totalApplications": 9, "uniqueApplicants": 7, "pendingReview": 1, "shortlisted": 6, "rejected": 2}
}
```

```http
PATCH /api/applications/A09/decision
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "decision": "rejected"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "application": {"id": "A09", "screeningStatus": "rejected", …},
  "statistics": {"totalApplications": 9, "uniqueApplicants": 7, "pendingReview": 0, "shortlisted": 6, "rejected": 3}
}
```

---

## Closing Applications & Closed-Campaign Application Attempt (`C5`, `C9`)

### Example — Close campaign applications (`200 OK`)

```http
POST /api/campaign/close
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "campaign": {
    "id": "camp-2026-fall",
    "name": "SAB Recruitment 2026",
    "clubName": "Student Activities Board (SAB)",
    "description": "…",
    "openingDate": "2026-11-10",
    "closingDate": "2026-11-30",
    "interviewDate": "2026-12-07",
    "instructions": "…",
    "status": "closed",
    "applicationsOpen": false,
    "isReadOnly": false,
    "draftSavedAt": "…",
    "publishedAt": "…",
    "positions": […]
  }
}
```

### Example — Applicant attempts to apply after campaign closes (`409 Conflict`)

```sh
curl -i http://localhost:3001/api/applications \
  -H "Authorization: Bearer {{token:studentA}}" \
  -F positionId=pos-events \
  -F "fullName=Nguyễn Minh Anh" \
  -F studentId=S20241001 \
  -F email=studenta@clubflow.test \
  -F phone=0912345678 \
  -F "major=Business IT" \
  -F yearOfStudy=2 \
  -F "motivationStatement=Applying for Event Operations Coordinator." \
  -F availabilitySlots=09:00-09:20 \
  -F "cv=@{{file:cv-studenta.pdf:200KB}};type=application/pdf"
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "CAMPAIGN_CLOSED",
    "message": "Applications are closed for this campaign.",
    "fields": {}
  }
}
```

---

## Changes

- `2026-11-25`: Initial applications, CV upload/download, and CV screening contract defined for steps C5, C6, and C7.
- `2026-11-26`: Corrected example `wordCount` (`22` → `19`) in `POST /api/applications` response and aligned seed `wordCount` values in `mock/data/applications.json` to match exact statement word counts.
