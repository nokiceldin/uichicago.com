export type CatalogCourseRecord = {
  subject?: unknown;
  number?: unknown;
  title?: unknown;
  hours?: unknown;
  description?: unknown;
};

export type CatalogCourseFacts = {
  code: string;
  subject: string;
  number: string;
  title: string;
  hours: string;
  description: string;
  prerequisites: string | null;
  corequisites: string | null;
  recommendedBackground: string | null;
  creditRestrictions: string[];
  registrationRestrictions: string[];
  otherRestrictionNotes: string[];
  otherCatalogNotes: string[];
};

export type CatalogCourseFactRequest = {
  code: string;
  wantsOverview: boolean;
  wantsHours: boolean;
  wantsPrerequisites: boolean;
  wantsCorequisites: boolean;
  wantsRecommendedBackground: boolean;
  wantsRestrictions: boolean;
};

export type CatalogCourseFactResult = {
  kind: "answer" | "redirect";
  code: string;
  response: string;
};

const COURSE_CODE = /\b([A-Z&]{2,5})\s*[- ]?\s*(\d{3}[A-Z]?)\b/gi;
const PREREQUISITE_LABEL_SOURCE = String.raw`Prerequisite(?:\s*\(s\))?`;
const COREQUISITE_LABEL_SOURCE = String.raw`Co-?requisite(?:s|\s*\(s\))?`;
const SCHEDULE_LABEL_SOURCE = String.raw`(?:Class Schedule(?: Information)?|Course Schedule Information|Schedule Information)`;
const SECTION_LABEL_SOURCE = `(?:Course Information|${PREREQUISITE_LABEL_SOURCE}|${COREQUISITE_LABEL_SOURCE}|Recommended background|${SCHEDULE_LABEL_SOURCE})`;
const SECTION_LABEL = new RegExp(String.raw`(?:\s+|(?<=[.;]))(?=${SECTION_LABEL_SOURCE}:)`, "i");
const NEGATIVE_CREDIT_PATTERN = /\b(?:credit\s+(?:for\s+[^.]{1,80}\s+)?is\s+not\s+given|no\s+(?:graduation\s+)?credit(?:\s+(?:is\s+)?given)?|no\s+credit\s+(?:is\s+)?given|no\s+credit\s+toward(?:s)?\b|may\s+not\s+be\s+used\s+for\s+credit|cannot\s+be\s+used\s+for\s+credit|does\s+not\s+carry\s+(?:degree\s+)?credit|no\s+transfer(?:red)?\s+credits?\s+(?:is|are)\s+(?:accepted|allowed)|transfer(?:red)?\s+credits?[^.]{0,80}(?:may|can|will|is|are)\s+not\s+(?:be\s+)?(?:accepted|allowed))\b/i;
const ENROLLMENT_RESTRICTION_PATTERN = /\b(?:restricted\s+to|open\s+only\s+to|consent\s+of|approval\s+of|approval\s+(?:is\s+)?required|permission\s+of|admission\s+to|must\s+(?:enroll|be\s+enrolled|register|be\s+registered)|requires?\s+concurrent\s+(?:registration|enrollment)|limited\s+to)\b/i;
const ACCESS_RESTRICTION_PATTERN = /\b(?:not\s+open\s+to|open\s+to\s+all\s+students\s+(?:who|in|within|from)\b|open\s+to\s+(?!all\s+students\b)|(?:priority|preference)(?:\s+(?:registration|enrollment))?\s+(?:(?:will\s+)?(?:be\s+)?given\s+to|is\s+given\s+to|for|to)\b|(?:accepted|admitted)\s+by\s+audition)\b/i;
const POSITIVE_TRANSFER_CREDIT_POLICY_PATTERN = /\btransfer(?:red)?\s+credits?\b[^.]{0,120}\b(?:(?:may|can|will)\s+be|(?:is|are))\s+(?:accepted|allowed|evaluated|considered)\b/i;
const LIMITING_TRANSFER_CREDIT_PATTERN = /\b(?:no\s+transfer(?:red)?\s+credits?|transfer(?:red)?\s+credits?[^.]{0,100}(?:may|can|will|is|are)\s+not\b|cannot\s+accept\b[^.]{0,60}\btransfer(?:red)?\s+credits?|(?:maximum|max(?:imum)?|up\s+to|no\s+more\s+than|at\s+most|only)\b[^.]{0,100}\btransfer(?:red)?\s+credits?|transfer(?:red)?\s+credits?\b[^.]{0,100}\b(?:maximum|max(?:imum)?|up\s+to|no\s+more\s+than|at\s+most|only|limited\s+to|restricted\s+to|excluded|prohibited))\b/i;
const RESTRICTION_LIKE_PATTERN = /\b(?:credits?|graduation|degree|major|restricted|open\s+only|consent|approval|permission|admission|must|required|only|eligible|intended\s+for|should\s+not\s+be\s+taken|may\s+not|cannot|may\s+be\s+repeated|maximum)\b/i;

