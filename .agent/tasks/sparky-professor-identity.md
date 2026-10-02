# Sparky Professor Identity Resolution

## Status

COMPLETE

## Request

Continue improving Sparky by fixing its handling of named professors. Sparky must not substitute a different professor because a partial-name match has more reviews, and it must retain enough of the user's name input to resolve apostrophes, multi-word names, and known directory aliases.

## Workflow

**Level: Normal — Manager → Workhorse → QA → Reviewer**

Rationale: This is a bounded change, but it affects the identity and evidence Sparky uses for user-facing recommendations. An incorrect match can confidently attribute ratings and courses to the wrong person. Independent behavioral QA and review of the matching/query design are required. A Prompter is unnecessary because the defect, evidence, and acceptance criteria are specific.

## Required agents

- Workhorse: implement the bounded identity-resolution change and tests.
- QA: independently verify name parsing, exact and alias matching, ambiguity handling, course association, and regressions.
- Reviewer: evaluate query safety, maintainability, false-match risk, and unnecessary complexity after QA passes.

## Evidence and scope

- `lib/chat/intent.ts` currently captures only one alphabetic token after `professor` or `prof`, losing full names and apostrophes.
- `lib/chat/data.ts` combines full-hint and token `contains` filters, then orders by `rmpRatingsCount`, so a popular professor can win over the professor the user named.
- `app/api/chat/route.ts` treats that result as high-confidence evidence and skips the generic list.
- Existing audit evidence in `artifacts/course-fact-consistency/name-lookups.json` shows `William O'Brien` resolving to William Rauscher while `O'Brien` resolves correctly. It also shows Adam Koehler resolving without his known course association.
- Reuse or extract the existing professor-directory normalization and alias concepts where practical. Avoid a second incompatible matching system.
- Preserve unrelated working-tree changes. Do not change rankings, rating calculations, prompt prose beyond what identity clarification requires, data schemas, dependencies, or the professor/course source datasets.
- Do not call live databases or model providers for verification.

## Acceptance criteria

1. Professor intent parsing preserves a useful multi-token name, including common punctuation such as apostrophes and hyphens, for prompts such as `Tell me about Professor William O'Brien's rating and courses`.
2. An exact normalized full-name match wins regardless of review count.
3. A unique surname or defensible known alias can resolve to one professor; middle-name variants used by the course map associate with the resolved directory identity when unambiguous.
4. A first-name-only or otherwise ambiguous partial name does not silently select a professor by popularity. Sparky asks the user which matching professor they mean and gives concise candidate identifiers where available.
5. When there is no defensible named match, Sparky does not present another professor as though that person were requested.
6. The resolved professor's rating, department, slug, and course list all come from the same identity.
7. Existing professor ranking and course-specific recommendation flows remain functional.
8. Focused tests cover exact full names, apostrophes, ambiguous partial names, unique surnames, and middle-name course-map associations. Relevant existing tests, TypeScript, and proportionate lint/build checks pass, or any pre-existing failure is clearly separated.

## Intended QA depth

- Inspect the submitted diff and verify the production call path from intent parsing through retrieval.
- Run focused pure tests with synthetic candidates so no live database is required.
- Reproduce the William O'Brien wrong-match case and the Adam Koehler middle-name course association at the resolver level.
- Verify ambiguity produces a clarification path rather than a popularity-based selection.
- Run the relevant full test suite plus TypeScript and targeted lint/build checks.
- Check that unrelated ranking/recommendation behavior was not broadened or rewritten.

## Handoffs and gates

- Manager → Workhorse: submitted with bounded ownership of professor intent parsing, identity resolution, retrieval wiring, and focused offline tests.
- Workhorse revision/diff: submitted.
  - Added `lib/chat/professor-identity.ts` and `lib/chat/professor-identity.test.mts`.
  - Updated `lib/chat/intent.ts`, `lib/chat/data.ts`, and the professor retrieval/clarification path in `app/api/chat/route.ts`.
  - Reported 7 focused and 109 full tests passing, TypeScript passing, production build passing, focused lint passing, and no live database/model calls.
  - Submitted SHA-256 values:
    - `lib/chat/professor-identity.ts`: `014b8fc29082025d9ef1adf555b83108726bf58c0bcbf251fdb6f921efd7d0d4`
    - `lib/chat/professor-identity.test.mts`: `258928cc18a8c0c423c5617854901aaeab477fceeb756d3a91858c6498d3d126`
    - `lib/chat/intent.ts`: `64ac62e9bae1936db2d540975eb1b562eafc4104fb8e0d364c993c4b04591f28`
    - `lib/chat/data.ts`: `29ac9dfccb198abfd9e64af9f4a2a1c3bca91e35e9f36b0202de98224045f91d`
    - `app/api/chat/route.ts`: `0dceb8de11b1a04de88a405e0709e5f65c7dc0f16eed13f04031834672db9c85`
