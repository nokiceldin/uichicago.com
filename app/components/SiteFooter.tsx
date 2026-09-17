import ContactButton from "@/app/components/ContactButton";
import Link from "next/link";

type SiteFooterProps = {
  className?: string;
};

export default function SiteFooter({ className = "" }: SiteFooterProps) {
  return (
    <footer className={`border-t border-zinc-200 bg-zinc-50/70 px-4 py-8 text-sm dark:border-white/10 dark:bg-zinc-950/70 sm:px-6 ${className}`.trim()}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center sm:text-left">
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              UIChicago <span className="font-normal text-zinc-500">by Sparky Labs</span>
            </div>
            <p className="mt-1.5 text-sm text-zinc-500">
              Powered by real course, professor, and campus data.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            <Link
              href="/methodology"
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-red-400/40 dark:hover:text-red-300"
            >
              Methodology
            </Link>
            <ContactButton
              page="footer"
              buttonLabel="Contact"
              className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-700 transition hover:border-red-500/50 hover:bg-red-500/15 dark:text-red-200"
            />
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-200 pt-4 text-center text-[11px] tracking-[0.12em] text-zinc-500 dark:border-white/10 sm:text-left">
          Student-built, unofficial, and transparent about sources
        </div>
      </div>
    </footer>
  );
}
