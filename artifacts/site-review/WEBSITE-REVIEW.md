# UIChicago: full website review

Reviewed September 15, 2026.

## Overall verdict: 6.5/10

UIChicago has a compelling core: help a UIC student choose classes and professors, understand the evidence, and then study for those classes. Its strongest feature is the connection between course outcomes and instructors. The visual design is cohesive on desktop, and the study workspace contains considerably more functionality than the homepage communicates.

The biggest limitation is trust. Different parts of the site sometimes disagree about the same facts. Some labels overstate what historical grades or student ratings can prove. The study answer checker also has a reproducible correctness defect. These matter more than adding another page or another AI feature.

My assessment: a useful, ambitious product with a strong foundation, but not yet a consistently dependable student companion.

### Scope and how to read the scores

I ran the local application, reviewed desktop pages at 1440px and mobile pages at 390px, inspected both themes, exercised course search, guest set creation, and Sparky comparisons, and examined the implementation behind study tools, profiles, data displays, and supporting routes. Screenshots and text captures are saved alongside this report.

This reviews the local checkout and data available to it, not a verified production deployment. Scores are qualitative product judgments, not measured conversion rates or a mathematical average. Components means meaningful user-facing features and supporting systems, rather than every React helper function.

- **Observed:** rendered in the browser or directly exercised.
- **Mixed:** browser inspection plus implementation review; not every path tested.
- **Code:** implementation inspected; rating is provisional.
- **Gated:** inaccessible to an ordinary guest; rating concerns the current user experience.

Account synchronization, real group membership, microphone capture, every AI generation mode, and the unlocked planner were not tested end to end. I did not send contact messages, publish study material, delete an account, or modify application source. This is not a full security, accessibility, or production performance audit.

Score guide: 9–10 exceptional; 7–8 strong with clear improvements; 5–6 useful but materially incomplete or inconsistent; 3–4 significant usability/correctness problems; 1–2 absent or unusable for its advertised purpose.

## 1. Component inventory and ratings

### Global design, navigation, and homepage

| Component | Score | What it has and my assessment | Evidence |
|---|---:|---|---|
| Brand and visual identity | 8/10 | UIChicago name, flame mark, Sparky mascot, red academic navigation and purple study accents. Memorable and coherent, although the mascot and flame mark compete slightly. | Observed |
| Desktop navigation | 8/10 | Sticky header, home link, universal academic search, Courses, Professors, My School, SparkyAI, sign-in, settings. Clear and convenient. | Observed |
| Mobile navigation | 5/10 | Responsive header and horizontal links. Sparky is partially clipped on standard pages; My School's header squeezes its navigation into a very narrow scroll area. | Observed |
| Universal course/professor search | 7/10 | Debounced suggestions from both datasets, click-through results, Enter navigation. Needs proper keyboard selection and a clearer “all results” behavior; Enter prefers a course whenever any course result exists. | Mixed |
| Homepage headline and positioning | 7/10 | Strong typography and useful headline. “All of UIC” promises broader navigable coverage than the site currently exposes. | Observed |
| Homepage hero search-like control | 4/10 | Animated prompts and Search button look like an editable input, but the entire component is a link to chat. The appearance and behavior do not match. | Mixed |
| Homepage product buttons | 7/10 | Direct entry into all four products. The Sparky button becomes very faint in light mode. | Observed |
| UIC Snapshot panel | 5/10 | Attractive decorative summary, but mostly repeats nearby navigation and consumes prime space. A real example comparison would be more useful. | Observed |
| Homepage proof statistics | 6/10 | Shows 2,696 courses, 2,640 professors, 460+ organizations. The homepage numbers are hardcoded and lack visible freshness or coverage explanations. | Mixed |
| Product pillars/platform map | 6/10 | Explains capabilities well, but repeats the same four products across multiple sections. “Three ways in” above four product cards is an editorial mismatch. | Observed |
| Deep-page previews | 8/10 | Concrete course and professor examples make the value tangible. Preview figures are hardcoded, so they can drift from real pages. | Mixed |
| Sparky promotional examples | 7/10 | Student-centered prompts communicate possibilities. Label illustrative examples clearly and avoid implying that a static example is a freshly computed response. | Mixed |
| Dark theme | 8/10 | Strong overall hierarchy, color accents, and visual continuity. Some muted labels become too faint and small. | Observed |
| Light/automatic theme | 5/10 | Theme switching works; automatic mode follows 7 AM–7 PM. My School always stays dark, and some light-mode accents lack contrast. Add a system preference option. | Observed |
| Feature tours | 7/10 | Optional short tours exist for major surfaces, which is preferable to forcing onboarding. Their value depends on the underlying workflow being clear without the tour. | Mixed |
| Footer and contact entry points | 7/10 | Contact form, email, methodology link, student-built/unofficial attribution. Would benefit from privacy, data-use, and accessibility information. | Mixed |

