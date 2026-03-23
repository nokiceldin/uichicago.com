"use client";
export const dynamic = "force-dynamic";
import SparkyMarkdown from "../components/SparkyMarkdown";
import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import posthog from "posthog-js";
const BETA_PASSWORD = "uicsparky2026";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachedFile {
  name: string;
  mimeType: string;
  data: string;       // base64 (no data-URL prefix)
  fileType: "image" | "pdf" | "text";
  preview?: string;   // data-URL for image thumbnail
  sizeLabel: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  streaming?: boolean;
  attachment?: { name: string; fileType: AttachedFile["fileType"]; preview?: string };
}

interface TopicGroup {
  id: string;
  label: string;
  color: string;
  activeColor: string;
  borderColor: string;
  textColor: string;
  chipActive: string;
  items: string[];
}

// ─── Topic Data ───────────────────────────────────────────────────────────────
const TOPICS: TopicGroup[] = [
  {
    id: "courses",
    label: "📚 Courses",
    color: "violet",
    activeColor: "bg-violet-600",
    borderColor: "border-violet-500/30",
    textColor: "text-violet-300",
    chipActive: "bg-violet-600 border-violet-600 text-white",
    items: [
      "Make me a full 4-year CS plan",
      "What CS courses have the highest average GPA?",
      "Easiest Gen Ed for the natural world requirement?",
      "What are the prerequisites for CS 251?",
      "Hardest courses at UIC by GPA?",
      "Best electives for a CS major?",
      "What classes should I take my first semester as a CS major?",
      "What are the easiest 200-level CS courses at UIC?",
      "What are the hardest CS classes at UIC?",
      "What math classes do CS majors need at UIC?",
      "How hard is CS 211 compared to CS 141?",
      "How hard is CS 251 compared to CS 211?",
      "What classes are best if I want to become a data analyst?",
      "What classes are best if I want to become a software engineer?",
      "What UIC courses help with web development?",
      "What UIC classes help with cybersecurity?",
      "What are the easiest science Gen Eds at UIC?",
      "What are the easiest humanities Gen Eds at UIC?",
      "What are the best GPA booster classes at UIC?",
      "What are the easiest business electives at UIC?",
      "Which CS classes have the best average grades?",
      "Can you build me a 4-year pre med plan at UIC?",
      "Can you build me a 4-year engineering plan at UIC?",
      "Can you build me a 4-year business plan at UIC?",
    ],
  },
  {
    id: "professors",
    label: "🎓 Professors",
    color: "amber",
    activeColor: "bg-amber-600",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-300",
    chipActive: "bg-amber-600 border-amber-600 text-white",
    items: [
      "Who gives the best grades in MATH 180?",
      "Best rated CS professors at UIC?",
      "Easiest professor for CHEM 122?",
      "Which professors give the most As in calculus?",
      "Best biology professors at UIC?",
      "Who teaches CS 211 and how are they?",
      "Who is the easiest professor for MATH 121?",
      "Who is the best professor for CS 141?",
      "Who is the best professor for CS 211?",
      "Who is the best professor for CS 251?",
      "Who is the easiest professor for ENGL 160?",
      "Which professors are hardest graders at UIC?",
      "Which professors are the most liked by students?",
      "Which professors are best for freshmen?",
      "Which professors are easiest for science Gen Eds?",
      "Who is the best professor for MATH 181?",
      "Who is the best professor for CHEM 122?",
      "Who is the best professor for BIOS 110?",
      "Who is the best professor for ECON 120?",
      "Who is the best professor for ACTG 210?",
      "Which professors are best for pre med students?",
      "Which professors are best for business majors?",
      "Which professors are best for engineering students?",
      "Which UIC professors are easiest overall?",
      "Which UIC professors are hardest overall?",
      "Which professors are known for being fair graders?",
      "Which professors have the highest ratings and high GPA averages?",
      "Can you rank the best professors for calculus at UIC?",
      "Can you rank the best professors for CS at UIC?",
      "Who is the best professor at UIC for GPA and learning balance?",
    ],
  },
  {
    id: "costs",
    label: "💰 Costs",
    color: "emerald",
    activeColor: "bg-emerald-600",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-300",
    chipActive: "bg-emerald-600 border-emerald-600 text-white",
    items: [
      "How much is UIC tuition in-state?",
      "Do I qualify for the Aspire Grant?",
      "When is my fall tuition bill due?",
      "What scholarships can I apply for?",
      "How does UIC compare to UIUC in cost?",
      "What is the Aspire Grant and who qualifies?",
      "How much is UIC tuition out of state?",
      "How much does UIC cost per semester?",
      "How much does it cost to live on campus at UIC?",
      "How much do dorms cost at UIC?",
      "How much is a meal plan at UIC?",
      "What does UIC usually cost after aid?",
      "How much are student fees at UIC?",
      "How much does UIC cost for international students?",
      "What is the cheapest way to attend UIC?",
      "What scholarships are easiest to get at UIC?",
      "Does UIC give merit scholarships?",
      "What is the difference between tuition and total cost of attendance?",
      "Can I pay tuition monthly at UIC?",
      "What happens if I miss a tuition payment?",
      "What is included in the cost of attendance at UIC?",
      "Is UIC affordable compared to DePaul?",
      "Is UIC affordable compared to UIUC?",
      "How much debt do UIC students usually graduate with?",
      "What grants are available for Illinois students at UIC?",
      "Does UIC offer emergency grants?",
      "Are there scholarships for transfer students?",
      "Are there scholarships for international students?",
      "What financial aid is available for first year students?",
      "How expensive is parking at UIC?",
      "Does UIC charge different tuition by major?",
      "Can you compare UIC cost for living on campus versus commuting?",
    ],
  },
  {
    id: "housing",
    label: "🏠 Housing",
    color: "sky",
    activeColor: "bg-sky-600",
    borderColor: "border-sky-500/30",
    textColor: "text-sky-300",
    chipActive: "bg-sky-600 border-sky-600 text-white",
    items: [
      "Best dorm for a freshman engineering student?",
      "Should I live on campus or off campus?",
      "Which dorms don't require a meal plan?",
      "Cheapest housing options at UIC?",
      "What LLCs are available in JST?",
      "What's the difference between ARC and JST?",
      "What is the best dorm at UIC for freshmen?",
      "What is the quietest dorm at UIC?",
      "Which UIC dorm is the most social?",
      "Which UIC dorm is best for engineering students?",
      "Which UIC dorm is best for pre med students?",
      "Which UIC dorm is closest to classes?",
      "Which dorm has the best food access?",
      "Which dorm is best for international students?",
      "Which dorm is best for transfer students?",
      "What housing should a commuter student consider?",
      "Should I choose ARC, JST, MRH, or SSR?",
      "What are the pros and cons of living at ARC?",
      "What are the pros and cons of living at JST?",
      "What are the pros and cons of living off campus near UIC?",
      "How much does off campus housing near UIC usually cost?",
      "What neighborhoods are popular for UIC students?",
      "Is Little Italy a good place to live for UIC students?",
      "Is Pilsen a good place to live for UIC students?",
      "Can freshmen live off campus at UIC?",
      "Which dorms have kitchens at UIC?",
      "Which dorms have private bathrooms at UIC?",
      "Which dorms require a meal plan?",
      "Which dorms are apartment style at UIC?",
      "When does UIC housing open?",
      "How do I apply for UIC housing?",
      "How do I choose a roommate at UIC?",
      "What is the best housing option for a CS student?",
      "What is the cheapest dorm that still feels nice?",
      "Can you compare ARC and JST for me?",
      "Can you compare living on campus versus commuting to UIC?",
      "What is the best overall housing choice at UIC?",
    ],
  },
  {
    id: "campus_life",
    label: "🎉 Campus Life",
    color: "pink",
    activeColor: "bg-pink-600",
    borderColor: "border-pink-500/30",
    textColor: "text-pink-300",
    chipActive: "bg-pink-600 border-pink-600 text-white",
    items: [
      "What frats and sororities are at UIC?",
      "How does Greek rush work at UIC?",
      "Best clubs for pre-med students?",
      "What is the Spark Festival?",
      "What is the Involvement Fair?",
      "Best student orgs for CS majors?",
      "What is UIC student life like?",
      "What clubs should a freshman join at UIC?",
      "What clubs are best for making friends at UIC?",
      "What are the most popular student organizations at UIC?",
      "What events happen during welcome week at UIC?",
      "What is homecoming like at UIC?",
      "How do I meet people at UIC as a commuter?",
      "How do I make friends fast at UIC?",
      "What is Greek life like at UIC?",
      "What clubs are best for business students?",
      "What clubs are best for engineering students?",
      "What clubs are best for international students?",
      "What clubs are best for transfer students?",
      "What clubs are best for pre law students?",
      "What are the best volunteering clubs at UIC?",
      "What are the best leadership opportunities at UIC?",
      "How do I join student government at UIC?",
      "How do I find student events at UIC?",
      "What are the best fun events at UIC?",
      "What are the best cultural organizations at UIC?",
      "What are the best clubs for meeting ambitious people at UIC?",
      "What are the best clubs for CS majors at UIC?",
      "What are the best clubs for pre med students at UIC?",
      "What are the best clubs for finance students at UIC?",
      "What should I do my first month at UIC?",
      "How can I get involved fast at UIC?",
      "What organizations help with networking at UIC?",
      "What organizations help with community service at UIC?",
      "What are the biggest student events each semester at UIC?",
      "Can you suggest the best student orgs for my major at UIC?",
      "Can you help me build a campus involvement plan at UIC?",
    ],
  },
  {
    id: "dining",
    label: "🍔 Dining",
    color: "orange",
    activeColor: "bg-orange-600",
    borderColor: "border-orange-500/30",
    textColor: "text-orange-300",
    chipActive: "bg-orange-600 border-orange-600 text-white",
    items: [
      "What dining options are open late?",
      "Is there 24-hour food on campus?",
      "Which meal plan is best for freshmen?",
      "Where is the cheapest food near UIC?",
      "What halal food options are on campus?",
      "What are the hours for 605 Commons?",
      "What meal plan should I buy at UIC?",
      "Is the UIC meal plan worth it?",
      "Where can I get healthy food at UIC?",
      "Where can I get halal food near UIC?",
      "Where can I get vegetarian food at UIC?",
      "Where can I get vegan food at UIC?",
      "Where can I get coffee on campus at UIC?",
      "What restaurants are closest to UIC?",
      "What is open early in the morning at UIC?",
      "What is open late at night near UIC?",
      "Where can I eat between classes at UIC?",
      "Where can commuters eat at UIC?",
      "Are there microwaves on campus at UIC?",
      "What are the meal swipe options at UIC?",
      "How does dining dollars work at UIC?",
      "Can I use meal swipes at all campus locations?",
      "Which meal plan gives the most value at UIC?",
      "What are the hours for campus dining at UIC?",
      "Is there good breakfast on campus at UIC?",
      "Where can I get snacks on campus at UIC?",
      "Do UIC dining locations have allergy friendly options?",
      "What should freshmen know about meal plans at UIC?",
      "Can commuters buy meal plans at UIC?",
      "What food options are open on weekends at UIC?",
      "Where can I eat on east campus?",
      "Where can I eat on west campus?",
      "What is the best meal plan for someone who eats on campus a lot?",
      "What is the best meal plan for someone who goes home often?",
      "Can you compare UIC meal plans for me?",
      "What are the best food choices at UIC for saving money?",
    ],
  },
  {
    id: "athletics",
    label: "🔥 Athletics",
    color: "red",
    activeColor: "bg-red-600",
    borderColor: "border-red-500/30",
    textColor: "text-red-300",
    chipActive: "bg-red-600 border-red-600 text-white",
    items: [
      "How do I get free student tickets?",
      "What conference is UIC in?",
      "Where is the basketball arena?",
      "What is the Flames Fast Pass?",
      "What's the UIC basketball Instagram?",
      "How do UIC student tickets work?",
      "Is UIC Division 1?",
      "What sports does UIC have?",
      "Where do UIC basketball games happen?",
      "Where do UIC volleyball games happen?",
      "Where do UIC soccer games happen?",
      "What conference is UIC basketball in right now?",
      "How do I follow UIC athletics?",
      "Where can I see the UIC athletics schedule?",
      "What is Flames Fast Pass and is it worth it?",
      "Do UIC students get into games for free?",
      "How do I get student tickets for UIC games?",
      "What is the UIC athletics website?",
      "What sports are most popular at UIC?",
      "Where is the UIC recreation center?",
      "Does UIC have club sports?",
      "Does UIC have intramural sports?",
      "How do I join intramurals at UIC?",
      "How do I join club sports at UIC?",
      "Does UIC have tennis?",
      "Does UIC have soccer?",
      "Does UIC have football?",
      "What is the gym like at UIC?",
      "Can students use the rec center for free at UIC?",
      "What are the rec center hours at UIC?",
      "What fitness classes are offered at UIC?",
      "How do I stay active at UIC?",
      "What are the best sports for meeting people at UIC?",
      "What division and conference is UIC in now?",
      "Can you tell me where to follow all UIC sports online?",
      "What should a new student know about sports at UIC?",
    ],
  },
  {
    id: "campus",
    label: "🗺️ Campus",
    color: "indigo",
    activeColor: "bg-indigo-600",
    borderColor: "border-indigo-500/30",
    textColor: "text-indigo-300",
    chipActive: "bg-indigo-600 border-indigo-600 text-white",
    items: [
      "Which CTA line goes to UIC?",
      "Where is the MSLC tutoring center?",
      "How does Night Ride work?",
      "Where is the Financial Aid office?",
      "How do I get from east to west campus?",
      "Where can I print on campus?",
      "How do I get to UIC by train?",
      "How do I get to UIC by bus?",
      "Where do I park at UIC?",
      "What is the best parking option at UIC?",
      "Where is Student Center East?",
      "Where is Student Center West?",
      "Where is the library at UIC?",
      "Where is the rec center at UIC?",
      "Where is the advising office for my major?",
      "Where is the registrar office at UIC?",
      "Where is the bursar office at UIC?",
      "Where is the counseling center at UIC?",
      "Where is the disability resource center at UIC?",
      "Where can I study on campus at UIC?",
      "What are the best study spots at UIC?",
      "Where are the best quiet places on campus at UIC?",
      "Where can I charge my laptop on campus at UIC?",
      "Where can I print for free at UIC?",
      "Where do I get my i-card at UIC?",
      "How do I use Night Ride at UIC?",
      "How do I get from JST to lecture center buildings?",
      "How do I get from ARC to class buildings?",
      "Where are the engineering buildings at UIC?",
      "Where are the science buildings at UIC?",
      "Where are the CS classes usually held at UIC?",
      "Where is the tutoring center for math at UIC?",
      "Where can I meet with advisors at UIC?",
      "How big is the UIC campus?",
      "Is UIC easy to get around?",
      "What is on east campus versus west campus at UIC?",
      "What is the fastest way to move around campus at UIC?",
      "Where can I eat between classes on campus?",
      "Where can I relax between classes at UIC?",
      "Where are the best commuter spaces at UIC?",
      "Can you help me understand the layout of UIC campus?",
      "Can you tell me where the most important student offices are at UIC?",
      "What are the most useful places every UIC student should know?",
      "How do I navigate campus my first week at UIC?",
    ],
  },
  {
    id: "health",
    label: "🏥 Health",
    color: "teal",
    activeColor: "bg-teal-600",
    borderColor: "border-teal-500/30",
    textColor: "text-teal-300",
    chipActive: "bg-teal-600 border-teal-600 text-white",
    items: [
      "How do I waive CampusCare insurance?",
      "Is counseling free at UIC?",
      "Where is the health clinic?",
      "How do I get disability accommodations?",
      "Where is the campus pharmacy?",
      "What does CampusCare cover at UIC?",
      "How much does CampusCare cost at UIC?",
      "How do I use CampusCare insurance?",
      "How do I make a doctor appointment at UIC?",
      "Where is the student health center at UIC?",
      "How do I get mental health support at UIC?",
      "Does UIC offer therapy for students?",
      "How do I book counseling at UIC?",
      "Is therapy confidential at UIC?",
      "How do disability accommodations work at UIC?",
      "How do I register with the disability office at UIC?",
      "Can I get testing accommodations at UIC?",
      "How do I get note taking accommodations at UIC?",
      "Can I see a doctor on campus at UIC?",
      "Can international students use the health center at UIC?",
      "Does UIC have dental services for students?",
      "Where do I go if I get sick at UIC?",
      "What if I have an emergency on campus at UIC?",
      "How do prescriptions work with CampusCare?",
      "Is there a pharmacy on campus at UIC?",
      "Can I waive student health insurance at UIC?",
      "When is the CampusCare waiver deadline?",
      "What wellness resources does UIC offer?",
      "Does UIC have stress management support?",
      "How do I talk to someone if I am overwhelmed at UIC?",
      "What health services are included in student fees at UIC?",
      "What if I need help after office hours at UIC?",
      "Can I get accommodations for anxiety or ADHD at UIC?",
      "Who should I contact for accessibility support at UIC?",
      "Can you explain CampusCare in simple terms?",
      "What health resources should every new UIC student know?",
      "What should I do first if I need accommodations at UIC?",
    ],
  },
  {
    id: "registration",
    label: "📅 Registration",
    color: "lime",
    activeColor: "bg-lime-600",
    borderColor: "border-lime-500/30",
    textColor: "text-lime-300",
    chipActive: "bg-lime-600 border-lime-600 text-white",
    items: [
      "When does spring registration open?",
      "What is a registration time ticket?",
      "How do I add or drop a class?",
      "What is the last day to withdraw?",
      "How does the waitlist work at UIC?",
      "How do I handle a prerequisite override?",
      "How do I register for classes at UIC?",
      "How do time tickets work at UIC?",
      "When can freshmen register at UIC?",
      "When can transfer students register at UIC?",
      "When can graduate students register at UIC?",
      "What is open registration at UIC?",
      "How do I change my schedule after registering?",
      "How do I swap classes at UIC?",
      "What happens if a class is full at UIC?",
      "How do I get on a waitlist at UIC?",
      "What do I do if I need instructor approval for a class at UIC?",
      "How do I get a prerequisite override at UIC?",
      "How do I know if I have a hold on my account at UIC?",
      "What holds can block registration at UIC?",
      "How do I remove a registration hold at UIC?",
      "What is the deadline to drop a class without a W at UIC?",
      "What is the deadline to withdraw from a class at UIC?",
      "What happens if I drop below full time at UIC?",
      "How many credits should I take at UIC?",
      "Can I take 18 credits at UIC?",
      "How do overload approvals work at UIC?",
      "Can I add a class after the semester starts at UIC?",
      "Can I register for classes from my phone at UIC?",
      "How do I use XE Registration at UIC?",
      "What should I do before registration opens at UIC?",
      "How do I build a good schedule at UIC?",
      "Can I retake a class for grade replacement at UIC?",
      "How do repeats work at UIC?",
      "How do pass fail options work at UIC?",
      "How do I register for summer classes at UIC?",
      "How do I register for winter classes at UIC?",
      "What happens if I miss my registration time at UIC?",
      "How do I know if I am full time or part time at UIC?",
      "How do linked lectures and labs work at UIC?",
      "How do discussion sections work at UIC registration?",
      "Can you walk me through UIC registration step by step?",
      "Can you help me plan what classes to register for next semester?",
      "What should a freshman know about registering at UIC?",
    ],
  },
  {
    id: "admissions",
    label: "📝 Admissions",
    color: "blue",
    activeColor: "bg-blue-600",
    borderColor: "border-blue-500/30",
    textColor: "text-blue-300",
    chipActive: "bg-blue-600 border-blue-600 text-white",
    items: [
      "What is the UIC application deadline?",
      "Does UIC require SAT or ACT?",
      "What is the transfer GPA requirement?",
      "What is the Guaranteed Admission Transfer?",
      "What happens after I'm accepted?",
      "When does housing open for admitted students?",
      "What GPA do I need to get into UIC?",
      "How hard is it to get into UIC?",
      "Is UIC test optional?",
      "What documents do I need to apply to UIC?",
      "When should I apply to UIC?",
      "How do I apply to UIC as a freshman?",
      "How do I apply to UIC as a transfer student?",
      "How do I apply to UIC as an international student?",
      "What happens after I get admitted to UIC?",
      "How do I accept my UIC admission offer?",
      "How do I send transcripts to UIC?",
      "Does UIC superscore ACT or SAT?",
      "What majors are hardest to get into at UIC?",
      "Can I change my major after applying to UIC?",
      "What is the application fee for UIC?",
      "What are the admission requirements for engineering at UIC?",
      "What are the admission requirements for CS at UIC?",
      "What are the admission requirements for nursing at UIC?",
      "What are the admission requirements for business at UIC?",
      "How does guaranteed transfer admission work at UIC?",
      "What is the difference between freshman and transfer admission at UIC?",
      "When should transfer students apply to UIC?",
      "When should international students apply to UIC?",
      "Does UIC accept dual credit and AP credit for admission?",
      "What should I do after getting accepted to UIC?",
      "When do admitted students sign up for orientation at UIC?",
      "When do admitted students pick housing at UIC?",
      "How do I submit vaccination records after admission to UIC?",
      "What is the next step after paying my deposit to UIC?",
      "How do I know if I got scholarships after admission to UIC?",
      "What should parents know about the UIC admissions process?",
      "How competitive is UIC for out of state students?",
      "How competitive is UIC for international students?",
      "Can you explain the UIC admissions process step by step?",
      "Can you help me understand what happens after I am accepted to UIC?",
      "What is the smartest timeline for applying to UIC?",
      "What should I do first if I want to apply to UIC?",
    ],
  },
  {
    id: "careers",
    label: "💼 Careers",
    color: "cyan",
    activeColor: "bg-cyan-600",
    borderColor: "border-cyan-500/30",
    textColor: "text-cyan-300",
    chipActive: "bg-cyan-600 border-cyan-600 text-white",
    items: [
      "How do I find internships as a UIC student?",
      "Where is the Career Services office?",
      "Can F-1 students work on campus?",
      "How do I get a graduate assistantship?",
      "How does Handshake work at UIC?",
      "How do I get an internship through UIC?",
      "What career resources does UIC offer?",
      "How do I book a resume review at UIC?",
      "How do I get help with LinkedIn at UIC?",
      "How do I prepare for the UIC career fair?",
      "What employers recruit at UIC?",
      "Which majors at UIC get the best internships?",
      "How do I find on campus jobs at UIC?",
      "Where do I apply for student jobs at UIC?",
      "How do I get research opportunities at UIC?",
      "How do I get a TA or GA position at UIC?",
      "How do I use Handshake as a UIC student?",
      "What should I put on my resume as a freshman at UIC?",
      "How do I get experience if I have no internships yet at UIC?",
      "What are the best career fairs at UIC?",
      "How do I find internships in Chicago while at UIC?",
      "How do I network better at UIC?",
      "What career clubs should I join at UIC?",
      "What is the best time to look for internships at UIC?",
      "How early should freshmen start career prep at UIC?",
      "Can commuters still use career services at UIC?",
      "Can transfer students use career services at UIC?",
      "What career help does UIC offer for international students?",
      "How do I get interview practice at UIC?",
      "Does UIC help students find jobs after graduation?",
      "How do I get a part time job on campus at UIC?",
      "How do I get a summer internship from UIC connections?",
      "What career resources are best for freshmen at UIC?",
      "What career resources are best for seniors at UIC?",
      "How do I build a strong resume while studying at UIC?",
      "What should CS majors do early at UIC for career success?",
      "What should business majors do early at UIC for career success?",
      "Can you help me build a career plan while at UIC?",
      "Can you explain all the main UIC career resources to me?",
      "What should every new UIC student know about jobs and internships?",
      "How can I use UIC to maximize my career opportunities?",
    ],
  },
  {
    id: "international",
    label: "🌍 International",
    color: "purple",
    activeColor: "bg-purple-600",
    borderColor: "border-purple-500/30",
    textColor: "text-purple-300",
    chipActive: "bg-purple-600 border-purple-600 text-white",
    items: [
      "What do I need to do as a new F-1 student?",
      "How does CPT work at UIC?",
      "What is OPT and when can I apply?",
      "Do I need to check in with OIS?",
      "Can I work on campus as an F-1 student?",
      "How do I get a travel signature?",
      "What should international students do first at UIC?",
      "How do I maintain F-1 status at UIC?",
      "What is OIS at UIC?",
      "How do I contact OIS at UIC?",
      "How do I check in as a new international student at UIC?",
      "How do I get my I-20 from UIC?",
      "How do I transfer my SEVIS record to UIC?",
      "What documents do international students need for UIC?",
      "How do international students register for classes at UIC?",
      "How many credits do F-1 students need at UIC?",
      "Can international students work on campus at UIC?",
      "How do I apply for CPT at UIC?",
      "How do I apply for OPT at UIC?",
      "When should I apply for OPT through UIC?",
      "Can I do internships as an international student at UIC?",
      "What jobs can international students do at UIC?",
      "How do reduced course loads work for international students at UIC?",
      "What happens if I drop below full time as an F-1 student at UIC?",
      "How do I get a travel signature from UIC?",
      "How long is a travel signature valid at UIC?",
      "What should I carry when re entering the US as a UIC student?",
      "Can international students live off campus at UIC?",
      "Do international students get scholarships at UIC?",
      "How do health insurance rules work for international students at UIC?",
      "How do I update my address as an F-1 student at UIC?",
      "Can international students change majors at UIC?",
      "Can international students work off campus at UIC?",
      "What is the difference between CPT and OPT at UIC?",
      "How do I renew my I-20 at UIC?",
      "How do I get help from OIS quickly at UIC?",
      "How do I know if I am maintaining valid status at UIC?",
      "Can I take online classes as an international student at UIC?",
      "What should new international freshmen know at UIC?",
      "What should new international transfers know at UIC?",
      "Can you explain CPT and OPT in simple words for UIC students?",
      "Can you explain the first semester checklist for an international student at UIC?",
      "What should I do before traveling outside the US as a UIC international student?",
      "What are the most important rules for F-1 students at UIC?",
      "What is the full international student setup process at UIC?",
    ],
  },
  {
    id: "safety",
    label: "🛡️ Safety",
    color: "rose",
    activeColor: "bg-rose-600",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-300",
    chipActive: "bg-rose-600 border-rose-600 text-white",
    items: [
      "How does the safety escort work?",
      "What is the UIC Safe app?",
      "How do I report a bias incident?",
      "Who do I contact for a campus emergency?",
      "Are student legal services free?",
      "What is Title IX at UIC?",
      "What safety resources does UIC offer students?",
      "How do I use Night Ride at UIC?",
      "What is the safety escort service at UIC?",
      "How do I contact campus police at UIC?",
      "What is the emergency number for UIC?",
      "How do I report suspicious activity at UIC?",
      "How do I report harassment at UIC?",
      "How do I report sexual misconduct at UIC?",
      "How do I report discrimination at UIC?",
      "What should I do in a campus emergency at UIC?",
      "How do campus emergency alerts work at UIC?",
      "How do I sign up for safety alerts at UIC?",
      "What does the UIC Safe app do?",
      "Does UIC have blue light emergency phones?",
      "Where can I find campus police at UIC?",
      "How do I stay safe as a commuter at UIC?",
      "How do I stay safe walking home from UIC?",
      "How do I stay safe on public transit to UIC?",
      "What should freshmen know about safety at UIC?",
      "What should students living in dorms know about safety at UIC?",
      "What should students living off campus know about safety near UIC?",
      "What is Title IX and how does it help students at UIC?",
      "How do no contact orders work at UIC?",
      "Are there legal services for students at UIC?",
      "How do I get help if I feel unsafe at UIC?",
      "How do I report a bias incident at UIC?",
      "How do I get confidential support after an incident at UIC?",
      "What safety services are open late at UIC?",
      "Can I request an escort at night at UIC?",
      "What are the biggest safety tips for new UIC students?",
      "What resources help students in crisis at UIC?",
      "Where do I go for legal help as a UIC student?",
      "Can you explain all the main UIC safety resources?",
      "Can you tell me what to do step by step in an emergency at UIC?",
      "What should every student save in their phone for UIC safety?",
      "What are the most important student protections at UIC?",
      "What should I know about staying safe at UIC from day one?",
    ],
  },
];

