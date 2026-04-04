import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin";
import { getSparkyExportRows } from "@/lib/sparky-analytics";

function escapeCsv(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export async function GET(req: Request) {
  const adminSession = await getCurrentAdminSession();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const rows = await getSparkyExportRows({
    q: searchParams.get("q") ?? undefined,
    responseKind: searchParams.get("responseKind") ?? undefined,
    answerMode: searchParams.get("answerMode") ?? undefined,
    days: searchParams.get("days") ? Number(searchParams.get("days")) : undefined,
  });

  const header = [
    "createdAt",
    "sessionId",
    "conversationId",
    "userId",
    "query",
    "normalizedQuery",
    "responseText",
    "responseKind",
    "responseStatus",
    "answerMode",
    "abstained",
    "abstainReason",
    "responseMs",
  ];

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.createdAt.toISOString(),
        row.sessionId,
        row.conversationId,
        row.userId,
        row.query,
        row.normalizedQuery,
        row.responseText,
        row.responseKind,
        row.responseStatus,
        row.answerMode,
        row.abstained,
        row.abstainReason,
        row.responseMs,
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sparky-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