function normalizeCode(subject: string, number: string) {
  return `${subject.toUpperCase()} ${number.toUpperCase()}`;
}

function cleanCatalogText(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+([.;,:])/g, "$1").trim();
}

function extractSection(description: string, label: RegExp) {
  const match = label.exec(description);
  if (!match) return null;
  const tail = description.slice(match.index + match[0].length);
  const end = SECTION_LABEL.exec(tail);
  const text = cleanCatalogText(end ? tail.slice(0, end.index) : tail);
  return text || null;
}

export function extractCatalogCourseInformation(description: string) {
  const labels = [...description.matchAll(new RegExp(`${SECTION_LABEL_SOURCE}:\\s*`, "gi"))];
  const sections: string[] = [];
  labels.forEach((label, index) => {
    if (!/^Course Information:/i.test(label[0])) return;
    const start = (label.index ?? 0) + label[0].length;
    const end = labels[index + 1]?.index ?? description.length;
    const section = cleanCatalogText(description.slice(start, end));
    if (section) sections.push(section);
  });
  return sections.length ? sections.join(" ") : null;
}

export function isNegativeCreditLikeSentence(sentence: string) {
  return NEGATIVE_CREDIT_PATTERN.test(cleanCatalogText(sentence));
}

export function isAccessRestrictionLikeSentence(sentence: string) {
  return ACCESS_RESTRICTION_PATTERN.test(cleanCatalogText(sentence));
}

export function isPositiveTransferCreditPolicySentence(sentence: string) {
  const cleaned = cleanCatalogText(sentence);
  return POSITIVE_TRANSFER_CREDIT_POLICY_PATTERN.test(cleaned) &&
    !LIMITING_TRANSFER_CREDIT_PATTERN.test(cleaned);
}

function classifyCourseInformation(text: string | null) {
  const sentences = text
    ? text.split(/(?<=\.)\s+/).map(cleanCatalogText).filter(Boolean)
    : [];
  const creditRestrictions: string[] = [];
  const registrationRestrictions: string[] = [];
  const otherRestrictionNotes: string[] = [];
  for (const sentence of sentences) {
    if (NEGATIVE_CREDIT_PATTERN.test(sentence)) creditRestrictions.push(sentence);
    else if (ENROLLMENT_RESTRICTION_PATTERN.test(sentence) || ACCESS_RESTRICTION_PATTERN.test(sentence)) registrationRestrictions.push(sentence);
    else if (isPositiveTransferCreditPolicySentence(sentence)) continue;
    else if (RESTRICTION_LIKE_PATTERN.test(sentence)) otherRestrictionNotes.push(sentence);
  }
  return { creditRestrictions, registrationRestrictions, otherRestrictionNotes };
}

