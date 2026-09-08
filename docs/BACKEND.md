# LMS Backend — System Documentation (Source of Truth)

> **This document is the single source of truth for the NestJS backend.**  
> Prefer this file over older context docs when they conflict with the codebase under `LMS-Backend/src`.  
> Last aligned with the post-audit implementation (Phases 0–4).

---

## 1. Overview

Enterprise LMS API serving four roles:

| Role | Capabilities |
|------|----------------|
| **student** | Register/login, onboard, browse, cart, Stripe/free checkout, lessons, progress, assignments, quizzes, announcements (WS), schedule, chat, certificates, reviews |
| **instructor** | Org + teacher onboarding, full course CRUD, batches, teachers, students, assignments/quizzes/grading, announcements, schedule/live classes, chat, dashboard stats |
| **teacher** | Scoped to assigned batches; assignments/quizzes/announcements/schedule/students; **cannot** mutate course resources (`InstructorOnlyGuard`) |
| **admin** | `/admin/v1/*` oversight (users, courses, overview, announcement scheduler trigger) |

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11, TypeScript |
| Database | MongoDB (Mongoose) |
| Auth | Passport JWT, Google OAuth (`google-auth-library`) |
| Real-time | Socket.IO (`@nestjs/websockets`) — namespaces `/announcements`, `/communication` |
| Files | Cloudinary (multer memory + streamifier); MIME/size limits enforced |
| Email | Nodemailer / Brevo (OTP, teacher invite) |
| Payments | Stripe Checkout Sessions + webhook |
| Jobs | `@nestjs/schedule` (announcement midnight publish) |
| Validation | `class-validator` + global `ValidationPipe` |

**Default bind:** `PORT` from env (often `3288`), host `0.0.0.0`.

---

## 3. Modules (`src/`)

| Module | Responsibility |
|--------|----------------|
| `auth` | JWT strategy, `JwtAuthGuard`, `OptionalJwtAuthGuard`, `InstructorOnlyGuard`, `AdminOnlyGuard` |
| `user` | Register, login, OAuth (Google), onboarding, profile, password reset, seed (protected) |
| `organisation` | Org create/get under `auth/user/v1/organization` |
| `teacher` | Instructor-managed teachers (CRUD, invite email) under `auth/course/v1/*` |
| `category` | Categories under `auth/course/v1` |
| `course` | Courses, lessons, sublessons, batches, cart, favorites, purchase enroll, progress, reviews, dashboard stats |
| `assignment` | Assignments + submissions + grading |
| `quiz` | Quizzes + MCQ auto-grade + essay mark grading |
| `announcement` | CRUD, scheduled publish, WebSocket gateway |
| `schedule` | Calendar events / live class meeting links |
| `payment` | Stripe checkout session + webhook + `orders` |
| `communication` | Chat groups/messages REST + WS |
| `certificate` | Issue/list/verify certificates |
| `admin` | Admin-only overview APIs |
| `cloudinary` | Uploads + delete helper |

---

## 4. Auth & Guards

### JWT payload
`{ sub, email, role, onboardingStatus, isSubscribed }` → request user `{ userId, email, role, ... }`.

### Guards
| Guard | Behavior |
|-------|----------|
| `JwtAuthGuard` | Requires valid Bearer JWT |
| `OptionalJwtAuthGuard` | Public + optional enrichment |
| `InstructorOnlyGuard` | **Only** `role === 'instructor'` (students/teachers blocked) |
| `AdminOnlyGuard` | **Only** `role === 'admin'` |

### Password reset
`resetPassword` requires `decoded.sub === dto.user_id` (no IDOR).

### OAuth
- **Google:** supported via `POST auth/user/v1/auth/oauth-login-signup`
- **Facebook:** not implemented on backend (FE button removed)

### Seed
`GET auth/user/v1/seed/student-sandbox` — JWT + instructor; disabled when `NODE_ENV=production`.

---

## 5. Collections (actual)

