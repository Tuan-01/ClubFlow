# 04 — Interview Scheduling & Confirmation (`C8`, `C9`)

Manages generating draft interview schedules for shortlisted applications (`C8`), editing/resolving/assigning slots with real overlap checks, exporting the schedule table, and approving/confirming the final read-only schedule (`C9`).

All summary counts are strictly derived from `assignments`:
- `proposedCount + conflictCount + unassignedCount === totalShortlisted`
- `scheduledCount === proposedCount + conflictCount`
- Every `conflict` row represents an actual time overlap for the same applicant, interviewer, or room, and names the conflicting application(s) and time slot.

---

## `GET /api/schedule`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns current schedule status (`"not_generated"`, `"draft"`, or `"confirmed"`), parameters (`date`, `windowStart`, `windowEnd`, `slotDurationMinutes`), computed `summary`, `conflicts`, and `assignments`. Lookup lists (`interviewers`, `rooms`) are loaded from `GET /api/interview-setup`. In `MOCK_MODE=empty`, `assignments` and `conflicts` are `[]` and all summary counts are `0`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)

### Example — Load initial scheduling state (`200 OK`)

```http
GET /api/schedule
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "schedule": {
    "campaignId": "camp-2026-fall",
    "status": "not_generated",
    "isReadOnly": false,
    "savedAt": null,
    "confirmedAt": null,
    "parameters": {
      "date": "2026-12-07",
      "windowStart": "09:00",
      "windowEnd": "12:00",
      "slotDurationMinutes": 20
    },
    "summary": {
      "totalShortlisted": 6,
      "scheduledCount": 0,
      "proposedCount": 0,
      "unassignedCount": 0,
      "conflictCount": 0
    },
    "conflicts": [],
    "assignments": []
  }
}
```

---

## `POST /api/schedule/generate`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `date` (`string`, required): `YYYY-MM-DD`, must be after campaign `closingDate` (`2026-12-07`).
  - `windowStart` (`string`, required): `HH:MM` (`00:00`–`23:59`).
  - `windowEnd` (`string`, required): `HH:MM`, must be strictly after `windowStart`.
  - `slotDurationMinutes` (`integer`, required): `15`, `20`, or `30`.
- **Success response (`200 OK`)**: Generates a draft schedule containing `proposed`, `conflict`, and/or `unassigned` rows with exact summary counts and detailed conflict explanations.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): invalid `date`, `windowEnd <= windowStart`, or unsupported `slotDurationMinutes`.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`NO_SHORTLISTED_APPLICATIONS` or `SCHEDULE_CONFIRMED`): no shortlisted applications exist, or schedule is already confirmed (regeneration disabled).

### Example — Reject invalid time window (`400 Bad Request`)

```http
POST /api/schedule/generate
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "date": "2026-12-07",
  "windowStart": "12:00",
  "windowEnd": "09:00",
  "slotDurationMinutes": 25
}
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid schedule generation parameters.",
    "fields": {
      "windowEnd": "Window end time must be after start time.",
      "slotDurationMinutes": "Slot duration must be 15, 20, or 30 minutes."
    }
  }
}
```

### Example — Generate draft schedule with Proposed, Conflict, and Unassigned rows (`200 OK`)

```http
POST /api/schedule/generate
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "date": "2026-12-07",
  "windowStart": "09:00",
  "windowEnd": "12:00",
  "slotDurationMinutes": 20
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "schedule": {
    "campaignId": "camp-2026-fall",
    "status": "draft",
    "isReadOnly": false,
    "savedAt": null,
    "confirmedAt": null,
    "parameters": {
      "date": "2026-12-07",
      "windowStart": "09:00",
      "windowEnd": "12:00",
      "slotDurationMinutes": 20
    },
    "summary": {
      "totalShortlisted": 6,
      "scheduledCount": 5,
      "proposedCount": 3,
      "unassignedCount": 1,
      "conflictCount": 2
    },
    "conflicts": [
      {
        "type": "applicant",
        "entityName": "Nguyễn Minh Anh",
        "timeSlot": "09:00-09:20",
        "assignmentIds": ["sch-A01", "sch-A02"],
        "message": "Applicant Nguyễn Minh Anh has overlapping interviews (A01 and A02) at 09:00-09:20."
      }
    ],
    "assignments": [
      {
        "id": "sch-A01",
        "applicationId": "A01",
        "applicantId": "u-studenta",
        "applicantName": "Nguyễn Minh Anh",
        "studentId": "S20241001",
        "positionId": "pos-content",
        "positionTitle": "Content Team Specialist",
        "date": "2026-12-07",
        "startTime": "09:00",
        "endTime": "09:20",
        "interviewerId": "u-int-content",
        "interviewerName": "Trần Gia Huy",
        "roomId": "room-a",
        "roomName": "Room A (Media Lab)",
        "status": "conflict",
        "reason": "Applicant Nguyễn Minh Anh overlaps with A02 at 09:00-09:20.",
        "conflictWith": ["sch-A02"]
      },
      …
    ]
  }
}
```