const FEATURED_PROMPTS = [
  "Make me a full 4-year CS plan",
  "Best professor for MATH 180?",
  "Should I live on campus or off campus?",
  "Do I qualify for the Aspire Grant?",
  "Easiest Gen Eds for a GPA boost?",
  "How do free student tickets work?",
];

const TOPIC_SHORTCUTS: Record<string, string[]> = {
  courses: [
    "Build me a 4 year CS plan",
    "Best CS average grades",
    "Hardest CS classes",
    "Easiest 200 level CS classes",
  ],
  professors: [
    "Best CS professors",
    "Best professor for CS 211",
    "Best calculus professors",
    "Easiest science professors",
  ],
  costs: [
    "UIC tuition cost",
    "Aspire Grant eligibility",
    "Cheapest way to attend UIC",
    "UIC cost after aid",
  ],
  housing: [
    "Quietest dorm at UIC",
    "Best freshman dorm",
    "ARC vs JST",
    "Cheapest housing options",
  ],
  campus_life: [
    "Best clubs at UIC",
    "How to make friends fast",
    "Welcome week events",
    "Best orgs for CS majors",
  ],
  dining: [
    "Best meal plan",
    "Cheap food near UIC",
    "Halal food near campus",
    "Late night food",
  ],
  athletics: [
    "Free student tickets",
    "UIC sports schedule",
    "Rec center hours",
    "Does UIC have tennis?",
  ],
  campus: [
    "Best study spots",
    "Where to park at UIC",
    "How to get around campus",
    "Where to print",
  ],
  health: [
    "CampusCare explained",
    "Waive health insurance",
    "Free counseling at UIC",
    "Student health center",
  ],
  registration: [
    "When registration opens",
    "How waitlist works",
    "How to add or drop classes",
    "Registration holds explained",
  ],
  admissions: [
    "UIC application deadline",
    "UIC admission requirements",
    "How to apply to UIC",
    "What to do after acceptance",
  ],
  careers: [
    "How to find internships",
    "UIC career resources",
    "On campus jobs",
    "Resume help at UIC",
  ],
  international: [
    "Maintain F1 status",
    "CPT explained",
    "OPT explained",
    "Travel signature help",
  ],
  safety: [
    "Night Ride explained",
    "UIC Safe app",
    "Campus police contact",
    "Safety tips for freshmen",
  ],
};