### Courses

| Component | Score | What it has and my assessment | Evidence |
|---|---:|---|---|
| Course explorer | 8/10 | Large searchable catalog with title/code/topic matching, enrollment counts, GPA, easiness, saves, and pagination. CS 211 search returned the correct single result. | Observed |
| Course filters | 7/10 | Department, major, Gen Ed category, saved-only, requirement type, active filter chips, and clear-all. Add level, credits, and current-term availability. | Observed |
| Department taxonomy | 4/10 | Course subjects include malformed-looking combinations such as “CHEM 122 + CHEM.” Professor departments mix abbreviations and names. Clean this at the data layer. | Observed |
| Course sorting/default results | 5/10 | Easiest/hardest toggle is simple, but the default list is dominated by specialized and graduate courses with near-perfect GPAs. It is a weak starting point for a typical undergraduate. | Observed |
| Course list layout and pagination | 7/10 | Compact desktop rows and mobile cards work. Fifty rows make a long page; navigation near the bottom would reduce backtracking. | Observed |
| Course header | 7/10 | Title, subject, credits, usual terms, GPA, easiness, enrollment, and save action. Useful summary, undermined by a credit contradiction in the inspected course. | Observed |
| Grade distribution | 8/10 | Donut chart plus grade percentages/counts, totals, and excluded outcome counts. The numeric legend is useful. Needs term range and a clearer explanation of “Other.” | Observed |
| Quick Insights | 7/10 | GPA, easiness, pass rate, withdrawal rate, most common grade, students counted. Helpful, but duplicates header metrics and needs more precise definitions. | Observed |
| GPA by professor | 8/10 | One of the site's strongest features: instructor GPA, RMP rating, graded count, registration count, linked profiles. Code excludes instructor rows with fewer than 20 letter-grade outcomes. | Mixed |
| Course description/prerequisites | 7/10 | Detailed descriptions and linked prerequisite course references. Prerequisites should be easier to scan and closer to the decision area. | Observed |
| Course follow-up actions | 7/10 | Related courses, instructor lead, Sparky handoff, previous/next browsing. “Best professor lead” overstates a ranking based on GPA. | Observed |
| Syllabus surface | 3/10 | A “coming soon” component and submission infrastructure exist, but a complete student-facing syllabus library was not observed. The component's existence is not the same as a launched library. | Code |
| Missing-course reporting | 7/10 | A useful correction channel in the explorer. Add a visible status or acknowledgment after a report is processed. Delivery was not tested. | Mixed |

### Professors

