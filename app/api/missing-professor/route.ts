import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { Resend } from "resend"
import { getPostHogClient } from "@/app/lib/posthog-server"

const resend = new Resend(process.env.RESEND_API_KEY)

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

    await resend.emails.send({
      from: "UIC Ratings <onboarding@resend.dev>",
      to: process.env.MISSING_REPORT_TO_EMAIL!,
      subject: `Missing professor report: ${professorName}`,
      text:
        `Professor: ${professorName}\n` +
        `Department: ${department ?? "N/A"}\n` +
        `Class: ${classInput ?? "N/A"}\n` +
        `Page: ${page}\n` +
        `Search query: ${searchQuery ?? "N/A"}\n` +
        `Notes: ${notes ?? "N/A"}\n` +
        `User-Agent: ${userAgent ?? "N/A"}\n`,
    })

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: "anonymous",
      event: "missing_professor_api_received",
      properties: {
        page,
        has_class: !!classInput,
        has_department: !!department,
        has_search_query: !!searchQuery,
      },
    });

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to submit report." }, { status: 500 })
  }
}