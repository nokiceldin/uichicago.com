"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function NavbarAuthControls() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (status === "loading") {
    return <div className="h-10 w-28 rounded-full border border-zinc-200 bg-zinc-100/80 dark:border-white/10 dark:bg-white/[0.05]" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: pathname || "/" })}
        className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/12 dark:bg-white dark:text-zinc-950"
      >
        Sign in
      </button>
    );
  }

  const initials =
    session.user.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/90 px-2 py-1.5 text-sm shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.05]"
        aria-label="Open account menu"
        aria-expanded={open}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
          {initials}
        </div>
        <ChevronDown className={`hidden h-4 w-4 text-zinc-500 transition md:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-[240px] rounded-[1.25rem] border border-zinc-200 bg-white p-2 shadow-[0_22px_50px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[#13151c]">
          <div className="rounded-[1rem] bg-zinc-50 px-3 py-3 dark:bg-white/[0.04]">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">
              {session.user.name || "Signed in"}
            </div>
            <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {session.user.email}
            </div>
          </div>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-2 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
