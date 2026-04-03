import { NextResponse } from "next/server";
import { getProfessorDirectory } from "@/lib/professors/directory";

export async function GET() {
  try {
    const directory = await getProfessorDirectory();
    const departments = [...new Set(directory.map((entry) => entry.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json(departments);
  } catch (error) {
    console.error("GET /api/departments error:", error);
    return NextResponse.json(
      { error: "Failed to load departments" },
      { status: 500 }
    );
  }
}
