"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type NeighborProfessor = {
  href: string;
  name: string;
  department: string;
  rating: string;
};

type ProfessorPageNavigatorProps = {
  currentName: string;
  previous: NeighborProfessor | null;
  next: NeighborProfessor | null;
};

type Direction = "left" | "right";

function EdgeButton({
  side,
  label,
  neighbor,
  onNavigate,
}: {
  side: Direction;
  label: string;
  neighbor: NeighborProfessor | null;
  onNavigate: (
    event: MouseEvent<HTMLAnchorElement>,
    neighbor: NeighborProfessor,
    direction: Direction,
  ) => void;
}) {
  const isLeft = side === "left";
  const alignment = isLeft ? "items-start text-left" : "items-end text-right";
  const panelPosition = isLeft ? "left-16" : "right-16";
  const buttonPosition = isLeft ? "left-4" : "right-4";
  const hoverTransform = isLeft ? "group-hover:translate-x-1" : "group-hover:-translate-x-1";

  return (
    <div
      className={`pointer-events-none fixed top-1/2 z-50 hidden h-64 w-28 -translate-y-1/2 xl:flex ${isLeft ? "left-0 justify-start" : "right-0 justify-end"}`}
    >
      {neighbor ? (
        <Link
          href={neighbor.href}
          onClick={(event) => onNavigate(event, neighbor, side)}
          className="pointer-events-auto group relative flex h-full w-full items-center"
          aria-label={`${label} professor: ${neighbor.name}`}
        >
          <div
            className={`absolute inset-y-0 ${isLeft ? "left-0" : "right-0"} w-full rounded-3xl bg-gradient-to-${isLeft ? "r" : "l"} from-white/[0.06] via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100`}
          />
          <div className={`pointer-events-none absolute top-1/2 z-20 ${panelPosition} hidden w-52 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#111723]/96 p-4 text-white shadow-[0_20px_55px_rgba(0,0,0,0.38)] backdrop-blur-xl group-hover:block`}>
            <div className={`flex ${alignment} gap-2`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
              <div className="text-base font-semibold leading-tight">{neighbor.name}</div>
              <div className="text-xs text-zinc-400">{neighbor.department}</div>
              <div className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold text-zinc-200">
                {neighbor.rating}
              </div>
            </div>
          </div>
          <div className={`absolute top-1/2 z-10 ${buttonPosition} flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#111723]/92 text-zinc-100 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl transition ${hoverTransform}`}>
            {isLeft ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </div>
        </Link>
      ) : null}
    </div>
  );
}

export default function ProfessorPageNavigator({
  currentName,
  previous,
  next,
}: ProfessorPageNavigatorProps) {
  const [transitionDirection, setTransitionDirection] = useState<Direction | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleNavigate = useCallback((
    event: MouseEvent<HTMLAnchorElement> | KeyboardEvent,
    neighbor: NeighborProfessor,
    direction: Direction,
  ) => {
    if (isTransitioning) return;

    event.preventDefault();
    setTransitionDirection(direction);
    setIsTransitioning(true);

    window.setTimeout(() => {
      window.location.assign(neighbor.href);
    }, 180);
  }, [isTransitioning]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || event.target.isContentEditable) return;
      }

      if (event.key === "ArrowLeft" && previous) {
        handleNavigate(event, previous, "left");
      }

      if (event.key === "ArrowRight" && next) {
        handleNavigate(event, next, "right");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNavigate, next, previous]);

  if (typeof document === "undefined") return null;

  return createPortal((
    <>
      <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0d1320]/92 px-3 py-2 text-xs font-medium text-zinc-300 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:hidden">
        {previous ? (
          <Link
            href={previous.href}
            onClick={(event) => handleNavigate(event, previous, "left")}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 transition hover:bg-white/10"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Link>
        ) : null}
        <span className="max-w-[12rem] truncate px-1 text-zinc-400">{currentName}</span>
        {next ? (
          <Link
            href={next.href}
            onClick={(event) => handleNavigate(event, next, "right")}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 transition hover:bg-white/10"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <EdgeButton side="left" label="Previous" neighbor={previous} onNavigate={handleNavigate} />
      <EdgeButton side="right" label="Next" neighbor={next} onNavigate={handleNavigate} />

      <div
        className={`pointer-events-none fixed inset-0 z-60 bg-[linear-gradient(180deg,rgba(8,10,16,0.98),rgba(10,14,22,0.98))] transition-transform duration-200 ease-out ${
          isTransitioning && transitionDirection === "right"
            ? "translate-x-0"
            : isTransitioning && transitionDirection === "left"
              ? "translate-x-0"
              : "translate-x-full"
        }`}
        style={{
          transform:
            isTransitioning && transitionDirection === "right"
              ? "translateX(0)"
              : isTransitioning && transitionDirection === "left"
                ? "translateX(0)"
                : undefined,
          clipPath:
            isTransitioning && transitionDirection === "right"
              ? "inset(0 0 0 0)"
              : isTransitioning && transitionDirection === "left"
                ? "inset(0 0 0 0)"
                : undefined,
        }}
      >
        {isTransitioning && transitionDirection ? (
          <div
            className={`absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.16),transparent_34%)] ${
              transitionDirection === "right" ? "animate-[slideInFromRight_180ms_ease-out_forwards]" : "animate-[slideInFromLeft_180ms_ease-out_forwards]"
            }`}
          />
        ) : null}
      </div>

      <style jsx global>{`
        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        @keyframes slideInFromLeft {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  ), document.body);
}
