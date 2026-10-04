export type ProfessorIdentityCandidate = {
  name: string;
  department?: string | null;
  slug?: string | null;
};

export type ProfessorIdentityResolution<T extends ProfessorIdentityCandidate> =
  | { status: "match"; candidate: T; matchKind: "exact" | "alias" | "surname" }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "none" };

const HONORIFICS = new Set(["dr", "prof", "professor", "mr", "mrs", "ms", "miss"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
// These are grammatical boundaries, not a list of professor names. A title
// followed by an auxiliary/action phrase ("professor gives...") is a generic
// question; the same words after a name begin the predicate about that person.
const PROFESSOR_PREDICATE_WORDS = new Set([
  "is", "are", "am", "was", "were", "be", "been", "being",
  "do", "does", "did", "has", "have", "had",
  "can", "could", "should", "would", "will", "may", "might", "must", "ought", "not",
  "give", "gives", "gave", "grade", "grades", "graded", "grading",
  "teach", "teaches", "taught", "teaching", "offer", "offers", "offered",
  "rank", "ranks", "ranked", "rate", "rates", "rated", "recommend", "recommends",
  "take", "takes", "taking", "choose", "avoid", "pick", "prefer", "compare", "seem", "seems",
  "like", "worth", "good", "bad", "great", "best", "worst", "better", "worse",
  "easy", "easier", "easiest", "hard", "harder", "hardest",
  "high", "higher", "highest", "low", "lower", "lowest",
  "strict", "lenient", "helpful", "clear", "fair",
  "rating", "ratings", "review", "reviews", "course", "courses", "class", "classes",
  "section", "sections", "department", "dept", "salary", "quality", "difficulty",
  "teacher", "instructor", "gpa", "as",
  "to", "for", "at", "in", "on", "and", "or", "with", "about", "versus", "vs",
  "a", "an", "the", "this", "that",
]);
const GENERIC_QUESTION_WORDS = new Set([
  "which", "what", "who", "whom", "whose", "where", "when", "why", "how",
  "i", "we", "you", "they", "he", "she", "it",
]);
const NAME_PREDICATE_COLLISIONS = new Set(["fair", "may", "will"]);
const GENERIC_POST_ROLE_MARKERS = new Set([
  "actually", "currently", "generally", "now", "often", "overall", "sometimes", "today", "usually",
]);
const PROFESSOR_POSSESSIVE_ATTRIBUTE =
  String.raw`(?:ratings?|courses?|class(?:es)?|sections?|departments?|depts?|reviews?|difficulty|teaching\s+history)`;
const NICKNAMES: Record<string, string[]> = {
  alex: ["alexander", "alexandra"],
  alexander: ["alex"],
  alexandra: ["alex"],
  andy: ["andrew"],
  andrew: ["andy", "drew", "andruid"],
  andruid: ["andrew"],
  bill: ["william"],
  bob: ["robert"],
  brad: ["bradley"],
  cate: ["catherine", "katherine", "kathryn"],
  cathy: ["catherine", "katherine", "kathryn"],
  chris: ["christopher", "christina", "christine"],
  dan: ["daniel"],
  danny: ["daniel"],
  dave: ["david"],
  drew: ["andrew"],
  ed: ["edward", "edwin"],
  frank: ["francis", "franklin"],
  gabe: ["gabriel"],
  jack: ["john", "jackson"],
  jake: ["jacob"],
  james: ["jim", "jimmy", "jamie"],
  jay: ["jason"],
  jeff: ["jeffrey"],
  jen: ["jennifer"],
  jess: ["jessica"],
  jim: ["james"],
  jimmy: ["james"],
  joe: ["joseph"],
  jon: ["jonathan"],
  josh: ["joshua"],
  kate: ["katherine", "catherine", "kathryn"],
  katie: ["katherine", "catherine", "kathryn"],
  kathy: ["katherine", "catherine", "kathryn"],
  ken: ["kenneth"],
  kim: ["kimberly"],
  larry: ["lawrence"],
  liz: ["elizabeth"],
  maddy: ["madeline", "madison"],
  mandy: ["amanda"],
  marc: ["mark"],
  matt: ["matthew"],
  mike: ["michael"],
  nate: ["nathan"],
  nathan: ["nate"],
  nick: ["nicholas"],
  pat: ["patrick", "patricia"],
  pete: ["peter"],
  phil: ["philip", "phillip"],
  rob: ["robert"],
  ron: ["ronald"],
  sam: ["samuel", "samantha"],
  stephen: ["steve"],
  steve: ["steven", "stephen"],
  steven: ["steve"],
  sue: ["susan"],
  ted: ["theodore"],
  tim: ["timothy"],
  tom: ["thomas", "tomas"],
  tony: ["anthony"],
  will: ["william"],
};

for (const [nickname, formalNames] of Object.entries({ ...NICKNAMES })) {
  for (const formalName of formalNames) {
    NICKNAMES[formalName] = [...new Set([...(NICKNAMES[formalName] ?? []), nickname])];
  }
}

export function normalizeProfessorIdentityName(raw: string) {
  let value = String(raw ?? "").trim();
  if (!value) return "";

  if (value.includes(",")) {
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) value = `${parts.slice(1).join(" ")} ${parts[0]}`;
  }

  const tokens = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'".]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !HONORIFICS.has(token))
    .filter((token) => !SUFFIXES.has(token));

  return tokens.join(" ");
}

function professorHintTokens(value: string) {
  const rawTokens = value.trim().split(/\s+/).filter(Boolean);
  while (rawTokens.length && HONORIFICS.has(rawTokens[0].toLowerCase().replace(/[^a-z]/g, ""))) {
    rawTokens.shift();
  }
  return rawTokens;
}

function lexicalToken(token: string) {
  return token.replace(/[’']s$/i, "").toLowerCase().replace(/[^a-z-]/g, "");
}

function hasClearlyGenericLeadingPhrase(rawTokens: string[]) {
  const first = lexicalToken(rawTokens[0] ?? "");
  if (!first) return true;
  if (GENERIC_POST_ROLE_MARKERS.has(first)) return true;
  if (GENERIC_QUESTION_WORDS.has(first)) return true;
  if (!PROFESSOR_PREDICATE_WORDS.has(first)) return false;

  if (NAME_PREDICATE_COLLISIONS.has(first)) {
    const second = lexicalToken(rawTokens[1] ?? "");
    return Boolean(second) && (GENERIC_QUESTION_WORDS.has(second) || PROFESSOR_PREDICATE_WORDS.has(second));
  }
  return true;
}

function sanitizeProfessorNameHint(value: string) {
  const rawTokens = professorHintTokens(value);
  if (!rawTokens.length || hasClearlyGenericLeadingPhrase(rawTokens)) return null;

  const possessiveIndex = rawTokens.findIndex((token) => /[’']s$/i.test(token));
  const boundedTokens = possessiveIndex >= 0 ? rawTokens.slice(0, possessiveIndex + 1) : rawTokens;
  const cleaned = boundedTokens.map((token) => token.replace(/[’']s$/i, ""));
  const validToken = (token: string) => Boolean(lexicalToken(token)) || /^\d{2,4}[A-Za-z]?$/.test(token);
  return cleaned.every(validToken) ? cleaned.join(" ") : null;
}

function extractPossessiveProfessorNameHint(message: string) {
  const nameToken = String.raw`[\p{L}][\p{L}’'.-]*`;
  const titledMatch = message.match(new RegExp(
    String.raw`\b(?:professor|prof\.?|dr\.?)\s+(${nameToken}(?:\s+${nameToken}){0,5})[’']s\s+${PROFESSOR_POSSESSIVE_ATTRIBUTE}\b`,
    "iu",
  ));
  if (titledMatch?.[1]) return sanitizeProfessorNameHint(titledMatch[1]);

  const surnameMatch = message.match(new RegExp(
    String.raw`\b(${nameToken})[’']s\s+${PROFESSOR_POSSESSIVE_ATTRIBUTE}\b`,
    "iu",
  ));
  const surname = surnameMatch?.[1] ? sanitizeProfessorNameHint(surnameMatch[1]) : null;
  if (!surname) return null;
  const token = lexicalToken(surname);
  return token && !HONORIFICS.has(token) && !PROFESSOR_PREDICATE_WORDS.has(token)
    ? surname
    : null;
}

export function buildProfessorNamePrefixes(value: string) {
  const sanitized = sanitizeProfessorNameHint(value);
  if (!sanitized) return [];
  const tokens = sanitized.split(/\s+/).filter(Boolean);
  return tokens.map((_, index) => tokens.slice(0, tokens.length - index).join(" "));
}

function canDiscardProfessorHintSuffix(fullHint: string, prefix: string) {
  const fullTokens = fullHint.split(/\s+/).filter(Boolean);
  const prefixTokens = prefix.split(/\s+/).filter(Boolean);
  if (prefixTokens.length === fullTokens.length) return true;
  const firstDiscarded = lexicalToken(fullTokens[prefixTokens.length] ?? "");
  return PROFESSOR_PREDICATE_WORDS.has(firstDiscarded) || GENERIC_QUESTION_WORDS.has(firstDiscarded);
}

export function trimProfessorNamePredicate(value: string) {
  const rawTokens = professorHintTokens(value);
  if (!rawTokens.length || hasClearlyGenericLeadingPhrase(rawTokens)) return null;

  const kept: string[] = [];
  for (const [index, token] of rawTokens.entries()) {
    const isPossessive = /[’']s$/i.test(token);
    const withoutPossessive = token.replace(/[’']s$/i, "");
    const normalized = lexicalToken(withoutPossessive);
    if (!normalized) return null;
    const nextNormalized = lexicalToken(rawTokens[index + 1] ?? "");
    const isMiddleInitial = normalized.length === 1 && Boolean(nextNormalized) &&
      !GENERIC_QUESTION_WORDS.has(nextNormalized) && !PROFESSOR_PREDICATE_WORDS.has(nextNormalized);
    if (kept.length > 0 && PROFESSOR_PREDICATE_WORDS.has(normalized) && !isMiddleInitial) break;

    kept.push(withoutPossessive);
    if (isPossessive) break;
  }
  return kept.length ? kept.join(" ") : null;
}

export function isGenericProfessorInterrogative(message: string) {
  const words = message.match(/[\p{L}&]+\.?/gu)?.map((word) => word.toLowerCase().replace(/\.$/, "")) ?? [];
  const questionWords = new Set(["which", "what", "who"]);
  const professorRoles = new Set(["professor", "prof", "instructor", "teacher"]);
  const roleStartsNamedPhrase = (roleIndex: number) => {
    const first = words[roleIndex + 1] ?? "";
    if (!first) return false;
    if (GENERIC_POST_ROLE_MARKERS.has(first)) return false;
    const firstIsBoundary = GENERIC_QUESTION_WORDS.has(first) || PROFESSOR_PREDICATE_WORDS.has(first);
    if (!firstIsBoundary) return true;

    if (NAME_PREDICATE_COLLISIONS.has(first)) {
      const second = words[roleIndex + 2] ?? "";
      return !second || (!GENERIC_QUESTION_WORDS.has(second) && !PROFESSOR_PREDICATE_WORDS.has(second));
    }
    return false;
  };

  for (let index = 0; index < words.length; index += 1) {
    if (!questionWords.has(words[index])) continue;

    for (let offset = 1; offset <= 8 && index + offset < words.length; offset += 1) {
      const roleIndex = index + offset;
      if (professorRoles.has(words[roleIndex])) {
        if (!roleStartsNamedPhrase(roleIndex)) return true;
        break;
      }
    }
  }
  return false;
}

function hasSupportedPossessiveProfessorTarget(message: string) {
  return extractPossessiveProfessorNameHint(message) !== null;
}

function identityMessageTokens(message: string) {
  return message
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'".]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const PROFESSOR_ROLE_TOKENS = new Set([
  "professor", "professors", "prof", "profs",
  "instructor", "instructors", "teacher", "teachers", "dr",
]);

function professorHintPrecedesRole(message: string, professorNameHint?: string | null) {
  const hintTokens = normalizeProfessorIdentityName(professorNameHint ?? "").split(" ").filter(Boolean);
  if (!hintTokens.length) return false;

  const messageTokens = identityMessageTokens(message);

  for (let index = 0; index <= messageTokens.length - hintTokens.length; index += 1) {
    if (!hintTokens.every((token, offset) => messageTokens[index + offset] === token)) continue;
    if (messageTokens.slice(index + hintTokens.length).some((token) => PROFESSOR_ROLE_TOKENS.has(token))) return true;
  }
  return false;
}

function professorRolePrecedesExplicitHint(message: string, professorNameHint?: string | null) {
  const hintTokens = normalizeProfessorIdentityName(professorNameHint ?? "").split(" ").filter(Boolean);
  if (!hintTokens.length) return false;
  const messageTokens = identityMessageTokens(message);

  for (let hintIndex = 0; hintIndex <= messageTokens.length - hintTokens.length; hintIndex += 1) {
    if (!hintTokens.every((token, offset) => messageTokens[hintIndex + offset] === token)) continue;

    for (let roleIndex = hintIndex - 1; roleIndex >= 0; roleIndex -= 1) {
      if (!PROFESSOR_ROLE_TOKENS.has(messageTokens[roleIndex])) continue;
      const lead = messageTokens.slice(Math.max(0, roleIndex - 8), roleIndex);
      const endsWith = (...tokens: string[]) =>
        tokens.every((token, offset) => lead[lead.length - tokens.length + offset] === token);
      const explicitNamedLead =
        lead.at(-1) === "is" ||
        endsWith("tell", "me", "about") ||
        endsWith("tell", "us", "about") ||
        endsWith("what", "about") ||
        lead.at(-1) === "rank" ||
        lead.at(-1) === "compare" ||
        lead.at(-1) === "recommend";
      if (explicitNamedLead) return true;
      return false;
    }
  }
  return false;
}

export function shouldClarifyProfessorLookup(
  status: "match" | "ambiguous" | "none",
  wantsProfessorSelection: boolean,
  rawQuery: string,
  professorNameHint?: string | null,
) {
  if (status === "match") return false;
  if (status === "ambiguous") return true;
  if (!wantsProfessorSelection) return true;
  return hasSupportedPossessiveProfessorTarget(rawQuery) ||
    professorHintPrecedesRole(rawQuery, professorNameHint) ||
    professorRolePrecedesExplicitHint(rawQuery, professorNameHint);
}

export function extractProfessorNameHint(message: string) {
  if (isGenericProfessorInterrogative(message)) return null;
  const possessive = extractPossessiveProfessorNameHint(message);
  if (possessive) return possessive;
  const afterTitle = message.match(/\b(?:professor|prof\.?|dr\.?)\s+([\p{L}][\p{L}’'.-]*(?:\s+[\p{L}][\p{L}’'.-]*){0,5})/iu)?.[1];
  if (afterTitle) {
    const sanitized = sanitizeProfessorNameHint(afterTitle);
    if (sanitized) return sanitized;
  }
  return null;
}

function nameParts(raw: string) {
  const normalized = normalizeProfessorIdentityName(raw);
  const tokens = normalized.split(" ").filter(Boolean);
  return {
    normalized,
    tokens,
    first: tokens[0] ?? "",
    last: tokens[tokens.length - 1] ?? "",
  };
}

function firstNameMatches(left: string, right: string) {
  if (!left || !right) return false;
  return left === right || (NICKNAMES[left] ?? []).includes(right) || (NICKNAMES[right] ?? []).includes(left);
}

function uniqueByName<T extends ProfessorIdentityCandidate>(candidates: T[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${normalizeProfessorIdentityName(candidate.name)}|${candidate.department ?? ""}|${candidate.slug ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveProfessorIdentity<T extends ProfessorIdentityCandidate>(
  hint: string,
  candidates: T[],
): ProfessorIdentityResolution<T> {
  const query = nameParts(hint);
  if (!query.normalized) return { status: "none" };

  const available = uniqueByName(candidates);
  if (query.tokens.length === 1) {
    const surname = available.filter((candidate) => nameParts(candidate.name).last === query.normalized);
    if (surname.length === 1) return { status: "match", candidate: surname[0], matchKind: "surname" };
    if (surname.length > 1) return { status: "ambiguous", candidates: surname };

    // A first name is not a stable identity, even when today's bounded query
    // happens to return only one profile. Always ask the user to clarify it.
    const firstName = available.filter((candidate) => firstNameMatches(nameParts(candidate.name).first, query.normalized));
    return firstName.length ? { status: "ambiguous", candidates: firstName } : { status: "none" };
  }

  const exact = available.filter((candidate) => nameParts(candidate.name).normalized === query.normalized);
  if (exact.length === 1) return { status: "match", candidate: exact[0], matchKind: "exact" };
  if (exact.length > 1) return { status: "ambiguous", candidates: exact };

  const firstLast = available.filter((candidate) => {
    const parts = nameParts(candidate.name);
    return parts.last === query.last && firstNameMatches(parts.first, query.first);
  });
  if (firstLast.length === 1) return { status: "match", candidate: firstLast[0], matchKind: "alias" };
  if (firstLast.length > 1) return { status: "ambiguous", candidates: firstLast };

  return { status: "none" };
}

export type ProfessorIdentityLookup<T extends ProfessorIdentityCandidate> = {
  findExact: (prefixes: Array<{ raw: string; normalized: string }>) => Promise<T[]>;
  findCandidates: (lookupParts: string[]) => Promise<T[]>;
};

export async function resolveProfessorIdentityFromLookup<T extends ProfessorIdentityCandidate>(
  hint: string,
  lookup: ProfessorIdentityLookup<T>,
) {
  const prefixes = buildProfessorNamePrefixes(hint)
    .map((raw) => ({ raw, normalized: normalizeProfessorIdentityName(raw) }))
    .filter((prefix) => prefix.normalized.split(" ").length > 1);
  if (!prefixes.length && !trimProfessorNamePredicate(hint)) return { status: "none" as const };

  if (prefixes.length) {
    const exactCandidates = uniqueByName(await lookup.findExact(prefixes));
    const fullHint = prefixes[0].raw;
    let rejectedShorterExact = false;
    for (const prefix of prefixes) {
      const matches = exactCandidates.filter((candidate) =>
        normalizeProfessorIdentityName(candidate.name) === prefix.normalized
      );
      if (matches.length && !canDiscardProfessorHintSuffix(fullHint, prefix.raw)) {
        rejectedShorterExact = true;
        continue;
      }
      if (matches.length === 1) return { status: "match" as const, candidate: matches[0], matchKind: "exact" as const };
      if (matches.length > 1) return { status: "ambiguous" as const, candidates: matches };
    }
    if (rejectedShorterExact) return { status: "none" as const };
  }

  const fallbackHint = trimProfessorNamePredicate(hint);
  if (!fallbackHint) return { status: "none" as const };
  const normalizedFallback = normalizeProfessorIdentityName(fallbackHint);
  const tokens = normalizedFallback.split(" ").filter((part) => part.length >= 2);
  if (!tokens.length) return { status: "none" as const };
  const rawLastPart = fallbackHint.trim().split(/\s+/).at(-1)?.replace(/[’']s$/i, "") ?? "";
  const lookupParts = [...new Set([tokens.at(-1) ?? "", rawLastPart].filter((part) => part.length >= 2))];
  return resolveProfessorIdentity(fallbackHint, await lookup.findCandidates(lookupParts));
}

export function resolveProfessorCourseMapKey(professorName: string, mapKeys: string[]) {
  const professor = nameParts(professorName);
  const exact = mapKeys.filter((key) => nameParts(key).normalized === professor.normalized);
  if (exact.length === 1) return exact[0];

  const firstLast = mapKeys.filter((key) => {
    const parts = nameParts(key);
    return parts.last === professor.last && firstNameMatches(parts.first, professor.first);
  });
  return firstLast.length === 1 ? firstLast[0] : null;
}

export function chooseProfessorNameHint(aiHint: unknown, regexHint: unknown, rawQuery?: string) {
  if (rawQuery && isGenericProfessorInterrogative(rawQuery)) return null;
  const possessiveHint = rawQuery ? extractPossessiveProfessorNameHint(rawQuery) : null;
  if (possessiveHint) return possessiveHint;
  const values = [aiHint, regexHint]
    .filter((value): value is string => typeof value === "string")
    .map(sanitizeProfessorNameHint)
    .filter((value): value is string => value !== null && normalizeProfessorIdentityName(value).length > 0);
  if (!values.length) return null;
  return values.sort((left, right) => {
    const leftParts = normalizeProfessorIdentityName(left).split(" ").length;
    const rightParts = normalizeProfessorIdentityName(right).split(" ").length;
    return rightParts - leftParts || right.length - left.length;
  })[0];
}

export function formatProfessorClarification(
  hint: string,
  candidates: ProfessorIdentityCandidate[],
) {
  const labels = candidates.slice(0, 5).map((candidate) =>
    candidate.department ? `${candidate.name} (${candidate.department})` : candidate.name
  );
  if (!labels.length) {
    return `I couldn't find a professor who clearly matches “${hint}.” Could you provide their full name or department?`;
  }
  return `Which professor did you mean by “${hint}”? ${labels.join("; ")}.`;
}
