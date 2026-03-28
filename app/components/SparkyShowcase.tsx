"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ShowcasePrompt = {
  tag: string;
  emoji: string;
  questions: string[];
};

type ShowcaseExample = {
  question: string;
  answer: string;
  chips: string[];
};

const rotatingExamples: ShowcaseExample[] = [
  {
    question: "I am pre-med and commuting. Which first-year classes should I take without making life miserable?",
    answer:
      "Start with BIOS 110, CHEM 122/123, and one lighter Gen Ed so your commute and lab schedule stay manageable. Then build around that instead of stacking every hard science at once.",
    chips: ["Pre-med", "Planning", "Commuter"],
  },
  {
    question: "What should I actually major in if I like business but also want solid job options?",
    answer:
      "Finance, accounting, and IDS are strong places to start because they stay practical and recruitable. The best fit depends on whether you want analysis, client-facing work, or more technical problem solving.",
    chips: ["Majors", "Careers", "Advice"],
  },
  {
    question: "I want to make friends fast. Where do people actually go out or socialize around UIC?",
    answer:
      "Start with Weeks of Welcome, big student org events, and the social spots around campus before branching into nearby nightlife. If you want, I can point you to the most social orgs, party scenes, or best places to meet people as a commuter.",
    chips: ["Campus life", "Social", "Nightlife"],
  },
  {
    question: "I have biology notes. Can you turn them into flashcards and a quiz for me?",
    answer:
      "Yes — the study tools here can turn notes into flashcards, test questions, and timed practice so you are not building everything by hand first.",
    chips: ["Study", "Flashcards", "AI"],
  },
];

const promptSlots: ShowcasePrompt[] = [
  {
    tag: "Planning",
    emoji: "🗺️",
    questions: [
      "How should a transfer student plan their first semester?",
      "Can you help me build a smart 4-year plan?",
      "What should a freshman majoring in biology take first?",
    ],
  },
  {
    tag: "Campus Life",
    emoji: "🎉",
    questions: [
      "Where do people actually go out or party near UIC?",
      "What are the most social student events at UIC?",
      "What clubs are best if I want friends and a real social life?",
    ],
  },
  {
    tag: "Dining",
    emoji: "🍔",
    questions: [
      "What food near UIC is actually good after 10pm?",
      "Best late-night spots around UIC if I'm hungry after studying?",
      "Where do students actually go for good cheap food near campus?",
    ],
  },
  {
    tag: "Costs",
    emoji: "💰",
    questions: [
      "What scholarships or grants should I look at first?",
      "How can I lower my costs at UIC without making life miserable?",
      "What financial aid help is actually worth checking first at UIC?",
    ],
  },
  {
    tag: "Athletics",
    emoji: "🔥",
    questions: [
      "How do free student tickets for games work?",
      "What UIC games are actually the most fun to go to?",
      "How do I get into the student section for UIC games?",
    ],
  },
];

export default function SparkyShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % rotatingExamples.length);
    }, 5400);

    return () => window.clearInterval(interval);
  }, []);

  const activeExample = rotatingExamples[activeIndex];
  const visiblePrompts = useMemo(
    () =>
      promptSlots.map((slot, index) => ({
        tag: slot.tag,
        emoji: slot.emoji,
        question: slot.questions[(activeIndex + index) % slot.questions.length],
      })),
    [activeIndex],
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.08fr_0.92fr]">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-red-500">See Sparky In Action</div>
        <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
          Sparky becomes the intelligent layer.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Use chat for recommendations, plans, and quick answers when the data pages alone are not enough.
        </p>
        <div className="mt-8 overflow-hidden rounded-[1.7rem] border border-zinc-300 bg-white shadow-[0_22px_54px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,17,22,0.92),rgba(11,13,18,0.9))] dark:shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-4 dark:border-white/8">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-500">Live example</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">Real student questions</div>
            </div>
            <div className="rounded-full border border-red-300/45 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              Sparky AI
            </div>
          </div>
          <div className="space-y-4 px-5 py-5">
            <div className="flex justify-end">
              <div className="max-w-[88%] min-h-[4.5rem] rounded-[1.4rem] bg-zinc-900 px-4 py-3 text-sm font-medium leading-6 text-white dark:bg-zinc-800">
                {activeExample.question}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <img src="/sparky-icon.png" alt="Sparky" className="mt-1 h-7 w-7 shrink-0 object-contain" />
              <div className="max-w-[92%]">
                <div className="min-h-[10.5rem] text-sm leading-7 text-zinc-800 transition-all duration-300 dark:text-zinc-300">
                  {activeExample.answer}
                </div>
                <div className="mt-4 flex min-h-[2rem] flex-wrap gap-2">
                  {activeExample.chips.map((chip, index) => (
                    <span
                      key={chip}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        index === 0
                          ? "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : index === 1
                          ? "border border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                          : "border border-red-300 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                      }`}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <Link
            href="/chat"
            className="premium-button group inline-flex items-center gap-3 rounded-full border border-red-400/35 bg-[linear-gradient(180deg,rgba(239,68,68,0.92),rgba(220,38,38,0.88))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(239,68,68,0.18)] transition hover:border-red-300/55 hover:shadow-[0_18px_42px_rgba(239,68,68,0.24)]"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.45)]" />
            Open Sparky
            <span className="transition group-hover:translate-x-0.5">→</span>
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Try questions like</div>
        <div className="grid gap-3">
          {visiblePrompts.map((item) => (
            <Link
              key={item.tag}
              href={`/chat?q=${encodeURIComponent(item.question)}`}
              style={{ animationDelay: `${45 * (visiblePrompts.indexOf(item) + 1)}ms` }}
              className="premium-card premium-fade-up rounded-[1.2rem] border border-zinc-300 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition hover:border-red-400/40 hover:bg-white hover:shadow-lg dark:border-white/10 dark:bg-[rgba(15,17,22,0.75)] dark:hover:bg-[rgba(19,22,28,0.92)]"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-red-300/50 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:border-red-400/30 dark:bg-red-400/16 dark:text-red-200">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[13px] not-italic leading-none">
                  {item.emoji}
                </span>
                {item.tag}
              </div>
              <p className="mt-3 min-h-[3.5rem] text-sm leading-7 text-zinc-800 dark:text-zinc-300">
                {item.question}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
