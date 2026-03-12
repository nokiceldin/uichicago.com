import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(
    20,
    Math.max(1, Number(searchParams.get("pageSize") || "10") || 10)
  );
  const skip = (page - 1) * pageSize;

  const qLower = q.toLowerCase();
  const qCompact = qLower.replace(/\s+/g, "");
  const qParts = q.trim().split(/\s+/);

  const subjectPart = qParts[0]?.match(/^[a-zA-Z&]+$/) ? qParts[0] : "";
  const numberPart = qParts[1]?.match(/^\d+[a-zA-Z]*$/) ? qParts[1] : "";

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { subject: { contains: q, mode: "insensitive" as const } },
          { number: { contains: q, mode: "insensitive" as const } },

          ...(subjectPart && numberPart
            ? [
                {
                  AND: [
                    { subject: { equals: subjectPart, mode: "insensitive" as const } },
                    { number: { startsWith: numberPart, mode: "insensitive" as const } },
                  ],
                },
              ]
            : []),

          ...(qCompact
            ? [
                {
                  AND: [
                    {
                      subject: {
                        contains: qCompact.replace(/\d.*$/, ""),
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      number: {
                        contains: qCompact.replace(/^[a-zA-Z&]+/, ""),
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      take: pageSize,
      skip,
      orderBy: [
        { totalRegsAllTime: "desc" },
        { avgGpa: "desc" },
        { subject: "asc" },
        { number: "asc" },
      ],
      select: {
        id: true,
        subject: true,
        number: true,
        title: true,
        avgGpa: true,
        difficultyScore: true,
        totalRegsAllTime: true,
      },
    }),
    prisma.course.count({ where }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    items: items.map((c) => ({
      ...c,
      href: `/courses/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.number)}`,
    })),
  });
}