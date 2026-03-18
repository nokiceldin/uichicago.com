# Sparky Eval Failure Report
_Generated: 2026-03-18T02:48:10.537Z_

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 10 |
| Avg score | 8.8/10 |
| Pass rate (≥7) | 9/10 (90.0%) |
| Failing cases | 1 |
| Real system bugs | 1 cases |
| Eval spec issues | 0 cases |

## Score Distribution

`0-3`  0
`4-6` █ 1
`7-8` ███ 3
`9-10` ██████ 6

## Lowest Scoring Cases

### q63 — 6/10 (athletics)
**Q:** are uic athletic events free for students?
**Expected:** answer | **Got:** answer
**Judge:** The response correctly states that events are free with student ID and mentions the Missouri Valley Conference, but makes a forbidden claim that all events including basketball are free. It lacks impo
**Missed:** Regular season home events are FREE for students with valid UIC student ID; Flames Fast Pass: $50 covers all home events except basketball
**Forbidden claims:** all events including basketball are free

## Failure Clusters

### Over-Confident Factual Error — 1 cases 🔴 System Bug
**IDs:** q63
**Avg score:** 6/10 | **Confidence:** high
**Root cause:** Retrieved chunk contains correct general data but model overgeneralizes or ignores a caveat present in the data. The chunk wording doesn't explicitly flag the exception.
**Code areas:** retrieval content strings — specific retriever functions, system prompt trust instruction for 'answer' mode
**Fix:** Add explicit exception language to the chunk content (e.g., 'excluding basketball' for ticket pricing). Use hedge trust instruction for financial/access claims.
**Symptoms:** forbidden_claim_found, missed_required_facts

## Recommended Fixes (Ranked by Leverage)

_Ranking: expected failures removed × implementation simplicity × low regression risk_

### Fix 1: Over-Confident Factual Error
- **Affects:** 1 cases (q63)
- **Effort:** Low — targeted change
- **Change:** Add explicit exception language to the chunk content (e.g., 'excluding basketball' for ticket pricing). Use hedge trust instruction for financial/access claims.
- **Files:** retrieval content strings — specific retriever functions, system prompt trust instruction for 'answer' mode

## Spec Issues vs Real System Issues

### Real System Issues
- **Over-Confident Factual Error** (q63): Add explicit exception language to the chunk content (e.g., 'excluding basketball' for ticket pricing). Use hedge trust instruction for financial/access claims.

## Suggested Rerun Plan

After applying top fixes, run this minimal subset to verify:

```bash
node scripts/eval-sparky.mjs --ids=q63
ANTHROPIC_API_KEY=your_key node scripts/rubric-eval-runner.mjs --live --ids=q63
```
