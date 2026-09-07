# Certification Tracker

Internal web application to manage and track employee certification plans. Built as a
simple Next.js full-stack monolith.

The system answers: which certifications are available / required / recommended, who needs
each one, deadlines, who completed / is learning / hasn't started / is overdue, who needs a
reminder, and the overall compliance status.

## Tech Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Auth.js** (next-auth v5) with **Microsoft Entra ID** (plus a dev-only login)
- **PostgreSQL + Prisma** *(MVP hiện dùng **SQLite** — `file:./dev.db`, không cần Docker)*
- **Azure Blob Storage** (private, SAS URLs) with a local-filesystem fallback for dev
- **Zod** validation
- **Vitest** (unit) + **Playwright** (E2E)

No .NET, no separate backend, no microservices, no Redis, no message queues.

## Architecture

```
                     Microsoft Entra ID
                            │
                            ▼
        ┌──────────────────────────────────────────┐
        │             Next.js Application          │
        │  React UI · Server Components · Server   │
        │  Actions · Route Handlers · Auth · Biz   │
        │                                          │
        │              ┌──────────────┐            │
        │              │ Prisma       │            │
        │              └───────┬──────┘            │
        └──────────────────────┼───────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              SQLite (MVP)          Azure Blob Storage
```

Core domains: **User**, **Certification**, **Certification Assignment**,
**Member Certification**, **Certificate File**.

A `Certification` defines *what a certification is* (e.g. AZ-204). A
`CertificationAssignment` defines *what a specific member must do* (John + AZ-204 +
Required + deadline). Different members can have different deadlines for the same cert.

## Getting Started

### Prerequisites

- Node.js 20+

### 1. Configure environment

```bash
cp .env.example .env
# Fill in AUTH_SECRET, and optionally Microsoft Entra ID credentials.
```

For local development `AUTH_ENABLE_DEV_LOGIN=true` enables a login screen that lets you
pick a seeded user (no Microsoft account needed). **Never enable it in production.**

> **MVP uses SQLite** (`DATABASE_URL="file:./dev.db"`), so no Docker/PostgreSQL is required.
> The optional `docker-compose.yml` only runs Azurite (Azure Blob emulator) if you set
> `FILE_STORAGE=azure`; with the default `FILE_STORAGE=local` you can ignore it.

### 2. Install

```bash
npm install
```

### 3. Migrate and seed

```bash
npx prisma migrate dev
npm run db:seed
```

The seed creates 1 admin, 5 members, 5 certifications (AZ-104, AZ-204, AZ-305, AZ-400,
AWS-SAA) and realistic assignments spanning Required / Recommended / Completed / In
Progress / Not Started / Overdue / Exempted.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Log in with any seeded user (e.g. `admin@company.com` for admin,
`john@company.com` for a member).

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Start the dev server                     |
| `npm run build`    | Production build                         |
| `npm run start`    | Serve the production build               |
| `npm run typecheck`| TypeScript type check (`tsc --noEmit`)   |
| `npm run lint`     | ESLint                                   |
| `npm test`         | Run unit tests (Vitest)                  |
| `npm run test:e2e` | Run Playwright E2E tests (requires DB)   |
| `npm run db:migrate` | Apply Prisma migrations                |
| `npm run db:seed`  | Seed the database                        |

## Configuration

See `.env.example` for all variables. Notable ones:

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js signing secret |
| `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER` | Microsoft Entra ID OAuth |
| `AUTH_ENABLE_DEV_LOGIN` | Enable dev-only login (default true in dev) |
| `FILE_STORAGE` | `azure` or `local` (local is for development) |
| `AZURE_STORAGE_*` | Azure Blob Storage credentials |
| `CERTIFICATION_EXPIRING_SOON_DAYS` | Expiring-soon window (default 30) |
| `MAX_CERTIFICATE_FILE_SIZE_MB` | Max certificate upload size (default 10) |
| `REMINDER_COOLDOWN_HOURS` | Reminder duplicate-send cooldown (default 24) |
| `NOTIFICATION_BACKEND` | `console` (dev) or `resend` |
| `EMAIL_PROVIDER_API_KEY` / `EMAIL_FROM` | Transactional email provider |
| `APP_URL` | Public app URL used in reminder emails |

**Never commit real secrets.** `.env` is gitignored.

## Pages

- `/dashboard` — Member certification plan (summary cards + table) + gold balance
- `/my-certifications` — Member learning progress + certificate upload + OCR image extraction
- `/recommended` — Featured recommended certifications with gold rewards + member gold view
- `/leaderboard` — Top members by gold (config-gated)
- `/admin/dashboard` — Org-wide metrics, compliance rate, charts, "Needs Attention"
- `/admin/members`, `/admin/members/[id]` — Member list + detail (assign, edit, exempt, verify, remind)
- `/admin/certifications` — Certification catalog CRUD + gold reward + featured toggle
- `/admin/certification-plan` — Bulk assign a certification to members
- `/admin/reports/overdue` — Overdue assignments
- `/admin/reports/missing` — Required but not started
- `/admin/reports/upcoming` — Deadlines within the window
- `/admin/reports/expiring` — Certificates about to expire

## AI Assist (Module A)

An in-app conversational assistant (floating chat bubble) with role-scoped tool-calling:

- **Members** can ask about their own plan, deadlines, progress, recommended certs, compliance and gold.
- **Admins** can additionally ask org-wide questions (overdue, missing, compliance, hot certs) and
  propose changes via chat (feature a cert, set a gold reward, assign a recommended cert, change a deadline).

Safety:
- The LLM never touches the DB directly; it only emits tool calls that the **server** executes after
  an authorization re-check.
- Write tools are **proposed first** and only executed after the admin clicks **Confirm** in the chat
  (human-in-the-loop). Every AI mutation writes an `AuditLog` with `source = AI_ASSIST` and the original
  utterance.
