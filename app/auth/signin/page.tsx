import GoogleSignInButton from "@/app/components/auth/GoogleSignInButton";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/study";

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.18),transparent_25%),linear-gradient(180deg,#0d0d10_0%,#120809_55%,#09090b_100%)] px-4 py-10 text-white sm:px-6 sm:py-16">
      <div className="mx-auto flex min-h-[78vh] max-w-5xl items-center">
        <div className="grid w-full gap-8 overflow-hidden rounded-4xl border border-white/10 bg-white/4 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-red-200">
              UIChicago
            </div>
            <h1 className="mt-5 max-w-[12ch] text-3xl font-black tracking-[-0.05em] text-white sm:mt-6 md:text-5xl">
              Sign in once.
              <span className="block bg-linear-to-r from-white via-red-200 to-red-400 bg-clip-text text-transparent">
                Stay known everywhere.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300">
              Use Google to keep your study identity, saved academic context, verified study groups, and future Sparky personalization tied to one real account.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5 sm:p-6">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-400">Continue</div>
            <div className="mt-3 text-2xl font-bold tracking-[-0.04em] text-white">Fast, clean Google sign in</div>
            <div className="mt-6">
              <GoogleSignInButton callbackUrl={callbackUrl} className="w-full justify-center py-3.5" />
            </div>
            {params.error ? (
              <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Sign in did not complete. Check your Google OAuth setup and try again.
              </p>
            ) : null}
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/4 p-4 text-sm leading-6 text-zinc-300">
              First sign-in automatically creates your profile with UIC as the default school, then keeps your study sets, sessions, and group identity attached to that account.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
