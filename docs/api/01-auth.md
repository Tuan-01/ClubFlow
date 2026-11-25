# 01 — Authentication (`C2`)

Handles demo-account sign-in, current-session restoration on reload, and sign-out for all three roles (`executive`, `applicant`, `interviewer`).

---

## `POST /api/auth/login`

- **Allowed roles**: Public (unauthenticated)
- **Path / Query parameters**: None
- **Request body (`application/json`)**:
  - `email` (`string`, required): non-empty valid e-mail address matching a demo account.
  - `password` (`string`, required): non-empty password string.
- **Success response (`200 OK`)**: Returns a Bearer token (`token-<userId>`) and user summary. `studentId` is a string for applicants and `null` for executive/interviewer accounts.
- **Error responses**:
  - `400 Bad Request` (`VALIDATION_ERROR`): missing or blank `email` or `password`.
  - `401 Unauthorized` (`INVALID_CREDENTIALS`): unknown `email` or incorrect `password`.

### Example — Sign in as Applicant (`200 OK`)

```http
POST /api/auth/login
Content-Type: application/json

{"email": "studenta@clubflow.test", "password": "studenta-demo"}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "token": "…",
  "user": {
    "id": "u-studenta",
    "name": "Nguyễn Minh Anh",
    "email": "studenta@clubflow.test",
    "role": "applicant",
    "studentId": "S20241001"
  }
}
```

### Example — Missing password (`400 Bad Request`)

```http
POST /api/auth/login
Content-Type: application/json

{"email": "studenta@clubflow.test", "password": ""}
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please provide both email and password.",
    "fields": {
      "password": "Password is required."
    }
  }
}
```

### Example — Wrong password (`401 Unauthorized`)

```http
POST /api/auth/login
Content-Type: application/json

{"email": "studenta@clubflow.test", "password": "wrong-password"}
```

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password.",
    "fields": {}
  }
}
```

---

## `GET /api/auth/me`

- **Allowed roles**: `executive`, `applicant`, `interviewer`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Success response (`200 OK`)**: Returns the authenticated user's profile (`id`, `name`, `email`, `role`, `studentId`).
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`): missing or unrecognized Bearer token.

### Example — Restore current user (`200 OK`)

```http
GET /api/auth/me
Authorization: Bearer {{token:studentA}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "user": {
    "id": "u-studenta",
    "name": "Nguyễn Minh Anh",
    "email": "studenta@clubflow.test",
    "role": "applicant",
    "studentId": "S20241001"
  }
}
```

### Example — Missing token (`401 Unauthorized`)

```http
GET /api/auth/me
```

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required.",
    "fields": {}
  }
}
```

---

## `POST /api/auth/logout`

- **Allowed roles**: `executive`, `applicant`, `interviewer`
- **Path / Query parameters**: None
- **Headers**: `Authorization: Bearer <token>`
- **Request body**: None
- **Success response (`200 OK`)**: Acknowledges sign-out; the React client clears its in-memory/stored token and user context.
- **Error responses**:
  - `401 Unauthorized` (`UNAUTHORIZED`): missing or invalid Bearer token.

### Example — Sign out (`200 OK`)

```http
POST /api/auth/logout
Authorization: Bearer {{token:studentA}}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "ok": true
}
```

---

## Changes

- `2026-11-25`: Initial authentication endpoints (`login`, `me`, `logout`) defined for step C2.
