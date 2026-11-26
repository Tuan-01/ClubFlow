# 02 — Campaigns & Interview Setup (`C1`, `C3`, `C4`)

Manages the single club recruitment campaign (`2026-11-10` to `2026-11-30`, interview date `2026-12-07`), public campaign view (`C1`), Executive draft/publish/close lifecycle (`C3`, `C5`/`C9`), and interview setup (`C4`).

---

## `GET /api/campaign/public`

- **Allowed roles**: Public (Visitor, Executive, Applicant, Interviewer)
- **Path / Query parameters**: None
- **Success response (`200 OK`)**: Returns the published campaign details, timeline, instructions, positions (with quotas, descriptions, requirements), slot duration, and club interview availability slots. In `MOCK_MODE=empty`, list fields (`positions`, `availableTimeSlots`) return `[]`.
- **Error responses**:
  - `404 Not Found` (`CAMPAIGN_NOT_PUBLISHED`): no campaign has been published yet.

### Example — Visitor views published campaign (`200 OK`)

```http
GET /api/campaign/public
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "campaign": {
    "id": "camp-2026-fall",
    "name": "SAB Recruitment 2026",
    "clubName": "Student Activities Board (SAB)",
    "description": "Join our student community to organize campus events, build multimedia campaigns, and support student life.",
    "openingDate": "2026-11-10",
    "closingDate": "2026-11-30",
    "interviewDate": "2026-12-07",
    "instructions": "Submit one application per position with a PDF CV (max 5 MB), a motivation statement (max 300 words), and your interview slot availability.",
    "status": "published",
    "applicationsOpen": true,
    "publishedAt": "…",
    "slotDurationMinutes": 20,
    "availableTimeSlots": ["09:00-09:20", …],
    "positions": [
      {
        "id": "pos-content",
        "department": "Media & Communications",
        "title": "Content Team Specialist",
        "quota": 3,
        "description": "Write engaging social media posts, press copy, and campaign narratives.",
        "requirements": "Strong copywriting skills and familiarity with student communication channels."
      },
      …
    ]
  }
}
```

---

## `GET /api/campaign`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns the Executive's full campaign state including `draftSavedAt`, `isReadOnly` (`true` after C9 confirmation), and `positions`.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`): missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): caller is not an Executive.

### Example — Executive loads campaign editor (`200 OK`)

```http
GET /api/campaign
Authorization: Bearer {{token:exec}}
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
    "status": "published",
    "applicationsOpen": true,
    "isReadOnly": false,
    "draftSavedAt": "…",
    "publishedAt": "…",
    "positions": [
      {
        "id": "pos-content",
        "department": "Media & Communications",
        "title": "Content Team Specialist",
        "quota": 3,
        "description": "…",
        "requirements": "…"
      },
      …
    ]
  }
}
```

### Example — Non-executive blocked (`403 Forbidden`)

