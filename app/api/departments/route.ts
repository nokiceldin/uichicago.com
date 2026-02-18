import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";



export async function GET() {
  try {
    const rows = await prisma.professor.findMany({
      select: { department: true },
      where: {
        department: { not: "" },
      },
      distinct: ["department"],
      orderBy: { department: "asc" },
    });

    const depts = rows
      .map((r) => r.department)
      .filter((d): d is string => Boolean(d));

    return NextResponse.json(depts);
  } catch (err) {
    console.error("GET /api/departments error:", err);
    return NextResponse.json(
      { error: "Failed to load departments" },
      { status: 500 }
    );
  }
}