- Manager inspection: submitted hashes match the working tree. The implementation uses a discriminated match/ambiguous/none result and a deterministic clarification response before model generation. Existing unrelated route and working-tree edits remain present.
- QA cycle 1: **FAIL**.
  - High: generic prompts such as `Which professor is best for CS 211?` and `Which professor should I take for CS 251?` were parsed as named professors (`is best`, `should I take`), causing the deterministic clarification path to override valid course-specific ranking retrieval.
  - High: ordinary trailing wording such as `Is Professor William O'Brien good?` and `...a good teacher?` was included in the name hint, causing a valid named professor to become a no-match.
  - Medium: the alphabetically ordered `take: 50` candidate boundary could omit an exact match or hide a duplicate, producing a false no-match or false certainty.
  - Focused tests, 110-test full suite, TypeScript, build, focused lint, and diff check passed, but the missing regression cases and bounded-query behavior fail acceptance criteria 1, 2, 4, and 7.
  - Submitted hashes remained unchanged during QA. No live database/model calls were made.
- Correction cycle 1: Workhorse submitted.
  - Generic ranking and malformed classifier hints are rejected as professor names.
  - Trailing evaluative wording is removed from full-name hints.
  - Candidate lookup is staged: complete exact-name query first for multi-token hints, then a complete surname candidate query for alias/surname/ambiguity resolution. The arbitrary 50-row boundary was removed.
  - Added regression coverage with 75 decoys and 60 same-surname candidates.
  - Reported 10 focused and 113 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `338b7f26ee1c4f16ac91ff4d2cc2ba58cb22c69cdea97c7da3040ff4162ee827`
    - `lib/chat/professor-identity.test.mts`: `37f3ce5b8ac508f16a5921f6e8621c22817079e89309386bb93e14d14fbc365b`
    - `lib/chat/data.ts`: `4334fd2f86badc019e46da10a44fa37e8a3ca6c3383eaf151a63a876b69863e3`
    - `lib/chat/intent.ts`: unchanged at `64ac62e9bae1936db2d540975eb1b562eafc4104fb8e0d364c993c4b04591f28`
    - `app/api/chat/route.ts`: unchanged at `0dceb8de11b1a04de88a405e0709e5f65c7dc0f16eed13f04031834672db9c85`
- QA cycle 2: **FAIL**.
  - Cycle-1 findings were verified fixed, including the former 50-row completeness problem.
  - High: `Which professor gives the best grades in CS?` and `Which professor gives easy As?` still produced the false name hint `gives`, allowing deterministic clarification to override ranking retrieval.
  - High: `What is Professor William O'Brien like?` and `Is Professor William O'Brien worth taking?` retained `like` or `worth taking` as part of the name, producing a false no-match.
  - Focused tests, 113-test full suite, TypeScript, build, focused lint, and diff checks passed; the parser still fails acceptance criteria 1, 2, 5, and 7 for common wording.
- Correction cycle 2: Workhorse submitted.
  - Replaced isolated word trimming with shared grammatical predicate boundaries, capitalization transitions, lowercase name-particle handling, and guarded name/verb collisions.
  - The regex path and classifier-hint merger now use the same sanitizer.
  - Expanded table-driven regression coverage across ranking questions; named questions followed by like/worth/recommend/teach/rating/course wording; apostrophes, hyphens, lowercase names, and `will` as either a name or auxiliary.
  - Reported 10 focused and 113 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `e907ec2249a3e473e213bcfd3876e428217972f006782e7233108075ff0bab4d`
    - `lib/chat/professor-identity.test.mts`: `c48f591e4a7dea02e845c9157db4d37d6b9d17f1b75c2738f53703184c4d174f`
    - Other submitted files unchanged from correction cycle 1.