```http
GET /api/campaign
Authorization: Bearer {{token:studentA}}
```

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only Executives may access campaign configuration.",
    "fields": {}
  }
}
```

---

## `PUT /api/campaign/draft`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `name` (`string`, optional in draft, max 120 chars)
  - `clubName` (`string`, optional in draft, max 120 chars)
  - `description` (`string`, optional in draft, max 1000 chars)
  - `openingDate` (`string`, optional in draft, `YYYY-MM-DD`)
  - `closingDate` (`string`, optional in draft, `YYYY-MM-DD`)
  - `interviewDate` (`string`, optional in draft, `YYYY-MM-DD`)
  - `instructions` (`string`, optional in draft, max 1000 chars)
  - `positions` (`array`, optional in draft): objects `{ id?, department, title, quota, description, requirements }`.
- **Success response (`200 OK`)**: Saves the draft fields and updates `draftSavedAt`.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): malformed field types (e.g., non-array `positions`, `quota` not a number).
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`SCHEDULE_CONFIRMED`): campaign is read-only after schedule confirmation (`C9`).

### Example — Save campaign draft (`200 OK`)

```http
PUT /api/campaign/draft
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "name": "SAB Recruitment 2026",
  "clubName": "Student Activities Board (SAB)",
  "description": "Join our student community to organize campus events, build multimedia campaigns, and support student life.",
  "openingDate": "2026-11-10",
  "closingDate": "2026-11-30",
  "interviewDate": "2026-12-07",
  "instructions": "Submit one application per position with a PDF CV (max 5 MB), a motivation statement (max 300 words), and your interview slot availability.",
  "positions": [
    {
      "id": "pos-content",
      "department": "Media & Communications",
      "title": "Content Team Specialist",
      "quota": 3,
      "description": "Write engaging social media posts, press copy, and campaign narratives.",
      "requirements": "Strong copywriting skills and familiarity with student communication channels."
    },
    {
      "id": "pos-comms",
      "department": "Media & Communications",
      "title": "Communications Coordinator",
      "quota": 2,
      "description": "Coordinate external outreach, partner messaging, and event PR.",
      "requirements": "Clear verbal communication and stakeholder coordination skills."
    },
    {
      "id": "pos-design",
      "department": "Creative Arts",
      "title": "Design & Media Specialist",
      "quota": 2,
      "description": "Produce event posters, stage visuals, and digital flyers.",
      "requirements": "Proficiency in Figma or Adobe Creative Suite and basic visual design portfolio."
    },
    {
      "id": "pos-events",
      "department": "Logistics & Planning",
      "title": "Event Operations Coordinator",
      "quota": 5,
      "description": "Support on-ground logistics, venue booking coordination, and stage management.",
      "requirements": "Teamwork, problem-solving under pressure, and event coordination experience."
    }
  ]
}
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
    "status": "…",
    "applicationsOpen": true,
    "isReadOnly": false,
    "draftSavedAt": "…",
    "publishedAt": "…",
    "positions": [
      {"id": "pos-content", "department": "…", "title": "…", "quota": 3, "description": "…", "requirements": "…"},
      …
    ]
  }
}
```

---

## `POST /api/campaign/publish`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `name` (`string`, required, 1–120 chars)
  - `clubName` (`string`, required, 1–120 chars)
  - `description` (`string`, required, 1–1000 chars)
  - `openingDate` (`string`, required, `YYYY-MM-DD`)
  - `closingDate` (`string`, required, `YYYY-MM-DD`, must be strictly after `openingDate`)
  - `interviewDate` (`string`, required, `YYYY-MM-DD`, must be strictly after `closingDate`)
  - `instructions` (`string`, required, 1–1000 chars)
  - `positions` (`array`, required, min 1 item):
    - `positions[].id` (`string`, optional — generated if new row)
    - `positions[].department` (`string`, required, 1–80 chars)
    - `positions[].title` (`string`, required, 1–100 chars)
    - `positions[].quota` (`integer`, required, `1`–`50`)
    - `positions[].description` (`string`, required, 1–500 chars)
    - `positions[].requirements` (`string`, required, 1–500 chars)
- **Success response (`200 OK`)**: Validates and publishes the campaign (`status: "published"`, `applicationsOpen: true`).
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): missing required fields, impossible dates (`closingDate <= openingDate` or `interviewDate <= closingDate`), empty `positions`, or invalid position row fields (`positions[i].quota`, etc.).
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`SCHEDULE_CONFIRMED`): campaign is read-only after schedule confirmation.

### Example — Reject publish with missing field and impossible dates (`400 Bad Request`)

```http
POST /api/campaign/publish
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "name": "SAB Recruitment 2026",
  "clubName": "Student Activities Board (SAB)",
  "description": "",
  "openingDate": "2026-11-30",
  "closingDate": "2026-11-10",
  "interviewDate": "2026-11-20",
  "instructions": "Submit your CV in PDF.",
  "positions": [
    {
      "id": "pos-content",
      "department": "Media & Communications",
      "title": "Content Team Specialist",
      "quota": 0,
      "description": "Write social media posts.",
      "requirements": "Copywriting skills."
    }
  ]
}
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot publish campaign due to invalid fields.",
    "fields": {
      "description": "Campaign description is required.",
      "closingDate": "Closing date must be after opening date.",
      "interviewDate": "Interview date must be after closing date.",
      "positions[0].quota": "Vacancies quota must be an integer of at least 1."
    }
  }
}
```

### Example — Publish valid campaign (`200 OK`)

```http
POST /api/campaign/publish
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "name": "SAB Recruitment 2026",
  "clubName": "Student Activities Board (SAB)",
  "description": "Join our student community to organize campus events, build multimedia campaigns, and support student life.",
  "openingDate": "2026-11-10",
  "closingDate": "2026-11-30",
  "interviewDate": "2026-12-07",
  "instructions": "Submit one application per position with a PDF CV (max 5 MB), a motivation statement (max 300 words), and your interview slot availability.",
  "positions": [
    {
      "id": "pos-content",
      "department": "Media & Communications",
      "title": "Content Team Specialist",
      "quota": 3,
      "description": "Write engaging social media posts, press copy, and campaign narratives.",
      "requirements": "Strong copywriting skills and familiarity with student communication channels."
    },
    {
      "id": "pos-comms",
      "department": "Media & Communications",
      "title": "Communications Coordinator",
      "quota": 2,
      "description": "Coordinate external outreach, partner messaging, and event PR.",
      "requirements": "Clear verbal communication and stakeholder coordination skills."
    },
    {
      "id": "pos-design",
      "department": "Creative Arts",
      "title": "Design & Media Specialist",
      "quota": 2,
      "description": "Produce event posters, stage visuals, and digital flyers.",
      "requirements": "Proficiency in Figma or Adobe Creative Suite and basic visual design portfolio."
    },
    {
      "id": "pos-events",
      "department": "Logistics & Planning",
      "title": "Event Operations Coordinator",
      "quota": 5,
      "description": "Support on-ground logistics, venue booking coordination, and stage management.",
      "requirements": "Teamwork, problem-solving under pressure, and event coordination experience."
    }
  ]
}
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
    "status": "published",
    "applicationsOpen": true,
    "isReadOnly": false,
    "draftSavedAt": "…",
    "publishedAt": "…",
    "positions": [
      {"id": "pos-content", "department": "…", "title": "…", "quota": 3, "description": "…", "requirements": "…"},
      …
    ]
  }
}
```

---

## `POST /api/campaign/close`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body**: None (or `{}`)
- **Success response (`200 OK`)**: Marks applications closed (`status: "closed"`, `applicationsOpen: false`) so no new applications are accepted and schedule confirmation (`C9`) can proceed once all applications are reviewed.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`CAMPAIGN_NOT_PUBLISHED` or `SCHEDULE_CONFIRMED`): campaign is still draft or already confirmed.

> Note: The runnable example for `POST /api/campaign/close` appears in [03-applications.md](03-applications.md) after valid application submission and screening examples so that earlier application examples run while the campaign is open.

---

## `GET /api/interview-setup`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns campaign interview date (`2026-12-07`), slot duration (`15`, `20`, or `30`), pre-existing rooms list, selected room IDs, available time slots, campaign positions, and configured interviewers.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)

### Example — Load interview setup (`200 OK`)

```http
GET /api/interview-setup
Authorization: Bearer {{token:exec}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "setup": {
    "campaignId": "camp-2026-fall",
    "interviewDate": "2026-12-07",
    "slotDurationMinutes": 20,
    "isReadOnly": false,
    "selectedRoomIds": ["room-a", "room-b", "room-c"],
    "rooms": [
      {"id": "room-a", "name": "Room A (Media Lab)", "location": "Building B, 201"},
      …
    ],
    "positions": [
      {"id": "pos-content", "title": "Content Team Specialist", "department": "Media & Communications"},
      …
    ],
    "availableSlots": ["09:00-09:20", …],
    "interviewers": [
      {
        "id": "u-int-content",
        "name": "Trần Gia Huy",
        "email": "int-content@clubflow.test",
        "positionIds": ["pos-content", "pos-design"],
        "availableSlots": ["09:00-09:20", …]
      },
      …
    ]
  }
}
```

---

## `PUT /api/interview-setup`

- **Allowed roles**: `executive`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body (`application/json`)**:
  - `slotDurationMinutes` (`integer`, required): must be `15`, `20`, or `30`.
  - `selectedRoomIds` (`array<string>`, required, min 1): IDs chosen from existing `rooms`.
  - `interviewers` (`array<object>`, required, min 1):
    - `interviewers[].id` (`string`, required): valid interviewer ID.
    - `interviewers[].positionIds` (`array<string>`, required, min 1): valid campaign position IDs.
    - `interviewers[].availableSlots` (`array<string>`, required, min 1): valid time slot strings (`HH:MM-HH:MM`).
- **Success response (`200 OK`)**: Persists the interview setup and returns the updated `setup` object.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): `slotDurationMinutes` not in `{15, 20, 30}`, empty `selectedRoomIds`, unknown room/position/interviewer ID, or interviewer missing positions/slots.
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`)
  - `409 Conflict` (`SCHEDULE_CONFIRMED`): setup is read-only after schedule confirmation.

