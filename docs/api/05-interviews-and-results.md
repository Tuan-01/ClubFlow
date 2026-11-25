# 05 — Interviews, Assessments, Results & Notifications (`C10`, `C11`)

Manages Interviewer assigned schedules and single-submission assessments (`C10`), Executive `Pass`/`Fail` result recording and publishing (`C11`), and Applicant final results and in-app notifications (`C6`, `C11`).

---

## `GET /api/interviews/mine`

- **Allowed roles**: `interviewer`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns `{ scheduleConfirmed, interviews }` containing **only** confirmed interviews assigned to the signed-in interviewer (`scheduleConfirmed: false` and `interviews: []` before C9 confirmation). Executive `internalNote` is never included. In `MOCK_MODE=empty`, `interviews` is `[]`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): caller is not an Interviewer.

### Example — Content interviewer sees only assigned interviews (`200 OK`)

```http
GET /api/interviews/mine
Authorization: Bearer {{token:int-content}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "scheduleConfirmed": true,
  "interviews": [
    {
      "id": "sch-A01",
      "applicationId": "A01",
      "applicantName": "Nguyễn Minh Anh",
      "studentId": "S20241001",
      "positionId": "pos-content",
      "positionTitle": "Content Team Specialist",
      "department": "Media & Communications",
      "date": "2026-12-07",
      "startTime": "09:00",
      "endTime": "09:20",
      "roomName": "Room A (Media Lab)",
      "cvUrl": "/api/applications/A01/cv",
      "assessment": null
    },
    …
  ]
}
```

### Example — Communications interviewer sees only A02 (`200 OK`)

```http
GET /api/interviews/mine
Authorization: Bearer {{token:int-comms}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "scheduleConfirmed": true,
  "interviews": [
    {
      "id": "sch-A02",
      "applicationId": "A02",
      "applicantName": "Nguyễn Minh Anh",
      "studentId": "S20241001",
      "positionId": "pos-comms",
      "positionTitle": "Communications Coordinator",
      "department": "Media & Communications",
      "date": "2026-12-07",
      "startTime": "09:40",
      "endTime": "10:00",
      "roomName": "Room C (Design Studio)",
      "cvUrl": "/api/applications/A02/cv",
      "assessment": null
    }
  ]
}
```

---

## Interviewer CV Access Boundary (`C10`)

### Example — Assigned interviewer downloads A01 CV (`200 OK`)

```http
GET /api/applications/A01/cv
Authorization: Bearer {{token:int-content}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
```

### Example — Unassigned interviewer blocked from A01 CV (`403 Forbidden`)

```http
GET /api/applications/A01/cv
Authorization: Bearer {{token:int-comms}}
```

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "code": "FORBIDDEN",
    "message": "You may only view CVs for applications assigned to you.",
    "fields": {}
  }
}
```

---

## `POST /api/interviews/:id/assessment`

- **Allowed roles**: `interviewer` (assigned interviewer for `:id` only)
- **Path parameters**: `id` (`string`, required, e.g. `sch-A01`)
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `recommendation` (`string`, required): `"recommend"` | `"conditional"` | `"not_recommend"`.
  - `score` (`integer`, required): `1` to `10`.
  - `feedback` (`string`, required, 1–1000 chars).
- **Success response (`201 Created`)**: Records the single assessment for this interview.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): invalid `recommendation`, `score` outside `1..10`, or blank/overlong `feedback`.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): caller is not an Interviewer or is not assigned to `:id`.
  - `404 Not Found` (`NOT_FOUND`): interview `:id` does not exist.
  - `409 Conflict` (`SCHEDULE_NOT_CONFIRMED` or `ASSESSMENT_ALREADY_SUBMITTED`): one assessment per interview.

### Example — Unassigned interviewer blocked from assessing sch-A01 (`403 Forbidden`)

```http
POST /api/interviews/sch-A01/assessment
Authorization: Bearer {{token:int-comms}}
Content-Type: application/json

{
  "recommendation": "recommend",
  "score": 8,
  "feedback": "Good energy."
}
```

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "code": "FORBIDDEN",
    "message": "You may only submit assessments for interviews assigned to you.",
    "fields": {}
  }
}
```