| Component | Score | What it has and my assessment | Evidence |
|---|---:|---|---|
| Professor explorer | 8/10 | Ratings, review volume, department context, course links, saved filtering, and unrated instructors. Strong discovery surface. | Observed |
| Professor filters/sorting | 7/10 | Department, minimum stars, minimum reviews, highest/lowest rating, most reviews, and salary sorts. Better department normalization would make these substantially stronger. | Observed |
| Ranking/confidence signals | 6/10 | Review count and confidence-style labels improve on naked star ratings. The UI needs exact ranking rules, sample limits, and refresh dates. | Mixed |
| Professor profile | 7/10 | Rating, overall and department rank, review count, summary, department/school, salary, RMP link, saves, course rankings, related professors. Comprehensive but repetitive. | Observed |
| Professor summary | 4/10 | Easy to read, but the inspected summary disagreed with its course-ranking table and used strongly reassuring language without clear evidence boundaries. | Observed |
| Course ranking table | 5/10 | Valuable course-specific context, but the inspected profile showed FIN 300 twice with different titles and identical ranks. | Observed |
| Similar professor suggestions | 7/10 | Links based on department/course overlap reduce dead ends. Label whether a recommendation means similar teaching history, stronger ratings, or simply shared subjects. | Observed |
| Salary information | 5/10 | Interesting secondary transparency feature. It needs source/year context and should not occupy the same decision priority as teaching information. | Observed |
| External RMP link | 8/10 | Good evidence escape hatch. Keep it visible near the summary and distinguish imported review signals from site-generated commentary. | Observed |
| Saved professors and personal notes | 7/10 | Bookmark and note controls are implemented, with account-backed saved lists. End-to-end signed-in persistence was not tested. | Code |
| Missing-professor reporting | 7/10 | Useful way to improve incomplete coverage. Needs the same acknowledgment/status discipline as course corrections. | Mixed |

### SparkyAI

| Component | Score | What it has and my assessment | Evidence |
|---|---:|---|---|
| Chat layout/composer | 8/10 | Focused conversation area, mascot, composer, stop/send controls, history sidebar, and response actions. Polished on desktop. | Observed |
| Topic discovery | 7/10 | Courses, professors, costs, housing, campus life, dining, athletics, campus, health, registration, admissions, careers, international, safety. Excellent breadth, though horizontally hidden topics are easy to miss. | Observed |
| Suggested questions | 6/10 | Reduces blank-page anxiety, but random initial selection caused a reproducible server/client rendering mismatch. | Mixed |
| Academic answer consistency | 4/10 | A live CS 211 comparison disagreed with course-page RMP ratings and some GPA values. This is the most important AI issue observed. | Observed |
| Evidence and uncertainty communication | 5/10 | Beta caveat and data-rich answers help, but confident “best for learning” conclusions exceeded what the displayed grade/review evidence establishes. | Observed |
| Contextual page handoffs | 8/10 | Course/professor links and prefilled comparison prompts can connect research into a single workflow. This is a real differentiator. | Mixed |
| Chat history | 8/10 | Local guest history plus account synchronization paths, new chats, rename/delete logic. Useful without mandatory signup; account sync was not tested. | Mixed |
| Voice/file-related chat support | 6/10 | Voice controls and file-related composer logic exist. Browser support and a complete attachment/voice workflow were not verified. | Code |
| Campus knowledge coverage | 7/10 | Broad topic prompts, knowledge data, retrieval, and news import infrastructure. This is coverage infrastructure, not proof that every answer is current or correct. | Code |

### My School and study tools

