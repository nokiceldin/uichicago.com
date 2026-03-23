# Claude Fix Prompts — Sparky Eval Failures
_Generated: 2026-03-22T04:59:20.360Z_
_Paste each prompt directly to Claude for implementation._

---

## Over-Confident Factual Error
_Affects 1 cases: q63_

### Prompt

```
You are working on Sparky, a retrieval-based AI assistant for UIC (University of Illinois Chicago).

PROBLEM:
Retrieved chunk contains correct general data but model overgeneralizes or ignores a caveat present in the data. The chunk wording doesn't explicitly flag the exception.

EVIDENCE FROM FAILING CASES:
- q63: "are uic athletic events free for students?" → answer (score: 6/10)
  judge: The response correctly states that events are free with student ID and mentions the Missouri Valley Conference, but makes a forbidden claim that all e

LIKELY RELEVANT FILES/FUNCTIONS:
- retrieval content strings — specific retriever functions
- system prompt trust instruction for 'answer' mode

PATCH OBJECTIVE:
Add explicit exception language to the chunk content (e.g., 'excluding basketball' for ticket pricing). Use hedge trust instruction for financial/access claims.

CONSTRAINTS:
- Make only the minimal change needed to fix this specific failure
- Do not refactor unrelated code
- Do not change trust-decision.ts (unless this is a trust threshold issue)
- Do not change the eval runner or spec files
- Every change must be justified by the evidence above

REGRESSION CHECK — run these after applying the patch:
node scripts/eval-sparky.mjs --ids=q63
```
