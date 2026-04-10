"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type TourStep = {
  title: string;
  description: string;
  targetId?: string;
};

type RectState = {
  top: number;
  left: number;
  width: number;
  height: number;
} | null;

type FeatureTourProps = {
  storageKey: string;
  steps: TourStep[];
  buttonLabel?: string;
  className?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function FeatureTour({
  storageKey,
  steps,
  buttonLabel = "Take the 20-second tour",
  className = "",
}: FeatureTourProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectState>(null);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!open || !step?.targetId) {
      const frame = window.requestAnimationFrame(() => setTargetRect(null));
      return () => window.cancelAnimationFrame(frame);
    }

    if (typeof window === "undefined") {
      return;
    }

    const updateRect = () => {
      const element = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${step.targetId}"]`),
      ).find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!element) {
        setTargetRect(null);
        return;
      }

      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    updateRect();

    const observer = new MutationObserver(updateRect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, step?.targetId]);

  const cardStyle = useMemo(() => {
    if (!targetRect || typeof window === "undefined") {
      return { right: 20, bottom: 20 };
    }

    const viewportPadding = 12;
    const gap = 16;
    const cardWidth = Math.min(340, window.innerWidth - viewportPadding * 2);
    const estimatedCardHeight = 170;

    const spaces = {
      right: window.innerWidth - (targetRect.left + targetRect.width) - viewportPadding,
      left: targetRect.left - viewportPadding,
      bottom: window.innerHeight - (targetRect.top + targetRect.height) - viewportPadding,
      top: targetRect.top - viewportPadding,
    };

    const canFit = {
      right: spaces.right >= cardWidth + gap,
      left: spaces.left >= cardWidth + gap,
      bottom: spaces.bottom >= estimatedCardHeight + gap,
      top: spaces.top >= estimatedCardHeight + gap,
    };

    let placement: "right" | "left" | "bottom" | "top" = "bottom";
    if (canFit.right) placement = "right";
    else if (canFit.left) placement = "left";
    else if (canFit.bottom) placement = "bottom";
    else if (canFit.top) placement = "top";
    else {
      placement = (Object.entries(spaces).sort((a, b) => b[1] - a[1])[0]?.[0] as typeof placement) || "bottom";
    }

    let left = viewportPadding;
    let top = viewportPadding;

    if (placement === "right") {
      left = targetRect.left + targetRect.width + gap;
      top = targetRect.top + targetRect.height / 2 - estimatedCardHeight / 2;
    } else if (placement === "left") {
      left = targetRect.left - cardWidth - gap;
      top = targetRect.top + targetRect.height / 2 - estimatedCardHeight / 2;
    } else if (placement === "top") {
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      top = targetRect.top - estimatedCardHeight - gap;
    } else {
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      top = targetRect.top + targetRect.height + gap;
    }

    left = clamp(left, viewportPadding, Math.max(viewportPadding, window.innerWidth - cardWidth - viewportPadding));
    top = clamp(top, viewportPadding, Math.max(viewportPadding, window.innerHeight - estimatedCardHeight - viewportPadding));

    return { left, top, width: cardWidth };
  }, [targetRect]);

  if (steps.length === 0) {
    return null;
  }

  const finishTour = () => {
    try {
      window.localStorage.setItem(storageKey, "done");
    } catch {
      // Ignore storage failures and still hide the tour for this session.
    }
    setOpen(false);
  };

  const nextStep = () => {
    if (stepIndex >= steps.length - 1) {
      finishTour();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  const startTour = () => {
    setStepIndex(0);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={startTour}
        className={`inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-red-300 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-red-400/35 dark:hover:bg-white/8 ${className}`.trim()}
      >
        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
        {buttonLabel}
      </button>
      {open
        ? createPortal(
            <>
      <aside
        className="fixed z-[80] w-[min(360px,calc(100vw-24px))] rounded-[24px] border border-zinc-200/80 bg-white/96 p-4 text-zinc-900 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur dark:border-white/10 dark:bg-zinc-950/92 dark:text-zinc-100"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-400">
              Quick tour
            </div>
            <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
          </div>
          <button
            type="button"
            onClick={finishTour}
            className="rounded-full px-2 py-1 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Skip tutorial"
          >
            Skip
          </button>
        </div>

        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{step.description}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {steps.map((_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === stepIndex
                    ? "w-6 bg-sky-500"
                    : "w-1.5 bg-zinc-300 dark:bg-zinc-600"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={nextStep}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {stepIndex === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </aside>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
