export type DataProvenanceKind =
  | "overview"
  | "historical_grades"
  | "catalog"
  | "stored_facts"
  | "live_schedule"
  | "account_access"
  | "browsing"
  | "professor_ranking"
  | "update_cadence"
  | "conflict"
  | "freshness"
  | "limits";

export type DataProvenanceRequest = {
  kind: DataProvenanceKind;
};

function normalizeProvenanceQuery(query: string) {
  return query
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\b(?:doesn't|doesnt)\b/g, "does not")
    .replace(/\b(?:didn't|didnt)\b/g, "did not")
    .replace(/\b(?:couldn't|couldnt)\b/g, "could not")
    .replace(/\b(?:wouldn't|wouldnt)\b/g, "would not")
    .replace(/\b(?:shouldn't|shouldnt)\b/g, "should not")
    .replace(/\bisn't\b/g, "is not")
    .replace(/\bdon't\b|\bdont\b/g, "do not")
    .replace(/\baren't\b/g, "are not")
    .replace(/\b(do not|do|can|cannot|are not|are|is not|is)\s+u\b/g, "$1 you")
    .replace(/\bui\s*chicago\b/g, "uichicago")
    .replace(/\bur\b/g, "your")
    .replace(/\bwher\b/g, "where")
    .replace(/\bfrm\b/g, "from")
    .replace(/\bvs\.\s*/g, "vs ")
    .replace(/\s+/g, " ")
    .trim();
}

const provenanceObjectPattern = /\b(?:answers?|data|information|records?|dataset|statistics|figures|facts?)\b/g;
const anyCategoryTermPattern = /\b(?:gpa|grades?|grade distribution|grade outcomes?|open[- ]?seats?|seats?|seat availability|waitlists?|instructors?|schedule of classes|course schedule|schedules?|course catalog|catalog|prerequisites?|corequisites?|tuition|fees?|housing|campus|services?)\b/;

function hasNearbyProvenanceObject(query: string, topicPattern: RegExp) {
  const topics = [...query.matchAll(new RegExp(topicPattern.source, "g"))];
  const objects = [...query.matchAll(provenanceObjectPattern)];
  return topics.some((topic) => objects.some((object) => {
    const topicStart = topic.index;
    const topicEnd = topicStart + topic[0].length;
    const objectStart = object.index;
    const objectEnd = objectStart + object[0].length;
    const between = objectStart >= topicEnd
      ? query.slice(topicEnd, objectStart)
      : query.slice(objectEnd, topicStart);
    return between.length <= 24 &&
      !/[.?!;]/.test(between) &&
      !/\b(?:and|or|but|versus|compared|while)\b/.test(between) &&
      !anyCategoryTermPattern.test(between);
  }));
}

const coordinatedCategoryAtom = "(?:gpa|grades?|grade distribution|grade outcomes?|open[- ]?seats?|seats?|seat availability|waitlists?|instructors?|schedule of classes|course schedule|schedules?|course catalog|catalog|prerequisites?|corequisites?|tuition|fees?|housing|campus|services?)";
const coordinatedCategoryTail = new RegExp(
  `(${coordinatedCategoryAtom}(?:\\s*(?:,\\s*(?:(?:and|or)\\s+)?|(?:and/or|and|or|vs\\.?|versus)\\s+|[&/]\\s*)${coordinatedCategoryAtom})+)\\s*$`,
);

function hasSharedTrailingProvenanceObject(query: string, topicPattern: RegExp) {
  return [...query.matchAll(provenanceObjectPattern)].some((object) => {
    const clause = query.slice(0, object.index).split(/[.?!;:]|\bbut\b/).at(-1)?.slice(-120) ?? "";
    const coordinated = coordinatedCategoryTail.exec(clause)?.[1];
    return coordinated ? topicPattern.test(coordinated) : false;
  });
}

const questionLead = "(?:what|which|where|when|how|who(?=\\s+teaches)|is|are|can|cannot|could|do|does|did|will|would|should)";
const questionLeadAtStart = new RegExp(`^${questionLead}\\b`);
const coordinatedQuestionLead = new RegExp(`\\b(?:and|but|while)\\s+(${questionLead})\\b`);
const prefixedQuestionLead = new RegExp(`[,:]\\s*(${questionLead})\\b`);
const usingQuestionLead = new RegExp(`^using\\b[^?;.!]{0,120}?\\b(${questionLead})\\b`);
const elidedProvenanceClause = new RegExp(
  `^\\s*${coordinatedCategoryAtom}(?:\\s*(?:,\\s*(?:(?:and|or)\\s+)?|(?:and/or|and|or|vs|versus)\\s+|[&/]\\s*)${coordinatedCategoryAtom})*\\s+(?:answers?|data|information|records?|dataset|statistics|figures|facts?)\\s+(?:live|historical|cached|stored|unavailable)\\s*$`,
);

function extractQuestionClause(clause: string) {
  const trimmed = clause.trim();
  if (questionLeadAtStart.test(trimmed)) return trimmed;
  for (const pattern of [usingQuestionLead, coordinatedQuestionLead, prefixedQuestionLead]) {
    const match = pattern.exec(trimmed);
    if (match?.index !== undefined && match[1]) {
      const leadOffset = match[0].lastIndexOf(match[1]);
      return trimmed.slice(match.index + leadOffset);
    }
  }
  return null;
}

function looksLikeExplicitProvenanceQuestion(clause: string) {
  return new RegExp(coordinatedCategoryAtom).test(clause) &&
    /\b(?:answers?|data|information|records?|dataset|statistics|figures|facts?)\b/.test(clause) &&
    /\b(?:live|historical|cached|stored|unavailable|sources?|sourced|based on|used for|powers?|freshness|verified|how fresh|how current)\b/.test(clause);
}

function categoryQuestionClauses(query: string) {
  const clauses: string[] = [];
  const segmentPattern = /([^?.!;]+)([?.!;]|$)/g;
  let priorDelimiter = "";
  let priorExplicitQuestion = false;
  for (const match of query.matchAll(segmentPattern)) {
    const raw = match[1].trim();
    if (!raw) {
      priorDelimiter = match[2];
      continue;
    }
    const explicit = extractQuestionClause(raw);
    if (explicit) {
      clauses.push(explicit);
      priorExplicitQuestion = looksLikeExplicitProvenanceQuestion(explicit);
    } else if (priorDelimiter === ";" && priorExplicitQuestion && elidedProvenanceClause.test(raw)) {
      clauses.push(raw);
    } else {
      priorExplicitQuestion = false;
    }
    priorDelimiter = match[2];
  }
  return clauses;
}

export function detectDataProvenanceRequest(query: string): DataProvenanceRequest | null {
  const lower = normalizeProvenanceQuery(query);
  const categoryClauses = categoryQuestionClauses(lower);
  const productAnchor = /\b(?:sparky|uichicago|your (?:answers?|data|dataset|sources?)|data behind (?:your|the) answers?)\b/.test(lower) ||
    /\byour\b[^?]{0,30}\banswers?\b/.test(lower) ||
    /\byou\b[^?]{0,30}\buic fact\b/.test(lower);
  const statusPrefix = /\b(?:before answering|before you answer|first|start by)\b[^?]{0,100}\b(?:live|historical|cached|stored|unavailable|data status|source)\b/.test(lower);
  const freshnessCue = /\b(?:freshness|freshness limits?|last verified|date was it verified|when .{0,30}verified|update cadence|update.{0,40}(?:on a )?schedule|how often.{0,60}updated|data period|newest semester|how current|how fresh|what date)\b/.test(lower);
  const limitsCue = /\b(?:data limits?|limits of the data|main limits?|limitations?)\b/.test(lower);
  const browsingCue = /\b(?:browse(?:d|ing)? the web|web live|live web|saved dataset)\b/.test(lower);
  const conflictCue = /\b(?:conflicts?|disagrees?|mismatch)\b/.test(lower) && /\b(?:official uic|uic (?:website|site|source))\b/.test(lower);
  const rankingCue = /\b(?:rank professors?|professor rankings?)\b/.test(lower) && /\b(?:data|used|assuming|assume|source)\b/.test(lower);
  const pluralSourceMap = /\b(?:data )?sources\b/.test(lower) && productAnchor &&
    /\b(?:power|each|categor(?:y|ies)|major categor(?:y|ies)|freshness|limits?|map)\b/.test(lower);
  const kindsMap = /\bwhich kinds? of answers?\b[^?]{0,80}\b(?:live|stored|historical)\b/.test(lower) ||
    /\blive data\b[^?]{0,80}\b(?:stored|historical)\b/.test(lower);
  const anchoredConflict = /\b(?:stored|sparky|uichicago)\b/.test(lower) ||
    /\byour\b[^?]{0,35}\b(?:answers?|data|information|records?|dataset|statistics|figures|facts?)\b/.test(lower) ||
    /\b(?:this|that|previous)\b[^?]{0,20}\b(?:answers?|information)\b/.test(lower) ||
    /\b(?:answers?|data|information|records?|dataset|statistics|figures|facts?)\b[^?]{0,25}\b(?:you|sparky|uichicago)\b[^?]{0,15}\b(?:gave|give|provided|showed|show)\b/.test(lower);
  if (conflictCue) return anchoredConflict ? { kind: "conflict" } : null;

  const personalRecord = /\b(?:degree audit|myuic|my uic|(?:uic\s+)?student account|registration record|my grades|personal uic records?)\b/.test(lower);
  const directAccountAccess = /\b(?:(?:can|cannot|could|could not|do|does|will|will not) (?:you|sparky|uichicago)|(?:you|sparky|uichicago) (?:can|cannot|could|could not|do|does|will|will not))\b[^?]{0,35}\b(?:get access to|have access to|access|read|view|check|see|look at)\s+(?:my\s+)?(?:grades|degree audit|registration record|(?:uic\s+)?student account|myuic|personal uic records?)\b/.test(lower);
  const negativeAccountAccess = /\b(?:you|sparky|uichicago)\b[^?]{0,30}\b(?:cannot|do not)\s+(?:get access to|have access to|access|read|view|check|see|look at)\s+(?:my\s+)?(?:grades|degree audit|registration record|(?:uic\s+)?student account|myuic|personal uic records?)\b/.test(lower);
  const ableAccountAccess = /\b(?:you|sparky|uichicago)\b[^?]{0,20}\bable to (?:access|view|see|read)\s+(?:my\s+)?(?:grades|degree audit|registration record|(?:uic\s+)?student account|myuic|personal uic records?)\b/.test(lower);
  const accountVisibility = /\b(?:you|sparky|uichicago)\b[^?]{0,25}\bvisibility into\s+(?:my\s+)?(?:grades|degree audit|registration record|(?:uic\s+)?student account|myuic|personal uic records?)\b/.test(lower);
  const forwardIntegration = /\b(?:you|sparky|uichicago)\b[^?]{0,35}\b(?:integrate(?:d)? with|connect(?:ed)? (?:to|with)|(?:have|has) (?:a )?connection to)\s+(?:my\s+)?(?:grades|degree audit|registration record|(?:uic\s+)?student account|myuic|personal uic records?)\b/.test(lower);
  const reversedIntegration = /\b(?:my\s+)?(?:grades|degree audit|registration record|(?:uic\s+)?student account|myuic|personal uic records?)\b[^?]{0,40}\b(?:integrated with|connect(?:s|ed)? (?:to|with)|(?:has|have) (?:a )?connection to|accessible to|available to|visible to|accessed by|read by|viewed by|seen by)\s+(?:you|sparky|uichicago)\b/.test(lower);
  const availableForAccess = /\b(?:my\s+)?(?:grades|degree audit|registration record|(?:uic\s+)?student account|myuic|personal uic records?)\b[^?]{0,25}\bavailable for (?:you|sparky|uichicago) to (?:access|read|view|check|see|look at)\b/.test(lower);
  if (personalRecord && (directAccountAccess || negativeAccountAccess || ableAccountAccess || accountVisibility || forwardIntegration || reversedIntegration || availableForAccess)) {
    return { kind: "account_access" };
  }

  if (pluralSourceMap || kindsMap) return { kind: "overview" };

  const gradePattern = /\b(?:gpa|grades?|grade distribution|grade outcomes?)\b/;
  const livePattern = /\b(?:open[- ]?seats?|seats?|seat availability|waitlists?|who teaches|instructors?|schedule of classes|course schedule|schedules?)\b/;
  const catalogPattern = /\b(?:course catalog|catalog|prerequisites?|corequisites?)\b/;
  const storedPattern = /\b(?:tuition|fees?|housing|campus|services?)\b/;
  const categoryKinds = new Set<DataProvenanceKind>();
  const prefixedStatusPair = /\b(?:historical|live|cached|stored|unavailable)\s+(?:or|vs\.?|versus)\s+(?:historical|live|cached|stored|unavailable)\b[^:]{0,30}:/.test(lower);

  for (const clause of categoryClauses) {
    const scopedStatusWord = /\b(?:live|historical|cached|stored|unavailable)\b/.test(clause);
    const scopedStatusPair = /\b(?:historical|live|cached|stored|unavailable)\s+(?:or|vs\.?|versus)\s+(?:historical|live|cached|stored|unavailable)\b/.test(clause) || prefixedStatusPair;
    const referenceRelation = /\b(?:sources?|references?|citations?|bibliograph(?:y|ies))\b/.test(clause) &&
      /\b(?:cit(?:e|ation)|supports?|uses?|powers?|sourced|comes?|based|used)\b/.test(clause);
    const scopedSourceCue = /\b(?:sources?|sourced from|comes? from|come from|based on|used for|powers?|powered by)\b/.test(clause) || referenceRelation;
    const scopedFreshnessCue = /\b(?:freshness|freshness limits?|last verified|date was it verified|when .{0,30}verified|update cadence|update.{0,40}(?:on a )?schedule|how often.{0,60}updated|data period|newest semester|how current|how fresh|what date)\b/.test(clause);
    const liveCapabilityCue = /\b(?:can|do) you\b[^?]{0,35}\b(?:see|access|check|read|view)\b[^?]{0,60}\b(?:live|current|schedule|instructor|seats?|waitlist)\b/.test(clause);
    const specificProductAnswer = /\b(?:sparky|uichicago)\b[^?]{0,45}\banswers?\b/.test(clause) ||
      /\banswers?\b[^?]{0,25}\b(?:you|sparky|uichicago)\b[^?]{0,15}\b(?:gave|give|provided|showed|show)\b/.test(clause) ||
      /\banswers?\b[^?]{0,20}\bfrom (?:sparky|uichicago)\b/.test(clause);
    const researchIntent = /\b(?:research|paper|essay|assignment|recommend(?:s|ed|ation)?)\b/.test(clause);
    if (researchIntent && !specificProductAnswer) continue;

    const gradeTopic = gradePattern.test(clause) && !/\bgpa formula\b/.test(clause);
    const liveTopic = livePattern.test(clause);
    const catalogTopic = catalogPattern.test(clause);
    const storedTopic = storedPattern.test(clause);
    const explicitCategoryAnchor = /\b(?:sparky|uichicago)\b/.test(clause) ||
      /\b(?:your|this|the)\b[^?]{0,30}\banswers?\b/.test(clause) ||
      /\byou\b[^?]{0,30}\b(?:show|showed|give|gave|use|provide|provided|calculate)\b/.test(clause);
    const sharedObjectFrame = statusPrefix || scopedStatusPair || scopedSourceCue || scopedFreshnessCue || scopedStatusWord;
    const liveObject = liveTopic && (hasNearbyProvenanceObject(clause, livePattern) || (sharedObjectFrame && hasSharedTrailingProvenanceObject(clause, livePattern)) || explicitCategoryAnchor || statusPrefix || liveCapabilityCue);
    const gradeObject = gradeTopic && (hasNearbyProvenanceObject(clause, gradePattern) || (sharedObjectFrame && hasSharedTrailingProvenanceObject(clause, gradePattern)) || explicitCategoryAnchor || statusPrefix);
    const catalogObject = catalogTopic && (hasNearbyProvenanceObject(clause, catalogPattern) || (sharedObjectFrame && hasSharedTrailingProvenanceObject(clause, catalogPattern)) || explicitCategoryAnchor || statusPrefix);
    const storedObject = storedTopic && (hasNearbyProvenanceObject(clause, storedPattern) || (sharedObjectFrame && hasSharedTrailingProvenanceObject(clause, storedPattern)) || explicitCategoryAnchor || statusPrefix);
    const answerObject = /\banswers?\b/.test(clause) && (gradeObject || liveObject || catalogObject || storedObject);
    const typedData = /\b(?:live|historical|cached|stored|unavailable)\s+(?:(?:gpa|grade|course|professor|catalog|housing|tuition|schedule)\s+)?(?:data|records?)\b/.test(clause);
    const copularStatus = (/^(?:is|are)(?: not)?\b/.test(clause) || elidedProvenanceClause.test(clause)) && scopedStatusWord;
    const confirmedStatus = answerObject && scopedStatusWord && /\b(?:right|correct)\b/.test(clause);
    const dataUseCue = /\bdo(?: not)? you use\b/.test(clause) && typedData;
    const relationCue = scopedSourceCue || /\b(?:sparky|you|uichicago)\b[^?]{0,50}\buses?\b/.test(clause) || dataUseCue;
    const categoryCue = statusPrefix || scopedStatusPair || copularStatus || confirmedStatus || relationCue || scopedFreshnessCue || liveCapabilityCue;
    if (!categoryCue) continue;
    if (liveObject) categoryKinds.add("live_schedule");
    if (gradeObject) categoryKinds.add("historical_grades");
    if (catalogObject) categoryKinds.add("catalog");
    if (storedObject) categoryKinds.add("stored_facts");
  }

  if (categoryKinds.size > 1) return { kind: "overview" };
  const [categoryKind] = categoryKinds;
  if (categoryKind) return { kind: categoryKind };

  if (browsingCue && /\b(?:you|sparky|answers?|dataset)\b/.test(lower)) return { kind: "browsing" };
  if (rankingCue) return { kind: "professor_ranking" };
  if (/\b(?:how often|update cadence|update schedule|update.{0,35}(?:on a schedule|frequency)|when (?:is|are).{0,35}updated|frequency)\b/.test(lower) && productAnchor) {
    return { kind: "update_cadence" };
  }
  if (freshnessCue && productAnchor) return { kind: "freshness" };
  if ((limitsCue || /\bwhat.{0,20}(?:cannot|does not).{0,20}(?:access|know|see)\b/.test(lower)) && productAnchor) {
    return { kind: "limits" };
  }
  if (productAnchor && /\b(?:data sources?|sources? power|live data|stored (?:or|and) historical|saved data(?:set)?|where does your data come from|is your data live)\b/.test(lower)) {
    return { kind: "overview" };
  }
  return null;
}

function formatTermCode(code: string) {
  const match = /^(\d{4})(SP|SU|FA)$/.exec(code);
  if (!match) return code;
  const season = match[2] === "SP" ? "Spring" : match[2] === "SU" ? "Summer" : "Fall";
  return `${season} ${match[1]}`;
}

function configuredInstructorWindow(termCodes: readonly string[]) {
  if (!termCodes.length) return "The configured instructor-comparison term window is unavailable.";
  const first = formatTermCode(termCodes[0]);
  const last = formatTermCode(termCodes[termCodes.length - 1]);
  return `The configured recent instructor-comparison window is **${first} through ${last}**. That window applies only to instructor comparisons; it is not a verified end date for all grade data.`;
}

const officialControl = "For time-sensitive decisions, use the current official UIC source. If it conflicts with stored UIChicago information, the official source controls and the mismatch should be reported as a UIChicago data issue.";

export function renderDataProvenanceResponse(
  request: DataProvenanceRequest,
  instructorTermCodes: readonly string[],
) {
  const instructorWindow = configuredInstructorWindow(instructorTermCodes);
  switch (request.kind) {
    case "live_schedule":
      return [
        "**Data status: Unavailable.** Sparky cannot see the live UIC Schedule of Classes, current instructor assignments, open seats, or waitlists.",
        "Check the [UIC Schedule of Classes](https://schedule.uic.edu/) for the current section, instructor, and seat status. I will not substitute a historical instructor or enrollment count for a live answer.",
      ].join("\n\n");
    case "account_access":
      return [
        "**Data status: Unavailable.** Sparky has no direct access to your UIC account, grades, registration record, myUIC, or degree audit.",
        "Facts you type in chat or save in your UIChicago profile are student-supplied context. They do not give Sparky a connection to UIC systems. Use [myUIC](https://my.uic.edu/) for official personal records.",
      ].join("\n\n");
    case "historical_grades":
      return [
        "**Data status: Historical.** Course GPA and grade outcomes come from stored past grade-distribution records, not a live feed. Professor reviews are also stored snapshots and remain subjective feedback.",
        instructorWindow,
        "The full grade dataset does not expose one verified global start or end date here. Use the normal course or professor lookup for the available historical figures, and do not treat them as a prediction of a future section.",
      ].join("\n\n");
    case "catalog":
      return [
        "**Data status: Stored catalog snapshot.** Course titles, descriptions, hours, prerequisites, corequisites, and catalog restrictions come from UIChicago's bundled catalog data.",
        "That snapshot does not provide a verified scrape date, catalog effective year, or update cadence in this answer. Check the [current UIC catalog](https://catalog.uic.edu/ucat/course-descriptions/) before registration.",
        officialControl,
      ].join("\n\n");
    case "stored_facts":
      return [
        "**Data status: Stored.** Tuition, fees, housing, campus, and service answers use bundled UIChicago datasets based on published UIC information; they are not live official-system lookups.",
        "A single verified source date, academic year, or update cadence is not available for every stored category. Check the current official office page, especially for prices, deadlines, availability, and policies.",
        officialControl,
      ].join("\n\n");
    case "browsing":
      return [
        "Sparky's ordinary answers use stored or bundled UIChicago data and the context you provide. This answer did not browse UIC websites live.",
        "Treat a claim as live only when the response explicitly says it checked a current source. For schedules, seats, deadlines, prices, and policies, open the current official UIC page.",
      ].join("\n\n");
    case "professor_ranking":
      return [
        "Professor comparisons use historical grade outcomes and stored student-review snapshots. Grade patterns describe past sections; reviews are subjective; neither proves teaching quality, learning, workload, or who will teach next term.",
        instructorWindow,
        "Use the normal course lookup for the available comparison, and check the live UIC schedule for current instructors.",
      ].join("\n\n");
    case "update_cadence":
      return [
        "UIChicago does not expose one verified update schedule for its course, professor, catalog, and campus datasets in this answer, so the update cadence is **unknown**.",
        instructorWindow,
        officialControl,
      ].join("\n\n");
    case "conflict":
      return `The current official UIC source controls. Treat the conflicting stored UIChicago fact as a product-data issue and report it so the stored data can be reviewed. UIChicago should not override a newer official schedule, catalog, price, deadline, or policy.`;
    case "freshness":
      return [
        "There is no single verified date that makes every UIChicago fact current. A global last-verified date and update cadence are **unknown** because those metadata are not represented consistently across the stored datasets.",
        instructorWindow,
        officialControl,
      ].join("\n\n");
    case "limits":
      return [
        "Sparky can use historical grade outcomes and professor-review snapshots, a bundled course-catalog snapshot, stored campus/tuition/housing/service facts, and context you provide or save.",
        "It cannot see live schedules, current instructors, seats, waitlists, or your UIC account, grades, registration, or degree audit. Stored-data freshness and update cadence are not globally verified.",
        officialControl,
      ].join("\n\n");
    case "overview":
      return [
        "## Sparky data status",
        "- **Historical:** grade outcomes and professor-review snapshots. They describe past records and feedback, not live teaching or future results.",
        `- **Configured instructor comparisons:** ${instructorWindow}`,
        "- **Stored catalog snapshot:** course titles, descriptions, hours, prerequisites, corequisites, and restrictions.",
        "- **Stored campus facts:** tuition, fees, housing, and campus/service information. Freshness varies and a global last-verified date or update cadence is unknown.",
        "- **Unavailable live data:** current schedules, instructors, seats, and waitlists.",
        "- **No UIC-system access:** Sparky cannot read your account, grades, registration, or degree audit. Saved profile facts and chat details are context you supplied, not data pulled from UIC.",
        officialControl,
      ].join("\n");
  }
}
