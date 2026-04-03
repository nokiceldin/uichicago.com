"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { CheckCircle2, ChevronDown, ChevronRight, ImageIcon, Plus, Search, Upload, UserRound, X } from "lucide-react";
import { parseCommaSeparated, readLocalStudyProfile, writeLocalStudyProfile } from "@/lib/study/profile";
import type { SiteSettingsPayload } from "@/lib/study/profile";
import {
  PRESET_AVATARS,
  getPresetAvatarUrl,
  readLocalSiteSettings,
  resolveAvatarUrl,
  writeLocalSiteSettings,
} from "@/lib/site-settings";

type ProfileFormState = {
  school: string;
  major: string;
  majorSlug: string;
  currentCourses: string;
  completedCourses: string;
  interests: string;
  studyPreferences: string;
  currentSemesterNumber: string;
  honorsStudent: boolean;
};

type CourseSuggestion = {
  id: string;
  code: string;
  title: string;
  href: string;
};

type MajorOption = {
  name: string;
  slug: string;
  college: string;
  hasSchedule: boolean;
};

const emptyProfile: ProfileFormState = {
  school: "UIC",
  major: "",
  majorSlug: "",
  currentCourses: "",
  completedCourses: "",
  interests: "",
  studyPreferences: "",
  currentSemesterNumber: "0",
  honorsStudent: false,
};

const STUDY_PROFILE_EVENT = "uichicago-study-profile-change";

function serializeProfileForm(form: ProfileFormState) {
  const unifiedCourses = Array.from(new Set([
    ...parseCommaSeparated(form.currentCourses),
    ...parseCommaSeparated(form.completedCourses),
  ]));
  return JSON.stringify({
    school: form.school.trim(),
    major: form.major.trim(),
    majorSlug: form.majorSlug.trim(),
    currentCourses: unifiedCourses,
    interests: parseCommaSeparated(form.interests),
    studyPreferences: form.studyPreferences.trim(),
    currentSemesterNumber: String(Number(form.currentSemesterNumber || "0")),
    honorsStudent: Boolean(form.honorsStudent),
  });
}

function formToStudyProfilePayload(form: ProfileFormState, settings?: SiteSettingsPayload) {
  const unifiedCourses = Array.from(new Set([
    ...parseCommaSeparated(form.currentCourses),
    ...parseCommaSeparated(form.completedCourses),
  ]));
  return {
    school: form.school.trim() || "UIC",
    major: form.major.trim(),
    currentCourses: unifiedCourses,
    interests: parseCommaSeparated(form.interests),
    studyPreferences: form.studyPreferences.trim(),
    plannerProfile: {
      majorSlug: form.majorSlug.trim() || undefined,
      currentSemesterNumber: Number(form.currentSemesterNumber || "0"),
      honorsStudent: Boolean(form.honorsStudent),
      currentCourses: unifiedCourses,
      completedCourses: [],
    },
    settings: settings ?? {},
  };
}

