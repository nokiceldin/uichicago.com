# Patch Proposal: Direct Rule Or Fast Path Quality

Candidate ID: `candidate_direct_rule_or_fast_path_quality`
Patch type: `fast_path`

## Goal

Replace brittle canned replies with a targeted rule or richer fallback path.

## Suggested Scope

- Inspect and patch `app/api/chat/route.ts`

## Why This Candidate

- Acceptance gate: Direct-rule regressions stay at zero and any targeted feedback case gets a clearly improved response on manual review.
- Affected eval IDs: none
- Affected feedback cases: 2026-03-30T22:20:44.622Z_1
- Cluster summary: A hardcoded response or fast path produced poor output or bad user feedback.

## Example Incidents

- 2026-03-30T22:20:44.622Z_1: play the song
  Current answer: Lets go Flames!
  Notes: rating=bad

## Eval Gate

- No direct eval IDs are attached to this candidate.
- Use manual review and targeted follow-up eval authoring before promotion.
