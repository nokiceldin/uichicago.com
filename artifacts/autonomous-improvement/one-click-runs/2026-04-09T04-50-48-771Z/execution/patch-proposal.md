# Patch Proposal: Incorrect Abstain Or Missing Retrieval

Candidate ID: `candidate_incorrect_abstain_or_missing_retrieval`
Patch type: `retrieval_or_trust`

## Goal

Recover good evidence earlier and relax abstention only when source quality supports it.

## Suggested Scope

- Inspect and patch `app/api/chat/route.ts`
- Inspect and patch `lib/chat/trust-decision.ts`
- Inspect and patch `lib/chat/data.ts`

## Why This Candidate

- Acceptance gate: Affected abstain cases must cross the pass threshold with no new hallucination flags in financial or policy domains.
- Affected eval IDs: q51, q60, q63, q84
- Affected feedback cases: none
- Cluster summary: Sparky had data available or should have answered, but abstained or failed to retrieve the right evidence.

## Example Incidents

- q51: what do international students need to do before arriving at uic?
  Current answer: [NO RESPONSE: fetch failed]
  Notes: The system failed to provide any response due to a fetch failure. This represents a complete system failure rather than an appropriate abstention with redirection. No information was provided to help the student, and there was no attempt to redirect them to appropriate resources. | missed: F-1 students must complete Immigration Check-In with OIS to remove SEVIS hold | missed: J-1 students must validate with OIS within 30 days of arrival
- q60: what mental health resources does uic offer?
  Current answer: [NO RESPONSE: fetch failed]
  Notes: The system provided no response at all due to a fetch failure. This is a complete system failure rather than an appropriate abstain behavior with redirection. For a critical mental health query, providing no information is particularly problematic and unsafe. | missed: Counseling Center is in Suite 2010, Student Services Building | missed: Phone: 312-996-3490
- q63: are uic athletic events free for students?
  Current answer: [NO RESPONSE: fetch failed]
  Notes: The system failed to provide any response (fetch failed), resulting in a complete failure to answer the student's question. Since the expected behavior was to answer with direct factual information about free athletic events, the absence of any response fails all evaluation criteria. | missed: Regular season home events are FREE for students with valid UIC student ID | missed: Basketball student section (Flame Force): Gate 3, Credit Union 1 Arena, sections 110-112

## Eval Gate

- Re-run rubric evals for: q51, q60, q63, q84
- Promote only if the average score improves and no targeted case regresses.
