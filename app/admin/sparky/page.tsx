import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/admin";
import prisma from "@/lib/prisma";
import { getSparkyAnalytics } from "@/lib/sparky-analytics";

type SearchParamsValue = string | string[] | undefined;

type WebsiteFeedbackItem = {
  id: string;
  createdAt: Date;
  score: number | null;
  comment: string;
  page: string;
  timeOnSiteMs: number | null;
};

function pickFirst(value: SearchParamsValue) {
  return Array.isArray(value) ? value[0] : value;
}

function buildQueryString(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function truncate(value: string | null | undefined, max = 180) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max).trimEnd()}...` : value;
}

function formatDurationMs(value: number | null) {
  if (!value || value < 0) return "Unknown";
  const minutes = Math.max(1, Math.round(value / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function parseWebsiteFeedback(row: { id: string; message: string; createdAt: Date }): WebsiteFeedbackItem | null {
  try {
    const payload = JSON.parse(row.message) as {
      type?: unknown;
      score?: unknown;
      comment?: unknown;
      page?: unknown;
      timeOnSiteMs?: unknown;
    };

    if (payload.type !== "website") return null;

    const score = Number(payload.score);
    const timeOnSiteMs = Number(payload.timeOnSiteMs);

    return {
      id: row.id,
      createdAt: row.createdAt,
      score: Number.isInteger(score) && score >= 1 && score <= 5 ? score : null,
      comment: typeof payload.comment === "string" ? payload.comment : "",
      page: typeof payload.page === "string" && payload.page.trim() ? payload.page : "Unknown page",
      timeOnSiteMs: Number.isFinite(timeOnSiteMs) ? timeOnSiteMs : null,
    };
  } catch {
    return null;
  }
}

function withAdminNotice(
  returnTo: string,
  next: { groupStatus?: string; groupError?: string },
) {
  const url = new URL(returnTo || "/admin/sparky", "http://localhost");
  if (next.groupStatus) {
    url.searchParams.set("groupStatus", next.groupStatus);
  } else {
    url.searchParams.delete("groupStatus");
  }
  if (next.groupError) {
    url.searchParams.set("groupError", next.groupError);
  } else {
    url.searchParams.delete("groupError");
  }
  return `${url.pathname}${url.search}`;
}

async function deleteStudyGroupAction(formData: FormData) {
  "use server";

  const adminSession = await getCurrentAdminSession();
  if (!adminSession) {
    redirect("/auth/signin?callbackUrl=/admin/sparky");
  }

  const returnTo = String(formData.get("returnTo") || "/admin/sparky");
  const groupId = String(formData.get("groupId") || "").trim();
  const deleteTarget = String(formData.get("deleteTarget") || "").trim();

  let targetId = groupId;

  if (!targetId && deleteTarget) {
    const exactIdMatch = await prisma.studyGroup.findUnique({
      where: { id: deleteTarget },
      select: { id: true, name: true },
    });

    if (exactIdMatch) {
      targetId = exactIdMatch.id;
    } else {
      const exactNameMatches = await prisma.studyGroup.findMany({
        where: {
          name: {
            equals: deleteTarget,
            mode: "insensitive",
          },
        },
        select: { id: true },
        take: 2,
      });

      if (exactNameMatches.length === 0) {
        redirect(withAdminNotice(returnTo, { groupError: "No study group matched that exact name or ID." }));
      }

      if (exactNameMatches.length > 1) {
        redirect(withAdminNotice(returnTo, { groupError: "That exact group name matched multiple groups. Delete by ID instead." }));
      }

      targetId = exactNameMatches[0]?.id ?? "";
    }
  }

  if (!targetId) {
    redirect(withAdminNotice(returnTo, { groupError: "Enter a study group ID or exact name first." }));
  }

  const existing = await prisma.studyGroup.findUnique({
    where: { id: targetId },
    select: { id: true, name: true },
  });

  if (!existing) {
    redirect(withAdminNotice(returnTo, { groupError: "Study group not found." }));
  }

  await prisma.studyGroup.delete({
    where: { id: existing.id },
  });

  revalidatePath("/admin/sparky");
  redirect(withAdminNotice(returnTo, { groupStatus: `Deleted study group "${existing.name}".` }));
}

export default async function SparkyAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
}) {
  const adminSession = await getCurrentAdminSession();
  if (!adminSession) {
    redirect("/auth/signin?callbackUrl=/admin/sparky");
  }

  const resolved = (await searchParams) ?? {};
  const filters = {
    q: pickFirst(resolved.q) ?? "",
    responseKind: pickFirst(resolved.responseKind) ?? "",
    answerMode: pickFirst(resolved.answerMode) ?? "",
    days: Number(pickFirst(resolved.days) ?? 30),
    page: Number(pickFirst(resolved.page) ?? 1),
  };
  const groupQuery = (pickFirst(resolved.groupQuery) ?? "").trim();
  const groupStatus = pickFirst(resolved.groupStatus) ?? "";
  const groupError = pickFirst(resolved.groupError) ?? "";

  const analytics = await getSparkyAnalytics(filters);
  const websiteFeedbackRows = await prisma.feedback.findMany({
    where: { rating: "website" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      message: true,
      createdAt: true,
    },
  });
  const websiteFeedback = websiteFeedbackRows.flatMap((row) => {
    const parsed = parseWebsiteFeedback(row);
    return parsed ? [parsed] : [];
  });
  const websiteRatingScores = websiteFeedback.flatMap((item) => (item.score ? [item.score] : []));
  const averageWebsiteRating =
    websiteRatingScores.length > 0
      ? websiteRatingScores.reduce((total, score) => total + score, 0) / websiteRatingScores.length
      : null;
  const exportQuery = buildQueryString({
    q: analytics.filters.q,
    responseKind: analytics.filters.responseKind,
    answerMode: analytics.filters.answerMode,
    days: analytics.filters.days,
  });

  const previousPage = analytics.filters.page > 1 ? analytics.filters.page - 1 : undefined;
  const nextPage = analytics.filters.page < analytics.totalPages ? analytics.filters.page + 1 : undefined;
  const groupMatches = groupQuery
    ? await prisma.studyGroup.findMany({
        where: {
          OR: [
            { id: { contains: groupQuery } },
            { inviteCode: { contains: groupQuery, mode: "insensitive" } },
            { name: { contains: groupQuery, mode: "insensitive" } },
          ],
        },
        include: {
          creator: {
            select: {
              displayName: true,
              email: true,
            },
          },
          memberships: {
            select: { id: true },
          },
          linkedSets: {
            select: { id: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 25,
      })
    : [];
  const returnTo = `/admin/sparky?${buildQueryString({
    q: filters.q,
    responseKind: filters.responseKind,
    answerMode: filters.answerMode,
    days: filters.days,
    page: filters.page,
    groupQuery,
  })}`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_24%),#fafafa] px-4 py-8 text-zinc-950 sm:px-6 dark:bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.15),transparent_28%),#09090b] dark:text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                Admin
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sparky analytics</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Search what people ask, review Sparky’s exact replies, spot frequent questions, and export the raw data when you want to analyze it elsewhere.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/api/admin/sparky/export?${exportQuery}`}
                className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
              >
                Export CSV
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Search</span>
              <input
                type="text"
                name="q"
                defaultValue={analytics.filters.q}
                placeholder="Search prompts or answers"
                className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none dark:border-white/10 dark:bg-white/5"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Response kind</span>
              <select
                name="responseKind"
                defaultValue={analytics.filters.responseKind}
                className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none dark:border-white/10 dark:bg-white/5"
              >
                <option value="">All</option>
                {analytics.responseKinds.map((item) => (
                  <option key={item.label} value={item.label}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Answer mode</span>
              <select
                name="answerMode"
                defaultValue={analytics.filters.answerMode}
                className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none dark:border-white/10 dark:bg-white/5"
              >
                <option value="">All</option>
                {analytics.answerModes.map((item) => (
                  <option key={item.label} value={item.label}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Window</span>
              <select
                name="days"
                defaultValue={String(analytics.filters.days)}
                className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none dark:border-white/10 dark:bg-white/5"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last 365 days</option>
              </select>
            </label>
            <input type="hidden" name="page" value="1" />
            <div className="xl:col-span-5 flex flex-wrap gap-3">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Apply filters
              </button>
              <Link
                href="/admin/sparky"
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Clear
              </Link>
            </div>
          </form>
        </section>

        <section className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Study group cleanup</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Search live study groups by ID, invite code, or name, then remove leftover test data directly from the database.
              </p>
            </div>
            <form action={deleteStudyGroupAction} className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
              <input type="hidden" name="returnTo" value={returnTo} />
              <input
                type="text"
                name="deleteTarget"
                placeholder="Exact study group ID or exact name"
                className="h-11 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none dark:border-white/10 dark:bg-white/5"
              />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Delete exact match
              </button>
            </form>
          </div>

          {groupStatus ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              {groupStatus}
            </div>
          ) : null}
          {groupError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {groupError}
            </div>
          ) : null}

          <form className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <input type="hidden" name="q" value={filters.q} />
            <input type="hidden" name="responseKind" value={filters.responseKind} />
            <input type="hidden" name="answerMode" value={filters.answerMode} />
            <input type="hidden" name="days" value={String(filters.days)} />
            <input type="hidden" name="page" value="1" />
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Find study groups</span>
              <input
                type="text"
                name="groupQuery"
                defaultValue={groupQuery}
                placeholder="Search by name, invite code, or ID"
                className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none dark:border-white/10 dark:bg-white/5"
              />
            </label>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
              >
                Search groups
              </button>
              <Link
                href={`/admin/sparky?${buildQueryString({
                  q: filters.q,
                  responseKind: filters.responseKind,
                  answerMode: filters.answerMode,
                  days: filters.days,
                  page: filters.page,
                })}`}
                className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Clear group search
              </Link>
            </div>
          </form>

          {groupQuery ? (
            <div className="mt-5 space-y-3">
              {groupMatches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  No study groups matched &quot;{groupQuery}&quot;.
                </div>
              ) : groupMatches.map((group) => (
                <div
                  key={group.id}
                  className="flex flex-col gap-4 rounded-[1.4rem] border border-zinc-200 px-4 py-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{group.name}</div>
                    <div className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      ID {group.id}
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">
                      Invite {group.inviteCode} • {group.linkedSets.length} sets • {group.memberships.length} members
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      Creator {group.creator.displayName || group.creator.email || "Unknown"} • updated {formatDate(group.updatedAt)}
                    </div>
                  </div>
                  <form action={deleteStudyGroupAction}>
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="groupId" value={group.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
                    >
                      Delete group
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Website feedback</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Ratings and comments from the optional 30-minute site feedback prompt.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-72">
              <div className="rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Total</div>
                <div className="mt-1 text-2xl font-semibold">{formatNumber(websiteFeedback.length)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Avg rating</div>
                <div className="mt-1 text-2xl font-semibold">
                  {averageWebsiteRating === null ? "No ratings" : `${averageWebsiteRating.toFixed(1)} / 5`}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {websiteFeedback.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                No website feedback has been submitted yet.
              </div>
            ) : websiteFeedback.map((item) => (
              <div key={item.id} className="rounded-[1.4rem] border border-zinc-200 px-4 py-4 dark:border-white/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.score ? `Rating ${item.score} / 5` : "Comment only"}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      {formatDate(item.createdAt)} • {item.page} • {formatDurationMs(item.timeOnSiteMs)} on site
                    </div>
                  </div>
                </div>
                {item.comment ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                    {item.comment}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No written comment.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Total questions", value: formatNumber(analytics.totals.totalLogs) },
            { label: "Answered", value: formatNumber(analytics.totals.totalAnswered) },
            { label: "Abstained", value: formatNumber(analytics.totals.totalAbstained) },
            { label: "Avg prompt chars", value: formatNumber(analytics.totals.avgPromptLength) },
            { label: "Avg response ms", value: formatNumber(analytics.totals.avgResponseMs) },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">{card.label}</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{card.value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
            <h2 className="text-lg font-semibold">Most frequent questions</h2>
            <div className="mt-4 space-y-3">
              {analytics.frequentQuestions.length === 0 ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">No repeated questions yet for this filter.</div>
              ) : analytics.frequentQuestions.map((item) => (
                <div key={item.query} className="rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.query}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">{item.count} asks</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
            <h2 className="text-lg font-semibold">Common wording</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {analytics.commonWords.length === 0 ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">No word trends yet for this filter.</div>
              ) : analytics.commonWords.map((item) => (
                <span
                  key={item.word}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                >
                  <span>{item.word}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.count}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
            <h2 className="text-lg font-semibold">Response mix</h2>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Kinds</div>
                <div className="mt-2 space-y-2">
                  {analytics.responseKinds.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700 dark:text-zinc-300">{item.label}</span>
                      <span className="font-medium">{formatNumber(item.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Modes</div>
                <div className="mt-2 space-y-2">
                  {analytics.answerModes.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700 dark:text-zinc-300">{item.label}</span>
                      <span className="font-medium">{formatNumber(item.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
          <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
            <h2 className="text-lg font-semibold">Recent Sparky questions</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Exact prompts and answers from the selected window.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-white/10">
              <thead className="bg-zinc-50 dark:bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-300">When</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-300">Question</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-300">Answer</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-300">Kind</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-300">Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-white/10">
                {analytics.recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-zinc-500 dark:text-zinc-400">
                      No Sparky logs found for these filters.
                    </td>
                  </tr>
                ) : analytics.recentLogs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                      <div>{formatDate(log.createdAt)}</div>
                      <div className="mt-1 text-xs">session {log.sessionId.slice(-8)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-md whitespace-pre-wrap font-medium text-zinc-900 dark:text-zinc-100">{truncate(log.query, 260)}</div>
                      {log.normalizedQuery && log.normalizedQuery !== log.query && (
                        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">normalized: {truncate(log.normalizedQuery, 180)}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-lg whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{truncate(log.responseText, 320) || "No saved response"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="inline-flex rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] dark:border-white/10">
                        {log.responseKind ?? "unknown"}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{log.answerMode ?? "unknown mode"}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                      <div>{log.responseMs ? `${formatNumber(log.responseMs)} ms` : "No timing"}</div>
                      <div className="mt-1">{log.abstained ? "Abstained" : "Answered"}</div>
                      {log.userId && <div className="mt-1">user linked</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-white/10">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              Page {analytics.filters.page} of {analytics.totalPages}
            </div>
            <div className="flex gap-3">
              {previousPage ? (
                <Link
                  href={`/admin/sparky?${buildQueryString({
                    q: analytics.filters.q,
                    responseKind: analytics.filters.responseKind,
                    answerMode: analytics.filters.answerMode,
                    days: analytics.filters.days,
                    page: previousPage,
                  })}`}
                  className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold dark:border-white/10"
                >
                  Previous
                </Link>
              ) : <span />}
              {nextPage ? (
                <Link
                  href={`/admin/sparky?${buildQueryString({
                    q: analytics.filters.q,
                    responseKind: analytics.filters.responseKind,
                    answerMode: analytics.filters.answerMode,
                    days: analytics.filters.days,
                    page: nextPage,
                  })}`}
                  className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold dark:border-white/10"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