### Example — Invalid assessment score (`400 Bad Request`)

```http
POST /api/interviews/sch-A01/assessment
Authorization: Bearer {{token:int-content}}
Content-Type: application/json

{
  "recommendation": "recommend",
  "score": 15,
  "feedback": ""
}
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Assessment validation failed.",
    "fields": {
      "score": "Score must be an integer between 1 and 10.",
      "feedback": "Interview feedback is required."
    }
  }
}
```

### Example — Assigned interviewer submits assessment for A01 (`201 Created`)

```http
POST /api/interviews/sch-A01/assessment
Authorization: Bearer {{token:int-content}}
Content-Type: application/json

{
  "recommendation": "recommend",
  "score": 9,
  "feedback": "Strong storytelling examples and clear campaign ideas during the interview."
}
```

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "assessment": {
    "id": "asm-A01",
    "interviewId": "sch-A01",
    "applicationId": "A01",
    "interviewerId": "u-int-content",
    "recommendation": "recommend",
    "score": 9,
    "feedback": "Strong storytelling examples and clear campaign ideas during the interview.",
    "submittedAt": "…"
  }
}
```

### Example — Duplicate assessment rejected (`409 Conflict`)

```http
POST /api/interviews/sch-A01/assessment
Authorization: Bearer {{token:int-content}}
Content-Type: application/json

{
  "recommendation": "recommend",
  "score": 8,
  "feedback": "Trying to submit twice."
}
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "ASSESSMENT_ALREADY_SUBMITTED",
    "message": "An assessment has already been submitted for this interview.",
    "fields": {}
  }
}
```

### Example — Communications interviewer submits assessment for A02 (`201 Created`)

```http
POST /api/interviews/sch-A02/assessment
Authorization: Bearer {{token:int-comms}}
Content-Type: application/json

{
  "recommendation": "conditional",
  "score": 6,
  "feedback": "Polite communication, limited external partner outreach experience."
}
```

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "assessment": {
    "id": "asm-A02",
    "interviewId": "sch-A02",
    "applicationId": "A02",
    "interviewerId": "u-int-comms",
    "recommendation": "conditional",
    "score": 6,
    "feedback": "Polite communication, limited external partner outreach experience.",
    "submittedAt": "…"
  }
}
```

---

## `GET /api/results`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns `{ scheduleConfirmed, resultsPublished, publishedAt, summary, items }`. Before schedule confirmation (`C9`), `scheduleConfirmed` is `false`, `items` is `[]`, and summary counts are `0` so the UI displays an informative gate message. In `MOCK_MODE=empty`, `items` is `[]` and counts are `0`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)

### Example — Executive views results roster (`200 OK`)

```http
GET /api/results
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "scheduleConfirmed": true,
  "resultsPublished": false,
  "publishedAt": null,
  "summary": {
    "totalEligible": 6,
    "passCount": 0,
    "failCount": 0,
    "pendingCount": 6
  },
  "items": [
    {
      "applicationId": "A01",
      "applicantName": "Nguyễn Minh Anh",
      "studentId": "S20241001",
      "positionId": "pos-content",
      "positionTitle": "Content Team Specialist",
      "interviewerName": "Trần Gia Huy",
      "assessment": {
        "id": "asm-A01",
        "recommendation": "recommend",
        "score": 9,
        "feedback": "Strong storytelling examples and clear campaign ideas during the interview.",
        "submittedAt": "…"
      },
      "finalResult": "pending",
      "decisionNote": ""
    },
    {
      "applicationId": "A02",
      "applicantName": "Nguyễn Minh Anh",
      "studentId": "S20241001",
      "positionId": "pos-comms",
      "positionTitle": "Communications Coordinator",
      "interviewerName": "Hoàng Thảo Vy",
      "assessment": {
        "id": "asm-A02",
        "recommendation": "conditional",
        "score": 6,
        "feedback": "Polite communication, limited external partner outreach experience.",
        "submittedAt": "…"
      },
      "finalResult": "pending",
      "decisionNote": ""
    },
    {
      "applicationId": "A03",
      "applicantName": "Lê Thu Hà",
      "studentId": "S20241002",
      "positionId": "pos-content",
      "positionTitle": "Content Team Specialist",
      "interviewerName": "Trần Gia Huy",
      "assessment": null,
      "finalResult": "pending",
      "decisionNote": ""
    },
    …
  ]
}
```

