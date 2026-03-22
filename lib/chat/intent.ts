import { majorRequirements } from "@/lib/majorRequirements";

export function detectIntent(msg: string) {
  const m = msg.toLowerCase();
  const courseCodeMatch = msg.match(/\b([A-Za-z]{2,6})\s*(\d{3}[A-Za-z]?)\b/);
  const courseCode = courseCodeMatch
    ? { subject: courseCodeMatch[1].toUpperCase(), number: courseCodeMatch[2].toUpperCase() }
    : null;
  const subjectMatch = msg.match(
    /\b(MATH|CS|NURS|CHEM|PHYS|BIOS|ENGL|PSCH|ECON|STAT|ECE|ME|BME|CHE|CME|SOC|HIST|COMM|POLS|CLJ|ACTG|FIN|MGMT|MKTG|IDS|KN|PUBH|ARCH|MUS|THTR|DES|PHIL|GWS|BLST|GLAS|ANTH|SPAN|GER|LING|DHD|AHS|HIM|EPSY|BHIS|MCS|IE|PSCI|EAES|HN|PHAR|UPA|PPOL|US|UPP|PA|LAS|CL|GEOG|NATS|CI|SPED|ED|MTHT|IDEA|ART|AH|DLG|ISA|RES|ENTR|BA|ARTH|TADR|OT|PT)\b/i
  );
  const subjectCode = subjectMatch ? subjectMatch[1].toUpperCase() : null;

  const majorMatch = majorRequirements.find((maj) => {
    const label = maj.label.toLowerCase();
    const key = maj.key.replace(/-/g, " ");
    return (
      m.includes(label) || m.includes(key) ||
      (maj.key === "computer-science" && /\bcs\s+major|\bcomp(uter)?\s+sci/.test(m)) ||
      (maj.key === "nursing" && /\bnursing/.test(m)) ||
      (maj.key === "mathematics" && /\bmath\s+major|\bmathematics\s+major/.test(m)) ||
      (maj.key === "psychology" && /\bpsych\s+major|\bpsychology\s+major/.test(m)) ||
      (maj.key === "biochemistry" && /\bbiochem/.test(m)) ||
      (maj.key === "kinesiology" && /\bkin(esiology)?\s+major/.test(m)) ||
      (maj.key === "finance" && /\bfinance\s+major/.test(m)) ||
      (maj.key === "accounting" && /\baccounting\s+major/.test(m)) ||
      (maj.key === "marketing" && /\bmarketing\s+major/.test(m)) ||
      (maj.key === "management" && /\bmanagement\s+major/.test(m)) ||
      (maj.key === "economics" && /\becon(omics)?\s+major/.test(m)) ||
      (maj.key === "biology" && /\bbio(logy)?\s+major/.test(m)) ||
      (maj.key === "chemistry" && /\bchem(istry)?\s+major/.test(m)) ||
      (maj.key === "physics" && /\bphysics\s+major/.test(m)) ||
      (maj.key === "architecture" && /\barchitecture\s+major/.test(m)) ||
      (maj.key === "biomedical-engineering" && /\bbme\s+major|\bbiomedical/.test(m)) ||
      (maj.key === "electrical-engineering" && /\bece\s+major|\belectrical\s+eng/.test(m)) ||
      (maj.key === "mechanical-engineering" && /\bme\s+major|\bmechanical\s+eng/.test(m)) ||
      (maj.key === "civil-engineering" && /\bcivil\s+eng/.test(m)) ||
      (maj.key === "industrial-engineering" && /\bindustrial\s+eng/.test(m)) ||
      (maj.key === "chemical-engineering" && /\bchemical\s+eng/.test(m)) ||
      (maj.key === "public-health" && /\bpublic\s+health\s+major/.test(m)) ||
      (maj.key === "sociology" && /\bsociology\s+major/.test(m)) ||
      (maj.key === "history" && /\bhistory\s+major/.test(m)) ||
      (maj.key === "english" && /\benglish\s+major/.test(m)) ||
      (maj.key === "philosophy" && /\bphilosophy\s+major/.test(m)) ||
      (maj.key === "statistics" && /\bstat(istics)?\s+major/.test(m)) ||
      (maj.key === "neuroscience" && /\bneuro(science)?\s+major/.test(m)) ||
      (maj.key === "ba-communication" && /\bcomm(unication)?\s+major/.test(m)) ||
      (maj.key === "ba-criminology-law-and-justice" && /\bclj\s+major|\bcriminology/.test(m)) ||
      (maj.key === "ba-political-science" && /\bpoli(tical)?\s+sci/.test(m)) ||
      (maj.key === "rehabilitation-sciences" && /\brehab\s+sci/.test(m)) ||
      (maj.key === "health-information-management" && /\bhim\s+major|\bhealth\s+info/.test(m)) ||
      (maj.key === "information-and-decision-sciences" && /\bids\s+major/.test(m)) ||
      (maj.key === "ba-anthropology" && /\banthr(opology)?\s+major/.test(m)) ||
      (maj.key === "ba-urban-studies" && /\burban\s+studies/.test(m)) ||
      (maj.key === "ba-public-policy" && /\bpublic\s+policy/.test(m)) ||
      (maj.key === "pharmaceutical-sciences" && /\bpharm(acy|aceutical)/.test(m))
    );
  }) ?? null;

  const deptKeywords: [RegExp, string][] = [
    [/\bnursing\b/, "Nursing"],
    [/\bmathematics\b|\bmath department\b/, "Mathematics"],
    [/\bcomputer science department\b/, "Computer Science"],
    [/\bchemistry department\b/, "Chemistry"],
    [/\bphysics department\b/, "Physics"],
    [/\bbiology\b|\bbiological sciences\b/, "Biological Sciences"],
    [/\bpsychology department\b/, "Psychology"],
    [/\benglish department\b/, "English"],
    [/\bhistory department\b/, "History"],
    [/\beconomics department\b/, "Economics"],
    [/\bfinance department\b/, "Finance"],
    [/\baccounting department\b/, "Accounting"],
    [/\bmanagement department\b/, "Management"],
    [/\bmarketing department\b/, "Marketing"],
    [/\bsociology department\b/, "Sociology"],
    [/\bkinesiology\b/, "Kinesiology"],
    [/\bcommunication department\b/, "Communication"],
    [/\bphilosophy department\b/, "Philosophy"],
    [/\bpolitical science\b/, "Political Science"],
    [/\bpublic health\b/, "Public Health"],
    [/\barchitecture\b/, "Architecture"],
    [/\bcivil engineering\b/, "Civil Engineering"],
    [/\belectrical.*engineering\b/, "Electrical and Computer Engineering"],
    [/\bmechanical.*engineering\b/, "Mechanical and Industrial Engineering"],
    [/\bbiomedical engineering\b/, "Biomedical Engineering"],
    [/\bchemical engineering\b/, "Chemical Engineering"],
    [/\bindustrial engineering\b/, "Industrial Engineering"],
    [/\bcriminology\b|\bclj\b/, "Criminology, Law and Justice"],
    [/\banthropology\b/, "Anthropology"],
    [/\bstatistics\b/, "Statistics"],
    [/\bneuroscience\b/, "Neuroscience"],
    [/\burban\b/, "Urban Planning and Policy"],
  ];

  let deptName: string | null = null;
  for (const [re, dept] of deptKeywords) {
    if (re.test(m)) { deptName = dept; break; }
  }

  const profNameMatch = m.match(/professor\s+([a-z]+)|prof\s+([a-z]+)|([a-z]+)'s\s+(class|course|section)/);

  return {
    courseCode,
    subjectCode,
    major: majorMatch,
    deptName,
    profNameHint: profNameMatch
      ? (profNameMatch[1] || profNameMatch[2] || profNameMatch[3])
      : null,
    isAboutProfessors: /professor|instructor|teacher|\bprof\b|who teach|who gives|best prof|worst prof|ratings|rmp|rank.*prof|prof.*rank/i.test(m),
    isAboutCourses: /course|class|elective|easiest|hardest|gpa|grade|subject|credit|difficult|easy|hard|gen.?ed|requirement/i.test(m),
    isAboutGenEd: /gen.?ed|general education|gen ed/i.test(m),
    isAboutMajor: /major|required|requirement|prereq|curriculum|degree|program|what do i need|what courses/i.test(m),
    isAboutRequirementType: /prereq|prerequisite|core|elective|required|requirement type|foundational/i.test(m),
    wantsEasiest: /easiest|easy|highest gpa|best grades|most a|good grades|easy a/i.test(m),
    wantsHardest: /hardest|hard|lowest gpa|most difficult|toughest|avoid/i.test(m),
    wantsProfRanking: /rank|best|worst|top|who.*teach|who.*give|which prof/i.test(m),
  };
}

export function detectCampusIntent(msg: string) {
  const m = msg.toLowerCase();
  return {
    isAboutTuition: /tuition|cost|fee|how much|afford|pay|money|expensive|cheap|price|credit hour|per credit|billing|charges/i.test(m),
    isAboutFinancialAid: /financial aid|scholarship|grant|aspire|fafsa|rise act|merit|chancellor|president.*award|pap|snap|aid|free tuition|free\.uic/i.test(m),
    isAboutResidency: /in.?state|out.?of.?state|residency|resident|nonresident|lake county|indiana|tribal/i.test(m),
    isAboutPayment: /payment plan|installment|nelnet|ui pay|pay over time|how to pay/i.test(m),
    isAboutCostComparison: /compare|vs|versus|uiuc|niu|siu|cheaper|more expensive|other school/i.test(m),
    isAboutDebt: /debt|borrow|loan|average debt|graduate debt/i.test(m),
    isAboutHousing: /housing|dorm|residence hall|live on campus|room|arc|jst|commons|courtyard|marie robinson|mrh|tbh|ssr|psr|beckham|stukel|roommate|move.?in|apply for housing/i.test(m),
    isAboutMealPlan: /meal plan|meal swipe|flames fare|ignite|blaze|dining plan|swipes|food plan/i.test(m),
    isAboutDining: /dining|eat|food|restaurant|cafe|cafeteria|chick.?fil|panda|starbucks|subway|sushi|halal|dunkin|market|where to eat|lunch|breakfast|dinner/i.test(m),
    isAboutOffCampus: /off.?campus|apartment|neighborhood|pilsen|west loop|university village|little italy|near campus/i.test(m),
    isAboutLLC: /llc|living learning|affinity|spectrum|honors.*housing|innovate|ventures|sisters|la casa|bayt|lead asia|pbma|dusable/i.test(m),
    isAboutStudentLife: /student org|club|join|greek|fraternity|sorority|frat|sorority|greek life|involvement|quad day|involvement fair|spark.?fest|spark.*concert|homecoming|wow|weeks of welcome|student activities|student newspaper|student paper|student media|student publication|the flame|wuic|student radio/i.test(m),
    isAboutAthletics: /flames|athletics|basketball|baseball|soccer|volleyball|softball|swimming|tennis|golf|track|cross country|credit union.*arena|uic pavilion|sports|game|ticket|student section|flame force|mvc|horizon league|coach|roster/i.test(m),
    isAboutCampusMap: /building|where is|how to get to|directions|library|daley|lhs|student center|ssb|parking|shuttle|night ride|cta|blue line|pink line|bus|train|transit|campus map/i.test(m),
    isAboutHealth: /health service|counseling|therapy|mental health|doctor|sick|nurse|campus care|campuscare|pharmacy|dental|eye|urgent care|disability|drc|accommodation/i.test(m),
    isAboutAcademicPolicies: /registration|banner|time ticket|add.*drop|withdraw|gpa requirement|academic probation|academic notice|deans list|graduation requirement|latin honors|honors college|incomplete|grade replacement|repeat.*course|how many credits|120 credit|change major|double major|minor/i.test(m),
    isAboutCalendar: /academic calendar|semester start|finals|spring break|registration open|add drop deadline|when does.*semester|when is.*break|fall 2025|spring 2026/i.test(m),
    isAboutRecreation: /crrc|srf|sfc|recreation|rec center|gym|intramural|sport club|fitness class|pool|climbing|yoga|zumba|hiit|night ride/i.test(m),
    isAboutSafety: /safe|safety|escort|night ride|uic safe|emergency|crime|walking escort/i.test(m),
    isAboutBuildings: /building|where is|ssb|student services|university hall|daley library|student center|grant hall|srf|sfc|arc|jst|mrh|tbh|ssr|psr|lecture center|engineering building/i.test(m),
    isAboutTransportation: /cta|blue line|pink line|bus|train|transit|shuttle|night ride|parking|divvy|bike|uic halsted|racine station|medical district station|polk station/i.test(m),
  };
}