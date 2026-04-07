import { NextResponse } from "next/server";
import { extractReadableTextFromUploadedFile } from "@/lib/chat/attachments";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "That file type is temporarily unavailable. Please use a text file instead." }, { status: 400 });
    }

    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const cleaned = await extractReadableTextFromUploadedFile({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      data,
      fileType: "text",
    });

    if (!cleaned) {
      return NextResponse.json({ error: "No readable text was found in that file." }, { status: 400 });
    }

    return NextResponse.json({ text: cleaned });
  } catch (error) {
    console.error("[study parse-pdf]", error);
    return NextResponse.json({ error: "Could not read that file." }, { status: 500 });
  }
}