---

## `PATCH /api/results/:applicationId`

- **Allowed roles**: `executive`
- **Path parameters**: `applicationId` (`string`, required, e.g. `A01`)
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `finalResult` (`string`, required): `"pass"` or `"fail"`.
  - `decisionNote` (`string`, optional, max 500 chars).
- **Success response (`200 OK`)**: Records `pass` or `fail` for that single application without affecting other applications by the same student (`A01` vs `A02`).
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): `finalResult` is not `"pass"` or `"fail"`, or `decisionNote` > 500 chars.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `404 Not Found` (`NOT_FOUND`): `:applicationId` not found among eligible applications.
  - `409 Conflict` (`SCHEDULE_NOT_CONFIRMED` or `RESULTS_ALREADY_PUBLISHED`)

### Example — Refuse publish while results are still pending (`409 Conflict`)

```http
POST /api/results/publish
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{}
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "PENDING_RESULTS",
    "message": "Record Pass or Fail for all eligible applications before publishing.",
    "fields": {
      "pending": "Pending applications: A01, A02, A03, A04, A05, A06"
    }
  }
}
```

### Example — Record Pass/Fail per application (`200 OK`)

```http
PATCH /api/results/A01
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "finalResult": "pass",
  "decisionNote": "Welcome to SAB Content Team."
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "item": {
    "applicationId": "A01",
    "applicantName": "Nguyễn Minh Anh",
    "studentId": "S20241001",
    "positionId": "pos-content",
    "positionTitle": "Content Team Specialist",
    "interviewerName": "Trần Gia Huy",
    "assessment": {"id": "asm-A01", "recommendation": "recommend", "score": 9, "feedback": "…", "submittedAt": "…"},
    "finalResult": "pass",
    "decisionNote": "Welcome to SAB Content Team."
  },
  "summary": {
    "totalEligible": 6,
    "passCount": 1,
    "failCount": 0,
    "pendingCount": 5
  }
}
```

```http
PATCH /api/results/A02
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "finalResult": "fail",
  "decisionNote": "Thank you for interviewing with Communications Team."
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "item": {"applicationId": "A02", "finalResult": "fail", …},
  "summary": {"totalEligible": 6, "passCount": 1, "failCount": 1, "pendingCount": 4}
}
```

```http
PATCH /api/results/A03
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{"finalResult": "pass", "decisionNote": "Strong copywriting sample."}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "item": {"applicationId": "A03", "finalResult": "pass", …},
  "summary": {"totalEligible": 6, "passCount": 2, "failCount": 1, "pendingCount": 3}
}
```

```http
PATCH /api/results/A04
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{"finalResult": "pass", "decisionNote": "Great Figma portfolio."}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "item": {"applicationId": "A04", "finalResult": "pass", …},
  "summary": {"totalEligible": 6, "passCount": 3, "failCount": 1, "pendingCount": 2}
}
```

```http
PATCH /api/results/A05
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{"finalResult": "fail", "decisionNote": "Schedule commitment mismatch."}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "item": {"applicationId": "A05", "finalResult": "fail", …},
  "summary": {"totalEligible": 6, "passCount": 3, "failCount": 2, "pendingCount": 1}
}
```

```http
PATCH /api/results/A06
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{"finalResult": "pass", "decisionNote": "Well prepared for campaign work."}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "item": {"applicationId": "A06", "finalResult": "pass", …},
  "summary": {"totalEligible": 6, "passCount": 4, "failCount": 2, "pendingCount": 0}
}
```

---

## `POST /api/results/publish`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body**: None (or `{}`)
- **Success response (`200 OK`)**: Publishes final results (`resultsPublished: true`) and generates one in-app notification per eligible application (deterministically keyed as `notif-<applicationId>`).
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`SCHEDULE_NOT_CONFIRMED` | `PENDING_RESULTS` | `RESULTS_ALREADY_PUBLISHED`)

