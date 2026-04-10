import ContactButton from "@/app/components/ContactButton";
import Link from "next/link";

type SiteFooterProps = {
  className?: string;
};

export default function SiteFooter({ className = "" }: SiteFooterProps) {
  return (
    <footer className={`border-t border-zinc-200 px-6 py-8 text-sm dark:border-white/10 ${className}`.trim()}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 text-zinc-500 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-zinc-500">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">UIChicago</span> by Sparky Labs
        </div>
        <div className="text-sm text-zinc-500 md:text-center">
          <div>Powered by real course, professor, and campus data</div>
          <div className="mt-1">
            <Link
              href="/methodology"
              className="font-medium text-zinc-600 transition hover:text-red-500 dark:text-zinc-300 dark:hover:text-red-300"
            >
              Read the methodology
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 text-center md:items-end md:text-right">
          <a
            href="mailto:uicratings@gmail.com"
            className="text-sm font-medium text-zinc-600 transition hover:text-red-500 dark:text-zinc-300 dark:hover:text-red-300"
          >
            uicratings@gmail.com
          </a>
          <ContactButton
            page="footer"
            buttonLabel="Contact"
            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          />
          <div className="text-[11px] tracking-[0.12em] text-zinc-500/90">
            Student-built, unofficial, and transparent about sources
          </div>
        </div>
      </div>
    </footer>
  );
}
