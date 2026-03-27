"use client";

import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

type GoogleSignInButtonProps = {
  callbackUrl?: string;
  label?: string;
  className?: string;
};

export default function GoogleSignInButton({
  callbackUrl = "/study",
  label = "Continue with Google",
  className = "",
}: GoogleSignInButtonProps) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          setPending(true);
          await signIn("google", { callbackUrl });
        } finally {
          setPending(false);
        }
      }}
      disabled={pending}
      className={`inline-flex items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/12 dark:bg-white dark:text-zinc-950 ${className}`}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.5-.2-2.2H12Z" />
          <path fill="#34A853" d="M12 21c2.6 0 4.9-.9 6.5-2.5l-3.1-2.4c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1l-3.2 2.5C4.8 18.7 8.1 21 12 21Z" />
          <path fill="#4A90E2" d="M6.4 12.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.2 6.6A9 9 0 0 0 2.2 11c0 1.6.4 3.1 1 4.4l3.2-2.5Z" />
          <path fill="#FBBC05" d="M12 5.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.2 14.6 1.2 12 1.2 8.1 1.2 4.8 3.5 3.2 6.6l3.2 2.5C7.2 6.8 9.4 5.1 12 5.1Z" />
        </svg>
      )}
      <span>{pending ? "Connecting..." : label}</span>
    </button>
  );
}
