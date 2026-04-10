"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const PHRASES: string[] = [
  "Make me a full 4-year CS plan",
  "Hardest courses at UIC by GPA?",
  "What are the easiest 200-level CS courses at UIC?",
  "What are the hardest CS classes at UIC?",
  "How hard is CS 211 compared to CS 141?",
  "How hard is CS 251 compared to CS 211?",
  "What classes are best if I want to become a software engineer?",
  "What classes are best if I want to become a data analyst?",
  "What UIC courses help with cybersecurity?",
  "What are the best GPA booster classes at UIC?",
  "Which CS classes have the best average grades?",
  "Best rated CS professors at UIC?",
  "Which professors give the most As in calculus?",
  "Who is the best professor for CS 141?",
  "Who is the best professor for CS 211?",
  "Who is the best professor for CS 251?",
  "Which professors are hardest graders at UIC?",
  "Which UIC professors are easiest overall?",
  "Which professors have the highest ratings and high GPA averages?",
  "Who is the best professor at UIC for GPA and learning balance?",
  "Can you rank the best professors for CS at UIC?",
  "How much does UIC actually cost after aid?",
  "What is the cheapest way to attend UIC?",
  "How much debt do UIC students usually graduate with?",
  "How much does it cost to live on campus at UIC?",
  "Is UIC affordable compared to UIUC?",
  "Can you compare UIC cost for living on campus versus commuting?",
  "What scholarships are easiest to get at UIC?",
  "What is the best dorm at UIC for freshmen?",
  "Which UIC dorm is the most social?",
  "What is the best dorm at UIC overall?",
  "What is the quietest dorm at UIC?",
  "What is the cheapest dorm that still feels nice?",
  "Should I live on campus or off campus?",
  "What neighborhoods are best for UIC students?",
  "Can you compare ARC and JST for me?",
  "What is UIC student life really like?",
  "How do I make friends fast at UIC?",
  "What clubs are best for making friends at UIC?",
  "What should I do my first month at UIC?",
  "What are the best clubs for meeting ambitious people at UIC?",
  "How do I meet people at UIC as a commuter?",
  "Where is the cheapest food near UIC?",
  "What food is open late at UIC?",
  "Is the UIC meal plan worth it?",
  "What is the best meal plan at UIC?",
  "Where can I eat between classes at UIC?",
  "How do I find internships as a UIC student?",
  "What should CS majors do early at UIC for career success?",
  "What employers recruit at UIC?",
  "How do I build a strong resume as a freshman at UIC?",
  "How do I get experience if I have no internships yet?",
  "What should international students do first at UIC?",
  "How does CPT work at UIC?",
  "What is OPT and when can I apply?",
  "Can international students work on campus at UIC?",
  "How hard is it to get into UIC?",
  "What GPA do I need to get into UIC?",
  "What majors are hardest to get into at UIC?",
  "What should every new UIC student know?"
];

function shuffleArray(array: string[]): string[] {
  return [...array].sort(() => Math.random() - 0.5);
}

export default function HeroSearchBar() {
  const [phrases] = useState<string[]>(() => shuffleArray(PHRASES));
  const [displayed, setDisplayed] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (phrases.length === 0) return;

    if (paused) {
      const t = setTimeout(() => {
        setPaused(false);
        setDeleting(true);
      }, 1800);
      return () => clearTimeout(t);
    }

    const current = phrases[phraseIndex];

    if (!current) return;

    if (!deleting) {
      if (charIndex < current.length) {
        const t = setTimeout(() => {
          setDisplayed(current.slice(0, charIndex + 1));
          setCharIndex((c) => c + 1);
        }, 38);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => {
          setPaused(true);
        }, 0);
        return () => clearTimeout(t);
      }
    } else {
      if (charIndex > 0) {
        const t = setTimeout(() => {
          setDisplayed(current.slice(0, charIndex - 1));
          setCharIndex((c) => c - 1);
        }, 18);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => {
          setDeleting(false);
          setPhraseIndex((i) => (i + 1) % phrases.length);
        }, 0);
        return () => clearTimeout(t);
      }
    }
  }, [charIndex, deleting, paused, phraseIndex, phrases]);

  return (
    <div className="max-w-2xl mx-auto mb-6">
      <Link href="/chat?focus=1" className="group block w-full">
        <div className="flex cursor-text items-center gap-3 rounded-2xl border border-zinc-300 bg-white px-5 py-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-colors hover:border-red-400/55 hover:shadow-[0_18px_38px_rgba(239,68,68,0.08)] dark:border-white/10 dark:bg-white/6">
          <img
            src="/sparky-icon.png"
            alt="Sparky"
            className="w-7 h-7 object-contain"
          />
          <div className="min-w-0 flex-1 text-left">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-red-500 dark:text-red-300">
              SparkyAI
            </div>
            <span className="block text-sm text-zinc-500 dark:text-zinc-300">
            {displayed ? (
              <span className="text-zinc-800 dark:text-zinc-100">
                {displayed}
                <span className="inline-block w-0.5 h-3.5 bg-red-500 ml-0.5 align-middle animate-pulse" />
              </span>
            ) : (
              <span className="italic text-zinc-500 dark:text-zinc-300">Search courses or chat with Sparky...</span>
            )}
            </span>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors group-hover:bg-red-500">
            Search →
          </span>
        </div>
      </Link>
    </div>
  );
}