- QA cycle 3: **FAIL**.
  - All standard cases from QA cycles 1 and 2 passed, as did staged lookup completeness, resolution, deterministic clarification, and course-map association.
  - High: title-cased predicates such as `Worth Taking`, `Like`, and `Teach` were retained as name tokens, producing false no-matches.
  - Medium: real lowercase names that collide with adjectives/verbs were truncated, including the dataset professor `Freda Fair`; lowercase middle initials such as `renata a tarasievich` were also truncated.
  - Focused tests, 113-test full suite, TypeScript, build, focused lint, and diff checks passed, but acceptance criterion 1 remains incomplete and valid names can still become false no-matches.
- Correction cycle 3: Workhorse submitted.
  - The parser preserves plausible post-title phrases while rejecting clearly generic leading predicates.
  - The resolver builds longest-to-shortest prefixes and performs one complete exact query over their raw and normalized values; the longest confirmed identity wins.
  - When no exact prefix is confirmed, a grammar-trimmed phrase drives the existing complete surname/alias/ambiguity lookup.
  - Added data-aware coverage for title-cased predicates, `Freda Fair`, lowercase middle initials, `Will Smith`, `May Lee`, alias fallback, generic phrases, single-call prefix lookup, and complete fallback ambiguity.
  - Reported 12 focused and 115 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `dc7956cbf19ec36b09cf85d9c4b5c459ab9ae593517969c08dde2f2a9a9d3d6f`
    - `lib/chat/professor-identity.test.mts`: `2c64e0cc7118bcde56109b2473718de8884245bb2a89babc945630011271b8dc`
    - `lib/chat/data.ts`: `caa3a84b5ce7c6895db61a1654be90983a0801453829a4fbfbb51f4fbd3043e4`
    - Other submitted files unchanged from earlier cycles.
- QA cycle 4: **FAIL**.
  - Data-aware resolution passed title-cased predicates, `Freda Fair`, lowercase middle initials, name/verb collisions, query completeness, duplicate ambiguity, parameterization, and all earlier standard cases.
  - High: infinitive ranking forms such as `Which professor to take/choose/avoid ...` still created false named-professor hints because `to`/`avoid` were not generic leading boundaries.
  - High: unrestricted longest-to-shortest prefix resolution could discard arbitrary unrecognized surname tokens, so `William O'Brien Smith` could incorrectly resolve to William O'Brien.
  - Focused tests, 115-test full suite, TypeScript, build, focused lint, and diff checks passed, but acceptance criteria 5 and 7 still fail in these cases.
- Correction cycle 4: Workhorse submitted.
  - Generic `to take/choose/avoid/pick/prefer` ranking phrases and classifier equivalents are rejected as names.
  - Full-phrase exact matching remains first. A shorter exact prefix is accepted only when the first discarded token is recognized predicate/question wording; a matched shorter identity followed by arbitrary identity-like tokens returns no match before alias fallback.
  - Added regression coverage for valid predicate suffixes and false substitutions such as `William O'Brien Smith`, `...Unknown Surname`, and `...Extra`.
  - Reported 13 focused and 116 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `2a1c43bf29241d9a1537f0c8433f3b8e8251d8a0a723b58e2d5e425867403a54`
    - `lib/chat/professor-identity.test.mts`: `ab5f470a7eff7efa11c1b31f1803e423b10418e3e079d566bab1289f9c3fbc1a`
    - Other submitted files unchanged from correction cycle 3.
- QA cycle 5: **FAIL**.
  - All prior QA cases passed, including identity completeness, data-aware collisions, suffix gating, aliases, ambiguity, course-map association, and earlier ranking forms.
  - High: negative/modal ranking wording such as `Which professor not to take ...` and `Which professor ought I take ...` still produced named hints and deterministic clarification instead of ranking results.
  - Focused tests, 116-test full suite, TypeScript, build, focused lint, and diff checks passed; no live services were used.