### Example — Publish final results (`200 OK`)

```http
POST /api/results/publish
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "resultsPublished": true,
  "publishedAt": "…",
  "notifiedCount": 6
}
```

### Example — Applicant sees confirmed interview and published results (`200 OK`)

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
      "screeningStatus": "shortlisted",
      "interview": {
        "date": "2026-12-07",
        "startTime": "09:00",
        "endTime": "09:20",
        "roomName": "Room A (Media Lab)",
        "interviewerName": "Trần Gia Huy"
      },
      "finalResult": "pass",
      "resultPublishedAt": "…"
    },
    {
      "id": "A02",
      "campaignId": "camp-2026-fall",
      "positionId": "pos-comms",
      "positionTitle": "Communications Coordinator",
      "department": "Media & Communications",
      "submittedAt": "…",
      "screeningStatus": "shortlisted",
      "interview": {
        "date": "2026-12-07",
        "startTime": "09:40",
        "endTime": "10:00",
        "roomName": "Room C (Design Studio)",
        "interviewerName": "Hoàng Thảo Vy"
      },
      "finalResult": "fail",
      "resultPublishedAt": "…"
    },
    {
      "id": "A09",
      "campaignId": "camp-2026-fall",
      "positionId": "pos-design",
      "positionTitle": "Design & Media Specialist",
      "department": "Creative Arts",
      "submittedAt": "…",
      "screeningStatus": "rejected",
      "interview": null,
      "finalResult": "pending",
      "resultPublishedAt": "…"
    }
  ]
}
```

---

## `GET /api/notifications`

- **Allowed roles**: `applicant`, `executive`, `interviewer` (own notifications only)
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns `{ unreadCount, notifications }` belonging to the signed-in user. Before `POST /api/results/publish`, `notifications` is `[]` and `unreadCount` is `0`. In `MOCK_MODE=empty`, `notifications` is `[]` and `unreadCount` is `0`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)

### Example — Applicant reads in-app result notifications (`200 OK`)

```http
GET /api/notifications
Authorization: Bearer {{token:studentA}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "unreadCount": 2,
  "notifications": [
    {
      "id": "notif-A01",
      "applicationId": "A01",
      "title": "Final Result Published — Content Team Specialist",
      "message": "Your application A01 for Content Team Specialist resulted in: Pass.",
      "result": "pass",
      "isRead": false,
      "createdAt": "…"
    },
    …
  ]
}
```

---

## `PATCH /api/notifications/:id/read`

- **Allowed roles**: `applicant`, `executive`, `interviewer` (owner of `:id` only)
- **Path parameters**: `id` (`string`, required, e.g. `notif-A01`)
- **Headers**: `Authorization: Bearer <token>`
- **Request body**: None (or `{}`)
- **Success response (`200 OK`)**: Marks the notification as read (`isRead: true`).
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): notification belongs to another user.
  - `404 Not Found` (`NOT_FOUND`): notification `:id` does not exist.

### Example — Mark notification as read (`200 OK`)

```http
PATCH /api/notifications/notif-A01/read
Authorization: Bearer {{token:studentA}}
Content-Type: application/json

{}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "notification": {
    "id": "notif-A01",
    "applicationId": "A01",
    "title": "Final Result Published — Content Team Specialist",
    "message": "Your application A01 for Content Team Specialist resulted in: Pass.",
    "result": "pass",
    "isRead": true,
    "createdAt": "…"
  }
}
```

### Example — Other user blocked from marking someone else's notification (`403 Forbidden`)

```http
PATCH /api/notifications/notif-A01/read
Authorization: Bearer {{token:int-content}}
Content-Type: application/json

{}
```

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "code": "FORBIDDEN",
    "message": "You may only modify your own notifications.",
    "fields": {}
  }
}
```

---

## Changes

- `2026-11-25`: Initial interviewer assessments, final pass/fail results, and in-app notifications contract defined for steps C10 and C11.
- `2026-11-25`: Updated `GET /api/results` and `GET /api/applications/mine` response examples to show both object and `null` item shapes (`A03`–`A06` with `assessment: null`; rejected `A09` with `interview: null`) so `contract-check.mjs` validates trailing array items accurately.