---

## `POST /api/schedule/confirm`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body**: None (or `{}`)
- **Success response (`200 OK`)**: Confirms the schedule (`status: "confirmed"`, `isReadOnly: true`). Campaign configuration, applications, and schedule become read-only (`C9`).
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`CAMPAIGN_NOT_CLOSED` | `PENDING_SCREENING` | `SCHEDULE_INCOMPLETE` | `SCHEDULE_CONFIRMED`):
    - Refused if applications are still open, unreviewed applications remain (`submitted`), no draft exists, or any shortlisted application is `unassigned` or `conflict` (naming the affected application IDs and reasons in `error.message` and `error.fields`).

### Example — Refuse confirmation while conflict and unassigned rows remain (`409 Conflict`)

```http
POST /api/schedule/confirm
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{}
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "SCHEDULE_INCOMPLETE",
    "message": "Cannot confirm schedule: unresolved conflicts (A01, A02) and unassigned applications (A04) remain.",
    "fields": {
      "conflicts": "A01 and A02 overlap for Nguyễn Minh Anh at 09:00-09:20.",
      "unassigned": "A04 (Phạm Quốc Bảo) has no assigned slot."
    }
  }
}
```

---

## `PATCH /api/schedule/assignments/:id`

- **Allowed roles**: `executive`
- **Path parameters**: `id` (`string`, required, e.g. `sch-A02`, `sch-A04`)
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `startTime` (`string`, required): `HH:MM`.
  - `endTime` (`string`, required): `HH:MM`, duration must match campaign `slotDurationMinutes`.
  - `interviewerId` (`string`, required): interviewer assigned to the application's position.
  - `roomId` (`string`, required): room ID from the selected setup rooms.
- **Success response (`200 OK`)**: Updates the assignment (`Edit`, `Resolve`, or `+ Assign Slot`), rechecks applicant, interviewer, and room overlaps across all rows, and returns the updated `schedule`.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): invalid time slot, duration mismatch, unknown interviewer/room, or interviewer not assigned to the application's position.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `404 Not Found` (`NOT_FOUND`): assignment `:id` does not exist.
  - `409 Conflict` (`SCHEDULE_CONFIRMED`): editing is disabled after schedule confirmation.

### Example — Resolve conflict on A02 (`200 OK`)

```http
PATCH /api/schedule/assignments/sch-A02
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "startTime": "09:40",
  "endTime": "10:00",
  "interviewerId": "u-int-comms",
  "roomId": "room-c"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "schedule": {
    "campaignId": "camp-2026-fall",
    "status": "draft",
    "isReadOnly": false,
    "savedAt": null,
    "confirmedAt": null,
    "parameters": {
      "date": "2026-12-07",
      "windowStart": "09:00",
      "windowEnd": "12:00",
      "slotDurationMinutes": 20
    },
    "summary": {
      "totalShortlisted": 6,
      "scheduledCount": 5,
      "proposedCount": 5,
      "unassignedCount": 1,
      "conflictCount": 0
    },
    "conflicts": [],
    "assignments": [
      {
        "id": "sch-A01",
        "applicationId": "A01",
        "applicantId": "u-studenta",
        "applicantName": "Nguyễn Minh Anh",
        "studentId": "S20241001",
        "positionId": "pos-content",
        "positionTitle": "Content Team Specialist",
        "date": "2026-12-07",
        "startTime": "09:00",
        "endTime": "09:20",
        "interviewerId": "u-int-content",
        "interviewerName": "Trần Gia Huy",
        "roomId": "room-a",
        "roomName": "Room A (Media Lab)",
        "status": "proposed",
        "reason": null,
        "conflictWith": []
      },
      …
    ]
  }
}
```

