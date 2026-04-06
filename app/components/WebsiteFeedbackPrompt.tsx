"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

const ACTIVE_TIME_BEFORE_PROMPT_MS = 30 * 60 * 1000;
const TICK_MS = 15 * 1000;
const ACTIVE_TIME_KEY = "uichicago.websiteFeedback.activeTimeMs";
const PROMPT_STATUS_KEY = "uichicago.websiteFeedback.status";
const LAST_PROMPT_DATE_KEY = "uichicago.websiteFeedback.lastPromptDate";

type SubmitStatus = "idle" | "sending" | "sent" | "error";

function readNumberFromStorage(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; the prompt can still work for this session.
  }
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function WebsiteFeedbackPrompt() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState("");
  const activeTimeRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const promptDateRef = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);

  const showPrompt = () => {
    if (readStorage(PROMPT_STATUS_KEY) === "submitted") return;

    const todayKey = getTodayKey();
    if (promptDateRef.current === todayKey || readStorage(LAST_PROMPT_DATE_KEY) === todayKey) return;

    writeStorage(LAST_PROMPT_DATE_KEY, todayKey);
    promptDateRef.current = todayKey;
    setOpen(true);
    posthog.capture("website_feedback_prompt_shown", {
      page: window.location.pathname,
      time_on_site_ms: activeTimeRef.current,
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const promptStatus = readStorage(PROMPT_STATUS_KEY);
    if (promptStatus === "submitted") return;

    activeTimeRef.current = readNumberFromStorage(ACTIVE_TIME_KEY);
    if (activeTimeRef.current >= ACTIVE_TIME_BEFORE_PROMPT_MS) {
      showPrompt();
      return;
    }

    lastTickRef.current = document.visibilityState === "visible" ? Date.now() : null;

    const tick = () => {
      if (document.visibilityState !== "visible") {
        lastTickRef.current = null;
        return;
      }

      const now = Date.now();
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
        return;
      }

      activeTimeRef.current += now - lastTickRef.current;
      lastTickRef.current = now;
      writeStorage(ACTIVE_TIME_KEY, String(activeTimeRef.current));

      if (activeTimeRef.current >= ACTIVE_TIME_BEFORE_PROMPT_MS) {
        showPrompt();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastTickRef.current = Date.now();
      } else {
        tick();
        lastTickRef.current = null;
      }
    };

    const intervalId = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      tick();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    setStatus("idle");
    setError("");
    posthog.capture("website_feedback_prompt_dismissed", {
      page: pathname,
      time_on_site_ms: activeTimeRef.current,
    });
  };

  const submit = async () => {
    const trimmedComment = comment.trim();
    if (!score && !trimmedComment) {
      setError("Choose a rating or leave a note first.");
      return;
    }

    setError("");
    setStatus("sending");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "website",
          score,
          comment: trimmedComment,
          page: pathname,
          timeOnSiteMs: activeTimeRef.current,
        }),
      });

      if (!response.ok) throw new Error("Feedback request failed");

      writeStorage(PROMPT_STATUS_KEY, "submitted");
      setStatus("sent");
      posthog.capture("website_feedback_submitted", {
        score,
        has_comment: !!trimmedComment,
        page: pathname,
        time_on_site_ms: activeTimeRef.current,
      });
      window.setTimeout(() => setOpen(false), 1200);
    } catch {
      setStatus("error");
    }
  };

  const modal = open ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg bg-zinc-950 p-5 text-white shadow-2xl ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">How is UIChicago working for you?</h3>
            <p className="mt-1 text-sm text-white/65">
              You have been here for a bit. A quick rating or note would help make the site better.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-2 py-1 text-sm text-white ring-1 ring-white/10 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-white/80">Rating</p>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setScore(value);
                    setError("");
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${
                    score === value
                      ? "bg-emerald-500 text-white ring-emerald-300"
                      : "bg-zinc-900 text-white/75 ring-white/10 hover:bg-white/10"
                  }`}
                  aria-pressed={score === value}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-white/45">
              <span>Needs work</span>
              <span>Love it</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-white/80" htmlFor="website-feedback-comment">
              Feedback
            </label>
            <textarea
              id="website-feedback-comment"
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setError("");
              }}
              placeholder="What should be improved, fixed, or added?"
              className="mt-2 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-emerald-400"
              rows={4}
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={submit}
              disabled={status === "sending" || status === "sent"}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : status === "sent" ? "Sent" : "Send feedback"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/5"
            >
              Not today
            </button>
            {status === "sent" ? <span className="text-sm text-emerald-300">Thank you, this helps.</span> : null}
            {status === "error" ? <span className="text-sm text-red-300">Could not send. Try again.</span> : null}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return mounted && modal ? createPortal(modal, document.body) : null;
}
