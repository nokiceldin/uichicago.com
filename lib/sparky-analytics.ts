import { prisma } from "@/lib/prisma";

const WORD_STOPLIST = new Set([
  "a", "about", "all", "am", "an", "and", "any", "are", "as", "at", "be", "been", "but",
  "by", "can", "do", "for", "from", "get", "got", "had", "has", "have", "help", "how",
  "i", "if", "im", "in", "into", "is", "it", "its", "just", "know", "like", "me", "my",
  "need", "of", "on", "or", "please", "should", "so", "tell", "than", "that", "the",
  "them", "they", "this", "to", "u", "want", "was", "what", "when", "where", "which",
  "who", "why", "will", "with", "would", "you", "your",
]);

export type SparkyAnalyticsFilters = {
  q?: string;
  responseKind?: string;
  answerMode?: string;
  days?: number;
  page?: number;
  pageSize?: number;
};

export type SparkyLogRow = {
  id: string;
  createdAt: Date;
  sessionId: string;
  conversationId: string | null;
  userId: string | null;
  query: string;
  normalizedQuery: string | null;
  responseText: string | null;
  responseKind: string | null;
  responseStatus: string | null;
  answerMode: string | null;
  abstained: boolean;
  responseMs: number | null;
};

function makeWhere(filters: SparkyAnalyticsFilters) {
  const days = Number.isFinite(filters.days) ? Math.max(1, Number(filters.days)) : 30;
  const createdAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const q = filters.q?.trim();

  return {
    createdAt: { gte: createdAt },
    ...(filters.responseKind ? { responseKind: filters.responseKind } : {}),
    ...(filters.answerMode ? { answerMode: filters.answerMode } : {}),
    ...(q
      ? {
          OR: [
            { query: { contains: q, mode: "insensitive" as const } },
            { normalizedQuery: { contains: q, mode: "insensitive" as const } },
            { responseText: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

function countWords(queries: Array<string | null>) {
  const counts = new Map<string, number>();

  for (const raw of queries) {
    if (!raw) continue;
    const words = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !WORD_STOPLIST.has(word));

    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([word, count]) => ({ word, count }));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function getSparkyAnalytics(filters: SparkyAnalyticsFilters = {}) {
  const page = Number.isFinite(filters.page) ? Math.max(1, Number(filters.page)) : 1;
  const pageSize = Number.isFinite(filters.pageSize) ? Math.min(100, Math.max(10, Number(filters.pageSize))) : 40;
  const where = makeWhere(filters);
  const skip = (page - 1) * pageSize;

  let totalLogs: number;
  let totalAbstained: number;
  let totalErrors: number;
  let recentLogs: SparkyLogRow[];
  let groupedKinds: Array<{ responseKind: string | null; _count: { _all: number } }>;
  let groupedModes: Array<{ answerMode: string | null; _count: { _all: number } }>;
  let frequentQuestions: Array<{ normalizedQuery: string | null; _count: { _all: number } }>;
  let querySamples: Array<{ query: string; normalizedQuery: string | null; responseText: string | null; responseMs: number | null }>;

  try {
    [
      totalLogs,
      totalAbstained,
      totalErrors,
      recentLogs,
      groupedKinds,
      groupedModes,
      frequentQuestions,
      querySamples,
    ] = await Promise.all([
      prisma.queryLog.count({ where }),
      prisma.queryLog.count({ where: { ...where, abstained: true } }),
      prisma.queryLog.count({ where: { ...where, responseStatus: "error" } }),
      prisma.queryLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          sessionId: true,
          conversationId: true,
          userId: true,
          query: true,
          normalizedQuery: true,
          responseText: true,
          responseKind: true,
          responseStatus: true,
          answerMode: true,
          abstained: true,
          responseMs: true,
        },
      }) as Promise<SparkyLogRow[]>,
      prisma.queryLog.groupBy({
        by: ["responseKind"],
        where,
        _count: { _all: true },
        orderBy: {
          _count: {
            responseKind: "desc",
          },
        },
        take: 12,
      }),
      prisma.queryLog.groupBy({
        by: ["answerMode"],
        where,
        _count: { _all: true },
        orderBy: {
          _count: {
            answerMode: "desc",
          },
        },
        take: 12,
      }),
      prisma.queryLog.groupBy({
        by: ["normalizedQuery"],
        where: {
          ...where,
          normalizedQuery: {
            not: null,
          },
        },
        _count: { _all: true },
        orderBy: {
          _count: {
            normalizedQuery: "desc",
          },
        },
        take: 15,
      }),
      prisma.queryLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 1500,
        select: {
          query: true,
          normalizedQuery: true,
          responseText: true,
          responseMs: true,
        },
      }),
    ]);
  } catch (error) {
    console.warn("[sparky-analytics] Falling back to legacy QueryLog shape:", error);
    [
      totalLogs,
      totalAbstained,
      recentLogs,
      groupedModes,
      frequentQuestions,
      querySamples,
    ] = await Promise.all([
      prisma.queryLog.count({ where }),
      prisma.queryLog.count({ where: { ...where, abstained: true } }),
      prisma.queryLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          sessionId: true,
          query: true,
          answerMode: true,
          abstained: true,
          responseMs: true,
        },
      }).then((rows) =>
        rows.map((row) => ({
          ...row,
          conversationId: null,
          userId: null,
          normalizedQuery: null,
          responseText: null,
          responseKind: "legacy",
          responseStatus: null,
        }))
      ),
      prisma.queryLog.groupBy({
        by: ["answerMode"],
        where,
        _count: { _all: true },
        orderBy: {
          _count: {
            answerMode: "desc",
          },
        },
        take: 12,
      }),
      prisma.queryLog.groupBy({
        by: ["query"],
        where,
        _count: { _all: true },
        orderBy: {
          _count: {
            query: "desc",
          },
        },
        take: 15,
      }).then((rows) =>
        rows.map((row) => ({
          normalizedQuery: row.query,
          _count: { _all: row._count._all },
        }))
      ),
      prisma.queryLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 1500,
        select: {
          query: true,
          responseMs: true,
        },
      }).then((rows) =>
        rows.map((row) => ({
          query: row.query,
          normalizedQuery: null,
          responseText: null,
          responseMs: row.responseMs,
        }))
      ),
    ]);

    totalErrors = 0;
    groupedKinds = [];
  }

  const promptLengths = querySamples.map((row) => row.query.length).filter((value) => value > 0);
  const responseLengths = querySamples.map((row) => row.responseText?.length ?? 0).filter((value) => value > 0);
  const responseTimes = querySamples.map((row) => row.responseMs ?? 0).filter((value) => value > 0);

  return {
    filters: {
      q: filters.q?.trim() ?? "",
      responseKind: filters.responseKind ?? "",
      answerMode: filters.answerMode ?? "",
      days: Number.isFinite(filters.days) ? Math.max(1, Number(filters.days)) : 30,
      page,
      pageSize,
    },
    totals: {
      totalLogs,
      totalAbstained,
      totalErrors,
      totalAnswered: Math.max(totalLogs - totalAbstained - totalErrors, 0),
      avgPromptLength: Math.round(average(promptLengths)),
      avgResponseLength: Math.round(average(responseLengths)),
      avgResponseMs: Math.round(average(responseTimes)),
    },
    recentLogs: recentLogs as SparkyLogRow[],
    responseKinds: groupedKinds.map((item) => ({
      label: item.responseKind ?? "unknown",
      count: item._count._all,
    })),
    answerModes: groupedModes.map((item) => ({
      label: item.answerMode ?? "unknown",
      count: item._count._all,
    })),
    frequentQuestions: frequentQuestions
      .filter((item) => item.normalizedQuery)
      .map((item) => ({
        query: item.normalizedQuery as string,
        count: item._count._all,
      })),
    commonWords: countWords(querySamples.map((row) => row.normalizedQuery ?? row.query)),
    totalPages: Math.max(Math.ceil(totalLogs / pageSize), 1),
  };
}

export async function getSparkyExportRows(filters: SparkyAnalyticsFilters = {}) {
  const where = makeWhere(filters);
  try {
    return await prisma.queryLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        createdAt: true,
        sessionId: true,
        conversationId: true,
        userId: true,
        query: true,
        normalizedQuery: true,
        responseText: true,
        responseKind: true,
        responseStatus: true,
        answerMode: true,
        abstained: true,
        abstainReason: true,
        responseMs: true,
      },
    });
  } catch (error) {
    console.warn("[sparky-analytics] Falling back to legacy export shape:", error);
    const rows = await prisma.queryLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        createdAt: true,
        sessionId: true,
        query: true,
        answerMode: true,
        abstained: true,
        abstainReason: true,
        responseMs: true,
      },
    });

    return rows.map((row) => ({
      ...row,
      conversationId: null,
      userId: null,
      normalizedQuery: null,
      responseText: null,
      responseKind: "legacy",
      responseStatus: null,
    }));
  }
}
