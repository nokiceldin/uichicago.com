"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function getTargetMeta(nextPath: string) {
  if (nextPath.startsWith("/study")) {
    return {
      badge: "Private Area",
      title: "My School is locked",
      description: "Enter the password to open your personal school workspace.",
      button: "Enter My School",
      accent: "from-indigo-500 to-indigo-600",
      glow: "shadow-indigo-950/35",
      dot: "bg-indigo-400",
    };
  }

  return {
    badge: "Private Area",
    title: "Sparky is locked",
    description: "Enter the password to continue into Sparky.",
    button: "Enter Sparky",
    accent: "from-red-500 to-red-600",
    glow: "shadow-red-950/35",
    dot: "bg-red-400",
  };
}

export default function UnlockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const nextPath = useMemo(() => {
    const requested = searchParams.get("next") || "/chat";
    if (!requested.startsWith("/") || requested.startsWith("//")) return "/chat";
    return requested;
  }, [searchParams]);

  const meta = getTargetMeta(nextPath);

  const submit = async () => {
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/private-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next: nextPath }),
      });

      if (!response.ok) {
        setShake(true);
        setPassword("");
        setError("Incorrect password. Please try again.");
        window.setTimeout(() => setShake(false), 500);
        window.setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.12),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(239,68,68,0.12),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#ffffff_100%)] px-4 dark:bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(239,68,68,0.16),transparent_24%),linear-gradient(180deg,#080811_0%,#0b1020_45%,#05060a_100%)]">
      <style>{`
        @keyframes unlockFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes unlockShake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
        .unlock-float { animation: unlockFloat 3.6s ease-in-out infinite; }
        .unlock-shake { animation: unlockShake 0.45s ease; }
      `}</style>

      <div className="w-full max-w-md rounded-[2rem] border border-white/60 bg-white/85 p-7 shadow-[0_32px_120px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-[rgba(8,10,20,0.82)] dark:shadow-[0_32px_120px_rgba(0,0,0,0.42)]">
        <div className="unlock-float mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-white/50 bg-white/80 shadow-lg dark:border-white/10 dark:bg-white/[0.06]">
          <div className={`h-4 w-4 rounded-full ${meta.dot} shadow-[0_0_24px_currentColor]`} />
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.badge}
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.05em] text-zinc-950 dark:text-white">{meta.title}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{meta.description}</p>
        </div>

        <div className={`mt-7 ${shake ? "unlock-shake" : ""}`}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submit();
              }
            }}
            placeholder="Enter password"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[16px] text-zinc-950 outline-none transition focus:border-zinc-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/25"
          />
          {error ? <p className="mt-2 text-xs text-red-500 dark:text-red-300">{error}</p> : null}
        </div>

        <button
          onClick={() => void submit()}
          disabled={!password.trim() || submitting}
          className={`mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-b ${meta.accent} px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 ${meta.glow}`}
        >
          {submitting ? "Checking..." : meta.button}
        </button>
      </div>
    </main>
  );
}