- Correction cycle 5: Workhorse submitted.
  - Added a raw-query generic-interrogative detector for `which/what/who professor|prof|instructor|teacher...`.
  - Both regex extraction and the AI/regex hint merger suppress named lookup for this shape; the route passes the raw message into the merger.
  - Named controls such as `What is Professor William O'Brien like?`, `Who is Professor William O'Brien?`, and surname possessives remain enabled.
  - Added regression coverage for negative/modal ranking prompts and classifier override attempts.
  - Reported 14 focused and 117 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `b6e914d904b6745579fcfda0220769d2ddbb3b12299e213ee7a8e967eb70f2d2`
    - `lib/chat/professor-identity.test.mts`: `cc65a254cc38bbfca8991757f3bafecaa80ee301cb86674933eec3ee43a26193`
    - `app/api/chat/route.ts`: `5d7fb13879fb6b5a2f31a9bbdaa40e3f63f60c4228fa4d8621bed1e0236bdf36`
    - `lib/chat/intent.ts` and `lib/chat/data.ts`: unchanged from correction cycle 4.
- QA cycle 6: **FAIL**.
  - Direct generic-interrogative forms and all earlier QA cases passed.
  - High: the detector was anchored to message start and required the professor role immediately after the question word. Preambles and qualifiers such as `Can you tell me which professor...`, `I want to know which professor...`, and `Which CS professor...` bypassed suppression and re-entered deterministic clarification.
  - Focused tests, 117-test full suite, TypeScript, build, focused lint, and diff checks passed; no live services were used.
- Correction cycle 6: Workhorse submitted.
  - The detector now scans the full message for generic professor-interrogative clauses and permits up to three qualifier tokens before the role while stopping at copulas/predicates.
  - Added preamble and subject/department qualifier regressions plus named copular controls.
  - Reported 14 focused and 117 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `a469069aeb80c4253fa1d0ccb228f1a9ef553abbc9149a06415043ac07d2d3b8`
    - `lib/chat/professor-identity.test.mts`: `14372c25a3121decc72aa53f8d6e57995787f0b685da50e092ca986b118e683b`
    - Other submitted files unchanged from correction cycle 5.
- QA cycle 7: **FAIL**.
  - Preambles, short qualifiers, classifier suppression, named controls, and all prior identity cases passed.
  - High: the scanner treated conjunctions and qualitative words as predicate stops before reaching the role. Real qualifiers such as `electrical and computer engineering`, `information and decision sciences`, and `highly rated` therefore bypassed generic suppression.
  - Focused tests, 117-test full suite, TypeScript, build, focused lint, and diff checks passed; no live services were used.
- Correction cycle 7: Workhorse submitted.
  - Any `which` clause with a professor role within eight tokens is now a generic selection question, independent of intervening conjunctions or descriptions and with preamble support.
  - Predicate-aware `what`/`who` handling remains unchanged for named questions.
  - Added long department, descriptive qualifier, preamble, and classifier-override regressions.
  - Reported 14 focused and 117 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `3700baf94f6425e228240bb15b0639373233712fd3fdc958f1752015a5096d5f`
    - `lib/chat/professor-identity.test.mts`: `34dd7324316d443d62f114bc021353a611910c214ebdb871798943d89ffbdf13`
    - Other submitted files unchanged from correction cycle 6.
- QA cycle 8: **FAIL**.
  - Long/conjoined/descriptive qualifiers, classifier suppression, direct named controls, and all earlier resolver/query cases passed.
  - High: broad nearby-role suppression hid natural named indirect questions such as `who Professor William O'Brien is`, `what Professor William O'Brien teaches`, and `Which courses/department ... Professor William O'Brien ...`.
  - Focused tests, 117-test full suite, TypeScript, build, focused lint, and diff checks passed; no live services were used.
- Correction cycle 8: Workhorse submitted.
  - Nearby question-word/role clauses now inspect the post-role phrase. Plausible names retain named lookup; empty or generic predicate/question starts retain ranking suppression.
  - Added `not` and `ought` to generic leading grammar while preserving `Will`, `May`, and `Fair` name collisions.
  - Added indirect named-question regressions for who/what/which course, class, and department phrasings alongside all long qualifier generic cases.
  - Reported 14 focused and 117 full tests passing, TypeScript/build/focused lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `e4cfd247af0e1ea9af13cc80165b2dd80d07b550630c16650c26c7cebec6558d`
    - `lib/chat/professor-identity.test.mts`: `98b3263a2f68a50660c4c21990ac801483ee135c7a43a69866176fdcebc7d330`
    - Other submitted files unchanged from correction cycle 7.