### Example — Assign slot to Unassigned A04 (`200 OK`)

```http
PATCH /api/schedule/assignments/sch-A04
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "startTime": "10:20",
  "endTime": "10:40",
  "interviewerId": "u-int-content",
  "roomId": "room-c"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "schedule": {
    "campaignId": "camp-2026-fall",
    "status": "draft",
    "isReadOnly": false,
    "savedAt": null,
    "confirmedAt": null,
    "parameters": {"date": "2026-12-07", "windowStart": "09:00", "windowEnd": "12:00", "slotDurationMinutes": 20},
    "summary": {
      "totalShortlisted": 6,
      "scheduledCount": 6,
      "proposedCount": 6,
      "unassignedCount": 0,
      "conflictCount": 0
    },
    "conflicts": [],
    "assignments": […]
  }
}
```

---

## `PUT /api/schedule`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `assignments` (`array<object>`, optional): list of `{ id, startTime, endTime, interviewerId, roomId }` updates to persist together; if omitted or empty when saving current in-memory draft, persists the current draft timestamp (`savedAt`).
- **Success response (`200 OK`)**: Saves draft changes (`Save Changes`) without confirming the schedule.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): invalid assignment fields.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`SCHEDULE_CONFIRMED`): read-only after confirmation.
  - `409 Conflict` (`SCHEDULE_NOT_GENERATED`): no schedule draft exists yet.

### Example — Save draft changes (`200 OK`)

```http
PUT /api/schedule
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "assignments": []
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "schedule": {
    "campaignId": "camp-2026-fall",
    "status": "draft",
    "isReadOnly": false,
    "savedAt": "…",
    "confirmedAt": null,
    "parameters": {"date": "2026-12-07", "windowStart": "09:00", "windowEnd": "12:00", "slotDurationMinutes": 20},
    "summary": {"totalShortlisted": 6, "scheduledCount": 6, "proposedCount": 6, "unassignedCount": 0, "conflictCount": 0},
    "conflicts": [],
    "assignments": […]
  }
}
```

---

## `GET /api/schedule/export`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Exports the schedule table as `text/csv; charset=utf-8`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`SCHEDULE_NOT_GENERATED`): no schedule draft exists yet.

### Example — Export schedule CSV (`200 OK`)

```http
GET /api/schedule/export
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: text/csv; charset=utf-8
```

---

## Schedule Confirmation & Read-Only Enforcement (`C9`)

### Example — Approve & Confirm clean schedule (`200 OK`)

```http
POST /api/schedule/confirm
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "schedule": {
    "campaignId": "camp-2026-fall",
    "status": "confirmed",
    "isReadOnly": true,
    "savedAt": "…",
    "confirmedAt": "…",
    "parameters": {"date": "2026-12-07", "windowStart": "09:00", "windowEnd": "12:00", "slotDurationMinutes": 20},
    "summary": {"totalShortlisted": 6, "scheduledCount": 6, "proposedCount": 6, "unassignedCount": 0, "conflictCount": 0},
    "conflicts": [],
    "assignments": […]
  },
  "campaign": {
    "id": "camp-2026-fall",
    "status": "confirmed",
    "applicationsOpen": false,
    "isReadOnly": true,
    …
  }
}
```

### Example — Editing blocked after confirmation (`409 Conflict`)

```http
PATCH /api/schedule/assignments/sch-A02
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "startTime": "11:00",
  "endTime": "11:20",
  "interviewerId": "u-int-comms",
  "roomId": "room-c"
}
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "SCHEDULE_CONFIRMED",
    "message": "Schedule is already confirmed and read-only.",
    "fields": {}
  }
}
```

---

## Changes

- `2026-11-25`: Initial interview scheduling, conflict detection, and confirmation contract defined for steps C8 and C9.
- `2026-11-26`: Clarified that `GET /api/schedule` returns schedule data without duplicating `interviewers`/`rooms` lookup lists (fetched via `GET /api/interview-setup`), and documented `409 SCHEDULE_NOT_GENERATED` on `PUT /api/schedule`.
