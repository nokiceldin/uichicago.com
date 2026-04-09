# UIChicago

UIChicago is a student-built platform for exploring UIC courses, comparing professors, asking campus questions with AI, and managing a personal study workspace in one place.

It combines structured academic data, professor rankings, campus knowledge, and AI-assisted tools into a single Next.js app designed around real student decisions:

- Which classes should I take?
- Which professor should I choose?
- How hard is this course really?
- What does campus life look like?
- Can AI turn my notes into something useful?

## What The App Includes

### Core product surfaces

- `Courses`: searchable course explorer with GPA, easiness, Gen Ed, and requirement filters
- `Professors`: professor rankings with department filters, reviews, course history, and profile pages
- `Sparky`: UIC-focused chat for planning, comparisons, campus questions, and recommendations
- `My School`: a personal study workspace for flashcards, quizzes, notes, exam prep, progress tracking, and planning

### Student-facing features

- Course detail pages with grade distributions, pass rates, withdrawal rates, and professor outcome comparisons
- Professor detail pages with rankings, summaries, linked courses, and save controls
- Saved professors and saved courses tied to user accounts
- Study set creation, public/private sharing, notes workflows, and study groups
- Degree-planning and profile-aware study preferences
- Campus knowledge coverage for topics like tuition, dining, housing, advising, library, health, safety, and student life

### Internal/admin features

- Sparky analytics admin page
- Chat logging and analytics
- RSS/news import job
- Data import and seeding scripts for courses, grades, professors, majors, embeddings, and campus knowledge

## Tech Stack

- `Next.js 16` with App Router
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `Prisma` with `PostgreSQL`
- `NextAuth` with Google sign-in
- `Anthropic` for Sparky
- `PostHog` for analytics
- `Vercel Analytics`
- `Resend` for email/contact workflows

## Repository Structure

```text
app/
  api/                 API routes for courses, professors, chat, study, auth, feedback, cron jobs
  chat/                Sparky UI
  courses/             Course explorer and course detail pages
  professors/          Professor ranking pages and professor detail pages
  study/               Study workspace, planner, notes, and set pages
  profile/             Student profile page
  settings/            Theme and account settings

lib/
  chat/                Sparky intent, retrieval, trust, memory, and data helpers
  study/               Study engine, AI prompts, profile, validation, and server payload logic
  professors/          Professor directory generation and course mapping
  auth/                Session and study-user helpers

prisma/
  schema.prisma        Database schema
  seed.mjs             Seed entrypoint

public/data/
  *.csv / *.json       Academic and campus knowledge data used by the app

scripts/
  *.mjs / *.ts         Import, scrape, seed, eval, and maintenance scripts
```

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment files

Create `.env.local` for local development. At minimum, you need a working Postgres database and auth secrets.

Example:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"

NEXTAUTH_SECRET="replace-with-a-long-random-string"
AUTH_SECRET="replace-with-a-long-random-string"

GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

ANTHROPIC_API_KEY="your-anthropic-key"

NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=""
NEXT_PUBLIC_POSTHOG_HOST=""

RESEND_API_KEY=""
MISSING_REPORT_TO_EMAIL=""

SPARKY_ADMIN_EMAILS="you@example.com"
ADMIN_EMAILS="you@example.com"

CRON_SECRET="replace-this"
SPARKY_BASE_URL="http://localhost:3000"

VOYAGE_API_KEY=""
SYLLABUS_SUBMISSIONS_DIR=""
```

### 3. Generate Prisma client

This runs automatically on install, but you can run it manually if needed:

```bash
npx prisma generate
```

### 4. Push schema or run migrations

If you are starting with a fresh database:

```bash
npx prisma db push
```

Optional:

```bash
npx prisma db seed
```

### 5. Start the app

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Required Environment Variables

### Database

- `DATABASE_URL`: PostgreSQL connection string

### Authentication

- `NEXTAUTH_SECRET`: NextAuth secret
- `AUTH_SECRET`: optional alias used by auth config
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret

### AI

- `ANTHROPIC_API_KEY`: required for Sparky chat and AI generation routes
- `VOYAGE_API_KEY`: used for embeddings/vector workflows if you run embedding scripts

### Analytics

- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`: PostHog project token
- `NEXT_PUBLIC_POSTHOG_HOST`: PostHog host