- QA cycle 9: **FAIL**.
  - Long qualifiers, indirect named forms, classifier suppression, data-aware resolution, ambiguity, and no-substitution behavior passed.
  - High: unknown post-role adverbs such as `currently`, `overall`, `generally`, `actually`, and `usually` were treated as names, allowing failed lookup clarification to override ranking/course retrieval.
  - Focused tests, 117-test full suite, TypeScript, build, focused lint, and diff checks passed; no live services were used.
- Correction cycle 9: Workhorse submitted.
  - Added adverb-shaped and common non-`-ly` discourse/frequency boundaries for post-role generic phrases.
  - Added a pure clarification-decision helper and route-level defense: exact named matches still return, but ambiguous/none results in clear ranking requests fall through to the normal professor list instead of deterministic clarification.
  - Actual named misses/ambiguities still receive deterministic clarification.
  - Added adverb, preamble, named-control, and clarification-decision regressions.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live database/model calls.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `7512fc74204773db0f819ad0e7217ea0fcf6f963271cb83b050b6c8711c71448`
    - `lib/chat/professor-identity.test.mts`: `3df3bb66447ddda25db533ef40c0e30e5f5ae3bbb82820083d35c0783b8b6302`
    - `app/api/chat/route.ts`: `87f51f52169b79fb43ead426d00181582849917107b139072cdc58243e475290`
    - `lib/chat/intent.ts` and `lib/chat/data.ts`: unchanged from correction cycle 8.
- QA cycle 10: **FAIL**.
  - High: adverb suffix heuristics misclassified real UIC names including Sally and Kimberly, suppressing valid named requests.
  - High: the route fallback still required a question-word detector, so clear ranking prompts such as `Best professor currently...` and `Top professor overall...` could force clarification.
  - Named misses/ambiguities and exact matches otherwise behaved correctly. Focused tests, 118-test full suite, TypeScript, build, scoped lint, and diff checks passed; no live services were used.
- Correction cycle 10: Workhorse submitted.
  - Removed suffix-based adverb detection and replaced it with explicit lexical markers.
  - Preserved real professor names Sally Blechschmidt, Sally Pissetzky, and Kimberly Warner.
  - Missing/ambiguous ranking lookups now fall through unless the query contains an explicit titled or supported possessive named target; exact matches remain unchanged.
  - Added ranking-without-question-word, named miss, ambiguity, possessive, and named ranking regressions.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live services.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `4d5a015f2f5a55bf86e26d561203a6e5ae1a3bf1f403ba09009b09433a2f9a8f`
    - `lib/chat/professor-identity.test.mts`: `334a7376b24d0441e36ccc531d5f6ead95ba41cc3a144e7f408d39dbe11a23b3`
    - Other submitted files unchanged from correction cycle 9.
- QA cycle 11: **FAIL**.
  - Sally/Kimberly names, explicit adverbs, generic rankings with and without question words, exact matches, titled named misses/ambiguities, possessives, and all earlier identity cases passed.
  - High: natural named ranking syntax with the name before `professor(s)`—for example `Is Smith the best professor?` and `Rank Smith among CS professors`—fell through instead of clarifying ambiguous/missing identities.
  - Focused tests, 118-test full suite, TypeScript, build, scoped lint, and diff checks passed; no live services were used.
- Correction cycle 11: Workhorse submitted.
  - Clarification decisions now receive the selected professor hint and detect that normalized hint before singular/plural professor, prof, instructor, or teacher roles.
  - Explicit name-before-role misses/ambiguities clarify; post-role generic artifacts still fall through; exact matches remain unchanged.
  - Added ambiguous/missing name-before-role, generic post-role, and exact-match regressions.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live services.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `fdf9ea291de6d237560b2b18bf9232dc17ddd0534cf5bf5bd102024193e547c2`
    - `lib/chat/professor-identity.test.mts`: `f1592ae48a662d795ff0356004073b16861bb308436fc82e36861b47fe48ef68`
    - `app/api/chat/route.ts`: `2b550630d3d8e317d881eae60c0c88983c3c9389b82fdaa7474ee1600d984688`
    - `lib/chat/intent.ts` and `lib/chat/data.ts`: unchanged from correction cycle 10.