### Mongoose schemas
`users`, `organisations`, `teachers`, `categories`, `courses`, `lessons`, `sublessons`, `batches` (schema exists), `batch_enrolled_students`, `course_progress`, `reviews`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_submissions`, `announcements`, `schedules`, `orders`, `chat_groups`, `chat_messages`, `certificates`

### Ad-hoc / raw collections
`carts`, `likes` (favorites) — accessed via `connection.collection`

### Batch model note
- **UI source of truth:** embedded `course.batch[]`
- **Synced:** create/update/delete batch also upserts/deletes `batches` collection
- Chat group auto-created on batch create; student added on enroll

---

## 6. API Prefix Map

| Prefix | Domain |
|--------|--------|
| `/auth/user/v1` | Auth, onboarding, profile, org create |
| `/auth/course/v1` | Courses, lessons, batches, cart, purchase, progress, teachers, dashboard stats, **Stripe checkout** |
| `/auth/assignment/v1` | Assignments |
| `/auth/quiz/v1` | Quizzes |
| `/auth/announcement/v1` | Announcements |
| `/auth/schedule/v1` | Schedule |
| `/review/v1` | Reviews |
| `/communication/v1` | Chat rooms + messages |
| `/certificate/v1` | Certificates |
| `/admin/v1` | Admin |

### Payments (Stripe)
| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/course/v1/checkout/create-session` | JWT; free → enroll now; paid → Stripe URL |
| GET | `/auth/course/v1/checkout/confirm?session_id=` | Confirm after redirect |
| POST | `/auth/course/v1/webhook/stripe` | Raw body + `stripe-signature` |

Legacy `POST /auth/course/v1/course/purchase` still exists for enroll helper use; FE checkout should use create-session.

### Progress
| Method | Path |
|--------|------|
| GET | `/auth/course/v1/progress` |
| POST | `/auth/course/v1/progress/complete-lesson` |
| POST | `/auth/course/v1/progress/complete-material` |

### Dashboard
| Method | Path |
|--------|------|
| GET | `/auth/course/v1/dashboard/stats` |

---

## 7. Real-time

### `/announcements`
- Handshake: JWT in `auth.token`
- `join` with `{ courseIds, batchIds }` — membership checked
- Events: `announcement:new`, `announcement:deleted`
- Rooms: `course_<id>`, `batch_<id>`

### `/communication`
- Handshake: JWT
- `joinRoom` / `leaveRoom` / `sendMessage` / `typing`
- Membership required for join/send/history

### Cron
`AnnouncementScheduler` — daily midnight UTC; publishes drafts with `scheduledAt <= today` (date-only, not time-of-day).

---

## 8. Key Behaviors

| Topic | Behavior |
|-------|----------|
| Free checkout | Enroll immediately; order status `free` |
| Paid checkout | Stripe session; enroll on webhook (idempotent by order) |
| Assignment submit | Status `Submitted`; progress `$addToSet` assignment |
| Quiz MCQ | Auto-graded on submit |
| Quiz essay grade | `essayMarks[]` updates marks + `obtainedScore` |
| Quiz answers | Hidden from students in `formatQuiz` |
| Reviews | Enrollment required; updates course `average_rating` / `review_count` |
| Certificates | `GET /certificate/v1/my`; verify by code; issue when progress eligible |
| Cloudinary | MIME allowlist + 100MB max |

---

## 9. Environment Variables

### Required at startup
`MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### Auth / email / frontend
`GOOGLE_CLIENT_ID`, `FRONTEND_URL`, `EMAIL_USER`, `EMAIL_PASS`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`

### Payments
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Runtime
`PORT` (default `3001` in code if unset; project often uses `3288`), `NODE_ENV`, `CORS_ORIGINS` (comma-separated; if unset, reflect request origin)

**Never commit secrets.** Document names only in PRs.

---

## 10. Local Run

```bash
cd LMS-Backend
cp .env.example .env   # if present; or maintain .env locally
npm install
npm run start:dev
```

```bash
npm run build
npx jest src/auth/instructor-only.guard.spec.ts
```

---

## 11. Security Checklist (maintain)

- [ ] Course mutations instructor-only + prefer org ownership on writes
- [ ] Reset password bound to token subject
- [ ] Seed not public in production
- [ ] Chat/announcement WS authenticated + membership
- [ ] Quiz answers not leaked to students
- [ ] Stripe webhook signature verified
- [ ] Admin routes behind `AdminOnlyGuard`

---

## 12. Maintenance Rule

When changing APIs, schemas, env vars, or auth rules:

1. Update this file in the same PR.
2. Update `LMS-Frontend/docs/FRONTEND.md` if the FE contract changes.
3. Do not treat outdated chat/audit markdown as SSOT.