const CHAT_QUICK_PROMPTS = [
  "Best CS average grades",
  "Hardest CS classes",
  "Easiest 200 level CS classes",
  "Build me a 4 year CS plan",
  "Best CS professors",
  "Best professor for CS 211",
  "Quietest dorm at UIC",
  "Best freshman dorm",
  "ARC vs JST",
  "Best study spots",
  "Where to print",
  "How to get around campus",
  "UIC tuition cost",
  "Aspire Grant eligibility",
  "Best GPA booster classes",
  "How to register for classes",
  "How waitlist works",
  "UIC application deadline",
  "Best clubs at UIC",
  "Free student tickets",
  "CampusCare explained",
  "Waive health insurance",
  "How to find internships",
  "Maintain F1 status",
  "CPT explained",
  "OPT explained",
  "Night Ride explained",
  "UIC Safe app",
  "Cheap food near UIC",
  "Best meal plan",
  "On campus or off campus?",
  "Best career resources",
  "Best calculus professors",
  "How to lower tuition",
  "Best housing options",
  "How to add or drop classes",
  "What majors is UIC best for?",
  "Best commuter tips",
  "Where is the rec center?",
  "What should freshmen know first?",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRandomItems<T>(arr: T[], count: number): T[] {
  return shuffleArray(arr).slice(0, count);
}

function shortenPrompt(text: string): string {
  const map: Record<string, string> = {
    "What are the easiest 200-level CS courses at UIC?": "Easiest 200 level CS classes",
    "Which CS classes have the best average grades?": "Best CS average grades",
    "What are the hardest CS classes at UIC?": "Hardest CS classes",
    "What math classes do CS majors need at UIC?": "CS major math requirements",
    "Can you build me a 4-year engineering plan at UIC?": "Build me a 4 year engineering plan",
    "Can you build me a full 4-year CS plan": "Build me a full 4 year CS plan",
    "Make me a full 4-year CS plan": "Build me a full 4 year CS plan",
    "What are the best GPA booster classes at UIC?": "Best GPA booster classes",
    "Best rated CS professors at UIC?": "Best CS professors",
    "Who is the best professor for CS 211?": "Best professor for CS 211",
    "Should I live on campus or off campus?": "On campus or off campus?",
    "Do I qualify for the Aspire Grant?": "Aspire Grant eligibility",
    "What is the quietest dorm at UIC?": "Quietest dorm at UIC",
  };

  if (map[text]) return map[text];

  return text
    .replace(/ at UIC\??$/i, "")
    .replace(/Can you /i, "")
    .replace(/What are the /i, "")
    .replace(/What is the /i, "")
    .replace(/Which /i, "")
    .replace(/How do I /i, "")
    .replace(/\?$/, "")
    .trim();
}

function formatContent(text: string): string {
  // Headers
  let html = text.replace(/^### (.+)$/gm, "<h3 class='text-white font-bold text-base mt-4 mb-1.5'>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2 class='text-white font-bold text-[17px] mt-5 mb-2'>$1</h2>");
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong class='text-white font-semibold'>$1</strong>");
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code class='bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-[13px] font-mono'>$1</code>");
  // Bullet lists
  html = html.replace(/^[•\-\*] (.+)$/gm, "<li class='flex gap-2 items-start'><span class='text-zinc-500 mt-0.5 shrink-0'>•</span><span>$1</span></li>");
  // Numbered lists
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li class='flex gap-2.5 items-start'><span class='text-zinc-500 font-mono text-xs mt-1 shrink-0 w-4'>$1.</span><span>$2</span></li>");
  // Wrap consecutive <li> items - use split approach for compatibility
  const liBlockRegex = /<li[^>]*>[\s\S]*?<\/li>/g;
  const liBlocks = html.match(liBlockRegex);
  if (liBlocks) {
    html = html.replace(/<li/, "<ul class='space-y-1.5 my-2'><li");
    html = html.replace(/(<\/li>)(?!\s*<li)/, "$1</ul>");
  }
  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p class='mt-3'>");
  html = html.replace(/\n/g, "<br/>");
  return html;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SparkyAvatar({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "w-16 h-16" : "w-7 h-7";
  return (
    <div className={`relative ${dim} shrink-0`}>
      {size === "lg" && (
        <div className="absolute inset-0 rounded-full bg-red-600/20 blur-xl scale-150" />
      )}
      <img
        src="/sparky-icon.png"
        alt="Sparky"
        className={`relative ${dim} object-contain drop-shadow-lg`}
      />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3.5 items-start">
      <div className="pt-0.5 shrink-0"><SparkyAvatar size="sm" /></div>
      <div className="flex items-center gap-1 pt-2">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
            style={{
              animation: `dotPulse 1.4s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ActionBtn({ title, onClick, children, className = "" }: { title: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <div className="relative group/btn">
      <button
        onClick={onClick}
        className={`p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-100 transition-colors duration-150 ${className}`}
      >
        {children}
      </button>
      <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-zinc-700 text-zinc-100 text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150">
        {title}
      </div>
    </div>
  );
}

function CopyBtn({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group/btn">
      <button
        onClick={() => {
          navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-100 transition-colors duration-150"
      >
        {copied ? (
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        )}
      </button>
      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-zinc-200 text-[11px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 border border-zinc-700">
        {copied ? "Copied!" : "Copy"}
      </div>
    </div>
  );
}

function MessageBubble({ msg, onRegenerate, userQuestion }: { msg: Message; onRegenerate?: () => void; userQuestion?: string }) {
  const [feedbackGiven, setFeedbackGiven] = useState<"good" | "bad" | null>(null);

  const submitFeedback = async (rating: "good" | "bad") => {
    if (feedbackGiven) return;
    setFeedbackGiven(rating);
    posthog.capture("chat_response_feedback", { rating });
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQuestion ?? "", answer: msg.content, rating }),
      });
    } catch { /* silent */ }
  };
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        {msg.attachment && (
          <div className="max-w-[78%] md:max-w-[62%]">
            {msg.attachment.fileType === "image" && msg.attachment.preview ? (
              <img
                src={msg.attachment.preview}
                alt={msg.attachment.name}
                className="max-h-64 rounded-2xl border border-zinc-200 dark:border-zinc-700 object-cover"
              />
            ) : (
              <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-2.5 border border-zinc-200 dark:border-zinc-700">
                <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-[13px] text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[200px]">{msg.attachment.name}</span>
              </div>
            )}
          </div>
        )}
        {msg.content && (
          <div className="max-w-[78%] md:max-w-[62%] rounded-[24px] px-5 py-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 text-[15.5px] leading-[1.55] font-[430] tracking-[-0.008em]">
            {msg.content}
          </div>
        )}
        <div className="flex items-center gap-1 pr-1">
          <CopyBtn content={msg.content} />
        </div>
      </div>
    );
  }
  return (
  <div className="flex items-start gap-3.5 group">
    <div className="pt-0.5 shrink-0">
      <SparkyAvatar size="sm" />
    </div>

    <div className={`min-w-0 flex-1 ${msg.error ? "opacity-60" : ""}`}>
      <div className="max-w-[700px]">
        <div className="text-[15.5px] leading-[1.85] text-zinc-800 dark:text-zinc-100 font-normal tracking-[-0.008em] antialiased prose-sparky">
          <SparkyMarkdown content={msg.content} />
        </div>

        {!msg.streaming && !msg.error && (
          <div className="flex items-center gap-0.5 mt-2.5">
            <CopyBtn content={msg.content} />

            {onRegenerate && (
              <ActionBtn title="Regenerate response" onClick={onRegenerate}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </ActionBtn>
            )}

            <ActionBtn
              title="Good response"
              onClick={() => submitFeedback("good")}
              className={feedbackGiven === "good" ? "text-green-500" : feedbackGiven === "bad" ? "opacity-30 cursor-default" : ""}
            >
              <svg className="w-4 h-4" fill={feedbackGiven === "good" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
              </svg>
            </ActionBtn>

            <ActionBtn
              title="Bad response"
              onClick={() => submitFeedback("bad")}
              className={feedbackGiven === "bad" ? "text-red-500" : feedbackGiven === "good" ? "opacity-30 cursor-default" : ""}
            >
              <svg className="w-4 h-4" fill={feedbackGiven === "bad" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
              </svg>
            </ActionBtn>
          </div>
        )}

        {msg.error && (
          <p className="text-xs text-red-400 mt-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            Failed to get response
          </p>
        )}
      </div>
    </div>
  </div>
);
}
function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  onKeyDown,
  loading,
  inputRef,
  variant = "floating",
  attachedFile,
  onAttach,
  onRemoveAttachment,
  fileInputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text?: string) => void;
  onStop: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  variant?: "floating" | "fixed";
  attachedFile: AttachedFile | null;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const isFloating = variant === "floating";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Stop recognition on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSpeechError("Speech recognition not supported in this browser.");
      setTimeout(() => setSpeechError(null), 4000);
      return;
    }
    const r = new SR();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((res: any) => res[0].transcript)
        .join(" ")
        .trim();
      if (transcript) onChange(value ? value + " " + transcript : transcript);
    };
    r.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setSpeechError("Couldn't hear you. Try again.");
        setTimeout(() => setSpeechError(null), 3000);
      }
    };
    r.onend = () => setRecording(false);
    recognitionRef.current = r;
    r.start();
    setRecording(true);
    setSpeechError(null);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  return (
    // Outer wrapper is relative but NOT overflow-hidden so the popup can escape
    <div ref={menuRef} className="relative">
      {/* Popup menu — rendered outside overflow-hidden so it's not clipped */}
      {menuOpen && (
        <div
          className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-60 rounded-2xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden"
          style={{ animation: "fadeSlideUp 0.15s ease forwards" }}
        >
          <button
            type="button"
            onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-zinc-100 hover:bg-zinc-700/60 transition-colors text-left"
          >
            <svg className="w-5 h-5 text-zinc-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Add photos and files
          </button>
        </div>
      )}

      <div
        className={`overflow-hidden border transition-all duration-200 ${
          isFloating
            ? "rounded-[22px] border-zinc-300 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
            : "rounded-[22px] border-zinc-300 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        }`}
      >
      {/* Attachment preview strip */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-0">
          {attachedFile.fileType === "image" && attachedFile.preview ? (
            <div className="relative">
              <img src={attachedFile.preview} alt={attachedFile.name} className="h-16 w-16 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700" />
              <button onClick={onRemoveAttachment} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 flex items-center justify-center text-[10px] leading-none hover:bg-red-600 dark:hover:bg-red-500 transition-colors">✕</button>
            </div>
          ) : (
            <div className="relative flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-2 border border-zinc-200 dark:border-zinc-700">
              <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200 truncate max-w-[160px]">{attachedFile.name}</p>
                <p className="text-[11px] text-zinc-400">{attachedFile.sizeLabel}</p>
              </div>
              <button onClick={onRemoveAttachment} className="ml-1 w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-600 flex items-center justify-center text-[10px] leading-none hover:bg-red-500 hover:text-white transition-colors">✕</button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end min-h-[50px]">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,text/*,.txt,.md"
          className="hidden"
          onChange={onAttach}
        />

        {/* Left: attach button */}
        <div className="flex items-end pl-3 pb-3">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 ${
              menuOpen
                ? "bg-zinc-300 dark:bg-zinc-600 text-zinc-900 dark:text-white"
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white"
            }`}
            aria-label="Attach file or image"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
          }}
          onKeyDown={onKeyDown}
          placeholder={attachedFile ? "Ask about this file..." : "Ask Sparky anything about UIC..."}
          rows={1}
          className="flex-1 bg-transparent text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none resize-none text-[16px] font-normal leading-relaxed px-3 py-[18px]"
          style={{ maxHeight: "180px" }}
        />

        {/* Right buttons */}
        <div className="flex items-end gap-1.5 pr-3 pb-3">
          {/* Mic button — hidden while Sparky is responding */}
          {!loading && (
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              title={recording ? "Stop recording" : "Speak your message"}
              aria-label={recording ? "Stop recording" : "Voice input"}
              className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
                recording
                  ? "bg-red-500 text-white shadow-[0_0_0_4px_rgba(239,68,68,0.2)]"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {recording ? (
                /* Pulsing stop indicator */
                <span className="w-3 h-3 rounded-sm bg-white" style={{ animation: "micPulse 1s ease-in-out infinite" }} />
              ) : (
                /* Microphone icon */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                </svg>
              )}
            </button>
          )}

          {/* Send / Stop-Sparky button */}
          {loading ? (
            <button
              onClick={onStop}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-zinc-800 dark:text-white transition-all duration-150"
              aria-label="Stop response"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => onSend()}
              disabled={!value.trim() && !attachedFile}
              className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
                (value.trim() || attachedFile)
                  ? "bg-[#CC0000] hover:bg-[#aa0000] text-white shadow-[0_2px_8px_rgba(204,0,0,0.35)] scale-100 hover:scale-105 active:scale-95"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
              }`}
              aria-label="Send message"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Speech error */}
      {speechError && (
        <div className="px-4 pb-2 text-[12px] text-red-400 dark:text-red-400 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          {speechError}
        </div>
      )}
      </div>
    </div>
  );
}

function TopicChip({
  topic,
  active,
  onClick,
}: {
  topic: TopicGroup;
  active: boolean;
  onClick: () => void;
  key?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 py-1.5 rounded-full border text-[12.5px] font-medium transition-all duration-150 ${
        active
          ? topic.chipActive
          : `bg-zinc-100/80 dark:bg-zinc-900/80 border-zinc-300/50 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500`
      }`}
    >
      {topic.label}
    </button>
  );
}

function PromptCard({
  text,
  onClick,
  delay,
}: {
  text: string;
  onClick: () => void;
  delay: number;
  key?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className="prompt-card group w-full text-left px-4 py-3 rounded-3xl border bg-zinc-100/60 dark:bg-zinc-900/60 border-zinc-300/40 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-all duration-150 hover:scale-[1.02] active:scale-[0.99] text-[13.5px] font-medium leading-snug flex items-start gap-2.5"
    >
      <span className="flex-1">{text}</span>
      <svg
        className="w-3.5 h-3.5 mt-0.5 opacity-30 group-hover:opacity-50 shrink-0 transition-opacity"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
    </button>
  );
}

function EmptyState({
  activeTopic,
  setActiveTopic,
  onSend,
  onStop,
  input,
  onInputChange,
  onKeyDown,
  loading,
  inputRef,
  attachedFile,
  onAttach,
  onRemoveAttachment,
  fileInputRef,
}: {
  activeTopic: number;
  setActiveTopic: (i: number) => void;
  onSend: (text?: string) => void;
  onStop: () => void;
  input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  attachedFile: AttachedFile | null;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}){
const topic = TOPICS[activeTopic];
const visiblePrompts = useMemo(() => getRandomItems(topic.items, 4), [topic.id]);

  return (
    <div
      className="flex flex-col items-center px-4 w-full"
      style={{ minHeight: "calc(100vh - 64px)", paddingTop: "15vh", paddingBottom: "40px" }}
    >
      {/* Identity */}
      <div className="flex flex-col items-center mb-8">
        <div className="sparky-float mb-5">
          <img src="/sparky-icon.png" alt="Sparky" className="w-24 h-24 object-contain drop-shadow-lg" />
        </div>
        <h1 className="text-[32px] font-semibold text-zinc-900 dark:text-white tracking-tight leading-none mb-3">
          Hey, I&apos;m Sparky
        </h1>
        <p className="text-zinc-500 text-[14.5px] text-center max-w-sm leading-relaxed">
          Ask me anything about UIC — courses, professors, housing, costs, and more.
        </p>
      </div>

      {/* Input */}
      <div className="w-full max-w-3xl mb-6">
        <ChatInput
          onStop={onStop}
          value={input}
          onChange={onInputChange}
          onSend={onSend}
          onKeyDown={onKeyDown}
          loading={loading}
          inputRef={inputRef}
          variant="floating"
          attachedFile={attachedFile}
          onAttach={onAttach}
          onRemoveAttachment={onRemoveAttachment}
          fileInputRef={fileInputRef}
        />
      </div>

      {/* Topic tabs + prompt cards */}
      <div className="w-full max-w-3xl">
        {/* Scrollable topic chips — negative mx so fade mask reaches edge */}
        <div className="relative -mx-4">
<div className="hide-scroll flex gap-1.5 overflow-x-auto pb-4">  
  {TOPICS.map((t, i) => (
              <TopicChip
                key={t.id}
                topic={t}
                active={activeTopic === i}
                onClick={() => setActiveTopic(i)}
              />
            ))}
          </div>
        </div>

        {/* 2-col prompt grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visiblePrompts.map((item, i) => (
            <PromptCard
              key={item}
              text={item}
              onClick={() => {
                posthog.capture("chat_prompt_card_clicked", { prompt_text: item, topic: topic.id });
                onInputChange(item);
              }}
              delay={i * 35}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConversationView({
  messages,
  loading,
  bottomRef,
  onRegenerate,
  scrollAreaRef,
}: {
  messages: Message[];
  loading: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onRegenerate: () => void;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [showScroll, setShowScroll] = useState(false);

  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollAreaRef]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const isStreaming = messages.some(m => m.streaming);
  return (
    <div className="relative">
      <div className="max-w-3xl mx-auto w-full px-5 pt-8 pb-6">
      <div className="space-y-8">
        {messages.map((msg, i) => {
          const userQuestion = msg.role === "assistant"
            ? messages.slice(0, i).reverse().find(m => m.role === "user")?.content
            : undefined;
          // Add a subtle divider before each user message (except the first)
          const showDivider = msg.role === "user" && i > 0;
          return (
            <div key={msg.id}>
              {showDivider && (
                <div className="border-t border-zinc-100 dark:border-zinc-800/60 mb-8" />
              )}
              <div className="msg-appear" data-msg-id={msg.id}>
                <MessageBubble
                  msg={msg}
                  onRegenerate={msg.role === "assistant" && !msg.streaming && !msg.error ? onRegenerate : undefined}
                  userQuestion={userQuestion}
                />
              </div>
            </div>
          );
        })}
        {loading && !isStreaming && <TypingIndicator />}
      </div>
      <div ref={bottomRef} style={{ height: loading ? "48vh" : "7rem", transition: "height 0.4s ease" }} />
    </div>{showScroll && (
  <button
    onClick={scrollToBottom}
    className="fixed left-1/2 -translate-x-1/2 bottom-[116px] z-20 flex items-center justify-center w-10 h-10 rounded-full border border-zinc-300/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-150 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
    aria-label="Scroll to bottom"
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </button>
)}
  </div>
  );
}
function QuickSuggestBar({
  onSend,
  onInputChange,
  refreshKey,
}: {
  onSend: (text?: string) => void;
  onInputChange: (v: string) => void;
  refreshKey: number;
}) {
  const quickPrompts = useMemo(() => {
    return getRandomItems(CHAT_QUICK_PROMPTS, 10);
  }, [refreshKey]);

  return (
    <div className="w-full max-w-[860px] mx-auto">
      <div className="hide-scroll flex items-center gap-2 overflow-x-auto pb-1">
        {quickPrompts.map((item) => (
          <button
            key={item}
            onClick={() => {
              posthog.capture("chat_prompt_card_clicked", { prompt_text: item, topic: "chat_general" });
              onInputChange(item);
            }}
            className="shrink-0 h-[30px] px-3.5 rounded-full border border-zinc-200 dark:border-zinc-700/60 bg-transparent text-[12.5px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:scale-[0.97] transition-all duration-150 whitespace-nowrap"
            title={item}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function ChatContent() {
  const stopRef = useRef<(() => void) | null>(null);

// ── File attachment handler ────────────────────────────────────────────────
const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!e.target) return;
  (e.target as HTMLInputElement).value = "";
  if (!file) return;

  const MAX_IMAGE = 4 * 1024 * 1024;  // 4 MB
  const MAX_DOC   = 10 * 1024 * 1024; // 10 MB

  const isImage = file.type.startsWith("image/");
  const isPDF   = file.type === "application/pdf";
  const isText  = file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md");

  if (!isImage && !isPDF && !isText) {
    alert("Supported formats: images (JPG, PNG, GIF, WEBP), PDFs, and text files.");
    return;
  }
  if (isImage && file.size > MAX_IMAGE) { alert("Image must be under 4 MB."); return; }
  if ((isPDF || isText) && file.size > MAX_DOC) { alert("Document must be under 10 MB."); return; }

  const fileType: AttachedFile["fileType"] = isImage ? "image" : isPDF ? "pdf" : "text";
  const sizeLabel = file.size < 1024 * 1024
    ? `${(file.size / 1024).toFixed(0)} KB`
    : `${(file.size / 1024 / 1024).toFixed(1)} MB`;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const result = ev.target?.result as string;
    // result is a data-URL like "data:image/png;base64,..."
    const base64 = result.split(",")[1];
    setAttachedFile({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      data: base64,
      fileType,
      preview: isImage ? result : undefined,
      sizeLabel,
    });
  };
  reader.readAsDataURL(file);
}, []);

const handleStop = useCallback(() => {
  stopRef.current?.();
  stopRef.current = null;
  setLoading(false);
}, []);

  const searchParams = useSearchParams();
const [messages, setMessages] = useState<Message[]>([]);
const [input, setInput] = useState("");
const [loading, setLoading] = useState(false);
const [activeTopic, setActiveTopic] = useState(0);
const [chipRefreshKey, setChipRefreshKey] = useState<number>(0);
const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasSentInitial = useRef(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const isEmpty = messages.length === 0;

  // Handle ?q= param
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !hasSentInitial.current) {
      hasSentInitial.current = true;
      handleSend(q);
    }
  }, []);


  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (typeof textOverride === "string" ? textOverride : input).trim();
    if ((!text && !attachedFile) || loading) return;

    // Snapshot & clear the attachment before the async send
    const fileSnapshot = attachedFile;
    setAttachedFile(null);

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: text || (fileSnapshot ? `[Attached: ${fileSnapshot.name}]` : ""),
      attachment: fileSnapshot
        ? { name: fileSnapshot.name, fileType: fileSnapshot.fileType, preview: fileSnapshot.preview }
        : undefined,
    };
    const updated = [...messages, userMsg];

    // flushSync forces React to commit the DOM synchronously so we can
    // measure and scroll immediately — no setTimeout needed.
    flushSync(() => {
      setMessages(updated);
    });

    const scrollArea = scrollAreaRef.current;
    const msgEl = scrollArea?.querySelector<HTMLElement>(`[data-msg-id="${userMsg.id}"]`);
    if (scrollArea && msgEl) {
      const offset = msgEl.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top - 24;
      scrollArea.scrollBy({ top: offset, behavior: "smooth" });
    }
    posthog.capture("chat_message_sent", {
      message_length: text.length,
      message_count: updated.length,
      has_attachment: !!fileSnapshot,
      attachment_type: fileSnapshot?.fileType,
    });
    setInput("");
    setChipRefreshKey((k) => k + 1);
    setLoading(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          file: fileSnapshot
            ? { name: fileSnapshot.name, mimeType: fileSnapshot.mimeType, data: fileSnapshot.data, fileType: fileSnapshot.fileType }
            : null,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const assistantId = uid();
      setMessages((prev: Message[]) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);

      const reader = res.body.getReader();
      stopRef.current = () => { reader.cancel(); };


const decoder = new TextDecoder();
let accumulated = "";
let displayed = "";
const charQueue: string[] = [];
let flushScheduled = false;
let streamDone = false;
let onQueueEmpty: (() => void) | null = null;

// Always animate — never dump. 5 chars/frame ≈ 300 chars/sec at 60fps (fast but typed).
// When tab is hidden, use setTimeout so chars still process in background.
function flushBatch() {
  flushScheduled = false;
  if (charQueue.length === 0) {
    if (streamDone && onQueueEmpty) onQueueEmpty();
    return;
  }
  // Slightly larger batch when tab hidden (background catch-up) or queue very large
  const batchSize = document.hidden
    ? Math.min(20, charQueue.length)
    : Math.min(5, charQueue.length);
  for (let i = 0; i < batchSize; i++) displayed += charQueue.shift()!;
  setMessages((prev: Message[]) =>
    prev.map((m) =>
      m.id === assistantId ? { ...m, content: displayed, streaming: true } : m
    )
  );
  // Continue draining
  if (charQueue.length > 0) scheduleFlush();
  else if (streamDone && onQueueEmpty) onQueueEmpty();
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  if (document.hidden) {
    // rAF is throttled when hidden — use setTimeout so background tab still drains
    setTimeout(flushBatch, 16);
  } else {
    requestAnimationFrame(flushBatch);
  }
}

// On tab return: resume animation of whatever is still queued
const onVisibilityChange = () => { if (!document.hidden) scheduleFlush(); };
document.addEventListener("visibilitychange", onVisibilityChange);

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const delta = decoder.decode(value, { stream: true });
  accumulated += delta;
  for (const char of delta) charQueue.push(char);
  scheduleFlush();
}

document.removeEventListener("visibilitychange", onVisibilityChange);
streamDone = true;

// Wait for every char to animate through before marking the message done
await new Promise<void>(resolve => {
  onQueueEmpty = resolve;
  if (charQueue.length === 0) resolve();
  else scheduleFlush(); // ensure drain is running
});

setMessages((prev: Message[]) =>
  prev.map((m) =>
    m.id === assistantId
      ? { ...m, content: accumulated, streaming: false }
      : m
  )
);
    } catch {
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: "Something went wrong reaching Sparky. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, messages, loading]);

  const handleRegenerate = useCallback(async () => {
  if (loading) return;
  const lastUser = [...messages].reverse().find(m => m.role === "user");
  if (!lastUser) return;
  
  // Remove last assistant message, keep the user message
  const withoutLastAssistant = messages.slice(0, -1);
  setMessages(withoutLastAssistant);
  setLoading(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: withoutLastAssistant }),
    });

    if (!res.ok || !res.body) throw new Error("Failed");

    const assistantId = uid();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", streaming: true }]);

    const reader = res.body.getReader();
    stopRef.current = () => { reader.cancel(); };

const decoder2 = new TextDecoder();
let accumulated2 = "";
let displayed2 = "";
const charQueue2: string[] = [];
let flushScheduled2 = false;
let streamDone2 = false;
let onQueueEmpty2: (() => void) | null = null;

function flushBatch2() {
  flushScheduled2 = false;
  if (charQueue2.length === 0) {
    if (streamDone2 && onQueueEmpty2) onQueueEmpty2();
    return;
  }
  const batchSize = document.hidden ? Math.min(20, charQueue2.length) : Math.min(5, charQueue2.length);
  for (let i = 0; i < batchSize; i++) displayed2 += charQueue2.shift()!;
  setMessages(prev =>
    prev.map(m => m.id === assistantId ? { ...m, content: displayed2, streaming: true } : m)
  );
  if (charQueue2.length > 0) scheduleFlush2();
  else if (streamDone2 && onQueueEmpty2) onQueueEmpty2();
}

function scheduleFlush2() {
  if (flushScheduled2) return;
  flushScheduled2 = true;
  if (document.hidden) setTimeout(flushBatch2, 16);
  else requestAnimationFrame(flushBatch2);
}

const onVisibilityChange2 = () => { if (!document.hidden) scheduleFlush2(); };
document.addEventListener("visibilitychange", onVisibilityChange2);

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const delta = decoder2.decode(value, { stream: true });
  accumulated2 += delta;
  for (const char of delta) charQueue2.push(char);
  scheduleFlush2();
}

document.removeEventListener("visibilitychange", onVisibilityChange2);
streamDone2 = true;

await new Promise<void>(resolve => {
  onQueueEmpty2 = resolve;
  if (charQueue2.length === 0) resolve();
  else scheduleFlush2();
});

setMessages(prev =>
  prev.map(m =>
    m.id === assistantId ? { ...m, content: accumulated2, streaming: false } : m
  )
);
  } catch {
    setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "Something went wrong. Please try again.", error: true }]);
  } finally {
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }
}, [messages, loading, stopRef, inputRef]);

const handleKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}, [handleSend]);

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sparkyFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes msgAppear {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40%            { transform: scale(1.1); opacity: 1; }
        }
        @keyframes promptIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sparky-float { animation: sparkyFloat 3.5s ease-in-out infinite; }
        .msg-appear   { animation: msgAppear 0.24s cubic-bezier(0.16,1,0.3,1) forwards; }
        .prompt-card  { animation: promptIn 0.25s ease both; }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }

        .prose-sparky h2 {
  color: rgb(18 18 20);
  font-weight: 600;
  font-size: 0.96rem;
  line-height: 1.4;
  margin-top: 1.2rem;
  margin-bottom: 0.3rem;
  letter-spacing: -0.012em;
}
.dark .prose-sparky h2 { color: rgb(250 250 252); }

.prose-sparky h3 {
  color: rgb(30 30 35);
  font-weight: 560;
  font-size: 0.91rem;
  line-height: 1.4;
  margin-top: 1rem;
  margin-bottom: 0.22rem;
  letter-spacing: -0.01em;
}
.dark .prose-sparky h3 { color: rgb(242 242 245); }

.prose-sparky p {
  margin-top: 0.82rem;
  color: rgb(40 40 45);
  line-height: 1.78;
  font-weight: 400;
}
.dark .prose-sparky p { color: rgb(235 235 238); }

.prose-sparky p:first-child {
  margin-top: 0;
}

.prose-sparky strong {
  color: rgb(30 30 30);
  font-weight: 550;
}
.dark .prose-sparky strong { color: rgb(245 245 245); }

.prose-sparky ul,
.prose-sparky ol {
  margin: 0.75rem 0;
  padding: 0;
  list-style: none;
}

.prose-sparky li {
  display: flex;
  gap: 0.58rem;
  align-items: flex-start;
  line-height: 1.78;
  color: rgb(40 40 45);
  font-weight: 400;
}
.dark .prose-sparky li { color: rgb(235 235 238); }

.prose-sparky code {
  background: rgb(228 228 231);
  color: rgb(30 30 30);
  padding: 0.12rem 0.42rem;
  border-radius: 0.42rem;
  font-size: 0.78rem;
  font-family: ui-monospace, monospace;
}
.dark .prose-sparky code { background: rgb(39 39 42); color: rgb(244 244 245); }

.prose-sparky em {
  color: rgb(82 82 91);
  font-style: normal;
}
.dark .prose-sparky em { color: rgb(161 161 170); }

.prose-sparky hr {
  border: 0;
  height: 1px;
  background: rgba(0,0,0,0.1);
  margin: 1rem 0;
}
.dark .prose-sparky hr { background: rgba(255,255,255,0.06); }
      `}</style>

      <div
        className="flex flex-col bg-white dark:bg-[#080808] text-zinc-900 dark:text-white"
        style={{ height: "calc(100vh - 64px)", animation: "slideUp 0.25s ease forwards" }}
      >
        {/* Scrollable area */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto chat-scroll">
          {isEmpty ? (
            <EmptyState
              onStop={handleStop}
              activeTopic={activeTopic}
              setActiveTopic={setActiveTopic}
              onSend={handleSend}
              input={input}
              onInputChange={setInput}
              onKeyDown={handleKey}
              loading={loading}
              inputRef={inputRef}
              attachedFile={attachedFile}
              onAttach={handleFileSelect}
              onRemoveAttachment={() => setAttachedFile(null)}
              fileInputRef={fileInputRef}
            />
          ) : (
            <ConversationView
  messages={messages}
  loading={loading}
  bottomRef={bottomRef}
  onRegenerate={handleRegenerate}
  scrollAreaRef={scrollAreaRef}
/>
          )}
        </div>

        {/* Bottom controls — only when chatting */}
        {/* Bottom composer module */}
{!isEmpty && (
  <div className="shrink-0 bg-white/98 dark:bg-[#080808]/98 backdrop-blur-xl px-4 pb-4 pt-2">
    <div className="max-w-[860px] mx-auto">
      <div className="flex flex-col gap-[10px]">
        <QuickSuggestBar
  onSend={handleSend}
  onInputChange={setInput}
  refreshKey={chipRefreshKey}
/>

        <ChatInput
          onStop={handleStop}
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onKeyDown={handleKey}
          loading={loading}
          inputRef={inputRef}
          variant="fixed"
          attachedFile={attachedFile}
          onAttach={handleFileSelect}
          onRemoveAttachment={() => setAttachedFile(null)}
          fileInputRef={fileInputRef}
        />

        <p className="text-center text-zinc-400 dark:text-zinc-600 text-[11.5px] leading-none tracking-wide">
          Sparky can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  </div>
)}
      </div>
    </>
  );
}

// ─── Password Gate ────────────────────────────────────────────────────────────

const STORAGE_KEY = "sparky_beta_unlocked";

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const attempt = () => {
    if (value === BETA_PASSWORD) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-[#080808] px-4">
      <style>{`
        @keyframes sparkyFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes gateShake  { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
        .sparky-float { animation: sparkyFloat 3.5s ease-in-out infinite; }
        .gate-shake   { animation: gateShake 0.45s ease; }
      `}</style>

      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="sparky-float">
          <img src="/sparky-icon.png" alt="Sparky" className="w-20 h-20 object-contain drop-shadow-lg" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight mb-1.5">UIC Sparky Beta</h1>
          <p className="text-zinc-500 text-sm">Enter the beta password to continue.</p>
        </div>

        {/* Input */}
        <div className={`w-full ${shake ? "gate-shake" : ""}`}>
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={e => { setValue(e.target.value); setError(false); }}
            onKeyDown={e => e.key === "Enter" && attempt()}
            placeholder="Beta password"
            className={`w-full bg-zinc-100 dark:bg-zinc-900 border rounded-xl px-4 py-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none text-[16px] transition-colors ${
              error ? "border-red-500 focus:border-red-400" : "border-zinc-300 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500"
            }`}
          />
          {error && (
            <p className="mt-2 text-red-400 text-xs flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
              Incorrect password. Please try again.
            </p>
          )}
        </div>

        <button
          onClick={attempt}
          disabled={!value.trim()}
          className="w-full py-3 rounded-xl font-semibold text-[16px] transition-all bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white shadow-lg shadow-red-900/30"
        >
          Enter Sparky
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setUnlocked(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setUnlocked(false);
    }
  }, []);

  // Still checking localStorage — show nothing to avoid flash
  if (unlocked === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-[#080808] text-zinc-500 text-sm gap-2.5">
        <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        Loading Sparky...
      </div>
    );
  }

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-white dark:bg-[#080808] text-zinc-500 text-sm gap-2.5">
          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          Loading Sparky...
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}