### Email / contact

- `RESEND_API_KEY`: Resend API key
- `MISSING_REPORT_TO_EMAIL`: inbox for missing professor / contact-type flows

### Admin

- `SPARKY_ADMIN_EMAILS`: comma-separated emails allowed into Sparky admin
- `ADMIN_EMAILS`: fallback admin email list
- `ADMIN_EMAIL`: single-email fallback

### Cron / deployment

- `CRON_SECRET`: secret for protected cron route access
- `SPARKY_BASE_URL`: base URL used by eval and related scripts

### Optional local data paths

- `SYLLABUS_SUBMISSIONS_DIR`: optional filesystem path for syllabus submission review workflows

## Available Scripts

### App lifecycle

```bash
npm run dev
npm run build
npm run start
npm run lint
```

### Syllabus workflows

```bash
npm run syllabus:review
npm run syllabus:upsert
```

### Common repo scripts

The `scripts/` directory includes tooling for:

- course and grade imports
- professor course-map generation
- major and degree-plan imports
- campus knowledge seeding
- embeddings and vector search prep
- evaluation and batch review workflows
- autonomous improvement review generation for Sparky
- RSS/news import
- study and syllabus maintenance

Examples:

```bash
node scripts/check-db.mjs
node scripts/import-grades.mjs
node scripts/import-majors.mjs
node scripts/build-embeddings.mjs
node scripts/run-eval.mjs
```

### Autonomous Sparky improvement loop

Generate a gated improvement review bundle from rubric eval failures and bad-response feedback:

```bash
npm run improve:sparky
```

Optional:

```bash
node --env-file=.env scripts/run-self-improvement-loop.mjs --threshold=7.5
node --env-file=.env scripts/run-self-improvement-loop.mjs --with-llm
```

Outputs are written to:

```text
artifacts/autonomous-improvement/
```

That bundle includes:

- `incidents.json`: normalized failures and bad-feedback incidents
- `clusters.json`: grouped failure patterns
- `candidates.json`: ranked, gated improvement candidates
- `generated-feedback-evals.json`: feedback-derived eval cases for candidates without rubric coverage
- `review.md`: human-readable review of what to fix next

This loop is intentionally conservative: it proposes changes and eval gates, but does not auto-edit production behavior by itself.

### Candidate execution and eval gate

After generating candidates, create an execution bundle for the top candidate:

```bash
npm run improve:sparky:execute
npm run improve:sparky:apply
```

Optional:

```bash
node --env-file=.env scripts/execute-self-improvement-candidate.mjs --candidate-id=candidate_direct_rule_or_fast_path_quality
node --env-file=.env scripts/execute-self-improvement-candidate.mjs --with-llm
```

This writes an execution folder under:

```text
artifacts/autonomous-improvement/executions/
```

Each execution contains:

- `patch-proposal.md`: the proposed change scope
- `execution-plan.json`: candidate metadata and next actions
- `decision.json`: `promote_candidate`, `reject_candidate`, or `manual_review_only`
- `auto-apply-result.json`: whether a known-safe local patch was applied
- `auto-apply.diff`: the file diff when auto-apply succeeds
- targeted rubric eval output when eval IDs are attached to the candidate

`npm run improve:sparky:apply` is the first step beyond proposal-only mode. It can auto-apply a known-safe local patch for supported candidates, but it still does not auto-commit or auto-deploy code changes.

### Feedback-derived evals

For candidates created from bad user feedback rather than existing rubric cases:

```bash
npm run improve:sparky:feedback-evals
npm run improve:sparky:worktree
```

This runs generated eval cases from:

```text
artifacts/autonomous-improvement/generated-feedback-evals.json
```

and writes:

```text
artifacts/autonomous-improvement/generated-feedback-eval-results.json
```

The candidate executor will automatically use these feedback-derived evals as a gate when no rubric eval IDs are attached.

### Isolated branch worktree runs

For the safest autonomous candidate test, run the candidate inside an isolated git worktree on its own local port:

```bash
npm run improve:sparky:worktree
```

Optional:

```bash
node --env-file=.env scripts/run-candidate-in-worktree.mjs --candidate-id=candidate_direct_rule_or_fast_path_quality --port=3011
```

This flow:

- creates a temporary `codex/` branch in a git worktree
- reuses your dependencies and env files
- starts a dev server in that worktree
- runs the improvement loop and candidate executor against that isolated server
- shuts it down afterward

This is the safest built-in path for trying autonomous candidate patches without testing them directly in your main workspace.

### One command occasionally

If you just want one command to run once in a while and let Sparky improve itself through the safest built-in loop, use:

```bash
npm run make:sparky:smarter
```

That command:

- finds a free local port
- creates an isolated worktree branch
- refreshes a lighter subset of Sparky eval data inside that isolated environment
- runs the improvement loop there
- prefers a supported candidate patch there when one is available
- runs the gate
- copies the result artifacts back into your main workspace
- cleans up the temporary worktree and branch

It prints a simple summary at the end and saves the artifacts under:

```text
artifacts/autonomous-improvement/one-click-runs/
```

## Data Sources And Product Model

This project is built around combining several types of data:

- structured course records
- grade distributions and aggregate historical performance
- professor metadata and RateMyProfessors-derived signals
- major and degree requirement data
- campus knowledge JSON files
- RSS/news imports
- student-created study content

The product philosophy is:

1. Prefer structured data when available
2. Use AI to synthesize, rank, explain, and personalize
3. Keep academic and campus exploration in one student workflow

## Authentication

Google sign-in is configured through NextAuth.

Authenticated users can:

- save professors
- save courses
- access synced profile and settings data
- use personal study data and preferences
- access study workspace persistence

## AI / Sparky Notes

Sparky is a UIC-focused assistant layered on top of:

- course and professor data
- campus knowledge documents
- session memory and user preferences
- retrieval and reranking logic
- trust-decision logic for when to answer vs abstain

Main implementation areas:

- [app/api/chat/route.ts](/Users/nokiceldin/Downloads/uic-prof-rank/app/api/chat/route.ts)
- [lib/chat/data.ts](/Users/nokiceldin/Downloads/uic-prof-rank/lib/chat/data.ts)
- [lib/chat/vectors.ts](/Users/nokiceldin/Downloads/uic-prof-rank/lib/chat/vectors.ts)
- [lib/chat/trust-decision.ts](/Users/nokiceldin/Downloads/uic-prof-rank/lib/chat/trust-decision.ts)

## Study Workspace Notes

The study experience includes:

- local and server-backed study sets
- flashcards
- quizzes and exam generation
- notes and transcript workflows
- progress tracking
- study groups
- public/private sharing

Main implementation areas:

- [app/study/study-workspace.tsx](/Users/nokiceldin/Downloads/uic-prof-rank/app/study/study-workspace.tsx)
- [lib/study/engine.ts](/Users/nokiceldin/Downloads/uic-prof-rank/lib/study/engine.ts)
- [lib/study/server.ts](/Users/nokiceldin/Downloads/uic-prof-rank/lib/study/server.ts)

## Deployment

This project is configured for Vercel.

### Vercel notes

- `vercel.json` defines a daily RSS cron job
- the chat route has a longer max duration
- production analytics are enabled through PostHog and Vercel Analytics

Build locally with:

```bash
npm run build
```

Start production mode locally with:

```bash
npm run start
```

## Known Reality Of The Repo

This is an ambitious, actively evolving product repo, not a minimal template. A few things to know:

- some large files still need future modularization
- many scripts support one-off imports and internal workflows
- `npm run build` is expected to pass for production readiness
- `npm run lint` may still surface debt in AI-heavy or legacy parts of the repo

If you are contributing, prioritize:

- correctness of student-facing data
- trustworthiness of AI outputs
- clean filters and taxonomy
- reducing monolithic files over time

## Security Notes

Before public launch or broad sharing:

- move any private passwords or gate tokens out of source code and into environment variables
- verify admin email configuration in production
- verify cron secrets
- verify contact/email destinations
- review any campus or financial AI answers for confidence and source quality

## Contributing

If you are working in this repo:

1. create or update the relevant data/import pipeline
2. test the UI path that depends on it
3. run `npm run build`
4. run `npm run lint` and note any existing debt you are not addressing
5. keep student-facing copy clear and direct

## License / Affiliation

UIChicago is an unofficial student-built project and is not affiliated with the University of Illinois Chicago.