| Component | Score | What it has and my assessment | Evidence |
|---|---:|---|---|
| Workspace shell/sidebar | 8/10 | Home, library, groups, folders, planner, flashcards, notes, guides, search, quick-create. Feels like a real application. Mobile global navigation needs work. | Observed |
| First-use dashboard | 6/10 | Clear first-set CTA, review queue, resume card, weekly recap, streak, sessions, best test. Too many empty cards repeat “create a set.” | Observed |
| Library and folders | 8/10 | Notes and sets, search, folders/subfolders, move/rename flows, organizational views. Strong foundation for repeat use. | Mixed |
| Manual flashcard builder | 7/10 | Terms/definitions, images, import, duplication, delete, ordering, visibility, folder selection, create-and-practice. More capable than a basic card editor. | Mixed |
| AI flashcard generation | 7/10 | Smart Assist from source text, with large input allowance and generation controls. Needs clear provenance and easy quality review. AI output quality was not benchmarked. | Code |
| Flashcard practice | 8/10 | Card flipping, navigation, speech/image support, shuffle/star-related controls, multiple study modes. A coherent practice surface. | Mixed |
| Learn mode | 6/10 | Repeated practice, hints, answer explanations, feedback, progress-oriented flow. Benefit depends on question quality and honest mastery estimates. | Code |
| Test/exam mode | 5/10 | Multiple choice, true/false, matching, written answers, configuration, results, and mistake-deck logic. The answer-grading defect lowers the current score substantially. | Code |
| Written-answer correctness | 2/10 | Direct tests confirmed the matcher accepts “12” for “120,” “cat” for “catalyst,” and “not correct” for “correct.” Blank input also passes the helper. | Direct function test |
| Match game | 7/10 | Timed term-definition matching and best-score tracking offer a lighter practice mode. Not fully played through during this review. | Code |
| Review scheduling/mastery | 6/10 | Due cards, mastery changes, repeated review, and suggested next work are implemented. Scheduling uses simple thresholds; mastery should not imply proven long-term retention. | Code |
| Notes editor | 8/10 | Autosaved drafts, course/title fields, writing/study/transcript views, private/public controls, search, pin/favorite support, and flashcard handoff. Strong adjacent workflow. | Mixed |
| Lecture recording/transcription | 6/10 | Record/pause/stop interface, transcript preview, processing states, transcription and structuring routes. Promising, but microphone/transcription success was not verified. | Code |
| AI study guide builder | 8/10 | Title, course, subject, source notes, preview-before-saving, private output, optional flashcards generated alongside the guide. One of the best-connected feature ideas already present. | Mixed |
| Public sets/notes and sharing | 6/10 | Public/private models, search routes, set sharing, and moderation helpers. Discovery quality, attribution, and abuse handling need real usage validation. | Code |
| Study groups | 6/10 | Create/join interface, invite link/code, membership, shared sets/notes. The guest surface is understandable; real membership and collaboration were not tested. | Mixed |
| My Picks/recent exploration | 7/10 | Saved academic choices and comparison prompts connect discovery to the workspace. The My Picks panel appears only after enough authenticated saves, so many new users may never discover it. | Code |
| Degree planner | 3/10 | Public navigation leads to a password gate. Code includes major selection, completed/current courses, plan length, semesters, and generated roadmaps, but ordinary users cannot complete the advertised journey. | Gated/code |

### Account, transparency, and supporting systems

| Component | Score | What it has and my assessment | Evidence |
|---|---:|---|---|
| Sign-in/guest model | 7/10 | Google sign-in with useful guest study/chat paths. Make “saved on this device” versus “synced to account” obvious at the point of saving. | Mixed |
| Student profile | 7/10 | Major, academic context, current/completed courses, honors context, avatar/photo, and saved academic items. Potentially valuable shared context; signed-in flow was not tested. | Code |
| Settings | 7/10 | Local/synced appearance, contact, profile link, connected account, account deletion. Clear basic scope, but export and detailed data controls are missing from the reviewed UI. | Mixed |
| Methodology | 5/10 | Honest student-built attribution, source categories, and limitations. Too general to explain the displayed ranking and easiness calculations precisely. | Observed |
| Feedback collection | 7/10 | Contextual reporting and site feedback after 30 minutes of visible-page time, with repeat-prompt controls. Good intent; avoid interrupting exams or active work. | Code |
| Accessibility foundation | 5/10 | Responsive layouts, some named controls, and numeric chart legends help. Small muted labels, search semantics, clipped navigation, and dialog/focus behavior deserve a dedicated audit. | Mixed |
| Search/share metadata | 4/10 | Root title/description/icon exist. No page-specific metadata, sitemap, or structured-data implementation was found in the inspected app source. | Code |
| Maintainability | 4/10 | Useful domain helpers exist, but the study workspace is over 8,300 lines, chat UI nearly 3,000, and notes around 1,500. Coupled state and duplicated presentation rules increase regression risk. | Code |
| AI operations/admin tools | 7/10 | Analytics, query logging, feedback, export, regression evaluation, and improvement scripts show serious operational effort. Their existence does not establish that current answers pass a quality gate. | Code |
| Access/cost controls | 4/10 | Planner password is stored in source. Reviewed AI generation/transcription handlers invoke services without visible route-level authentication or rate limits. Deployment controls may exist elsewhere; this needs a focused follow-up review. | Code |