### Example — Reject unsupported slot duration (`400 Bad Request`)

```http
PUT /api/interview-setup
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "slotDurationMinutes": 25,
  "selectedRoomIds": [],
  "interviewers": [
    {
      "id": "u-int-content",
      "positionIds": ["pos-content"],
      "availableSlots": ["09:00-09:20"]
    }
  ]
}
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid interview setup configuration.",
    "fields": {
      "slotDurationMinutes": "Slot duration must be 15, 20, or 30 minutes.",
      "selectedRoomIds": "Select at least one interview room."
    }
  }
}
```

### Example — Save interview setup (`200 OK`)

```http
PUT /api/interview-setup
Authorization: Bearer {{token:exec}}
Content-Type: application/json

{
  "slotDurationMinutes": 20,
  "selectedRoomIds": ["room-a", "room-b", "room-c"],
  "interviewers": [
    {
      "id": "u-int-content",
      "positionIds": ["pos-content", "pos-design"],
      "availableSlots": ["09:00-09:20", "09:20-09:40", "09:40-10:00", "10:00-10:20", "10:20-10:40", "10:40-11:00", "11:00-11:20"]
    },
    {
      "id": "u-int-comms",
      "positionIds": ["pos-comms", "pos-events"],
      "availableSlots": ["09:00-09:20", "09:20-09:40", "09:40-10:00", "10:00-10:20", "10:20-10:40", "10:40-11:00"]
    },
    {
      "id": "u-int-ops",
      "positionIds": ["pos-events"],
      "availableSlots": ["09:00-09:20", "09:20-09:40", "09:40-10:00", "10:00-10:20", "10:20-10:40"]
    }
  ]
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "setup": {
    "campaignId": "camp-2026-fall",
    "interviewDate": "2026-12-07",
    "slotDurationMinutes": 20,
    "isReadOnly": false,
    "selectedRoomIds": ["room-a", "room-b", "room-c"],
    "rooms": [
      {"id": "room-a", "name": "Room A (Media Lab)", "location": "Building B, 201"},
      …
    ],
    "positions": [
      {"id": "pos-content", "title": "Content Team Specialist", "department": "Media & Communications"},
      …
    ],
    "availableSlots": ["09:00-09:20", …],
    "interviewers": [
      {
        "id": "u-int-content",
        "name": "Trần Gia Huy",
        "email": "int-content@clubflow.test",
        "positionIds": ["pos-content", "pos-design"],
        "availableSlots": ["09:00-09:20", …]
      },
      …
    ]
  }
}
```

---

## Changes

- `2026-11-25`: Initial campaign and interview-setup contract defined for steps C1, C3, C4, and C5/C9 campaign close.
- `2026-11-26`: Updated `PUT /api/interview-setup` in `mock/server.mjs` to validate interviewer IDs against seeded interviewer users so partial updates do not permanently drop interviewers from future edits.
