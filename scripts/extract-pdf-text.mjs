import fs from "node:fs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Missing PDF path.");
  process.exit(1);
}

try {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = new pdfjs.PDFWorker({ name: "uic-study-pdf-worker" });
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(filePath)),
    worker,
    useSystemFonts: true,
  });

  try {
    const doc = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = Array.isArray(content.items) ? content.items : [];
      const text = items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .filter(Boolean)
        .join("\n");
      if (text.trim()) {
        pages.push(text);
      }
      page.cleanup();
    }

    process.stdout.write(pages.join("\n\n"));
  } finally {
    await loadingTask.destroy();
    await worker.destroy();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