## 2. Most important concrete findings

### A. The same academic facts disagree across surfaces

**Course credits:** CS 211's header says **3 credit hours**, while its description says **Course Information: 2 hours**. The review cannot determine which reflects the correct catalog year. The site should not silently show both.

**Professor ranks:** William O'Brien's summary says FIN 300 is **#1/8**, while the table says **#1 of 12**. The summary also references **1,263** as its overall ranking population, while the explorer shows **2,640 professors**. Rated versus total population could explain the latter, but the UI does not make that distinction clear.

**Duplicate course rows:** FIN 300 appears twice on that profile, with “Intro to Fin - Bus Scholar” and “Intro to Finance.” If these are meaningful variants, label the distinction; otherwise merge the course identity.

**Sparky versus course page:** The CS 211 page shows Koehler's RMP as **2.7**; the tested Sparky response says **4.3/5 across 58 reviews**. The completed response compares only two instructors, while the course page shows four qualifying instructor rows. These may come from different snapshots, matching logic, or aggregation rules. Whatever the cause, the student sees incompatible answers without an explanation.

The completed AI answer also describes 3.07 versus 2.87 as “half a letter grade”; the numerical gap is 0.20 GPA points. Even a neatly formatted table needs grounded interpretation.

**Fix:** use shared, versioned course/professor records for pages, summaries, previews, and AI answers. Carry source, update date, covered terms, and denominator through the entire pipeline. Regenerate stored summaries whenever those records change. Add an automated check that asks Sparky for a course comparison and compares its cited figures with the page's source records.

### B. The written-answer matcher is too permissive

The helper uses substring matching and a short edit-distance allowance. Directly running the current implementation accepted all of these:

| Submitted answer | Expected answer | Current result |
|---|---|---|
| `12` | `120` | Accepted |
| `cat` | `catalyst` | Accepted |
| `not correct` | `correct` | Accepted |
| Empty string | `photosynthesis` | Accepted by the helper |

The test grading path calls this helper for written-style questions. I did not reproduce every blank-answer path through the interface, but the underlying behavior is confirmed.

**Fix:** reject empty answers, compare numbers exactly unless a deliberate tolerance applies, accept explicit aliases, and make typo tolerance depend on answer length and question type. For longer written responses, show a rubric or ask students to self-assess when automatic evaluation is uncertain. Do not present inflated scores as mastery.

### C. “Easiness” and “best” need stricter meanings

The course score increases toward easy, but some chat wording calls it “Difficulty.” A displayed **1.7/5** is easy to misread without a direction cue.

On CS 211, “Best professor lead” means the linked instructor with the highest observed GPA. Sparky also inferred teaching quality and workload management from outcome/review signals. Those are useful clues, not direct measurements of learning.

**Fix:** label “Easiness — 5 is easiest,” “Highest historical GPA,” “Student rating,” and “Learning fit” separately. Let students prioritize grades, clarity, workload, or teaching style. Avoid a single winner unless the preference and evidence support it.

### D. Pass-rate and missing-data wording can mislead

The page explicitly defines passing as A/B/C/D, which is helpful, but its prerequisites also mention C-or-better requirements. A student might mistake the displayed pass percentage for the probability of satisfying their next course's prerequisite.

