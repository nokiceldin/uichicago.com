import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const professorName = String(body.professorName || "").trim()
    const department = body.department ? String(body.department).trim() : null
    const classInput = body.classInput ? String(body.classInput).trim() : null
    const notes = body.notes ? String(body.notes).trim() : null
    const searchQuery = body.searchQuery ? String(body.searchQuery).trim() : null
    const page = body.page ? String(body.page).trim() : "professors"

    if (professorName.length < 2) {
      return NextResponse.json({ error: "Professor name is required." }, { status: 400 })
    }

    const userAgent = req.headers.get("user-agent")

    await prisma.missingProfessorReport.create({
      data: {
        professorName,
        department,
        classInput,
        notes,
        searchQuery,
        page,
        userAgent,
      },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to submit report." }, { status: 500 })
  }
}