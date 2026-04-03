"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";

type ContactButtonProps = {
  page?: string;
  buttonLabel?: string;
  className?: string;
  title?: string;
  description?: string;
};

export default function ContactButton({
  page = "unknown",
  buttonLabel = "Contact",
  className = "",
  title = "Contact us",
  description = "Send a message and it will go straight to us.",
}: ContactButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const resetForm = () => {
    setName("");
    setDetails("");
    setEmail("");
    setStatus("idle");
  };

  async function submit() {
    setStatus("sending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: details,
          email,
          page,
        }),
      });

      if (!response.ok) throw new Error("bad");

      setStatus("sent");
      posthog.capture("contact_form_submitted", {
        page,
        has_email: !!email.trim(),
      });
      setName("");
      setDetails("");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  const modal = open ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm text-white/65">{description}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setStatus("idle");
            }}
            className="rounded-lg px-2 py-1 text-white ring-1 ring-white/10 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm text-white/70">
              Your name <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 text-white ring-1 ring-white/10 outline-none placeholder:text-white/30"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">
              What do you want to contact about? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Tell us what you need help with"
              className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 text-white ring-1 ring-white/10 outline-none placeholder:text-white/30"
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Email (optional)</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email if you want a reply"
              type="email"
              className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 text-white ring-1 ring-white/10 outline-none placeholder:text-white/30"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={submit}
              disabled={status === "sending" || name.trim().length < 2 || details.trim().length < 5}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Submit"}
            </button>

            {status === "sent" ? <span className="text-sm text-emerald-300">Sent, thank you</span> : null}
            {status === "error" ? <span className="text-sm text-red-300">Error, try again</span> : null}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        className={className}
      >
        {buttonLabel}
      </button>

      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