The code also defaults pass/withdrawal rates to 0 when there are no visible outcomes, and the most-common-grade reduction starts at A. That can produce misleading empty-data summaries. This was identified in code rather than reproduced on a particular empty course page.

**Fix:** show both “D or better” and “C or better,” define denominators, and use “No data” instead of a percentage or grade when the sample is empty.

### E. Mobile fit is not the same as mobile usability

The six checked mobile surfaces stayed within the 390px document width. That is good. However, global nav items were clipped inside horizontal scrolling regions, especially My School's header. The standard mobile header also consumes substantial vertical space before content.

**Fix:** put all primary destinations in an obvious menu or compact bottom navigation. Keep search accessible, but reduce duplicate header rows. Verify the on-screen keyboard, focused inputs, dialogs, and sticky bottom controls on a real phone.

### F. Homepage behavior and promises need tightening

The hero “search” cannot accept text; it links to chat. Four products are repeatedly described in multiple sections. The planner is promoted inside My School messaging but opens a private password screen. The site advertises organizations without a dedicated organization directory in the route inventory.

**Fix:** make the hero a real search/question field or clearly call it “Ask Sparky.” Replace repeated product summaries with one successful student workflow. Mark the planner as private preview beside its link. Explain that organization knowledge currently lives through Sparky rather than implying a browsable directory.

### G. Chat has a reproducible rendering mismatch

The browser recorded a hydration error: the server's suggested question did not match the client's initial suggested question. The code uses randomized prompt selection.

**Fix:** make initial questions deterministic, or rotate them after the first client render. Do not dismiss this solely as a development badge; the underlying server/client mismatch deserves correction.

### H. Small-deck creation leads to an empty practice screen

I created a guest deck with two complete cards, confirmed the save dialog, and chose Create and practice. The app routed into Learn and displayed “No cards available to learn right now.” The deck and both cards were present in local storage and the library after reload, so this was a practice-entry problem, not a demonstrated save failure.

**Fix:** support small decks in an appropriate practice mode or explain the minimum-card requirement before entering Learn. A successful creation flow should lead directly to something the student can use.

### I. Inconsistent colors undermine comparison

Course header, insight cards, and shared difficulty helpers use different thresholds. The same score can receive different visual treatment depending on component. The light-mode Sparky CTA is visibly washed out.

**Fix:** centralize score thresholds, labels, and colors in one shared module. Use theme-specific accessible foreground/background pairs and do not rely on color alone.

## 3. What I like most

1. **Course outcomes connected to professor decisions.** This answers a concrete student problem better than separate lists of classes and star ratings.
2. **Sample sizes are often visible.** Counts next to GPA and ratings are valuable and worth making even more prominent.
3. **The site has useful guest functionality.** Students can explore before committing to an account.
4. **My School has a coherent underlying workflow.** Notes can become guides and flashcards, then practice and review. These features reinforce one another.
5. **The visual identity has character.** Dark surfaces, restrained accent colors, strong typography, and Sparky give it a recognizable feel.
6. **There are thoughtful continuation paths.** Related professors, related courses, saves, and prefilled chat prompts reduce dead ends.
7. **You have correction and evaluation infrastructure.** Missing-data reports, feedback, analytics, and regression tooling are the right foundations for improving a data-heavy product.

## 4. What I do not like

1. **Confident language when records disagree.** This is the biggest trust problem.
2. **Too much emphasis on easiest/highest GPA.** Students also care about preparation, teaching clarity, workload, and fit.
3. **Repeated homepage explanation.** The page spends too much space reintroducing the same destinations.
4. **The fake-input hero.** It violates a familiar interaction expectation.
5. **Empty-dashboard repetition.** Several cards explain that there is no data yet and ask the student to create something.
6. **Small, faint utility text.** It looks tidy in screenshots but requires effort to read.
7. **Planner availability is unclear until after the click.** A private feature can exist, but its status should be visible upfront.
8. **Salary feels over-prioritized.** It is interesting information, but a weaker answer to “which section should I choose?”
9. **The product feels broader than its common workflow.** Discovery, chat, study, and planning need a stronger shared student/course context.

