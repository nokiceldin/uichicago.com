"use client";

import { LogOut } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function NavbarAuthControls() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

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
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50/90 px-3 py-1.5 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.05] md:flex">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
          {initials}
        </div>
        <div className="max-w-[150px] truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {session.user.name || session.user.email}
        </div>
      </div>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/12 dark:bg-white/[0.05] dark:text-zinc-200"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
