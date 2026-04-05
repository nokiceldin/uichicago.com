import { NextRequest, NextResponse } from "next/server";
import { normalizeTranscript, transcribeAudioRecording } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let payload;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const audioFile = formData.get("audioFile");
      const transcriptText = formData.get("transcriptText");
      const titleValue = formData.get("title");
      const title = typeof titleValue === "string" ? titleValue : undefined;

      if (typeof transcriptText === "string" && transcriptText.trim()) {
        payload = await normalizeTranscript({
          transcriptText,
          title,
        });
      } else if (audioFile instanceof File) {
        payload = await transcribeAudioRecording({
          audioFile,
          title,
        });
      } else {
        payload = await normalizeTranscript({
          transcriptText: typeof transcriptText === "string" ? transcriptText : "",
          title,
        });
      }
    } else {
      const body = await request.json();
      payload = await normalizeTranscript({
        transcriptText: body.transcriptText || "",
        title: body.title,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process transcript." },
      { status: 400 },
    );
  }
}