- QA cycle 12: **FAIL**.
  - Name-before-role handling, exact matches, titled/possessive clarification, real-name collisions, ambiguity, no-substitution, and prior generic markers passed.
  - High: unlisted post-role modifiers such as `available`, `recommended`, `recently`, `regularly`, and `previously` were treated as explicit names; their no-match results forced deterministic clarification.
  - Focused tests, 118-test full suite, TypeScript, build, scoped lint, and diff checks passed; no live services were used.
- Correction cycle 12: Workhorse submitted.
  - Clarification is now status- and evidence-based: match never clarifies; ambiguous always clarifies; non-ranking no-match clarifies; ranking no-match requires a possessive, hint before role, grammar-trimmed multi-token titled name, or proper-case single-token titled name.
  - Lowercase single-token post-role artifacts fall through without adding exhaustive lexical entries.
  - Added all reported modifier cases plus lowercase/proper-case named targets, ambiguous Smith, Missing Person, exact match, and generic controls.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live services.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `1ab6ac6de081798b09a792205cc11318ef72c2d764d980fb62f4c2993d0135c3`
    - `lib/chat/professor-identity.test.mts`: `ab025995bbd27262acf06c4ce1a09e03f79dd1cf694584189757396afa0ffd2f`
    - Other submitted files unchanged from correction cycle 11.
- QA cycle 13: **FAIL**.
  - The submitted evidence matrix and all core identity/query cases passed.
  - High: title-cased generic modifiers were treated as proper-name evidence, causing `Best/Top/Which Professor Available/Recommended/Recently...` to clarify instead of falling through.
  - Medium: lowercase explicit titled surname misses such as `is professor smyth the best...` fell through instead of clarifying. Capitalization, rather than request structure, controlled the outcome.
  - Focused tests, 118-test full suite, TypeScript, build, scoped lint, and diff checks passed; no live services were used.
- Correction cycle 13: Workhorse submitted.
  - Removed capitalization from clarification evidence.
  - Ranking no-match now distinguishes generic selection leads (`best/top/which` before role and hint) from case-insensitive explicit named structures (`is/how is/tell me about/who or what is professor <hint>`) plus supported ranking/comparison/recommendation named forms.
  - Name-before-role and possessive evidence remain; ambiguity always clarifies, match never does, and non-ranking no-match clarifies.
  - Added case-insensitive table coverage for both structural families.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live services.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `d989cdcd1b2560f945b84a8f90256e173f1ce0d6bdc97a0c6a953142b9b2480c`
    - `lib/chat/professor-identity.test.mts`: `9b8f6e0bd8c3cef1bd26438f6ea5a94813f66bef4d55fc1e6d9654f97f523d66`
    - Other submitted files unchanged from correction cycle 12.
- QA cycle 14: **FAIL**.
  - Case-independent Best/Top/Which selection leads and all explicit named/identity resolver cases passed.
  - High: `Worst`, `Easiest`, and `Hardest` generic selection leads were omitted. `Easiest`/`Hardest` also use dedicated intent flags while the route safety only received `wantsProfRanking`, so no-match forced clarification.
  - Focused tests, 118-test full suite, TypeScript, build, scoped lint, and diff checks passed; no live services were used.
- Correction cycle 14: Workhorse submitted.
  - Generic structural selection leads now include best/top/worst/easiest/hardest/which.
  - Route clarification safety receives the combined `wantsProfRanking || wantsEasiest || wantsHardest` selection intent.
  - Added mixed-case Worst/Easiest/Hardest generic regressions and explicit named controls; exact behavior remains unchanged.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live services.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `fe7984adabe3a33afbc2b2140986fb5dfe23305af6db28d7f4a13e37149154e1`
    - `lib/chat/professor-identity.test.mts`: `ac435c7d455aff7cfc7fe1bae475b46258fa9cbadb815e7684bcde9a9e93fbb7`
    - `app/api/chat/route.ts`: `46fdfe1b99bc43506e4e32619ea9939d683bd81663f7fc635db84f16e2fcb580`
    - `lib/chat/intent.ts` and `lib/chat/data.ts`: unchanged from correction cycle 13.