- Member-scope chats never see other members' data — org-wide tools are not even registered for members.

Configuration (supply your **own** provider key):

```bash
AI_PROVIDER=openai-compatible   # or azure-openai
AI_API_KEY=                     # YOUR provider key
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
AI_MAX_BULK_MUTATION=200
AI_CONVERSATION_PERSIST=true
```

**Google Gemini** (via its OpenAI-compatible endpoint) works out of the box:

```bash
AI_PROVIDER=openai-compatible
AI_API_KEY=YOUR_GEMINI_KEY
AI_MODEL=gemini-3.6-flash
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
```

The provider echoes Gemini's `extra_content` (thought signature) back on assistant tool calls,
which is required for multi-step tool loops. Azure OpenAI (when `AI_PROVIDER=azure-openai`): set
`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`.

## OCR Certificate Extraction (CR-OCR-01)

Members and admins can upload certificate **images** (PNG/JPEG) and have the system run OCR to
extract fields (certification code, member name/email, certificate number, issue/expiration
date), resolve the certification + member from the DB, and — when confident — persist a
**PENDING** `MemberCertification` with the file attached.

- **OCR only suggests, never auto-verifies.** `verificationStatus` is always `PENDING`; an admin
  still VERIFIES before it counts toward completion or triggers a gold award.
- **Confidence gate** (`OCR_REVIEW_THRESHOLD`, default 0.75): high confidence + matched cert &
  member → auto-create PENDING; otherwise flagged `needs_review` and returned for manual entry.
- Raw extraction JSON + confidence + source are stored on the `MemberCertification` and in a
  `CertificateExtraction` audit table; `AuditLog` records `EXTRACT_CERTIFICATE` /
  `CREATE_MEMBERCERT_FROM_OCR`.
- Batch upload supported; each file is processed independently (one failure doesn't abort the rest).
- Feature-flagged via `FEATURE_OCR_EXTRACTION`.

**OCR engine** is pluggable via `OCR_ENGINE`:
- `stub` (default) — deterministic fake for dev/test, no Python dependencies.
- `easyocr` — real extraction via a Python subprocess (`scripts/cert_ocr/extract.py`,
  the validated self-contained EasyOCR extractor: OpenCV preprocessing + EasyOCR + field
  extraction + catalog/roster matching).

```bash
# Enable real EasyOCR
pip install -r scripts/cert_ocr/requirements.txt   # pulls PyTorch (~2GB) + model (~64MB)
OCR_ENGINE=easyocr
OCR_DEFAULT_LANG=eng        # or eng+jpn
OCR_REVIEW_THRESHOLD=0.75
# Locked-down networks:
EASYOCR_MODEL_DIR=/path/to/models
EASYOCR_DOWNLOAD=0
```

## Gold Rewards (Module B)

Each certification can carry a **gold reward**. When a member obtains a **verified, unexpired**
certification, gold is credited automatically (idempotent — re-verifying never double-credits) and
recorded in an append-only `GoldTransaction` ledger. The balance is **derived** from the ledger, never
stored.

- Admins set rewards / feature recommended certs in `/admin/certifications` or via AI Assist.
- Members see their balance on `/dashboard` and browse `/recommended`.
- Optional leaderboard on `/leaderboard` (`GOLD_LEADERBOARD_ENABLED`).

```bash
GOLD_CLAWBACK_ON_EXPIRE=false   # MVP: expiry affects compliance only, not gold
GOLD_LEADERBOARD_ENABLED=true
```

## Key Business Rules

- **Status is derived, not hand-edited.** `getEffectiveStatus()` computes
  `NOT_STARTED / IN_PROGRESS / COMPLETED / OVERDUE / EXEMPTED / CERTIFICATE_EXPIRED` from the
  assignment deadline, member certification progress, and verification state.
- **Completion** requires a `MemberCertification` with `status = CERTIFIED` **and**
  `verificationStatus = VERIFIED`.
- **Compliance** is calculated on the fly: a member is compliant when all **REQUIRED**
  assignments are `COMPLETED` or `EXEMPTED`. Recommended assignments never affect compliance.
- **Deadline vs expiration** are separate concepts. A deadline decides whether the cert was
  obtained on time; certificate expiration decides whether it is still valid. An expired
  certificate makes the assignment `CERTIFICATE_EXPIRED` and non-compliant.
- **Reminders** are manual. A duplicate send is blocked within the cooldown window. Delivery
  goes through a `NotificationService` interface (`ConsoleNotificationService` in dev,
  `ResendNotificationService` in prod) so Teams/in-app can be added later.
- **Files** are stored in private blob storage (SAS URLs), never in PostgreSQL. Local dev
  uses a filesystem fallback served by a route handler.
- **Authorization** is enforced server-side. Members can only touch their own data; admins
  can do everything.

## Testing

Unit tests cover assignment status derivation, compliance calculation, reminder cooldowns,
date helpers, cross-member authorization, gold-award idempotency, AI tool role scoping, and
OCR decision rules (confidence gating, alias matching, no-auto-verify). Run with `npm test`.

E2E tests (`tests/e2e`) require a running app with a seeded DB and dev login enabled:

```bash
npx prisma migrate dev
npm run db:seed
npm run test:e2e
```

## Deployment

Deploy as a single Next.js application (e.g. Vercel) with:

- **SQLite** (MVP) or managed PostgreSQL when scaling
- Azure Blob Storage (private container)
- Microsoft Entra ID for auth
- A transactional email provider for reminders

Set `FILE_STORAGE=azure`, `NOTIFICATION_BACKEND=resend`, `AUTH_ENABLE_DEV_LOGIN=false`, and
provide the real credentials via environment variables.