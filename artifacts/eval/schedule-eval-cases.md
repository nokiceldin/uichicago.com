# Sparky Schedule Eval — 20 Majors

For each case: send the QUERY to Sparky, compare the response against EXPECTED SCHEDULE.
Sparky should output all the correct semesters with the right fixed courses.
Elective slots will be filled dynamically — check that the *structure* and *fixed courses* match.

---

## Case 1: Computer Science - BS

**Query:** Make me a full 4-year plan for Computer Science - BS

**Expected:** 8 semesters, ~128h total

**Expected Schedule:**

### Freshman Year - First Semester (14h)
- MATH 180 — Calculus I (4 cr)
- CS 111 — Program Design I or Program Design I in the Context of Biological Problems or Program Design I in the Context of Law and Public Policy (3 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- (elective) — Science Elective (4 cr) [science_elective]
- ENGR 100 — Engineering Success Seminar for Freshmen (1 cr)

### Freshman Year - Second Semester (16h)
- MATH 181 — Calculus II (4 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — General Education Core course (3 cr) [gen_ed_any]
- CS 141 — Program Design II (3 cr)
- CS 151 — Mathematical Foundations of Computing (3 cr)

### Sophomore Year - First Semester (17h)
- MATH 210 — Calculus III (3 cr)
- (elective) — Science Elective (4 cr) [science_elective]
- CS 211 — Programming Practicum (3 cr)
- CS 251 — Data Structures (4 cr)
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Sophomore Year - Second Semester (16h)
- CS 261 — Machine Organization (4 cr)
- CS 301 — Languages and Automata (3 cr)
- (elective) — Required Mathematics course (3 cr) [required_math]
- (elective) — Humanities/Social Science/Art Elective (3 cr) [humanities_elective]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Junior Year - First Semester (17h)
- CS 361 — Systems Programming (4 cr)
- CS 362 — Computer Design (4 cr)
- CS 342 — Software Design (3 cr)
- (elective) — Required Mathematics course (3 cr) [required_math]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Junior Year - Second Semester (16h)
- CS 277 — Technical and Professional Communication in Computer Science (3 cr)
- CS 341 — Programming Language Design and Implementation (3 cr)
- (elective) — Required Mathematics course (3 cr) [required_math]
- (elective) — Humanities/Social Sciences/Art Elective (3 cr) [humanities_elective]
- (elective) — Free Elective (4 cr) [free_elective]

### Senior Year - First Semester (17h)
- CS 377 — Ethical Issues in Computing (3 cr)
- CS 401 — Computer Algorithms I (3 cr)
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — General Education Core course (3 cr) [gen_ed_any]
- (elective) — Free Elective (2 cr) [free_elective]

### Senior Year - Second Semester (15h)
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Free Elective (3 cr) [free_elective]
- CS 499 — Professional Development Seminar (0 cr)

---

## Case 2: Finance - BS

**Query:** Make me a full 4-year plan for Finance - BS

**Expected:** 8 semesters, ~120h total

**Expected Schedule:**

### Freshman Year – First Semester (15h)
- BA 101 — Business First-Year Seminar (1 cr)
- ECON 120 — Principles of Microeconomics (3 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- COMM 100 — Fundamentals of Human Communication (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Freshman Year – Second Semester (15h)
- BA 100 — Introduction to Professional Development (1 cr)
- BA 111 — Business Decision-Making (3 cr)
- ACTG 210 — Introduction to Financial Accounting (3 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Sophomore Year – First Semester (16h)
- MGMT 340 — Introduction to Organizations (3 cr)
- ACTG 211 — Introduction to Managerial Accounting (3 cr)
- FIN 300 — Introduction to Finance (3 cr)
- IDS 270 — Business Statistics I (4 cr)
- MKTG 360 — Introduction to Marketing (3 cr)

### Sophomore Year – Second Semester (14h)
- BA 200 — Business Communication (3 cr)
- BA 220 — Business Professional Development II (1 cr)
- IDS 200 — Intro to Management Information Systems (4 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]

### Junior Year – First Semester (16h)
- BA 320 — Civic Engagement (1 cr)
- ECON 121 — Principles of Macroeconomics (3 cr)
- IDS 355 — Operations Management (3 cr)
- MGMT 350 — Business and Its External Environment (3 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Advanced Quantitative Skills course (3 cr) [elective_general]

### Junior Year – Second Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – First Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (3 cr) [elective_general]
- (elective) — Global Business Perspectives course (3 cr) [global_biz]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – Second Semester (14h)
- (elective) — Competitive Strategy course (4 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (4 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---

## Case 3: Accounting - BS

**Query:** Make me a full 4-year plan for Accounting - BS

**Expected:** 8 semesters, ~120h total

**Expected Schedule:**

### Freshman Year – First Semester (15h)
- BA 101 — Business First-Year Seminar (1 cr)
- ECON 120 — Principles of Microeconomics (3 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- COMM 100 — Fundamentals of Human Communication (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Freshman Year – Second Semester (15h)
- BA 100 — Introduction to Professional Development (1 cr)
- BA 111 — Business Decision-Making (3 cr)
- ACTG 210 — Introduction to Financial Accounting (3 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Sophomore Year – First Semester (16h)
- MGMT 340 — Introduction to Organizations (3 cr)
- ACTG 211 — Introduction to Managerial Accounting (3 cr)
- FIN 300 — Introduction to Finance (3 cr)
- IDS 270 — Business Statistics I (4 cr)
- MKTG 360 — Introduction to Marketing (3 cr)

### Sophomore Year – Second Semester (14h)
- BA 200 — Business Communication (3 cr)
- BA 220 — Business Professional Development II (1 cr)
- IDS 200 — Intro to Management Information Systems (4 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]

### Junior Year – First Semester (16h)
- BA 320 — Civic Engagement (1 cr)
- ECON 121 — Principles of Macroeconomics (3 cr)
- IDS 355 — Operations Management (3 cr)
- MGMT 350 — Business and Its External Environment (3 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Advanced Quantitative Skills course (3 cr) [elective_general]

### Junior Year – Second Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – First Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (3 cr) [elective_general]
- (elective) — Global Business Perspectives course (3 cr) [global_biz]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – Second Semester (14h)
- (elective) — Competitive Strategy course (4 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (4 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---

## Case 4: Nursing - BS

**Query:** Make me a full 4-year plan for Nursing - BS

**Expected:** 4 semesters, ~63h total

**Expected Schedule:**

### Junior Year - Fall Semester (16h)
- NURS 409 — Health Assessment and Communications (5 cr)
- NURS 411 — Foundations of Nursing Practice (7 cr)
- NURS 419 — Pathophysiology and Pharmacology 1 (4 cr)

### Junior Year - Spring Semester (16h)
- NURS 420 — Patho-Pharm 2 (3 cr)
- NURS 423 — Adult Health Nursing 1 (7 cr)
- NURS 443 — Nursing Care of Women and Childbearing Families (4 cr)
- NURS 463 — Psychiatric-Mental Health Nursing (4 cr)
- NURS 228 — Readiness for Professional Nursing Practice (2 cr)

### Senior Year - Fall Semester (17h)
- NURS 433 — Adult Health Nursing 2 (6 cr)
- NURS 453 — Pediatric Health Nursing (4 cr)
- NURS 473 — Population Health Nursing (4 cr)
- NURS 443 — Nursing Care of Women and Childbearing Families (4 cr)
- NURS 463 — Psychiatric-Mental Health Nursing (4 cr)
- NURS 438 — Introduction to Evidence-Based Practice (3 cr)

### Senior Year - Spring Semester (14h)
- NURS 458 — Transition to Professional Nursing Practice (4 cr)
- NURS 448 — Leadership in Professional Nursing Practice (6 cr)
- NURS 453 — Pediatric Health Nursing (4 cr)
- NURS 473 — Population Health Nursing (4 cr)

---

## Case 5: Mechanical Engineering - BS

**Query:** Make me a full 4-year plan for Mechanical Engineering - BS

**Expected:** 8 semesters, ~128h total

**Expected Schedule:**

### Freshman Year - First Semester (18h)
- ENGR 100 — Engineering Success Seminar for Freshmen a (1 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- MATH 180 — Calculus I (4 cr)
- CHEM 122 — Matter and Energy (3 cr)
- CHEM 123 — Foundations of Chemical Inquiry I (2 cr)
- ME 250 — Introduction to Engineering Design and Graphics (3 cr)
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Freshman Year - Second Semester (17h)
- MATH 181 — Calculus II (4 cr)
- PHYS 141 — General Physics I (Mechanics) (4 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- CS 109 — Programming for Engineers with MatLab (3 cr)
- (elective) — General Education Core Course (3 cr) [gen_ed_any]

### Sophomore Year - First Semester (16h)
- MATH 210 — Calculus III (3 cr)
- PHYS 142 — General Physics II (Electricity and Magnetism) (4 cr)
- IE 201 — Financial Engineering (3 cr)
- CME 201 — Statics (3 cr)
- ECE 210 — Electrical Circuit Analysis (3 cr)

### Sophomore Year - Second Semester (15h)
- MATH 218 — Applied Linear Algebra (3 cr)
- MATH 220 — Introduction to Differential Equations (3 cr)
- CME 203 — Strength of Materials (3 cr)
- ME 205 — Introduction to Thermodynamics (3 cr)
- ME 210 — Engineering Dynamics (3 cr)

### Junior Year - First Semester (16h)
- ME 211 — Fluid Mechanics I (4 cr)
- ME 320 — Mechanisms and Dynamics of Machinery (3 cr)
- ME 347 — Engineering Design and Graphics with Computer-Aided Design and Simulation (3 cr)
- ME 380 — Manufacturing Process Principles (3 cr)
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Junior Year - Second Semester (16h)
- ME 321 — Heat Transfer (4 cr)
- ME 328 — Numerical Methods in Mechanical Engineering (3 cr)
- ME 370 — Mechanical Engineering Design (3 cr)
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year - First Semester (15h)
- ME 312 — Dynamic Systems and Control (3 cr)
- ME 396 — Senior Design I (3 cr)
- IE 342 — Probability and Statistics for Engineers (3 cr)
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Technical Elective (3 cr) [technical_elective]

### Senior Year - Second Semester (15h)
- ME 341 — Experimental Methods in Mechanical Engineering (3 cr)
- ME 397 — Senior Design II (3 cr)
- ME 499 — Professional Development Seminar (0 cr)
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Elective Outside the Major Rubric (3 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---

## Case 6: Psychology - BS with a Major

**Query:** Make me a full 4-year plan for Psychology - BS with a Major

**Expected:** 8 semesters, ~78h total

**Expected Schedule:**

### First Year - Fall Semester (Noneh)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- MATH 105 — Mathematical Reasoning or Intermediate Algebraic Concepts (4 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### First Year - Spring Semester (Noneh)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- PSCH 100 — Introduction to Psychology (4 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Fall Semester (16h)
- PSCH 242 — Introduction to Research in Psychology (3 cr)
- (elective) — Psychology Elective a (3 cr) [elective_general]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Spring Semester (16h)
- (elective) — Psychology Elective b,c (3 cr) [elective_general]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — Electives (3 cr) [elective_general]

### Third Year - Fall Semester (16h)
- PSCH 343 — Statistical Methods in Behavioral Science d (4 cr)
- (elective) — Psychology Selective b,c (3 cr) [elective_general]
- (elective) — General Education Requirement course/Elective (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course/Elective (3 cr) [gen_ed_any]
- (elective) — Electives (3 cr) [elective_general]

### Third Year - Spring Semester (15h)
- (elective) — Psychology Elective d (3 cr) [elective_general]
- (elective) — Psychology Elective d (3 cr) [elective_general]
- (elective) — Electives (9 cr) [elective_general]

### Fourth Year - Fall Semester (15h)
- (elective) — PSCH Selective - Lab Course (WID) e (3 cr) [elective_general]
- (elective) — Electives (12 cr) [elective_general]

### Fourth Year - Spring Semester (Noneh)
- (elective) — Electives (13 cr) [elective_general]

---

## Case 7: Marketing - BS

**Query:** Make me a full 4-year plan for Marketing - BS

**Expected:** 8 semesters, ~120h total

**Expected Schedule:**

### Freshman Year – First Semester (15h)
- BA 101 — Business First-Year Seminar (1 cr)
- ECON 120 — Principles of Microeconomics (3 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- COMM 100 — Fundamentals of Human Communication (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Freshman Year – Second Semester (15h)
- BA 100 — Introduction to Professional Development (1 cr)
- BA 111 — Business Decision-Making (3 cr)
- ACTG 210 — Introduction to Financial Accounting (3 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Sophomore Year – First Semester (16h)
- MGMT 340 — Introduction to Organizations (3 cr)
- ACTG 211 — Introduction to Managerial Accounting (3 cr)
- FIN 300 — Introduction to Finance (3 cr)
- IDS 270 — Business Statistics I (4 cr)
- MKTG 360 — Introduction to Marketing (3 cr)

### Sophomore Year – Second Semester (14h)
- BA 200 — Business Communication (3 cr)
- BA 220 — Business Professional Development II (1 cr)
- IDS 200 — Intro to Management Information Systems (4 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]

### Junior Year – First Semester (16h)
- BA 320 — Civic Engagement (1 cr)
- ECON 121 — Principles of Macroeconomics (3 cr)
- IDS 355 — Operations Management (3 cr)
- MGMT 350 — Business and Its External Environment (3 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Advanced Quantitative Skills course (3 cr) [elective_general]

### Junior Year – Second Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – First Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (3 cr) [elective_general]
- (elective) — Global Business Perspectives course (3 cr) [global_biz]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – Second Semester (14h)
- (elective) — Competitive Strategy course (4 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (4 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---

## Case 8: Biochemistry - BS

**Query:** Make me a full 4-year plan for Biochemistry - BS

**Expected:** 8 semesters, ~120h total

**Expected Schedule:**

### First Year - Fall Semester (15h)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- BIOS 110 — Biology of Cells and Organisms or Biology of Populations and Communities (4 cr)
- (elective) — Select one of the following: (5 cr) [elective_general]
- CHEM 116 — Honors and Majors General and Analytical Chemistry I a,b (None cr)
- CHEM 122 — Matter and Energy a (None cr)
- CHEM 123 — Foundations of Chemical Inquiry I a,c (None cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### First Year - Spring Semester (15h)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- MATH 180 — Calculus I d (4 cr)
- (elective) — Select one of the following: (5 cr) [elective_general]
- CHEM 118 — Honors and Majors General and Analytical Chemistry II a,b (None cr)
- CHEM 124 — Chemical Dynamics a (None cr)
- CHEM 125 — Foundations of Chemical Inquiry II a,c (None cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Fall Semester (14h)
- CHEM 232 — Structure and Function (3 cr)
- MATH 181 — Calculus II (4 cr)
- BIOS 110 — Biology of Cells and Organisms or Biology of Populations and Communities (4 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Spring Semester (12h)
- CHEM 233 — Synthesis Techniques Laboratory (2 cr)
- CHEM 234 — Chemical Synthesis (3 cr)
- BIOS 220 — Genetics (3 cr)
- (elective) — Select one of the following: (4 cr) [elective_general]
- PHYS 131 — Introductory Physics for Life Sciences I a (None cr)
- PHYS 141 — General Physics I (Mechanics) a (None cr)

### Third Year - Fall Semester (16h)
- CHEM 452 — Biochemistry I ( Same as BIOS 452 ) (4 cr)
- CHEM 222 — Analytical Chemistry b (4 cr)
- (elective) — or Elective (None cr) [elective_general]
- (elective) — Select one of the following: (4 cr) [elective_general]
- PHYS 132 — Introductory Physics for Life Sciences II a (None cr)
- PHYS 142 — General Physics II (Electricity and Magnetism) a (None cr)

### Third Year - Spring Semester (14h)
- (elective) — Select one of the following: (3 cr) [elective_general]
- CHEM 340 — Physical Chemistry for Biochemists I (None cr)
- CHEM 342 — Physical Chemistry I e (None cr)
- CHEM 454 — Biochemistry II ( Same as BIOS 454 ) (4 cr)
- CHEM 455 — Biochemistry Laboratory (3 cr)

### Fourth Year - Fall Semester (17h)
- CHEM 343 — Physical Chemistry Laboratory e,f (3 cr)
- (elective) — Select one of the following: (3 cr) [elective_general]
- CHEM 344 — Physical Chemistry for Biochemists II (None cr)
- CHEM 346 — Physical Chemistry II e (None cr)
- (elective) — BIOS Elective at the advanced level (4 cr) [elective_general]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Fourth Year - Spring Semester (17h)
- CHEM 314 — Inorganic Chemistry (4 cr)
- (elective) — BIOS Elective at the advanced level (4 cr) [elective_general]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — Elective (2 cr) [elective_general]

---

## Case 9: Electrical Engineering - BS

**Query:** Make me a full 4-year plan for Electrical Engineering - BS

**Expected:** 8 semesters, ~128h total

**Expected Schedule:**

### Freshman Year - First Semester (16h)
- MATH 180 — Calculus I (4 cr)
- CHEM 122 — Matter and Energy (3 cr)
- CHEM 123 — Foundations of Chemical Inquiry I (2 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- ECE 115 — Introduction to Electrical and Computer Engineering (4 cr)
- ENGR 100 — Engineering Success Seminar for Freshmen a (1 cr)

### Freshman Year - Second Semester (18h)
- MATH 181 — Calculus II (4 cr)
- PHYS 141 — General Physics I (Mechanics) (4 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- CS 107 — Introduction to Computing and Programming (4 cr)
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Sophomore Year - First Semester (16h)
- MATH 210 — Calculus III (3 cr)
- PHYS 142 — General Physics II (Electricity and Magnetism) (4 cr)
- PHYS 260 — Introduction to Thermal Physics (2 cr)
- ECE 265 — Introduction to Logic Design (4 cr)
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Sophomore Year - Second Semester (17h)
- MATH 218 — Applied Linear Algebra (3 cr)
- MATH 220 — Introduction to Differential Equations (3 cr)
- ECE 225 — Circuit Analysis (4 cr)
- ECE 266 — Introduction to Embedded Systems (4 cr)
- ECE 341 — Probability and Random Processes for Engineers (3 cr)

### Junior Year - First Semester (15h)
- ECE 310 — Discrete and Continuous Signals and Systems (3 cr)
- ECE 322 — Introduction to Electromagnetics and Applications (4 cr)
- ECE 340 — Electronics I (4 cr)
- ECE 346 — Solid State Device Theory (4 cr)

### Junior Year - Second Semester (18h)
- ECE 311 — Communication Engineering (4 cr)
- ECE 317 — Digital Signal Processing I (4 cr)
- ECE 342 — Electronics II (4 cr)
- (elective) — General Education Core course (6 cr) [gen_ed_any]

### Senior Year - First Semester (15h)
- ECE 350 — Principles of Automatic Control (4 cr)
- ECE 396 — Senior Design I (2 cr)
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Technical Elective (3 cr) [technical_elective]
- (elective) — Technical Elective (3 cr) [technical_elective]

### Senior Year - Second Semester (13h)
- ECE 397 — Senior Design II (2 cr)
- ECE 499 — Professional Development Seminar (0 cr)
- (elective) — Technical Elective (4 cr) [technical_elective]
- (elective) — Technical Elective (4 cr) [technical_elective]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---

## Case 10: Criminology Law and Justice - BA with a Major

**Query:** Make me a full 4-year plan for Criminology Law and Justice - BA with a Major

**Expected:** 8 semesters, ~77h total

**Expected Schedule:**

### First Year - Fall Semester (Noneh)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### First Year - Spring Semester (Noneh)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- CLJ 101 — Introduction to Criminology, Law, and Justice a (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Fall Semester (16h)
- CLJ 200 — Law and Society a (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Spring Semester (16h)
- CLJ 210 — Principles of Criminal Law (3 cr)
- (elective) — General Education Requirement course/Elective (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course/Elective (3 cr) [gen_ed_any]
- (elective) — Electives (3 cr) [elective_general]

### Third Year - Fall Semester (15h)
- CLJ 220 — Criminology (3 cr)
- CLJ 261 — Research Methods I (3 cr)
- (elective) — Electives (9 cr) [elective_general]

### Third Year - Spring Semester (15h)
- CLJ 262 — Research Methods II b (3 cr)
- (elective) — One 300- or 400-level Elective in CLJ (3 cr) [elective_general]
- (elective) — Electives (9 cr) [elective_general]

### Fourth Year - Fall Semester (15h)
- CLJ 303 — Introduction to Forensic Science or Youth, Crime, Law and Justice in Society or Police in Society or Courts in Society or Punishment, Prisons and Corrections or Community Corrections and Reentry or Criminal Investigation or Drugs and Addiction in Society (3 cr)
- (elective) — Electives (9 cr) [elective_general]

### Fourth Year - Spring Semester (Noneh)
- (elective) — One 300- or 400-level Elective in CLJ (3 cr) [elective_general]
- (elective) — One 300- or 400-level Elective in CLJ (3 cr) [elective_general]
- (elective) — Electives (8 cr) [elective_general]

---

## Case 11: Management - BS

**Query:** Make me a full 4-year plan for Management - BS

**Expected:** 8 semesters, ~120h total

**Expected Schedule:**

### Freshman Year – First Semester (15h)
- BA 101 — Business First-Year Seminar (1 cr)
- ECON 120 — Principles of Microeconomics (3 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- COMM 100 — Fundamentals of Human Communication (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Freshman Year – Second Semester (15h)
- BA 100 — Introduction to Professional Development (1 cr)
- BA 111 — Business Decision-Making (3 cr)
- ACTG 210 — Introduction to Financial Accounting (3 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Sophomore Year – First Semester (16h)
- MGMT 340 — Introduction to Organizations (3 cr)
- ACTG 211 — Introduction to Managerial Accounting (3 cr)
- FIN 300 — Introduction to Finance (3 cr)
- IDS 270 — Business Statistics I (4 cr)
- MKTG 360 — Introduction to Marketing (3 cr)

### Sophomore Year – Second Semester (14h)
- BA 200 — Business Communication (3 cr)
- BA 220 — Business Professional Development II (1 cr)
- IDS 200 — Intro to Management Information Systems (4 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]

### Junior Year – First Semester (16h)
- BA 320 — Civic Engagement (1 cr)
- ECON 121 — Principles of Macroeconomics (3 cr)
- IDS 355 — Operations Management (3 cr)
- MGMT 350 — Business and Its External Environment (3 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Advanced Quantitative Skills course (3 cr) [elective_general]

### Junior Year – Second Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – First Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (3 cr) [elective_general]
- (elective) — Global Business Perspectives course (3 cr) [global_biz]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – Second Semester (14h)
- (elective) — Competitive Strategy course (4 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (4 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---

## Case 12: Pharmaceutical Sciences - BS

**Query:** Make me a full 4-year plan for Pharmaceutical Sciences - BS

**Expected:** 10 semesters, ~120h total

**Expected Schedule:**

### First Year - Fall Semester (14h)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts a (3 cr)
- CHEM 122 — Matter and Energy and Foundations of Chemical Inquiry I a (None cr)
- CHEM 116 — Honors and Majors General and Analytical Chemistry I (None cr)
- COMM 100 — Fundamentals of Human Communication a (3 cr)
- (elective) — Exploring World Cultures General Education course a (3 cr) [gen_ed_world_cultures]

### First Year - Spring Semester (15h)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research a (3 cr)
- CHEM 124 — Chemical Dynamics and Foundations of Chemical Inquiry II a (None cr)
- CHEM 118 — Honors and Majors General and Analytical Chemistry II (None cr)
- BIOS 110 — Biology of Cells and Organisms a (4 cr)
- (elective) — Understanding the Creative Arts General Education course a (3 cr) [gen_ed_creative_arts]

### Second Year - Fall Semester (14h)
- PHAR 200 — Introduction to Pharmaceutical Sciences b (3 cr)
- CHEM 232 — Structure and Function (3 cr)
- BIOS 120 — Biology of Populations and Communities a (4 cr)
- MATH 170 — Calculus for the Life Sciences a (4 cr)

### Second Year - Spring Semester (16h)
- CHEM 233 — Synthesis Techniques Laboratory and Chemical Synthesis (5 cr)
- STAT 130 — Introduction to Statistics for the Life Sciences (4 cr)
- PHAR 201 — Pharmaceutical Care in the US b (3 cr)
- PHYS 131 — Introductory Physics for Life Sciences I a (4 cr)

### Third Year - Fall Semester (15h)
- BIOS 350 — General Microbiology and Microbiology Laboratory (5 cr)
- BIOS 352 — Introductory Biochemistry (3 cr)
- KN 230 — Anatomy and Physiology Lecture I (3 cr)
- PSCI 300 — Undergraduate Research Experience in Pharmaceutical Sciences or Undergraduate Research Experience in Pharmacy Systems, Outcomes and Policy or Undergraduate Research Experience in Pharmacy Practice (1 cr)
- (elective) — Understanding the Past General Education course (3 cr) [gen_ed_past]

### Third Year - Spring Semester (15h)
- KN 231 — Anatomy and Physiology Lecture II (3 cr)
- BIOS 220 — Genetics or Natural Products or Advanced Microbiology or Biotechnology and Drug Discovery (3 cr)
- PSCI 300 — Undergraduate Research Experience in Pharmaceutical Sciences or Undergraduate Research Experience in Pharmacy Systems, Outcomes and Policy or Undergraduate Research Experience in Pharmacy Practice (2 cr)
- (elective) — Understanding U.S. Society General Education course a (3 cr) [gen_ed_individual_society]
- (elective) — Elective (4 cr) [elective_general]

### Fourth Year - Fall Semester (16h)
- PHAR 410 — Integrated Physiology (3 cr)
- PHAR 422 — Fundamentals of Drug Action (4 cr)
- PHAR 431 — Pharmaceutics I - Pharmaceutics Principles, Drug Delivery Systems, and Calculations (3 cr)
- PHAR 435 — Pharmacokinetics (3 cr)
- (elective) — Elective (3 cr) [elective_general]

### Fourth Year - Spring Semester (15h)
- PHAR 423 — Fundamentals of Drug Action II (4 cr)
- PHAR 432 — Pharmaceutics II – Pharmaceutical Dosage Forms and Calculations (2 cr)
- PHAR 438 — Introduction to Drug Information (1 cr)
- PHAR 461 — Pharmacy and the U.S. Healthcare System (2 cr)
- (elective) — Elective (6 cr) [elective_general]

### Fourth Year - Fall Semester (Noneh)
- PHAR 410 — Integrated Physiology (3 cr)
- PHAR 411 — Introduction Pharmacy Practice (4 cr)
- PHAR 422 — Fundamentals of Drug Action (4 cr)
- PHAR 431 — Pharmaceutics I - Pharmaceutics Principles, Drug Delivery Systems, and Calculations (3 cr)
- PHAR 435 — Pharmacokinetics (3 cr)
- PHAR 465 — Pharmacy Learning, Advising, Mentoring, and Engagement for Students (PhLAMES) 1 (0 cr)
- (elective) — Electives (0 cr) [elective_general]

### Fourth Year - Spring Semester (Noneh)
- PHAR 412 — Introductory Pharmacy Practice (IPPE): Community (2 cr)
- PHAR 423 — Fundamentals of Drug Action II (4 cr)
- PHAR 432 — Pharmaceutics II – Pharmaceutical Dosage Forms and Calculations (2 cr)
- PHAR 438 — Introduction to Drug Information (1 cr)
- PHAR 461 — Pharmacy and the U.S. Healthcare System (2 cr)
- PHAR 466 — Pharmacy Learning, Advising, Mentoring, and Engagement for Students (PhLAMES) 2 (0 cr)
- PHAR 501 — Pathophysiology, Drug Action, and Therapeutics (PDAT) 1: Self Care (3 cr)
- PHAR 502 — Pathophysiology, Drug Action, and Therapeutics (PDAT) 2: GI/Endocrine (3 cr)
- (elective) — Electives (0 cr) [elective_general]

---

## Case 13: Architecture - BS

**Query:** Make me a full 4-year plan for Architecture - BS

**Expected:** 8 semesters, ~108h total

**Expected Schedule:**

### Freshman Year - Fall Semester (16h)
- ARCH 105 — Architectural Studio 1 (5 cr)
- ARCH 151 — Architecture at Chicago (2 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- (elective) — LAS Elective (choose any Liberal Arts and Sciences course) (3 cr) [elective_general]

### Freshman Year - Spring Semester (Noneh)
- ARCH 106 — Architectural Studio 2 (5 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- DLG 120 — UIC First-Year Dialogue Seminar ( Required of new freshmen only ) (1 cr)

### Sophomore Year - Fall Semester (14h)
- ARCH 205 — Architectural Studio 3 (5 cr)
- ARCH 251 — Architectural Analysis (3 cr)

### Sophomore Year - Spring Semester (15h)
- ARCH 206 — Architectural Studio 4 (5 cr)
- ARCH 252 — Modern Architecture (3 cr)
- PHYS 131 — Introductory Physics for Life Sciences I (4 cr)
- (elective) — College elective (3 cr) [elective_general]

### Junior Year - Fall Semester (17h)
- ARCH 365 — Architectural Studio 5 (6 cr)
- ARCH 359 — Architectural Technology 1 (4 cr)
- ARCH 371 — Architectural Theory 1 (3 cr)
- MATH 180 — Calculus I (4 cr)

### Junior Year - Spring Semester (16h)
- ARCH 366 — Architectural Studio 6 (6 cr)
- ARCH 360 — Architectural Technology 2 (4 cr)
- ARCH 372 — Architectural Theory 2 (3 cr)
- (elective) — College Elective (3 cr) [elective_general]

### Senior Year - Fall Semester (15h)
- ARCH 465 — Advanced Topic Studio 1 (6 cr)
- ARCH 414 — Contemporary Practices (3 cr)
- ARCH 470 — Structures I: Statics (3 cr)
- (elective) — LAS Elective (choose any Liberal Arts and Sciences course) (3 cr) [elective_general]

### Senior Year - Spring Semester (15h)
- ARCH 466 — Advanced Topic Studio 2 (6 cr)
- ARCH 471 — Structures II: Strength of Materials (3 cr)
- (elective) — College Elective (3 cr) [elective_general]
- (elective) — Elective (choose any course offered at UIC) (3 cr) [elective_general]

---

## Case 14: Neuroscience - BS

**Query:** Make me a full 4-year plan for Neuroscience - BS

**Expected:** 8 semesters, ~76h total

**Expected Schedule:**

### First Year - Fall Semester (15h)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- MATH 170 — Calculus for the Life Sciences a or Calculus I (4 cr)
- (elective) — Select one of the following: (5 cr) [elective_general]
- CHEM 116 — Honors and Majors General and Analytical Chemistry I (None cr)
- CHEM 122 — Matter and Energy and Foundations of Chemical Inquiry I (None cr)
- (elective) — General Education Requirement (3 cr) [gen_ed_any]

### First Year - Spring Semester (16h)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — Select one of the following: (5 cr) [elective_general]
- CHEM 118 — Honors and Majors General and Analytical Chemistry II (None cr)
- CHEM 124 — Chemical Dynamics and Foundations of Chemical Inquiry II (None cr)
- BIOS 110 — Biology of Cells and Organisms b or Biology of Populations and Communities (4 cr)
- PSCH 100 — Introduction to Psychology (4 cr)

### Second Year - Fall Semester (Noneh)
- PSCH 242 — Introduction to Research in Psychology (3 cr)
- CHEM 230 — Organic Chemistry of Biological Systems or Structure and Function (3 cr)
- BIOS 110 — Biology of Cells and Organisms or Biology of Populations and Communities (4 cr)

### Second Year - Spring Semester (15h)
- CHEM 233 — Synthesis Techniques Laboratory (2 cr)
- BIOS 222 — Cell Biology (3 cr)
- PSCH 262 — Behavioral Neuroscience or The Biology of the Brain (3 cr)
- (elective) — General Education Requirement (3 cr) [gen_ed_any]

### Third Year - Fall Semester (16h)
- PHIL 202 — Philosophy of Psychology or Learning and Conditioning (3 cr)
- BIOS 220 — Genetics (3 cr)
- (elective) — Advanced-level Elective in BIOS, CHEM, PHIL, or PSCH, or any PHYS (3 cr) [elective_general]
- (elective) — General Education Requirement (3 cr) [gen_ed_any]

### Third Year - Spring Semester (14h)
- PSCH 343 — Statistical Methods in Behavioral Science (4 cr)
- PHIL 202 — Philosophy of Psychology or Cognitive Neuroscience (3 cr)

### Fourth Year - Fall Semester (Noneh)
- BIOS 484 — Neuroscience I or Neuroscience I or Neuroscience I (3 cr)
- PHIL 201 — Theory of Knowledge or Metaphysics or Introduction to the Philosophy of Science or Theory of Knowledge or Topics in Philosophy of Mind or Metaphysics or Philosophy of Science (3 cr)
- (elective) — General Education Requirement (3 cr) [gen_ed_any]
- (elective) — Elective (3 cr) [elective_general]

### Fourth Year - Spring Semester (Noneh)
- BIOS 485 — Neuroscience II or Neuroscience II or Neuroscience II (3 cr)
- (elective) — Elective (5 cr) [elective_general]

---

## Case 15: Economics - BA with a Major

**Query:** Make me a full 4-year plan for Economics - BA with a Major

**Expected:** 8 semesters, ~78h total

**Expected Schedule:**

### First Year - Fall Semester (16h)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- ECON 120 — Principles of Microeconomics a (4 cr)
- MATH 121 — Precalculus Mathematics b (5 cr)

### First Year - Spring Semester (17h)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- ECON 121 — Principles of Macroeconomics a (4 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Fall Semester (16h)
- ECON 220 — Microeconomics: Theory and Applications (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Spring Semester (Noneh)
- ECON 270 — Statistics for Economics (4 cr)
- ECON 221 — Macroeconomics in the World Economy: Theory and Applications (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Third Year - Fall Semester (Noneh)
- ECON 300 — Econometrics or Honors Econometrics (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course/Elective (3 cr) [gen_ed_any]
- (elective) — Electives (3 cr) [elective_general]

### Third Year - Spring Semester (Noneh)
- ECON 395 — Research and Writing in Economics d (1 cr)
- (elective) — General Education Requirement course/Elective (3 cr) [gen_ed_any]
- (elective) — Electives (3 cr) [elective_general]

### Fourth Year - Fall Semester (15h)
- (elective) — Electives (12 cr) [elective_general]

### Fourth Year - Spring Semester (14h)
- (elective) — Electives (11 cr) [elective_general]

---

## Case 16: Information and Decision Sciences - BS

**Query:** Make me a full 4-year plan for Information and Decision Sciences - BS

**Expected:** 8 semesters, ~120h total

**Expected Schedule:**

### Freshman Year – First Semester (15h)
- BA 101 — Business First-Year Seminar (1 cr)
- ECON 120 — Principles of Microeconomics (3 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- COMM 100 — Fundamentals of Human Communication (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Freshman Year – Second Semester (15h)
- BA 100 — Introduction to Professional Development (1 cr)
- BA 111 — Business Decision-Making (3 cr)
- ACTG 210 — Introduction to Financial Accounting (3 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Sophomore Year – First Semester (16h)
- MGMT 340 — Introduction to Organizations (3 cr)
- ACTG 211 — Introduction to Managerial Accounting (3 cr)
- FIN 300 — Introduction to Finance (3 cr)
- IDS 270 — Business Statistics I (4 cr)
- MKTG 360 — Introduction to Marketing (3 cr)

### Sophomore Year – Second Semester (14h)
- BA 200 — Business Communication (3 cr)
- BA 220 — Business Professional Development II (1 cr)
- IDS 200 — Intro to Management Information Systems (4 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]

### Junior Year – First Semester (16h)
- BA 320 — Civic Engagement (1 cr)
- ECON 121 — Principles of Macroeconomics (3 cr)
- IDS 355 — Operations Management (3 cr)
- MGMT 350 — Business and Its External Environment (3 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Advanced Quantitative Skills course (3 cr) [elective_general]

### Junior Year – Second Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – First Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (3 cr) [elective_general]
- (elective) — Global Business Perspectives course (3 cr) [global_biz]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – Second Semester (14h)
- (elective) — Competitive Strategy course (4 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (4 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---

## Case 17: Public Health - BS

**Query:** Make me a full 4-year plan for Public Health - BS

**Expected:** 4 semesters, ~60h total

**Expected Schedule:**

### Junior Year - Fall Semester (16h)
- PUBH 300 — Critical Thinking in Public Health (4 cr)
- PUBH 330 — Health Equity and Health Disparities (3 cr)
- PUBH 350 — Health Systems, Policy, and Advocacy (3 cr)
- PUBH 395 — Public Health Seminar III (0 cr)
- (elective) — Free electives (6 cr) [free_elective]

### Junior Year - Spring Semester (15h)
- PUBH 301 — Critical Thinking in Public Health II (2 cr)
- PUBH 320 — Ecologies of Health and Modern Life (3 cr)
- PUBH 340 — Health Literacy (3 cr)
- PUBH 360 — Local Citizenship and Community Health Initiatives (4 cr)
- PUBH 395 — Public Health Seminar III (0 cr)
- (elective) — Public Health elective (3 cr) [elective_general]

### Senior Year - Fall Semester (14h)
- PUBH 310 — Public Health and Global Citizenship (3 cr)
- PUBH 370 — Using the Public Health Toolbox (3 cr)
- PUBH 410 — Historical and Contemporary Public Health Challenges I (2 cr)
- (elective) — Public Health selective a (3 cr) [elective_general]
- (elective) — Public Health selective a (3 cr) [elective_general]

### Senior Year - Spring Semester (15h)
- PUBH 397 — Baccalaureate Project in Public Health (3 cr)
- PUBH 411 — Historical and Contemporary Public Health Challenges II (2 cr)
- (elective) — Public Health selective a (3 cr) [elective_general]
- (elective) — Public Health selective a (3 cr) [elective_general]
- (elective) — Public Health selective a (3 cr) [elective_general]
- (elective) — Free elective (1 cr) [free_elective]

---

## Case 18: Mathematics - BS with a Major

**Query:** Make me a full 4-year plan for Mathematics - BS with a Major

**Expected:** 8 semesters, ~87h total

**Expected Schedule:**

### First Year - Fall Semester (14h)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- MATH 180 — Calculus I a (4 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### First Year - Spring Semester (14h)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- MATH 181 — Calculus II (4 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Fall Semester (Noneh)
- MATH 210 — Calculus III (3 cr)
- MATH 215 — Introduction to Advanced Mathematics (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — Electives (3 cr) [elective_general]

### Second Year - Spring Semester (14h)
- MATH 320 — Linear Algebra I (3 cr)
- MATH 300 — Writing for Mathematics (1 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Third Year - Fall Semester (Noneh)
- MATH 330 — Abstract Algebra I (3 cr)
- MATH 313 — Analysis I (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — Electives (3 cr) [elective_general]

### Third Year - Spring Semester (15h)
- (elective) — MSCS Electives b (6 cr) [elective_general]
- (elective) — Electives (9 cr) [elective_general]

### Fourth Year - Fall Semester (15h)
- (elective) — Two MSCS electives (at least one at 400 level) b (6 cr) [elective_general]
- (elective) — Electives (9 cr) [elective_general]

### Fourth Year - Spring Semester (15h)
- (elective) — One MSCS elective (at least one at 400 level) b (3 cr) [elective_general]
- (elective) — Electives (12 cr) [elective_general]

---

## Case 19: Political Science - BA with a Major

**Query:** Make me a full 4-year plan for Political Science - BA with a Major

**Expected:** 8 semesters, ~46h total

**Expected Schedule:**

### First Year - Fall Semester (Noneh)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- POLS 101 — Introduction to American Government and Politics a (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### First Year - Spring Semester (Noneh)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- POLS 120 — Introduction to Political Theory a or Introduction to Comparative Politics or Introduction to International Relations (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Fall Semester (16h)
- POLS 120 — Introduction to Political Theory a or Introduction to Comparative Politics or Introduction to International Relations (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Second Year - Spring Semester (Noneh)
- POLS 200 — Methods of Political Science (3 cr)
- (elective) — General Education Requirement course (3 cr) [gen_ed_any]

### Third Year - Fall Semester (15h)
- POLS 201 — Political Data Analysis ( or Quantitative Reasoning course ) b (3 cr)
- (elective) — Electives (6 cr) [elective_general]

### Third Year - Spring Semester (15h)
- (elective) — Electives (12 cr) [elective_general]

### Fourth Year - Fall Semester (Noneh)
- (elective) — Select one of the following in either the fall or spring semesters: e (0 cr) [elective_general]
- POLS 329 — Seminar on American Politics (None cr)
- POLS 349 — Topics in Comparative Politics (None cr)
- POLS 389 — Seminar: Topics in International Relations (None cr)
- POLS 399 — Seminar in Political Theory (None cr)
- (elective) — Electives (12 cr) [elective_general]

### Fourth Year - Spring Semester (Noneh)
- (elective) — Select one of the following in either the fall or spring semesters: e (0 cr) [elective_general]
- POLS 329 — Seminar on American Politics (None cr)
- POLS 349 — Topics in Comparative Politics (None cr)
- POLS 389 — Seminar: Topics in International Relations (None cr)
- POLS 399 — Seminar in Political Theory (None cr)
- (elective) — Electives (14 cr) [elective_general]

---

## Case 20: Entrepreneurship - BS

**Query:** Make me a full 4-year plan for Entrepreneurship - BS

**Expected:** 8 semesters, ~120h total

**Expected Schedule:**

### Freshman Year – First Semester (15h)
- BA 101 — Business First-Year Seminar (1 cr)
- ECON 120 — Principles of Microeconomics (3 cr)
- ENGL 160 — Academic Writing I: Writing in Academic and Public Contexts (3 cr)
- COMM 100 — Fundamentals of Human Communication (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Freshman Year – Second Semester (15h)
- BA 100 — Introduction to Professional Development (1 cr)
- BA 111 — Business Decision-Making (3 cr)
- ACTG 210 — Introduction to Financial Accounting (3 cr)
- ENGL 161 — Academic Writing II: Writing for Inquiry and Research (3 cr)
- (elective) — Mathematics course (5 cr) [math_elective]

### Sophomore Year – First Semester (16h)
- MGMT 340 — Introduction to Organizations (3 cr)
- ACTG 211 — Introduction to Managerial Accounting (3 cr)
- FIN 300 — Introduction to Finance (3 cr)
- IDS 270 — Business Statistics I (4 cr)
- MKTG 360 — Introduction to Marketing (3 cr)

### Sophomore Year – Second Semester (14h)
- BA 200 — Business Communication (3 cr)
- BA 220 — Business Professional Development II (1 cr)
- IDS 200 — Intro to Management Information Systems (4 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]

### Junior Year – First Semester (16h)
- BA 320 — Civic Engagement (1 cr)
- ECON 121 — Principles of Macroeconomics (3 cr)
- IDS 355 — Operations Management (3 cr)
- MGMT 350 — Business and Its External Environment (3 cr)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Advanced Quantitative Skills course (3 cr) [elective_general]

### Junior Year – Second Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – First Semester (15h)
- (elective) — Major course (3 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (3 cr) [elective_general]
- (elective) — Global Business Perspectives course (3 cr) [global_biz]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

### Senior Year – Second Semester (14h)
- (elective) — Competitive Strategy course (4 cr) [elective_general]
- (elective) — Major course (3 cr) [elective_general]
- (elective) — General Elective (4 cr) [elective_general]
- (elective) — General Education Core course (3 cr) [gen_ed_any]

---