export default function ProfilePageClient() {
  const { data: session, status } = useSession();
  const [form, setForm] = useState<ProfileFormState>(() => {
    const cached = typeof window !== "undefined" ? readLocalStudyProfile() : null;
    if (!cached) return emptyProfile;
    return {
      school: cached.school || "UIC",
      major: cached.major || "",
      majorSlug: cached.plannerProfile.majorSlug || "",
      currentCourses: Array.isArray(cached.currentCourses) ? cached.currentCourses.join(", ") : "",
      completedCourses: "",
      interests: Array.isArray(cached.interests) ? cached.interests.join(", ") : "",
      studyPreferences: cached.studyPreferences || "",
      currentSemesterNumber: String(Number(cached.plannerProfile.currentSemesterNumber || 0)),
      honorsStudent: Boolean(cached.plannerProfile.honorsStudent),
    };
  });
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeProfileForm(form));
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [currentClassesOpen, setCurrentClassesOpen] = useState(false);
  const [currentCourseQuery, setCurrentCourseQuery] = useState("");
  const [currentCourseSuggestions, setCurrentCourseSuggestions] = useState<CourseSuggestion[]>([]);
  const [majorOptions, setMajorOptions] = useState<MajorOption[]>([]);
  const [majorPickerOpen, setMajorPickerOpen] = useState(false);
  const majorPickerRef = useRef<HTMLDivElement | null>(null);

  // --- Avatar state ---
  type AvatarPayload = NonNullable<SiteSettingsPayload["avatar"]>;
  const [avatar, setAvatar] = useState<AvatarPayload>(() => {
    // Read from localStorage immediately so the profile page shows the right
    // picture before the API response arrives (fixes the "wrong picture" flash).
    if (typeof window !== "undefined") {
      try {
        const localSettings = readLocalSiteSettings();
        if (localSettings.avatar?.type === "upload" && (localSettings.avatar as { type: "upload"; value?: string }).value) {
          return localSettings.avatar as AvatarPayload;
        }
        if (localSettings.avatar?.type === "preset" && (localSettings.avatar as { type: "preset"; value?: string }).value) {
          return localSettings.avatar as AvatarPayload;
        }
        if (localSettings.avatar?.type === "google") {
          return localSettings.avatar as AvatarPayload;
        }
      } catch {
        // ignore
      }
    }
    return { type: "google" };
  });
  const [fallbackAvatar, setFallbackAvatar] = useState<string | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewAvatarUrl = useMemo(
    () => resolveAvatarUrl(avatar, fallbackAvatar) ?? getPresetAvatarUrl("night-owl") ?? "",
    [avatar, fallbackAvatar],
  );

  const broadcastStudyProfile = (profile: {
    school: string;
    major: string;
    currentCourses: string[];
    interests: string[];
    studyPreferences: string;
    plannerProfile: {
      majorSlug?: string;
      currentSemesterNumber?: number;
      honorsStudent?: boolean;
      currentCourses?: string[];
      completedCourses?: string[];
    };
    settings?: SiteSettingsPayload;
  }) => {
    writeLocalStudyProfile({
      ...profile,
      settings: profile.settings ?? readLocalSiteSettings(),
    });
    window.dispatchEvent(new CustomEvent(STUDY_PROFILE_EVENT, { detail: { profile } }));
  };

  const saveAvatarImmediately = async (newAvatar: AvatarPayload) => {
    // Always persist to localStorage immediately
    const localSettings = readLocalSiteSettings();
    const nextSettings = { ...localSettings, avatar: newAvatar };
    writeLocalSiteSettings(nextSettings);
    const cachedProfile = readLocalStudyProfile();
    if (cachedProfile) {
      writeLocalStudyProfile({ ...cachedProfile, settings: nextSettings });
      window.dispatchEvent(new CustomEvent(STUDY_PROFILE_EVENT, { detail: { profile: { ...cachedProfile, settings: nextSettings } } }));
    }
    window.dispatchEvent(new CustomEvent("uichicago-avatar-change", {
      detail: { avatarUrl: resolveAvatarUrl(newAvatar, fallbackAvatar) },
    }));
    window.dispatchEvent(new Event("uichicago-settings-change"));

    if (status !== "authenticated") return;

    try {
      setIsAvatarSaving(true);
      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { ...localSettings, avatar: newAvatar },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) {
        const nextUrl = payload?.user?.avatarUrl ?? resolveAvatarUrl(newAvatar, fallbackAvatar) ?? null;
        setFallbackAvatar(nextUrl);
        window.dispatchEvent(new CustomEvent("uichicago-avatar-change", { detail: { avatarUrl: nextUrl } }));
      }
    } catch {
      // silent
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage("Please choose an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setMessage("Please keep uploads under 8 MB."); return; }

    try {
      const imageBitmap = await createImageBitmap(file);
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const ratio = Math.max(size / imageBitmap.width, size / imageBitmap.height);
      const dw = imageBitmap.width * ratio;
      const dh = imageBitmap.height * ratio;
      ctx.fillStyle = "#101114";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(imageBitmap, (size - dw) / 2, (size - dh) / 2, dw, dh);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
      const newAvatar: AvatarPayload = { type: "upload", value: dataUrl };
      setAvatar(newAvatar);
      void saveAvatarImmediately(newAvatar);
    } catch {
      setMessage("Could not process that image.");
    }
  };

  const handlePresetSelect = (presetId: string) => {
    const newAvatar: AvatarPayload = { type: "preset", value: presetId };
    setAvatar(newAvatar);
    void saveAvatarImmediately(newAvatar);
  };

  const handleUseGooglePhoto = () => {
    const newAvatar: AvatarPayload = { type: "google" };
    setAvatar(newAvatar);
    void saveAvatarImmediately(newAvatar);
  };

  useEffect(() => {
    let cancelled = false;

    const loadMajors = async () => {
      try {
        const response = await fetch("/api/study/majors", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled || !payload) return;
        setMajorOptions(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        return;
      }
    };

    void loadMajors();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!majorPickerRef.current?.contains(event.target as Node)) {
        setMajorPickerOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Helper: try to find a majorSlug from majorOptions that matches a given major name.
  // Works even if majorOptions hasn't loaded yet (returns "" in that case).
  const resolveMajorSlug = (majorName: string, slug: string, options: MajorOption[]): string => {
    if (slug) return slug; // already have one
    if (!majorName.trim() || !options.length) return "";
    const normalised = majorName.trim().toLowerCase();
    const match =
      options.find(o => o.slug === majorName) ||
      options.find(o => o.name.toLowerCase() === normalised) ||
      options.find(o => o.name.toLowerCase().includes(normalised) || normalised.includes(o.name.toLowerCase()));
    return match?.slug ?? "";
  };

  // When majorOptions finish loading AND the profile is already loaded, auto-resolve
  // any missing majorSlug so the dropdown shows the right selection.
  useEffect(() => {
    if (!loaded || !majorOptions.length) return;
    setForm(current => {
      if (current.majorSlug || !current.major.trim()) return current;
      const resolved = resolveMajorSlug(current.major, "", majorOptions);
      if (!resolved) return current;
      return { ...current, majorSlug: resolved };
    });
  }, [majorOptions, loaded]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/study/me", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled || !payload) {
          if (!cancelled) {
            const cached = readLocalStudyProfile();
            if (cached) {
              const nextForm = {
                school: cached.school || "UIC",
                major: cached.major || "",
                majorSlug: cached.plannerProfile.majorSlug || "",
                currentCourses: Array.isArray(cached.currentCourses) ? cached.currentCourses.join(", ") : "",
                completedCourses: "",
                interests: Array.isArray(cached.interests) ? cached.interests.join(", ") : "",
                studyPreferences: cached.studyPreferences || "",
                currentSemesterNumber: String(Number(cached.plannerProfile.currentSemesterNumber || 0)),
                honorsStudent: Boolean(cached.plannerProfile.honorsStudent),
              };
              setForm(nextForm);
              setSavedSnapshot(serializeProfileForm(nextForm));
              setMessage("Using the profile saved on this device right now.");
            } else if (payload?.error) {
              setMessage("Could not load your saved profile right now.");
            }
          }
          return;
        }

        const rawMajor = payload.profile?.major || "";
        const rawMajorSlug = payload.profile?.plannerProfile?.majorSlug || "";
        // Auto-resolve slug if we already have majorOptions loaded
        const resolvedSlug = resolveMajorSlug(rawMajor, rawMajorSlug, majorOptions);

        const nextForm = {
          school: payload.profile?.school || "UIC",
          major: rawMajor,
          majorSlug: resolvedSlug,
          currentCourses: Array.from(new Set([
            ...(Array.isArray(payload.profile?.currentCourses) ? payload.profile.currentCourses : []),
            ...(Array.isArray(payload.profile?.plannerProfile?.completedCourses) ? payload.profile.plannerProfile.completedCourses : []),
          ])).join(", "),
          completedCourses: "",
          interests: Array.isArray(payload.profile?.interests) ? payload.profile.interests.join(", ") : "",
          studyPreferences: payload.profile?.studyPreferences || "",
          currentSemesterNumber: String(Number(payload.profile?.plannerProfile?.currentSemesterNumber || 0)),
          honorsStudent: Boolean(payload.profile?.plannerProfile?.honorsStudent),
        };
        setForm(nextForm);
        setSavedSnapshot(serializeProfileForm(nextForm));

        // Load avatar: prefer DB value, fall back to localStorage
        const dbAvatar = payload.profile?.settings?.avatar;
        const localSettings = readLocalSiteSettings();
        const resolvedAvatar: AvatarPayload = (dbAvatar?.type === "upload" && dbAvatar.value)
          ? dbAvatar
          : (dbAvatar?.type === "preset" && dbAvatar.value)
          ? dbAvatar
          : (dbAvatar?.type === "google")
          ? dbAvatar
          : (localSettings.avatar?.type === "upload" && localSettings.avatar.value)
          ? localSettings.avatar
          : (localSettings.avatar?.type === "preset" && localSettings.avatar.value)
          ? localSettings.avatar
          : { type: "google" };
        const nextFallbackAvatar = payload.user?.avatarUrl ?? payload.user?.image ?? session?.user?.image ?? null;
        setAvatar(resolvedAvatar as AvatarPayload);
        setFallbackAvatar(nextFallbackAvatar);
        // Keep localStorage in sync with DB value
        writeLocalSiteSettings({ ...localSettings, avatar: resolvedAvatar as AvatarPayload });
        broadcastStudyProfile({
          school: nextForm.school,
          major: nextForm.major,
          currentCourses: parseCommaSeparated(nextForm.currentCourses),
          interests: parseCommaSeparated(nextForm.interests),
          studyPreferences: nextForm.studyPreferences,
          plannerProfile: {
            majorSlug: nextForm.majorSlug || undefined,
            currentSemesterNumber: Number(nextForm.currentSemesterNumber || "0"),
            honorsStudent: nextForm.honorsStudent,
            currentCourses: parseCommaSeparated(nextForm.currentCourses),
            completedCourses: parseCommaSeparated(nextForm.completedCourses),
          },
          settings: payload.profile?.settings ?? localSettings,
        });
      } catch {
        if (!cancelled) {
          setMessage("Could not load your profile.");
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [majorOptions, session?.user?.image, status]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!currentClassesOpen || currentCourseQuery.trim().length < 2) {
      setCurrentCourseSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(currentCourseQuery.trim())}&pageSize=6`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) return;
        setCurrentCourseSuggestions(
          (Array.isArray(payload.items) ? payload.items : []).map((item: { id: string; subject: string; number: string; title: string; href: string }) => ({
            id: item.id,
            code: `${item.subject} ${item.number}`,
            title: item.title,
            href: item.href,
          })),
        );
      } catch {
        setCurrentCourseSuggestions([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [currentClassesOpen, currentCourseQuery]);

  const currentCoursesList = useMemo(() => parseCommaSeparated(form.currentCourses), [form.currentCourses]);
  const hasUnsavedChanges = useMemo(() => serializeProfileForm(form) !== savedSnapshot, [form, savedSnapshot]);
  const selectedMajor = useMemo(
    () => majorOptions.find((option) => option.slug === form.majorSlug) ?? null,
    [form.majorSlug, majorOptions],
  );
  const filteredMajorOptions = useMemo(() => {
    const query = form.major.trim().toLowerCase();
    const ranked = majorOptions
      .map((option) => {
        const name = option.name.toLowerCase();
        const college = option.college.toLowerCase();
        let score = 0;

        if (!query) score = 1;
        else if (name === query) score = 500;
        else if (name.startsWith(query)) score = 400;
        else if (name.includes(query)) score = 300;
        else if (college.includes(query)) score = 200;

        return { option, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name));

    return ranked.slice(0, query ? 8 : 10).map((entry) => entry.option);
  }, [form.major, majorOptions]);

  const updateCourseField = (field: "currentCourses" | "completedCourses", nextCourses: string[]) => {
    setForm((current) => ({
      ...current,
      [field]: nextCourses.join(", "),
    }));
  };

  const addCourse = (field: "currentCourses" | "completedCourses", code: string) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    const existing = currentCoursesList;
    if (existing.includes(trimmedCode)) return;
    updateCourseField(field, [...existing, trimmedCode]);
    setCurrentCourseQuery("");
    setCurrentCourseSuggestions([]);
  };

  const removeCourse = (field: "currentCourses" | "completedCourses", code: string) => {
    const existing = currentCoursesList;
    updateCourseField(field, existing.filter((course) => course !== code));
  };

  const selectMajor = (major: MajorOption) => {
    setForm((current) => ({
      ...current,
      major: major.name,
      majorSlug: major.slug,
    }));
    setMajorPickerOpen(false);
  };

  const saveProfile = useCallback(async () => {
    if (status !== "authenticated") {
      void signIn("google", { callbackUrl: "/profile" });
      return;
    }
    if (!hasUnsavedChanges) return;

    const localSettings = readLocalSiteSettings();
    const resolvedMajorSlug = resolveMajorSlug(form.major, form.majorSlug, majorOptions);

    try {
      setIsSaving(true);
      // Include the current avatar in settings so it's never lost on save.

      // Keep the form in sync if we resolved a new slug so the snapshot is
      // correct after save and the save button goes back to disabled.
      if (resolvedMajorSlug && resolvedMajorSlug !== form.majorSlug) {
        setForm(current => ({ ...current, majorSlug: resolvedMajorSlug }));
      }

      const localForm: ProfileFormState = {
        ...form,
        majorSlug: resolvedMajorSlug || form.majorSlug,
      };
      const localProfilePayload = formToStudyProfilePayload(localForm, { ...localSettings, avatar });
      broadcastStudyProfile(localProfilePayload);

      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: form.school,
          major: form.major,
          currentCourses: Array.from(new Set([
            ...parseCommaSeparated(form.currentCourses),
            ...parseCommaSeparated(form.completedCourses),
          ])),
          interests: parseCommaSeparated(form.interests),
          studyPreferences: form.studyPreferences,
          settings: { ...localSettings, avatar },
          plannerProfile: {
            majorSlug: resolvedMajorSlug,
            currentSemesterNumber: Number(form.currentSemesterNumber || "0"),
            honorsStudent: form.honorsStudent,
            currentCourses: Array.from(new Set([
              ...parseCommaSeparated(form.currentCourses),
              ...parseCommaSeparated(form.completedCourses),
            ])),
            completedCourses: [],
          },
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save your profile.");
      }

      // Update form from server response so UI exactly reflects what was persisted.
      // Use resolvedMajorSlug as a second fallback so it's never lost.
      const savedForm: ProfileFormState = {
        school: payload.profile?.school || form.school,
        major: payload.profile?.major || form.major,
        majorSlug: payload.profile?.plannerProfile?.majorSlug || resolvedMajorSlug || form.majorSlug,
        currentCourses: Array.isArray(payload.profile?.currentCourses)
          ? payload.profile.currentCourses.join(", ")
          : form.currentCourses,
        completedCourses: "",
        interests: Array.isArray(payload.profile?.interests)
          ? payload.profile.interests.join(", ")
          : form.interests,
        studyPreferences: payload.profile?.studyPreferences ?? form.studyPreferences,
        currentSemesterNumber: String(Number(payload.profile?.plannerProfile?.currentSemesterNumber ?? form.currentSemesterNumber)),
        honorsStudent: Boolean(payload.profile?.plannerProfile?.honorsStudent ?? form.honorsStudent),
      };
      setForm(savedForm);
      setSavedSnapshot(serializeProfileForm(savedForm));
      // Sync avatar from server if returned
      if (payload.user?.avatarUrl) {
        setFallbackAvatar(payload.user.avatarUrl);
      }
      broadcastStudyProfile(payload.profile ?? {
        school: savedForm.school,
        major: savedForm.major,
        currentCourses: parseCommaSeparated(savedForm.currentCourses),
        interests: parseCommaSeparated(savedForm.interests),
        studyPreferences: savedForm.studyPreferences,
        plannerProfile: {
          majorSlug: savedForm.majorSlug || undefined,
          currentSemesterNumber: Number(savedForm.currentSemesterNumber || "0"),
          honorsStudent: savedForm.honorsStudent,
          currentCourses: parseCommaSeparated(savedForm.currentCourses),
          completedCourses: parseCommaSeparated(savedForm.completedCourses),
        },
        settings: { ...localSettings, avatar },
      });
      setLastSavedAt(new Date());
      setMessage("");
    } catch {
      const fallbackForm: ProfileFormState = {
        ...form,
        majorSlug: resolvedMajorSlug || form.majorSlug,
      };
      setForm(fallbackForm);
      setSavedSnapshot(serializeProfileForm(fallbackForm));
      setLastSavedAt(new Date());
      setMessage("Profile saved on this device. Cloud sync is unavailable right now.");
    } finally {
      setIsSaving(false);
    }
  }, [avatar, form, hasUnsavedChanges, majorOptions, status]);

  useEffect(() => {
    if (status !== "authenticated" || !loaded || !hasUnsavedChanges || isSaving) return;

    const timeout = window.setTimeout(() => {
      void saveProfile();
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [hasUnsavedChanges, isSaving, loaded, saveProfile, status]);

  if (status === "loading" || (status === "authenticated" && !loaded)) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_36%),#fafafa] px-4 py-10 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(129,58,58,0.18),transparent_36%),#09090b] dark:text-white sm:px-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="h-[520px] animate-pulse rounded-4xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/4" />
        </div>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_36%),#fafafa] px-4 py-10 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(129,58,58,0.18),transparent_36%),#09090b] dark:text-white sm:px-6">
        <div className="mx-auto max-w-[960px] rounded-4xl border border-zinc-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:border-white/10 dark:bg-white/4 dark:text-zinc-300">
            <UserRound className="h-4 w-4" />
            Your profile
          </div>
          <h1 className="mt-6 text-[2.5rem] font-black tracking-[-0.06em] text-zinc-950 dark:text-white">One place for the context your whole workspace needs.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
            Save your major, classes, and study preferences once so planning, study tools, and Sparky can personalize around you.
          </p>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/profile" })}
            className="mt-8 inline-flex items-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  const displayName = session?.user?.name || "Your profile";
  const email = session?.user?.email || "";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_36%),#fafafa] px-4 py-10 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(129,58,58,0.18),transparent_36%),#09090b] dark:text-white sm:px-6">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <section className="rounded-[1.8rem] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff,#f6f6f7)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.28)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Your profile</div>
              <h1 className="mt-2 text-[2.1rem] font-black tracking-[-0.06em] text-zinc-950 dark:text-white sm:text-[2.5rem]">
                Keep your academic context tidy.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                Save your major, semester, classes, and preferences here so the rest of the site can adapt without crowding the page.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                  {selectedMajor?.name || form.major.trim() || "No major yet"}
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                  {currentCoursesList.length} current or completed courses
                </span>
                {form.honorsStudent ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                    Honors student
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <div className="text-sm text-zinc-500 dark:text-zinc-400">{displayName}</div>
              <div className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ${
                isSaving
                  ? "bg-zinc-200 text-zinc-600 dark:bg-white/8 dark:text-zinc-300"
                  : hasUnsavedChanges
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
              }`}>
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Saving soon..." : "Autosaved"}
              </div>
              {lastSavedAt && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              {message && (
                <div className="text-xs font-medium text-red-500">{message}</div>
              )}
            </div>
          </div>
        </section>

        {/* Profile picture section */}
        <section className="rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
          <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
            <div className="text-sm font-semibold text-zinc-950 dark:text-white">
              Profile picture
              {isAvatarSaving && <span className="ml-2 text-xs font-normal text-zinc-400">Saving…</span>}
            </div>
          </div>
          <div className="p-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 shadow-[0_10px_30px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-white/6">
                <img src={previewAvatarUrl} alt="Your profile picture" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-1 flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/4 dark:text-white dark:hover:border-white/25 dark:hover:bg-white/7"
                >
                  <Upload className="h-4 w-4" />
                  Upload photo
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen((o) => !o)}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/4 dark:text-white dark:hover:border-white/25 dark:hover:bg-white/7"
                >
                  <ImageIcon className="h-4 w-4" />
                  Funny avatars
                </button>
                {session?.user?.image ? (
                  <button
                    type="button"
                    onClick={handleUseGooglePhoto}
                    className="inline-flex h-11 items-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:bg-white/2 dark:text-zinc-300 dark:hover:border-white/25 dark:hover:text-white"
                  >
                    Use Google photo
                  </button>
                ) : null}
              </div>
            </div>

            {avatarPickerOpen ? (
              <div className="mt-6 rounded-[1.4rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-black/20">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-950 dark:text-white">Choose an avatar</div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Click to apply immediately.</div>
                  </div>
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{PRESET_AVATARS.length} options</div>
                </div>
                <div className="grid grid-cols-5 gap-3 sm:grid-cols-7 md:grid-cols-8 lg:grid-cols-10">
                  {PRESET_AVATARS.map((preset) => {
                    const url = getPresetAvatarUrl(preset.id);
                    const active = avatar.type === "preset" && avatar.value === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handlePresetSelect(preset.id)}
                        className={`relative h-14 w-14 overflow-hidden rounded-full border transition ${
                          active
                            ? "border-zinc-900 ring-2 ring-zinc-300 dark:border-white dark:ring-white/25"
                            : "border-zinc-200 hover:-translate-y-0.5 hover:border-zinc-400 dark:border-white/10 dark:hover:border-white/30"
                        }`}
                        aria-label={`Choose ${preset.label}`}
                        title={preset.label}
                      >
                        {url ? <img src={url} alt={preset.label} className="h-full w-full object-cover" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.28)] sm:p-7">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Account context</div>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-zinc-950 dark:text-white">{displayName}</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{email}</p>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">School</div>
                <input
                  value={form.school}
                  onChange={(event) => setForm((current) => ({ ...current, school: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Major</div>
                <div ref={majorPickerRef} className="relative">
                  <input
                    value={form.major}
                    onFocus={() => setMajorPickerOpen(true)}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      // Try to auto-match a slug from the typed text so the system
                      // always knows which official major this is.
                      const autoSlug = resolveMajorSlug(nextValue, "", majorOptions);
                      setForm((current) => ({
                        ...current,
                        major: nextValue,
                        // Keep existing slug if text still matches the same major;
                        // use auto-resolved slug if we find a match; otherwise clear it.
                        majorSlug: current.majorSlug && selectedMajor?.name === nextValue
                          ? current.majorSlug
                          : autoSlug,
                      }));
                      setMajorPickerOpen(true);
                    }}
                    placeholder="Start typing your major"
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 pr-10 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />

                  {majorPickerOpen ? (
                    <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[#18181d]">
                      {filteredMajorOptions.length ? (
                        filteredMajorOptions.map((major) => {
                          const isSelected = form.majorSlug === major.slug;
                          return (
                            <button
                              key={major.slug}
                              type="button"
                              onClick={() => selectMajor(major)}
                              className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-zinc-100 dark:hover:bg-white/6"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-zinc-900 dark:text-white">{major.name}</div>
                                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{major.college}</div>
                              </div>
                              {isSelected ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                          No exact major matches yet. Keep typing or pick from the official list when it appears.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {selectedMajor
                    ? `Selected major: ${selectedMajor.name}`
                    : "Choose one of the official majors so planning and Sparky use the exact program."}
                </div>
              </label>
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current semester</div>
                <select
                  value={form.currentSemesterNumber}
                  onChange={(event) => setForm((current) => ({ ...current, currentSemesterNumber: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <option value="0">Not set yet</option>
                  <option value="1">1st semester</option>
                  <option value="2">2nd semester</option>
                  <option value="3">3rd semester</option>
                  <option value="4">4th semester</option>
                  <option value="5">5th semester</option>
                  <option value="6">6th semester</option>
                  <option value="7">7th semester</option>
                  <option value="8">8th semester</option>
                </select>
              </label>
              <div className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Honors student</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, honorsStudent: false }))}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${!form.honorsStudent ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-white/20 dark:bg-white/8 dark:text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-900 dark:border-white/10 dark:bg-white/4 dark:text-zinc-400 dark:hover:text-white"}`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, honorsStudent: true }))}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${form.honorsStudent ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-white/20 dark:bg-white/8 dark:text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-900 dark:border-white/10 dark:bg-white/4 dark:text-zinc-400 dark:hover:text-white"}`}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-white/10 dark:bg-white/3">
                <button
                  type="button"
                  onClick={() => setCurrentClassesOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current or completed courses</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">
                      {currentCoursesList.length ? `${currentCoursesList.length} courses saved` : "No courses saved yet"}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${currentClassesOpen ? "rotate-180" : ""}`} />
                </button>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(currentCoursesList.length ? currentCoursesList.slice(0, currentClassesOpen ? currentCoursesList.length : 6) : ["Add courses like CS 251 or BIOS 120"]).map((course) => (
                    currentCoursesList.length ? (
                      <span key={course} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/6 dark:text-zinc-200">
                        {course}
                        {currentClassesOpen ? (
                          <button
                            type="button"
                            onClick={() => removeCourse("currentCourses", course)}
                            className="text-zinc-400 transition hover:text-white"
                            aria-label={`Remove ${course}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <span key={course} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/4 dark:text-zinc-400">
                        {course}
                      </span>
                    )
                  ))}
                  {!currentClassesOpen && currentCoursesList.length > 6 ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/4 dark:text-zinc-400">
                      +{currentCoursesList.length - 6} more
                    </span>
                  ) : null}
                </div>

                {currentClassesOpen ? (
                  <div className="mt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Add course</div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={currentCourseQuery}
                        onChange={(event) => setCurrentCourseQuery(event.target.value)}
                        placeholder="Search courses you already have or are taking"
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-12 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const firstSuggestion = currentCourseSuggestions[0];
                          if (firstSuggestion) addCourse("currentCourses", firstSuggestion.code);
                        }}
                        disabled={!currentCourseSuggestions.length}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 transition enabled:hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/8 dark:text-zinc-200 dark:enabled:hover:bg-white/14"
                        aria-label="Add course"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {currentCourseSuggestions.length ? (
                      <div className="mt-3 space-y-2">
                        {currentCourseSuggestions.map((course) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => addCourse("currentCourses", course.code)}
                            className="flex w-full items-start justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/4 dark:hover:bg-white/8"
                          >
                            <div>
                              <div className="text-sm font-semibold text-zinc-900 dark:text-white">{course.code}</div>
                              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{course.title}</div>
                            </div>
                            <Plus className="mt-0.5 h-4 w-4 text-zinc-400" />
                          </button>
                        ))}
                      </div>
                    ) : currentCourseQuery.trim().length >= 2 ? (
                      <div className="mt-3 text-sm text-zinc-500">No matching courses yet.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))]">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Next best places</div>
              <div className="mt-4 space-y-3">
                <Link href="/study/planner" className="flex items-center justify-between rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/4 dark:text-white dark:hover:bg-white/8">
                  <span>Open degree planner</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
                <Link href="/study" className="flex items-center justify-between rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/4 dark:text-white dark:hover:bg-white/8">
                  <span>Open study workspace</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
                <Link href="/chat" className="flex items-center justify-between rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/4 dark:text-white dark:hover:bg-white/8">
                  <span>Talk to Sparky</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {message ? (
          <div className="fixed bottom-5 right-5 z-50 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[0_18px_45px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)] dark:text-white">
            {message}
          </div>
        ) : null}
      </div>
    </main>
  );
}
