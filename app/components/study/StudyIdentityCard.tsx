"use client";

type StudyProfileForm = {
  school: string;
  major: string;
  currentCourses: string;
  interests: string;
  studyPreferences: string;
};

type StudyIdentityCardProps = {
  isSignedIn: boolean;
  isSaving: boolean;
  displayName?: string | null;
  email?: string | null;
  profile: StudyProfileForm;
  collapsed: boolean;
  onProfileChange: (updater: (current: StudyProfileForm) => StudyProfileForm) => void;
  onSave: () => void;
  onSignIn: () => void;
  onToggleCollapsed: (next: boolean) => void;
};

export type { StudyProfileForm };

export default function StudyIdentityCard({
  isSignedIn,
  isSaving,
  displayName,
  email,
  profile,
  collapsed,
  onProfileChange,
  onSave,
  onSignIn,
  onToggleCollapsed,
}: StudyIdentityCardProps) {
  if (!isSignedIn) {
    return (
      <section className="rounded-[1.6rem] border border-indigo-400/20 bg-[linear-gradient(135deg,rgba(79,70,229,0.18),rgba(15,23,42,0.82))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.3)]">
        <div className="max-w-2xl">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-200">My School profile</div>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-white">Sign in to keep your courses, plans, library, and study groups attached to a real account.</h2>
          <p className="mt-3 text-sm leading-6 text-indigo-50/85">
            Google sign in unlocks saved school context for Sparky, verified study groups, and persistence for your study sets, notes, and planning preferences.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-5 inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
          >
            Continue with Google
          </button>
        </div>
      </section>
    );
  }

  const summaryParts = [
    profile.major.trim(),
    profile.currentCourses.trim(),
    profile.studyPreferences.trim(),
  ].filter(Boolean);

  if (collapsed) {
    return (
      <section className="rounded-[1.2rem] border border-white/8 bg-white/3 px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">My School profile</div>
            <div className="mt-1 text-sm font-medium text-white">{displayName || "Your school profile"}</div>
            <div className="mt-1 truncate text-sm text-zinc-400">
              {summaryParts.length ? summaryParts.join(" • ") : "Optional school context for more personalized planning and study help."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleCollapsed(false)}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/8"
          >
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.6rem] border border-white/10 bg-white/4 p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">My School profile</div>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-white">{displayName || "Your school profile"}</h2>
          <p className="mt-2 text-sm text-zinc-400">{email || "Signed in account"}</p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-full bg-[#4f46e5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5b54ef] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving..." : "Save profile"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">School</div>
          <input
            value={profile.school}
            onChange={(event) => onProfileChange((current) => ({ ...current, school: event.target.value }))}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none"
          />
        </label>
        <label className="block">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Major</div>
          <input
            value={profile.major}
            onChange={(event) => onProfileChange((current) => ({ ...current, major: event.target.value }))}
            placeholder="Computer Science"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </label>
        <label className="block">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current courses</div>
          <input
            value={profile.currentCourses}
            onChange={(event) => onProfileChange((current) => ({ ...current, currentCourses: event.target.value }))}
            placeholder="CS 251, MATH 210"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </label>
        <label className="block">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Interests</div>
          <input
            value={profile.interests}
            onChange={(event) => onProfileChange((current) => ({ ...current, interests: event.target.value }))}
            placeholder="Algorithms, exam prep, group study"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Study preferences</div>
        <textarea
          value={profile.studyPreferences}
          onChange={(event) => onProfileChange((current) => ({ ...current, studyPreferences: event.target.value }))}
          rows={3}
          placeholder="Examples: likes spaced repetition, prefers concise explanations, wants quiz-heavy practice"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </label>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => onToggleCollapsed(true)}
          className="text-sm font-medium text-zinc-400 transition hover:text-white"
        >
          Hide for now
        </button>
      </div>
    </section>
  );
}