## 5. Improvements to existing features, in priority order

### First: make the current product trustworthy

- Correct written-answer grading and cover the demonstrated false positives with regression checks.
- Reconcile course credits, course identities, professor matches, ratings, and summaries.
- Give Sparky the same canonical facts used by course/professor pages.
- Show update dates, term ranges, sources, sample sizes, and missing-data states.
- Define all metrics beside their displays; separate highest GPA from best teaching fit.
- Fix the chat rendering mismatch.

**Success condition:** a student can compare a course page, professor page, and Sparky answer without seeing unexplained contradictions.

### Next: make the central decision flow easier

- Improve undergraduate default course results; add level and credit filters.
- Normalize department names and aliases.
- Replace the hero's search-like link with a real input or a truthful CTA.
- Add visible status to private/preview features.
- Consolidate homepage sections.
- Make mobile navigation fully discoverable.
- Standardize metric color and typography rules.

**Success condition:** a new student can find a relevant class and compare suitable instructors within a few minutes, without learning the site's terminology.

### Then: strengthen the study workflow

- Replace empty dashboard widgets with one first-use sequence: paste notes → review output → practice five cards.
- Make save location and sync state visible.
- Keep links back to the notes/source passage behind generated material.
- Improve numerical, short-answer, and written-response grading separately.
- Give review recommendations a reason: “You missed these three concepts yesterday.”
- Split the large workspace into library, editor, practice, assessment, sharing, and persistence modules.

**Success condition:** a student creates material, completes practice, and returns to a useful next session without losing context or receiving misleading scores.

## 6. New features and ideas worth considering

These are product proposals, not claims that the site already supports them. Value and effort are relative estimates, not delivery commitments.

| Idea | Value | Effort | Why it fits |
|---|---|---|---|
| Side-by-side comparison tray | Very high | Medium | Select 2–4 courses/professors; compare GPA, rating, sample, terms, prerequisites, workload signals, and saved notes on one screen. Existing AI comparisons are a good starting point. |
| Source and freshness drawer | Very high | Medium | Click any metric to see its source, covered terms, exclusions, and refresh date. Makes your existing data more useful immediately. |
| Current-semester course hub | Very high | Medium | Each enrolled course becomes a home for professor, notes, decks, deadlines, syllabus, and upcoming reviews. Connects your four products. |
| Syllabus-to-calendar import | High | Medium–high | Extract assignments/exams into a reviewable draft, then export calendar events after student confirmation. Builds on notes/planning. |
| Prerequisite map | High | Medium–high | Visually show what a course unlocks and which requirements are still missing, tied to catalog year. |
| Registration comparison workspace | High | High | Compare actual sections, meeting times, labs, instructor choices, and conflicts. Requires reliable current schedule data. |
| Historical grade trends | High | Medium | Show term-by-term distributions and sample sizes instead of only all-time aggregates. Makes changes and stale signals visible. |
| Evidence-backed study answers | High | Medium | Every generated card or quiz explanation can point to the exact source passage, with a “this is wrong” correction action. |
| Semester workload sandbox | High | Medium–high | Combine credits, course signals, work/commute commitments, and deadlines. Show assumptions and ranges rather than pretending to know an exact workload. |
| Personal decision notes | Medium–high | Low–medium | Expand current professor notes to course comparisons: “Backup if morning section fills,” “Ask advisor about prerequisite.” |
| Guided demo course/deck | Medium–high | Low | Let guests experience a complete example study session before creating content. Keep demo material clearly labeled. |
| Course-material quality signals | Medium–high | Medium | For shared notes/decks: course/term, author attribution, correction history, last updated date, and reports. |
| Advisor-ready plan export | High | Medium | Export selected courses, assumptions, unresolved prerequisites, and questions for a real advising meeting. |
| Study backup/export | High | Medium | Download personal notes/cards and clearly distinguish local storage from cloud synchronization. |
| Organization finder | Medium | Medium | Turn advertised organization coverage into a browsable directory by interests, meeting schedule, and verified links, if the dataset supports it. |
| Commuter view | Medium–high | High | Group classes, study gaps, quiet spaces, and travel constraints into a daily view. Needs dependable location/schedule information. |

