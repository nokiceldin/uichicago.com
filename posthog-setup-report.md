<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into UIC Sparky. The following files were created or modified:

- **`instrumentation-client.ts`** (new) — Initializes PostHog client-side using the Next.js 15.3+ `instrumentation-client` approach, with reverse proxy via `/ingest`, exception capture enabled, and debug mode in development.
- **`next.config.ts`** (edited) — Added PostHog ingestion rewrites (`/ingest/static/:path*` and `/ingest/:path*`) and `skipTrailingSlashRedirect: true`.
- **`app/lib/posthog-server.ts`** (new) — Singleton server-side PostHog client using `posthog-node`, shared across all API routes.
- **`.env.local`** (updated) — `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` set.
- **`app/chat/page.tsx`** (edited) — Added `chat_message_sent`, `chat_prompt_card_clicked`, and `chat_response_feedback` events.
- **`app/components/MissingProfessorButton.tsx`** (edited) — Added `missing_professor_submitted` event on successful submission.
- **`app/components/MissingCourseButton.tsx`** (edited) — Added `missing_course_submitted` event on successful submission.
- **`app/api/feedback/route.ts`** (edited) — Added server-side `feedback_submitted` event.
- **`app/api/missing-professor/route.ts`** (edited) — Added server-side `missing_professor_api_received` event.
- **`app/api/chat/route.ts`** (edited) — Added server-side `chat_api_request` event after input validation.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `chat_message_sent` | User sends a message in the Sparky chat | `app/chat/page.tsx` |
| `chat_prompt_card_clicked` | User clicks a prompt card or quick suggestion | `app/chat/page.tsx` |
| `chat_response_feedback` | User clicks thumbs up or thumbs down on a Sparky response | `app/chat/page.tsx` |
| `missing_professor_submitted` | User submits a missing professor report | `app/components/MissingProfessorButton.tsx` |
| `missing_course_submitted` | User submits a missing course report | `app/components/MissingCourseButton.tsx` |
| `feedback_submitted` | User submits general feedback (server-side) | `app/api/feedback/route.ts` |
| `chat_api_request` | Server-side: Sparky chat API receives a request | `app/api/chat/route.ts` |
| `missing_professor_api_received` | Server-side: missing professor report received | `app/api/missing-professor/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/345858/dashboard/1368959
- **Daily chat volume** (messages sent + API requests, daily): https://us.posthog.com/project/345858/insights/7qS1R7FB
- **Sparky response quality** (good vs bad thumbs feedback): https://us.posthog.com/project/345858/insights/QcDtimKe
- **Weekly engagement overview** (messages, prompts, missing reports): https://us.posthog.com/project/345858/insights/F92NhZAh
- **Chat engagement funnel** (prompt card click → message sent): https://us.posthog.com/project/345858/insights/fCXgJCp9
- **Unique daily active chatters** (DAU by chat_message_sent): https://us.posthog.com/project/345858/insights/KaRS5mm3

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
