import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const page = body.page ? String(body.page).trim() : "unknown";
    const userAgent = req.headers.get("user-agent");

    if (name.length < 2) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (description.length < 5) {
      return NextResponse.json({ error: "Description is required." }, { status: 400 });
    }

    await resend.emails.send({
      from: "UIC Ratings <onboarding@resend.dev>",
      to: process.env.MISSING_REPORT_TO_EMAIL!,
      subject: `Contact form submission from ${name}`,
      text:
        `Name: ${name}\n` +
        `Email: ${email ?? "N/A"}\n` +
        `Page: ${page}\n` +
        `Description: ${description}\n` +
        `User-Agent: ${userAgent ?? "N/A"}\n`,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to send contact form." }, { status: 500 });
  }
}