### My top three bets

**1. A real comparison tray.** This makes your best existing information easier to use without requiring a perfect AI answer.

**2. A current-semester course hub.** This changes the site from something students visit during registration into something they use each week.

**3. Evidence-backed AI study material.** “Show me where this answer came from” is more valuable than simply generating more cards.

### Ideas I would postpone

- A general social feed: difficult to keep useful and active.
- More AI personalities: adds interface choices before fixing factual consistency.
- Expanding to other universities: multiplies data-quality work before the UIC foundation is stable.
- Heavy gamification: first ensure scores and mastery reflect actual performance.
- Monetization complexity: first establish which dependable workflow brings students back.

## 7. Product direction I would choose

**Help UIC students choose the right classes, then succeed in them.**

The path should feel continuous:

1. Find courses that meet a student's requirements.
2. Compare instructors and evidence.
3. Save a semester shortlist.
4. Turn selected courses into personal workspaces.
5. Add notes and study material.
6. Return for the next useful review session.

Sparky can help at each step, but students should also be able to inspect the facts directly.

A useful homepage structure would be: specific promise → real search → one real comparison example → how it becomes a study workspace → clear data/source explanation. That is enough to explain the product without repeating four product cards several times.

## 8. Measures to track

- Search-to-detail-page rate, broken down by course and professor.
- Detail-page-to-save or comparison rate.
- How often compared facts disagree across surfaces in automated checks.
- Time from first study visit to first completed practice session.
- Return rate for students who created a set, rather than visits alone.
- AI-answer correction rate and unsupported-number rate.
- Failed saves/syncs, generation failures, and recoverability.
- Mobile task completion, particularly navigation and course comparison.

Avoid treating total chatbot messages or the number of generated flashcards as the primary proof of value. A successful student decision or completed learning session is more meaningful.

## 9. Evidence locations and implementation pointers

- Homepage behavior: `app/page.tsx`, `app/components/HeroSearchBar.tsx`, `app/components/DeepPageShowcase.tsx`.
- Navigation and themes: `app/components/Navbar.tsx`, `app/settings/SettingsPageClient.tsx`.
- Course detail and metric computation: `app/courses/[subject]/[number]/page.tsx`, `app/components/course/`.
- Professor summary/table: `app/professors/[slug]/page.tsx`.
- Chat prompt rendering: `app/chat/page.tsx`; recorded errors in `browser-errors.json`.
- Study scoring: `lib/study/engine.ts` (`fuzzyMatch`) and `app/study/study-workspace.tsx` (`gradeQuestion`).
- Planner gate: `middleware.ts`, `lib/private-access.ts`.
- Recorded browser interactions: `interactions.json`; guest deck persistence and empty practice result: `study-interactions.json`. The earlier “reload persistence” boolean only checked visible title text in Learn; the later storage/library check confirms the deck did persist.
- Screenshots: homepage, explorers, details, chat, study, notes, groups, guide creation, mobile variants, and light theme in this directory.

## Final opinion

The best thing about UIChicago is that it can connect information students usually have to piece together themselves. The biggest thing holding it back is inconsistent evidence presented with too much certainty. I would spend the next development cycle making comparisons, grading, data definitions, and mobile navigation dependable. Then build a course hub and comparison tray around that foundation.

You already have enough features to make a useful product. Making those features agree, connect, and earn repeat use is the highest-value next step.
