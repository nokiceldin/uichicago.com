"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const PHRASES = [
  'Which dorm is cheapest?',
  'Best CS professor?',
  'Easiest math elective?',
  'Do I qualify for the Aspire Grant?',
  'Who grades easy in MATH 160?',
  'Is CHEM 130 hard?',
  'Which dorm should I pick as a freshman?',
  'Best professor in Computer Science?',
];

export default function HeroSearchBar() {
  const [displayed, setDisplayed] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      const t = setTimeout(() => { setPaused(false); setDeleting(true); }, 1800);
      return () => clearTimeout(t);
    }

    const current = PHRASES[phraseIndex];

    if (!deleting) {
      if (charIndex < current.length) {
        const t = setTimeout(() => {
          setDisplayed(current.slice(0, charIndex + 1));
          setCharIndex(c => c + 1);
        }, 38);
        return () => clearTimeout(t);
      } else {
        setPaused(true);
      }
    } else {
      if (charIndex > 0) {
        const t = setTimeout(() => {
          setDisplayed(current.slice(0, charIndex - 1));
          setCharIndex(c => c - 1);
        }, 18);
        return () => clearTimeout(t);
      } else {
        setDeleting(false);
        setPhraseIndex(i => (i + 1) % PHRASES.length);
      }
    }
  }, [charIndex, deleting, paused, phraseIndex]);

  return (
    <div className="max-w-2xl mx-auto mb-6">
      <Link href="/chat" className="group block w-full">
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4 hover:border-red-500 transition-colors cursor-text">
          <img src="/sparky-icon.png" alt="Sparky" className="w-7 h-7 object-contain" />
          <span className="flex-1 text-sm text-zinc-500 text-left min-w-0">
            {displayed
              ? <span className="text-zinc-300">{displayed}<span className="inline-block w-0.5 h-3.5 bg-red-500 ml-0.5 align-middle animate-pulse" /></span>
              : <span className="italic">Ask Sparky anything...</span>
            }
          </span>
          <span className="bg-red-600 group-hover:bg-red-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap shrink-0">
            Ask Sparky →
          </span>
        </div>
      </Link>
    </div>
  );
}