function splitUnheadedPrerequisiteNotes(text: string | null) {
  if (!text) return { clause: null, notes: [] as string[], registrationRestrictions: [] as string[] };
  const noteBoundary = /\.(?=\s+(?:Meets?\b|On-campus\b|Online\b|Taught\b|Offered\b|Class format\b|Check the class schedule\b|There (?:will|may) be\b|UIC GE\b|IAI\b|Priority will be\b))/i.exec(text);
  const boundary = noteBoundary ? noteBoundary.index + 1 : text.length;
  let clause = cleanCatalogText(text.slice(0, boundary));
  const note = noteBoundary ? cleanCatalogText(text.slice(boundary)) : "";

  const starts = [...clause.matchAll(/(?:^|\.\s+)(?=(?:Open only to|Restricted to|For\b))/gi)];
  const lastStart = starts.at(-1);
  const candidateStart = lastStart ? (lastStart.index ?? 0) + lastStart[0].length : -1;
  const candidate = candidateStart >= 0 ? clause.slice(candidateStart) : "";
  const isExplicitAccessClause =
    /^(?:Open only to|Restricted to)[\s\S]+\.$/i.test(candidate) ||
    /^For\b[\s\S]{0,300}\b(?:majors?|students?)\b[\s\S]{0,120}\bonly\.$/i.test(candidate);
  const containsAnotherSentence = /\.\s+[A-Z]/.test(candidate.slice(0, -1));
  const hasConsentOrApprovalAlternative = /\bor\s+(?:(?:the|instructor['’]s|department(?:al)?)\s+)?(?:consent|approval)\b/i.test(candidate);
  const registrationRestrictions = isExplicitAccessClause && !containsAnotherSentence && !hasConsentOrApprovalAlternative
    ? [candidate]
    : [];
  if (registrationRestrictions.length) {
    clause = cleanCatalogText(clause.slice(0, candidateStart));
  }

  return {
    clause: clause || null,
    notes: note ? [note] : [],
    registrationRestrictions,
  };
}

function officialCatalogUrl(subject: string) {
  return `https://catalog.uic.edu/ucat/course-descriptions/${subject.toLowerCase()}/`;
}

function redirectResponse(code: string, subject: string) {
  return [
    `I couldn't verify a complete catalog record for **${code}** in Sparky's local catalog snapshot.`,
    `Check the [official UIC ${subject} course catalog](${officialCatalogUrl(subject)}) for the current title, hours, prerequisites, and restrictions.`,
  ].join("\n\n");
}

export function detectCatalogCourseFactRequest(query: string): CatalogCourseFactRequest | null {
  const matches = [...query.matchAll(COURSE_CODE)];
  const uniqueCodes = [...new Set(matches.map((match) => normalizeCode(match[1], match[2])))];
  if (uniqueCodes.length !== 1 || matches.length !== 1) return null;

  const codeMatch = matches[0];
  const codeStart = codeMatch.index ?? 0;
  const before = query.slice(0, codeStart).trim().toLowerCase();
  const after = query.slice(codeStart + codeMatch[0].length).trim().toLowerCase();
  const afterSyntax = after.replace(/^[\s,:;?!().\-–—]+/, "").replace(/[?!()\s]+$/, "");
  const lower = query.toLowerCase();

  const explicitSpecializedRequest =
    /\b(?:any\s+)?open seats?\b|\bseats? open\b|\bseat availability\b|\bwaitlist\b|\bcurrent schedule\b/.test(lower) ||
    /\baverage gpa\b|\b(?:its|this course['’]s|the course['’]s)\s+gpa\b|\bgpa\s*[?!.,;:]?(?:\s|$)|\bgrade distribution\b/.test(lower) ||
    /\bprofessor ratings?\b|\bwho teaches\b|\b(?:which|what|who is the)\s+instructor\b|\binstructor\s+(?:for|ratings?)\b/.test(lower) ||
    /\b(?:can|could|should) i take\b|\bam i eligible\b|\beligible (?:for|to)\b/.test(lower) ||
    /\b(?:compare|rank)\b/.test(lower) ||
    /\b(?:take|schedule|fit|available|offered)\b[^.!?]{0,30}\bnext (?:term|semester)\b/.test(lower) ||
    /[;,]\s*(?:(?:also|plus)\s*[,;]?\s*)?next (?:term|semester)\b/.test(after);
  if (explicitSpecializedRequest) return null;

  const compoundProfessorRequest =
    /\bwho teaches\s+(?:it|this|the course)\b/.test(after) ||
    /\bwho is\s+(?:the\s+)?(?:professor|instructor|teacher)\s+(?:for\s+)?(?:it|this|the course)\b/.test(after) ||
    /\b(?:give|show) me\s+(?:(?:its|the course['’]s)\s+)?(?:the\s+)?(?:professor|instructor) ratings?\b/.test(after) ||
    /\bwhich\s+(?:professor|instructor|teacher)\s+(?:teaches|should i take|is best)\b/.test(after);
  const compoundLiveRequest =
    /\bdoes\s+(?:it|this|the course)\s+have\s+(?:any\s+)?open seats?\b/.test(after) ||
    /\bare\s+(?:(?:there|any)\s+)*(?:seats? open|open seats?)\b/.test(after) ||
    /\b(?:is there|does (?:it|this|the course) have)\s+(?:a\s+)?waitlist\b/.test(after) ||
    /\bwhat(?:'s| is)\s+(?:its|the course['’]s)\s+(?:current|live) schedule\b/.test(after) ||
    /\bwhat is\s+(?:the\s+)?(?:current|live) schedule\b/.test(after);
  const compoundPlanningRequest =
    /\b(?:can|could|should) i take\s+(?:it|this|the course)\b/.test(after) ||
    /\bam i eligible\s+(?:for|to take)\s+(?:it|this|the course)\b/.test(after) ||
    /\b(?:take|schedule|fit)\s+(?:it|this|the course)\b[^.!?]{0,25}\bnext (?:term|semester)\b/.test(after);
  const compoundOutcomeRequest =
    /\bwhat(?:'s| is)\s+(?:its|the course['’]s)\s+(?:average\s+)?gpa\b/.test(after) ||
    /\b(?:give|show) me\s+(?:(?:its|the course['’]s)\s+)?(?:the\s+)?(?:average gpa|gpa|grade distribution)\b/.test(after);
  const compoundComparisonRequest =
    /\bcompare\s+(?:it|this|the course)\b/.test(after) ||
    /\brank\s+(?:(?:its|the course['’]s)\s+)?(?:professors?|instructors?|sections?)\b/.test(after) ||
    /(?:^|\band\s+)(?:compare|rank)\b/.test(afterSyntax);

  const professorFlow =
    /\b(?:who|which|what)\b[^.!?]{0,35}\b(?:professor|instructor|teacher)\b[^.!?]{0,25}(?:\bfor\b|\bteaches?\b)?\s*$/.test(before) ||
    /\b(?:professor|instructor|teacher|who teaches)\b[^.!?]{0,20}(?:\bfor\b|\bteaches?\b)?\s*$/.test(before) ||
    (before.length === 0 && /^(?:professor|instructor|rating|rate my professor|rmp|gpa|grade distribution)\b/.test(afterSyntax)) ||
    /^(?:and\s+)?(?:who|which|what)\b[^.!?]{0,25}\b(?:professor|instructor|teacher)\b/.test(afterSyntax) ||
    compoundProfessorRequest;
  const rankingFlow =
    /\b(?:gpa|grade distribution|easiest|hardest|best|worst)\b[^.!?]{0,30}(?:\bfor\b|\bin\b)?\s*$/.test(before) ||
    (before.length === 0 && /^(?:gpa|grade distribution|easiest|hardest|best|worst)\b/.test(afterSyntax)) ||
    compoundOutcomeRequest;
  const liveOfferingFlow =
    /\b(?:open seats?|seat availability|available seats?|waitlist|sections?|live schedule|current schedule|when is|what time|days? of the week)\b[^.!?]{0,35}(?:\bfor\b|\bin\b|\bof\b)?\s*$/.test(before) ||
    (before.length === 0 && /^(?:open seats?|seat availability|available seats?|waitlist|sections?|live schedule|current schedule|when is|what time|days? of the week)\b/.test(afterSyntax)) ||
    compoundLiveRequest;
  const planningFlow =
    /\b(?:can i take|am i eligible for|should i take|schedule for me|plan for)\s*$/.test(before) ||
    (before.length === 0 && /^(?:next (?:term|semester)|eligibility|degree plan|four[- ]year plan|4[- ]year plan)\b/.test(afterSyntax)) ||
    compoundPlanningRequest;
  const comparisonFlow =
    /\b(?:compare|versus|vs\.?|difference between)\s*$/.test(before) ||
    /^(?:versus|vs\.?|compared (?:with|to))\b/.test(afterSyntax) ||
    compoundComparisonRequest;
  if (professorFlow || rankingFlow || liveOfferingFlow || planningFlow || comparisonFlow) return null;

  const wantsHours = /\b(credit|credits|credit hours?|hours?)\b/.test(lower);
  const wantsPrerequisites = /\b(prereq(?:uisite)?s?|required before|requirements? to take)\b/.test(lower);
  const wantsCorequisites = /\b(co[- ]?req(?:uisite)?s?|corequisites?|concurrent requirements?)\b/.test(lower);
  const wantsRecommendedBackground = /\b(recommended background|background (?:is )?recommended|what background|recommend(?:ed)? preparation)\b/.test(lower);
  const wantsRestrictions = /\b(restrictions?|credit exclusion|credit (?:is )?not given|registration requirements?|enrollment requirements?)\b/.test(lower);
  const wantsOverview = /\b(what is|what's|what does|what is covered|what do you learn|tell me about|describe|explain|covers?|learn|description(?: of)?|course title|title of|details?|overview(?: of)?|information(?: about| on)?)\b/.test(lower);

  if (!wantsOverview && !wantsHours && !wantsPrerequisites && !wantsCorequisites && !wantsRecommendedBackground && !wantsRestrictions) {
    return null;
  }

  const serviceHoursContext =
    /\b(?:office|tutoring|library|service|volunteer(?:ing)?|lab|contact)\s+hours?\b/.test(lower) ||
    /\bhours?\s+(?:for|of|from|at|in)\s+(?:the\s+)?(?:office|tutoring|library|service|volunteer(?:ing)?|lab|contact)\b/.test(lower) ||
    /\b(?:office|tutoring|library|service|volunteer(?:ing)?|lab)\b[^.!?]{0,30}\b(?:opening|open|run|meet)\b/.test(lower);
  if (wantsHours && serviceHoursContext) return null;

  const beforeIntroducesCourse = /\b(?:what is|what's|tell me about|describe|explain)(?:\s+the\s+course)?\s*$/.test(before);
  const beforeAsksContent = /\b(?:what does|what is covered in|what do you learn in)\s*$/.test(before) &&
    /^(?:cover|teach|include|focus on|involve|$)/.test(afterSyntax);
  const beforeAsksHours = /\bhow many\s+(?:(?:credit|semester)\s+)?(?:hours?|credits?)\s+(?:is|does)\s*$/.test(before) ||
    /\bhow many\s+(?:(?:credit|semester)\s+)?(?:hours?|credits?)\s+(?:do you|does (?:a student|one))\s+get\s+from\s*$/.test(before) ||
    /\bhow many\s+(?:(?:credit|semester)\s+)?(?:hours?|credits?)\s+(?:for|from)\s*$/.test(before) ||
    /\b(?:credits?|credit hours?|hours?)\s+(?:for|of|from)\s*$/.test(before) ||
    (/\bwhat are\s*$/.test(before) && /^hours?\b/.test(afterSyntax));
  const beforeAsksLabeledFact = /\b(?:prereq(?:uisite)?s?|requirements? to take|co[- ]?req(?:uisite)?s?|corequisites?|recommended background|background(?: is)? recommended|restrictions?|course title|course description|description)\s+(?:are\s+)?(?:for|of)?\s*$/.test(before) ||
    /\b(?:what|which)\s+(?:prereq(?:uisite)?s?|co[- ]?req(?:uisite)?s?|corequisites?|restrictions?)\s+(?:does|do)\s*$/.test(before);
  const codeStartsQuery = before.length === 0;
  const afterHasCourseFact = /^(?:(?:has|carries|is worth)\s+how many\s+(?:(?:credit|semester)\s+)?(?:hours?|credits?)|is\s+how many\s+(?:(?:credit|semester)\s+)?(?:hours?|credits?)|how many\s+(?:(?:credit|semester)\s+)?(?:hours?|credits?)|details?|information|overview|prereq(?:uisite)?s?|co[- ]?req(?:uisite)?s?|corequisites?|credits?|credit hours?|hours?|restrictions?|recommended background)\b/.test(afterSyntax) ||
    /^(?:and\s+)?(?:what|does|how)\b[^.!?]{0,35}\b(?:prereq(?:uisite)?s?|co[- ]?req(?:uisite)?s?|credits?|hours?|restrictions?|cover|teach|include)\b/.test(afterSyntax);
  const courseIsObject = beforeIntroducesCourse || beforeAsksContent || beforeAsksHours || beforeAsksLabeledFact ||
    (codeStartsQuery && afterHasCourseFact) ||
    (/\bdoes\s*$/.test(before) && /^(?:have|require)\b/.test(afterSyntax));
  if (!courseIsObject) return null;

  return {
    code: uniqueCodes[0],
    wantsOverview,
    wantsHours,
    wantsPrerequisites,
    wantsCorequisites,
    wantsRecommendedBackground,
    wantsRestrictions,
  };
}

export function parseCatalogCourseFacts(record: CatalogCourseRecord): CatalogCourseFacts | null {
  if (
    typeof record.subject !== "string" || !/^[A-Z&]{2,5}$/i.test(record.subject.trim()) ||
    typeof record.number !== "string" || !/^\d{3}[A-Z]?$/i.test(record.number.trim()) ||
    typeof record.title !== "string" || !record.title.trim() ||
    (typeof record.hours !== "string" && typeof record.hours !== "number") || !/^\d+$/.test(String(record.hours).trim()) ||
    typeof record.description !== "string" || !record.description.trim()
  ) {
    return null;
  }

  const description = cleanCatalogText(record.description);
  const firstSection = SECTION_LABEL.exec(description);
  const overview = cleanCatalogText(firstSection ? description.slice(0, firstSection.index) : description);
  if (!overview) return null;

  const courseInformation = extractCatalogCourseInformation(description);
  const prerequisiteSection = splitUnheadedPrerequisiteNotes(
    extractSection(description, new RegExp(`${PREREQUISITE_LABEL_SOURCE}:\\s*`, "i")),
  );
  const corequisites = extractSection(description, new RegExp(`${COREQUISITE_LABEL_SOURCE}:\\s*`, "i"));
  const recommendedBackground = extractSection(description, /Recommended background:\s*/i);
  const registrationInformation = extractSection(
    description,
    new RegExp(`${SCHEDULE_LABEL_SOURCE}:\\s*`, "i"),
  );
  const courseInformationRestrictions = classifyCourseInformation(courseInformation);

  return {
    code: normalizeCode(record.subject.trim(), record.number.trim()),
    subject: record.subject.trim().toUpperCase(),
    number: record.number.trim().toUpperCase(),
    title: cleanCatalogText(record.title),
    hours: String(record.hours).trim(),
    description: overview,
    prerequisites: prerequisiteSection.clause,
    corequisites,
    recommendedBackground,
    creditRestrictions: courseInformationRestrictions.creditRestrictions,
    registrationRestrictions: [
      ...courseInformationRestrictions.registrationRestrictions,
      ...prerequisiteSection.registrationRestrictions,
      ...(registrationInformation ? [registrationInformation] : []),
    ],
    otherRestrictionNotes: courseInformationRestrictions.otherRestrictionNotes,
    otherCatalogNotes: prerequisiteSection.notes,
  };
}

export function answerCatalogCourseFactRequest(
  request: CatalogCourseFactRequest,
  records: readonly CatalogCourseRecord[],
): CatalogCourseFactResult {
  const [subject] = request.code.split(" ");
  const matchingRecords = records.filter((record) =>
    typeof record.subject === "string" && typeof record.number === "string" &&
    normalizeCode(record.subject.trim(), record.number.trim()) === request.code,
  );
  const facts = matchingRecords.length === 1 ? parseCatalogCourseFacts(matchingRecords[0]) : null;
  if (!facts) {
    return { kind: "redirect", code: request.code, response: redirectResponse(request.code, subject) };
  }

  const lines = [`## ${facts.code}: ${facts.title}`];
  if (request.wantsOverview) lines.push(facts.description);
  if (request.wantsHours || request.wantsOverview) {
    lines.push(`**Credit hours:** ${facts.hours} (from the record's catalog-hours field)`);
  }
  if (request.wantsPrerequisites || request.wantsOverview) {
    lines.push(facts.prerequisites
      ? `**Prerequisites:** ${facts.prerequisites}`
      : "**Prerequisites:** No prerequisite clause is listed in this catalog snapshot. Other registration restrictions may still apply.");
  }
  if (request.wantsCorequisites || request.wantsPrerequisites || request.wantsRestrictions || request.wantsOverview) {
    lines.push(facts.corequisites
      ? `**Corequisites (concurrent enrollment):** ${facts.corequisites}`
      : "**Corequisites:** No corequisite clause is listed in this catalog snapshot.");
  }
  if (request.wantsRecommendedBackground || (request.wantsOverview && facts.recommendedBackground)) {
    lines.push(facts.recommendedBackground
      ? `**Recommended background (not a prerequisite):** ${facts.recommendedBackground}`
      : "**Recommended background:** None is listed in this catalog snapshot.");
  }
  const shouldRenderRestrictionDetails = request.wantsRestrictions ||
    (request.wantsOverview && (facts.creditRestrictions.length || facts.registrationRestrictions.length || facts.otherRestrictionNotes.length)) ||
    (request.wantsPrerequisites && facts.registrationRestrictions.length > 0);
  if (shouldRenderRestrictionDetails) {
    if (request.wantsRestrictions || request.wantsOverview) {
      lines.push(facts.creditRestrictions.length
        ? `**Credit/exclusion restrictions:** ${facts.creditRestrictions.join(" ")}`
        : facts.otherRestrictionNotes.length
          ? "**Credit/exclusion restrictions:** No negative-credit clause was classified; verify the other catalog restriction notes below."
          : "**Credit/exclusion restrictions:** None are listed in this catalog snapshot.");
    }
    lines.push(facts.registrationRestrictions.length
      ? `**Registration note:** ${facts.registrationRestrictions.join(" ")}`
      : facts.corequisites
        ? "**Registration note:** The corequisite above is a concurrent registration requirement. No separate class-schedule registration note is listed."
        : facts.otherRestrictionNotes.length
          ? "**Registration note:** No reliable enrollment clause was classified; verify the other catalog restriction notes below."
          : "**Registration note:** No separate registration note is listed in this catalog snapshot.");
    if (facts.otherRestrictionNotes.length) {
      lines.push(`**Other catalog restriction notes (verify):** ${facts.otherRestrictionNotes.join(" ")}`);
    }
  }
  if (facts.otherCatalogNotes.length && (request.wantsPrerequisites || request.wantsOverview)) {
    lines.push(`**Other catalog note (separate from prerequisites):** ${facts.otherCatalogNotes.join(" ")}`);
  }
  lines.push(
    `This answer uses Sparky's local catalog snapshot. Verify current details in the [official UIC ${facts.subject} course catalog](${officialCatalogUrl(facts.subject)}). It does not include live sections, seats, instructors, or registration status.`,
  );

  return { kind: "answer", code: facts.code, response: lines.join("\n\n") };
}