- QA cycle 15: **FAIL**.
  - Correction-14 leads and the combined selection-intent flag passed; acceptance criteria 1-6 passed.
  - High: other vocabulary already supported by `detectIntent`—easy/hard/toughest/most difficult/highest GPA/lowest GPA—was absent from the structural lead list, so selection no-match still clarified.
  - Focused tests, 118-test full suite, TypeScript, build, scoped lint, and diff checks passed; no live services were used.
- Correction cycle 15: Workhorse submitted.
  - Removed selection-word enumeration from clarification decisions.
  - Selection no-match now falls through by default and clarifies only from independent named-person evidence: supported possessive, selected hint before role, or bounded explicit named-address structures.
  - Ambiguous always clarifies, match never does, and non-selection no-match still clarifies.
  - Added a generic matrix for Easy/Hard/Toughest/Most difficult/Highest GPA/Lowest GPA and all prior terms, plus each named-evidence family.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live services.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `43c01fe8abb59f1e922b85b712a4cfba576364d0bed5cedd88474ae90a85a54a`
    - `lib/chat/professor-identity.test.mts`: `3648e3b2897dd85491b24fc4c653fa3863c8a3c36ca40b59abefc51e342baf29`
    - `app/api/chat/route.ts`: `46fdfe1b99bc43506e4e32619ea9939d683bd81663f7fc635db84f16e2fcb580`
    - `lib/chat/intent.ts` and `lib/chat/data.ts`: unchanged from correction cycle 14.
- QA cycle 16: **FAIL**.
  - The complete generic selection matrix, Professor/Prof explicit leads, possessives, name-before-role forms, ambiguity, exact matches, non-selection misses, and all resolver/query cases passed.
  - High: parser-supported `Dr.` explicit names were not included in named-evidence role detection during selection no-match, so `Is/Rank/Compare/Recommend Dr. Missing...` fell through instead of clarifying.
  - Focused tests, 118-test full suite, TypeScript, build, scoped lint, and diff checks passed; no live services were used.
- Correction cycle 16: Workhorse submitted.
  - Added normalized `dr` to explicit named-evidence roles.
  - Added Is/Rank/Compare/Recommend Dr. Missing selection regressions plus generic, exact, and ambiguous controls.
  - Reported 15 focused and 118 full tests passing, TypeScript/build/scoped lint/diff checks passing, with no live services.
  - Correction SHA-256 values:
    - `lib/chat/professor-identity.ts`: `a1fcbba307d01492e65fc2efe05ffcb020dfc11148763425bef4fc0656a0efd1`
    - `lib/chat/professor-identity.test.mts`: `4116ffa9476b26d6f759e9b94159700eda21b110d639de9945ba8ebf39606ae6`
    - Other submitted files unchanged from correction cycle 15.
- QA cycle 17: **PASS**.
  - All acceptance criteria and every prior regression passed.
  - Focused identity tests: 15/15.
  - Full test suite: 118/118.
  - Independent clarification decision matrix: 18/18.
  - TypeScript, production build, scoped lint (0 errors; 3 existing warnings), and diff checks passed.
  - Exact/ambiguous/no-match decisions, full generic selection vocabulary, Dr/Dr. named structures, aliases/surnames, no substitution, middle-name course association, and complete parameterized queries were verified.
  - No live database/model services were used, as required.
- Reviewer: **APPROVED**.
  - Reviewed the exact QA-passed hashes.
  - No blocking findings.
  - Non-blocking: professor normalization/nickname rules overlap with private rules in `lib/professors/directory.ts`; a later cleanup could share the pure rules.
  - Non-blocking: classifier-derived name hints could receive an explicit token/character cap before query construction, although regex extraction is already capped and current classifier prompting limits the normal path.
  - Query parameterization, candidate completeness, deterministic clarification, identity consistency, fallback behavior, maintainability, and error handling were approved.
- Reviewer: pending; do not begin until QA passes.

## Findings

- Final QA: PASS on correction cycle 17.
- Final review: APPROVED with no blocking findings.
- No live database, model-provider, analytics, deployment, or production data changes were used for verification.
