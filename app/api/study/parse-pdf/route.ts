import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    let text = "";

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const pdfModule = await import("pdf-parse");
      const pdfParse = ("default" in pdfModule ? pdfModule.default : pdfModule) as (buf: Buffer) => Promise<{ text: string }>;
      const payload = await pdfParse(Buffer.from(arrayBuffer));
      text = payload.text || "";
    } else {
      text = Buffer.from(arrayBuffer).toString("utf-8");
    }

    const cleaned = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!cleaned) {
      return NextResponse.json({ error: "No readable text was found in that file." }, { status: 400 });
    }

    return NextResponse.json({ text: cleaned });
  } catch (error) {
    console.error("[study parse-pdf]", error);
    return NextResponse.json({ error: "Could not read that file." }, { status: 500 });
  }
}
