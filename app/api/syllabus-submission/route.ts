import { NextResponse } from "next/server";
import { Resend } from "resend";
import { extractReadableTextFromUploadedFile } from "@/lib/chat/attachments";
import { savePendingSyllabusSubmission } from "@/lib/syllabus-submissions";

const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const courseCode = String(formData.get("courseCode") || "").trim();
    const courseTitle = String(formData.get("courseTitle") || "").trim();
    const department = String(formData.get("department") || "").trim();
    const term = String(formData.get("term") || "").trim();
    const instructor = String(formData.get("instructor") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const file = formData.get("file");

    if (courseCode.length < 2 || courseTitle.length < 2) {
      return NextResponse.json({ error: "Course information is required." }, { status: 400 });
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Please attach a syllabus file." }, { status: 400 });
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Unsupported file type. Please upload a PDF, image, text file, or doc." }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large. Please keep it under 15MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const userAgent = req.headers.get("user-agent");
    const lowerMimeType = file.type.toLowerCase();

    const extractedText = await extractReadableTextFromUploadedFile({
      name: file.name,
      mimeType: lowerMimeType,
      data: buffer.toString("base64"),
      fileType:
        lowerMimeType === "application/pdf"
          ? "pdf"
          : lowerMimeType.startsWith("text/")
            ? "text"
            : "image",
    }).catch(() => "");

    const { submission } = await savePendingSyllabusSubmission({
      courseCode,
      courseTitle,
      department,
      term,
      instructor,
      notes,
      userAgent: userAgent || "",
      fileName: file.name,
      mimeType: lowerMimeType,
      sizeBytes: file.size,
      buffer,
      extractedText,
    });

    if (process.env.RESEND_API_KEY && process.env.MISSING_REPORT_TO_EMAIL) {
      await resend.emails.send({
        from: "UIC Ratings <onboarding@resend.dev>",
        to: process.env.MISSING_REPORT_TO_EMAIL,
        subject: `Syllabus submission queued: ${courseCode}`,
        text:
          `Submission ID: ${submission.id}\n` +
          `Course: ${courseCode} - ${courseTitle}\n` +
          `Department: ${department || "N/A"}\n` +
          `Term: ${term || "N/A"}\n` +
          `Instructor: ${instructor || "N/A"}\n` +
          `Notes: ${notes || "N/A"}\n` +
          `File: ${file.name}\n` +
          `Extracted text chars: ${submission.extractedTextLength}\n` +
          `User-Agent: ${userAgent || "N/A"}\n`,
      });
    }

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch {
    return NextResponse.json({ error: "Failed to submit syllabus." }, { status: 500 });
  }
}
