import Anthropic from "@anthropic-ai/sdk";

export type UploadedFile = {
  name: string;
  mimeType: string;
  data: string;
  fileType: "image" | "pdf" | "text";
};

type UploadedFileSupport = {
  attachmentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | null;
  promptContext: string;
  fallbackUserPrompt: string;
  extractedText: string;
};

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{3,}/g, "  ")
    .trim();
}

function alnumCount(text: string) {
  const matches = text.match(/[A-Za-z0-9]/g);
  return matches ? matches.length : 0;
}

function summarizeExtractionQuality(text: string) {
  const trimmed = text.trim();
  const chars = trimmed.length;
  const alnum = alnumCount(trimmed);
  const lines = trimmed.split("\n").filter((line) => line.trim().length > 0).length;

  if (chars >= 1200 && alnum >= 800 && lines >= 8) return "strong";
  if (chars >= 240 && alnum >= 160 && lines >= 3) return "partial";
  return "weak";
}

function guessDocumentKind(name: string) {
  const lower = name.toLowerCase();
  if (/syllabus|course outline|class outline/.test(lower)) return "likely a syllabus or course outline";
  if (/schedule|calendar|timetable/.test(lower)) return "likely a schedule or calendar";
  if (/transcript|grade report|grades/.test(lower)) return "likely a transcript or grade report";
  if (/invoice|bill|statement|tuition/.test(lower)) return "likely a billing or tuition document";
  if (/form|application|petition|waiver/.test(lower)) return "likely a form or application";
  if (/flyer|poster|event/.test(lower)) return "likely a flyer or event handout";
  if (/map|floorplan/.test(lower)) return "likely a map or location guide";
  return null;
}

async function extractPdfTextFromBase64(data: string) {
  const pdfModule = await import("pdf-parse");
  const pdfParse = ("default" in pdfModule ? pdfModule.default : pdfModule) as (buf: Buffer) => Promise<{ text?: string | null }>;
  const parsed = await pdfParse(Buffer.from(data, "base64"));
  return cleanExtractedText(parsed.text ?? "");
}

export async function extractReadableTextFromUploadedFile(uploadedFile: UploadedFile) {
  if (uploadedFile.fileType === "pdf") {
    return extractPdfTextFromBase64(uploadedFile.data);
  }

  if (uploadedFile.fileType === "text") {
    return cleanExtractedText(Buffer.from(uploadedFile.data, "base64").toString("utf-8"));
  }

  return "";
}

export async function buildUploadedFileSupport(uploadedFile: UploadedFile): Promise<UploadedFileSupport> {
  if (uploadedFile.fileType === "image") {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    const mediaType = allowedTypes.includes(uploadedFile.mimeType as typeof allowedTypes[number])
      ? (uploadedFile.mimeType as typeof allowedTypes[number])
      : "image/jpeg";

    return {
      attachmentBlock: {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: uploadedFile.data },
      },
      promptContext:
        `\n\n=== UPLOADED IMAGE ===\n` +
        `The student uploaded an image named "${uploadedFile.name}". The image itself is attached in the user message.\n` +
        `Look carefully before answering. First identify what kind of image it most likely is: screenshot, document photo, flyer, form, schedule, map, building, classroom, sign, event post, registration page, grade page, or something else.\n` +
        `Call out visible text, course codes, dates, room numbers, prices, names, labels, or UI elements when you can read them.\n` +
        `If the image is ambiguous, make a qualified best guess and label your confidence clearly. Prefer phrases like "it looks like", "my best guess is", or "I am moderately confident".\n` +
        `If it appears related to UIC, connect what you see to UIC context and help the student take the next step.\n`,
      fallbackUserPrompt:
        `Analyze the uploaded image carefully. Say what it most likely shows, mention any readable details, ` +
        `and make a qualified guess if parts are ambiguous.`,
      extractedText: "",
    };
  }

  if (uploadedFile.fileType === "pdf") {
    let extractedText = "";
    try {
      extractedText = await extractPdfTextFromBase64(uploadedFile.data);
    } catch (error) {
      console.error("[pdf-parse error]", error);
    }

    const quality = summarizeExtractionQuality(extractedText);
    const kindHint = guessDocumentKind(uploadedFile.name);
    const excerpt = extractedText.slice(0, 12000);
    const extractionSection =
      quality === "weak"
        ? `Only a weak text extraction was available, which often means the PDF is scanned, image-heavy, or poorly encoded. Use the PDF's visible structure and layout too, and make qualified guesses when needed.`
        : quality === "partial"
          ? `A partial text extraction was available. Some details may be missing or garbled, so use both the extracted text and the PDF's visible structure.`
          : `A strong text extraction was available. Use it, but still pay attention to layout, tables, and headings in the PDF.`;

    const promptContext =
      `\n\n=== UPLOADED PDF ===\n` +
      `The student uploaded a PDF named "${uploadedFile.name}". The PDF itself is attached in the user message as a native document block.\n` +
      `${kindHint ? `Filename hint: it is ${kindHint}.\n` : ""}` +
      `${extractionSection}\n` +
      `When the document is ambiguous, separate confirmed details from best guesses and say how confident you are.\n` +
      (excerpt
        ? `\n=== EXTRACTED TEXT PREVIEW ===\n${excerpt}\n=== END EXTRACTED TEXT PREVIEW ===\n`
        : `\nNo reliable text could be extracted automatically from this PDF.\n`);

    return {
      attachmentBlock: {
        type: "document",
        title: uploadedFile.name,
        context: kindHint ? `Filename hint: ${kindHint}.` : undefined,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: uploadedFile.data,
        },
      },
      promptContext,
      fallbackUserPrompt:
        `Analyze the uploaded PDF. Figure out what kind of document it is, pull out the most important details, ` +
        `and make qualified guesses if the scan or formatting is unclear.`,
      extractedText,
    };
  }

  const extractedText = await extractReadableTextFromUploadedFile(uploadedFile);
  return {
    attachmentBlock: null,
    promptContext:
      `\n\n=== UPLOADED FILE: ${uploadedFile.name} ===\n` +
      `${extractedText.slice(0, 12000)}\n` +
      `=== END FILE ===\n\nAnalyze this file in the context of the student's question.\n`,
    fallbackUserPrompt: `Analyze the uploaded file and answer the student's question using it.`,
    extractedText,
  };
}
