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
      // pdf.js can split a visual word into individual glyphs. Preserve visual
      // rows and join adjacent glyphs, rather than putting every glyph on a
      // separate line (which makes structured PDFs impossible to parse).
      const rows = new Map();
      for (const item of items) {
        if (!("str" in item) || typeof item.str !== "string" || !item.str) continue;
        const x = item.transform?.[4];
        const y = item.transform?.[5];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const key = Math.round(y / 2) * 2;
        const row = rows.get(key) ?? [];
        row.push({ text: item.str, x, width: Number(item.width) || 0 });
        rows.set(key, row);
      }
      const text = [...rows.entries()]
        .sort(([a], [b]) => b - a)
        .map(([, row]) => row.sort((a, b) => a.x - b.x).reduce((line, item, index, all) => {
          const prior = all[index - 1];
          const gap = prior ? item.x - (prior.x + prior.width) : 0;
          return line + (prior && gap > 2 ? " " : "") + item.text;
        }, ""))
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
