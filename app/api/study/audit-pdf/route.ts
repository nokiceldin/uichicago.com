import { NextResponse } from "next/server";
import { extractReadableTextFromUploadedFile } from "@/lib/chat/attachments";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

/** Extract text only for a local preview. The uploaded PDF is never persisted. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF audit first." }, { status: 400 });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    if (!file.size || file.size > MAX_BYTES) return NextResponse.json({ error: "Use a PDF under 10 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "That file is not a valid PDF." }, { status: 400 });
    // Uses the existing server-only extractor and deletes its temporary file.
    const text = await extractReadableTextFromUploadedFile({ name: file.name, mimeType: file.type || "application/pdf", data: Buffer.from(bytes).toString("base64"), fileType: "pdf" });
    if (!text.trim()) return NextResponse.json({ error: "No selectable text was found. Export the uAchieve print view or paste the expanded website audit instead." }, { status: 400 });
    return NextResponse.json({ text });
  } catch (error) {
    console.error("Degree-audit PDF extraction failed", error);
    return NextResponse.json({ error: "Could not read that PDF. Try a uAchieve print/PDF audit with selectable text." }, { status: 400 });
  }
}
