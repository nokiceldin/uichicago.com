type ParsedFlashcard = {
  front: string;
  back: string;
};

const SEPARATOR_LINE = /^[-=_*]{3,}$/;

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripPrefix(value: string, prefixPattern: RegExp) {
  return value.replace(prefixPattern, "").trim();
}

function parseInlineCard(line: string): ParsedFlashcard | null {
  const [front, ...rest] = line.split(/::| - | – |: /);
  const normalizedFront = normalizeLine(front || "");
  const normalizedBack = normalizeLine(rest.join(" "));
  if (!normalizedFront || !normalizedBack) return null;
  return { front: normalizedFront, back: normalizedBack };
}

function parseBlock(block: string): ParsedFlashcard[] {
  const lines = block
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => line && !SEPARATOR_LINE.test(line));

  if (!lines.length) return [];

  if (lines.length === 1) {
    const inlineCard = parseInlineCard(lines[0]);
    return inlineCard ? [inlineCard] : [];
  }

  if (/^q[:.)-]?\s*/i.test(lines[0])) {
    const front = stripPrefix(lines[0], /^q[:.)-]?\s*/i);
    const answerLines = lines.slice(1).map((line, index) => (index === 0 ? stripPrefix(line, /^a[:.)-]?\s*/i) : line));
    const back = normalizeLine(answerLines.join(" "));
    return front && back ? [{ front, back }] : [];
  }

  if (lines[0].endsWith("?")) {
    return [{ front: lines[0], back: normalizeLine(lines.slice(1).join(" ")) }];
  }

  if (lines.length === 2) {
    return [{ front: lines[0], back: lines[1] }];
  }

  const pairedCards: ParsedFlashcard[] = [];
  for (let index = 0; index < lines.length - 1; index += 2) {
    const front = lines[index];
    const back = lines[index + 1];
    if (front && back) {
      pairedCards.push({ front, back });
    }
  }
  return pairedCards;
}

export function parseExplicitFlashcardsFromText(sourceMaterial: string): ParsedFlashcard[] {
  const blocks = sourceMaterial
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cards = blocks.flatMap((block) => parseBlock(block));
  const seen = new Set<string>();

  return cards.filter((card) => {
    const key = `${card.front.toLowerCase()}__${card.back.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function estimateFlashcardCountFromText(sourceMaterial: string) {
  const explicitCards = parseExplicitFlashcardsFromText(sourceMaterial);
  if (explicitCards.length) {
    return explicitCards.length;
  }

  const questionCount = (sourceMaterial.match(/\?/g) || []).length;
  if (questionCount > 0) {
    return questionCount;
  }

  const nonEmptyLines = sourceMaterial
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !SEPARATOR_LINE.test(line)).length;

  return Math.max(12, Math.ceil(nonEmptyLines / 2));
}
